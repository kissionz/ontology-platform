import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { OntologyMcpAdapter } from "../../packages/mcp-server/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";
const apps: Array<ReturnType<typeof buildApp>> = [];
function setup() {
  const app = buildApp({
    databasePath: ":memory:",
    apiKey: "test-key",
    queryExecutor: {
      execute: async () => ({
        columns: ["事业部名称", "销售额"],
        rows: [{ 事业部名称: "品牌电商", 销售额: 120 }],
        rowCount: 1,
        truncated: false,
      }),
    },
  });
  apps.push(app);
  app.platformStore.savePublished(validSnapshot());
  physicalTables().forEach((t) =>
    app.platformStore.putPhysicalTable("selectdb", t),
  );
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const auth = { authorization: "Bearer test-key" };
describe("C01-C06 HTTP/MCP contract", () => {
  it("C01 uses identical Application semantics for HTTP and MCP", async () => {
    const app = setup();
    const input = {
      queryMode: "AUTO",
      namespace: "retail",
      question: "按事业部看销售额",
      options: { includeQueryIr: true },
    };
    const http = await app.inject({
      method: "POST",
      url: "/v1/semantic-query",
      headers: auth,
      payload: input,
    });
    const mcp: any = await new OntologyMcpAdapter(app.platformService).callTool(
      "ExecuteSemanticQuery",
      input,
    );
    expect(http.statusCode).toBe(200);
    expect(http.json().data.rows).toEqual(mcp.data.rows);
    expect(http.json().data.queryIr).toEqual(mcp.data.queryIr);
  });
  it("C02 resolves latest to a concrete version", async () => {
    const app = setup();
    const response = await app.inject({
      method: "GET",
      url: "/v1/namespaces/retail/ontology?version=latest",
      headers: auth,
    });
    expect(response.json().ontologyVersion).toBe(1);
  });
  it("C03 honors ETag with 304", async () => {
    const app = setup();
    const first = await app.inject({
      method: "GET",
      url: "/v1/namespaces/retail/ontology",
      headers: auth,
    });
    const second = await app.inject({
      method: "GET",
      url: "/v1/namespaces/retail/ontology",
      headers: { ...auth, "if-none-match": first.headers.etag! },
    });
    expect(second.statusCode).toBe(304);
  });
  it("C04 rejects cross-version session references", async () => {
    const app = setup();
    const context = app.platformService.resolveOntologyContext({
      namespace: "retail",
      ontologyVersion: 1,
      question: "销售额",
      purpose: "PLAN",
    });
    const next = validSnapshot("retail", 2);
    next.baseVersion = 1;
    app.platformStore.savePublished(next);
    const response = await app.inject({
      method: "POST",
      url: "/v1/semantic-query",
      headers: auth,
      payload: {
        queryMode: "FIXED_SHAPE",
        namespace: "retail",
        ontologyVersion: 2,
        sessionId: context.sessionId,
        queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [], sort: [], limit: 10 },
      },
    });
    expect(response.json().error.code).toBe("SESSION_VERSION_MISMATCH");
  });
  it("C05 returns requiredScopes on 403", async () => {
    const app = setup();
    const key = "read-only";
    app.platformStore.createApiClient({
      clientId: "readonly",
      name: "readonly",
      scopes: ["ontology:read"],
      status: "ACTIVE",
      keyHash: createHash("sha256").update(key).digest("hex"),
      rateLimit: 10,
      rotatedAt: new Date().toISOString(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/semantic-query",
      headers: { authorization: `Bearer ${key}` },
      payload: { queryMode: "AUTO", namespace: "retail", question: "销售额" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.details.requiredScopes).toContain(
      "semantic:read",
    );
  });
  it("C06 redacts secrets from audit payloads", () => {
    const app = setup();
    app.platformStore.appendAudit("a", "r", "test", {
      apiKey: "secret",
      nested: { password: "password", value: "ok" },
    });
    const text = JSON.stringify(app.platformStore.listAudit());
    expect(text).not.toContain("secret");
    expect(text).not.toContain(':"password"');
    expect(text).toContain("***REDACTED***");
  });
  it("audits every external HTTP request with trace metadata", async () => {
    const app = setup();
    await app.inject({ method: "GET", url: "/v1/health" });
    await app.inject({ method: "GET", url: "/v1/namespaces/retail/summary", headers: auth });
    const events = app.platformStore.listAudit(10) as Array<any>;
    const http = events.filter((event) => event.eventType === "HttpRequestCompleted");
    expect(http).toHaveLength(2);
    expect(http.every((event) => event.payload.traceId && typeof event.payload.durationMs === "number")).toBe(true);
  });
});

it("discards only the requested draft at its current revision and preserves published data", async () => {
  const app = setup();
  const created = await app.inject({ method: "POST", url: "/v1/namespaces/retail/drafts", headers: auth, payload: {} });
  const draft = created.json().data;
  const url = `/v1/namespaces/retail/drafts/${draft.draftId}`;
  expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(401);
  expect((await app.inject({ method: "DELETE", url, headers: auth })).statusCode).toBe(400);
  expect((await app.inject({ method: "DELETE", url, headers: { ...auth, "if-match": String(draft.revision + 1) } })).statusCode).toBe(409);
  expect(app.platformStore.getDraft("retail", draft.draftId)).toBeTruthy();
  const removed = await app.inject({ method: "DELETE", url, headers: { ...auth, "if-match": String(draft.revision) } });
  expect(removed.statusCode).toBe(200);
  expect(removed.json().data).toEqual({ draftId: draft.draftId, discarded: true });
  expect((await app.inject({ method: "GET", url, headers: auth })).statusCode).toBe(404);
  expect(app.platformStore.getSnapshot("retail", 1)).toEqual(validSnapshot());
  expect(app.platformStore.listPhysicalTables()).toHaveLength(physicalTables().length);
});

it("rejects deletion of a referenced metric and permits removing dependents in the same patch", async () => {
  const app = setup();
  const created = await app.inject({ method: "POST", url: "/v1/namespaces/retail/drafts", headers: auth, payload: {} });
  const draft = created.json().data;
  const url = `/v1/namespaces/retail/drafts/${draft.draftId}`;
  const blocked = await app.inject({ method: "PATCH", url, headers: auth, payload: { revision: draft.revision, operations: [{ op: "REMOVE_METRIC", id: "m_sales" }] } });
  expect(blocked.statusCode).toBe(422);
  expect(app.platformStore.getDraft("retail", draft.draftId)?.revision).toBe(draft.revision);
  const removed = await app.inject({ method: "PATCH", url, headers: auth, payload: { revision: draft.revision, operations: [{ op: "REMOVE_METRIC", id: "m_sales" }, { op: "REMOVE_METRIC", id: "m_margin" }] } });
  expect(removed.statusCode).toBe(200);
  expect(removed.json().data.snapshot.metrics.some((m: any) => m.id === "m_sales")).toBe(false);
  expect(app.platformStore.getSnapshot("retail", 1)?.metrics.some(m => m.id === "m_sales")).toBe(true);
});
