import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PlatformException } from "../../../packages/contracts/src/index.js";
import { stableStringify } from "../../../packages/domain/src/index.js";

/** Retry window is process-local; pending duplicates await the original write. */
export function registerIdempotency(app: FastifyInstance) {
  type Result = { status: number; payload: string };
  type Entry = { fingerprint: string; expiresAt: number; result: Promise<Result>; finish: (result: Result) => void; done: boolean };
  const entries = new Map<string, Entry>();
  const owners = new Map<string, { key: string; entry: Entry }>();
  app.addHook("preHandler", async (request, reply) => {
    const token = request.headers["idempotency-key"];
    if (!token || !request.auth || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    if (typeof token !== "string" || token.length > 200) throw new PlatformException({ code: "INVALID_REQUEST", message: "Idempotency-Key 必须为最多 200 字符的字符串", stage: "http", retryable: false }, 400);
    const key = JSON.stringify([request.auth.clientId, request.auth.scopes, token]);
    const fingerprint = createHash("sha256").update(stableStringify([request.method, request.url, request.body ?? null, request.headers["if-match"] ?? null])).digest("hex");
    for (const [id, entry] of entries) if (entry.done && entry.expiresAt < Date.now()) entries.delete(id);
    const existing = entries.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new PlatformException({ code: "IDEMPOTENCY_CONFLICT", message: "同一 Idempotency-Key 已用于不同请求", stage: "http", retryable: false }, 409);
      const result = await existing.result;
      reply.header("idempotency-replayed", "true");
      return reply.code(result.status).type("application/json").send(result.payload);
    }
    if (entries.size >= 1000) {
      const completed = [...entries].find(([, entry]) => entry.done);
      if (completed) entries.delete(completed[0]);
      else throw new PlatformException({ code: "RATE_LIMIT_EXCEEDED", message: "并发写入过多，请稍后重试", stage: "http", retryable: true }, 429);
    }
    let finish!: (result: Result) => void;
    const result = new Promise<Result>(resolve => { finish = resolve; });
    const entry = { fingerprint, expiresAt: Date.now() + 10 * 60_000, result, finish, done: false };
    entries.set(key, entry); owners.set(request.id, { key, entry });
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const owner = owners.get(request.id);
    if (!owner) return payload;
    owners.delete(request.id);
    owner.entry.done = true;
    owner.entry.finish({ status: reply.statusCode, payload: typeof payload === "string" ? payload : JSON.stringify(payload ?? null) });
    if (reply.statusCode >= 500) entries.delete(owner.key);
    return payload;
  });
}
