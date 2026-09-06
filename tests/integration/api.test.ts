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
import { OntologyPlatformClient } from "../../packages/sdk-typescript/src/index.js";
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

it("filters audit time, key name and action in SQL and summarizes beyond the current page", async () => {
  const app = setup(); const store = app.platformStore;
  for (let i = 0; i < 120; i++) {
    store.appendAudit(`a${i}`, `r${i}`, "HttpRequestCompleted", { clientId: "alpha", clientName: "测试 Agent", method: "POST", route: "/v1/semantic-query", statusCode: i < 20 ? 500 : 200, durationMs: 10 });
  }
  store.db.prepare("UPDATE audit_events SET created_at=?").run("2026-01-01T00:00:00.000Z");
  store.appendAudit("outside", "outside", "HttpRequestCompleted", { clientId: "alpha", clientName: "测试 Agent", method: "POST", route: "/v1/semantic-query", statusCode: 200, durationMs: 1000 });
  const query = new URLSearchParams({ includeSummary: "true", start: "2026-01-01T08:00:00+08:00", end: "2026-01-01T08:00:00+08:00", clientName: "Agent", event: "POST /v1/semantic-query", limit: "2", offset: "2" });
  const response = await app.inject({ url: `/v1/system/audit-events?${query}`, headers: auth });
  expect(response.statusCode).toBe(200);
  const result = response.json().data;
  expect(result.events).toHaveLength(2); expect(result.total).toBe(120);
  expect(result.overview).toMatchObject({ calls: 120, failures: 20, averageDurationMs: 10 });
  expect(result.overview.successRate).toBeCloseTo(100 / 120);
  query.set("clientName", "' OR 1=1 --");
  const empty = (await app.inject({ url: `/v1/system/audit-events?${query}`, headers: auth })).json().data;
  expect(empty.total).toBe(0); expect(empty.overview.successRate).toBeNull();
});

it("keeps revoked key names in audit records and correlates business events without counting twice", async () => {
  const app = setup();
  const client = (await app.inject({ method: "POST", url: "/v1/system/api-clients", headers: auth, payload: { name: "历史 Agent", scopes: ["ontology:read"] } })).json().data;
  const response = await app.inject({ url: "/v1/namespaces/retail/summary", headers: { authorization: `Bearer ${client.apiKey}` } });
  const http = (app.platformStore.listAudit() as any[]).find(event => event.payload.clientId === client.clientId);
  app.platformStore.appendAudit(http.auditId, http.requestId, "ValueIndexFailed", { code: "VALUE_INDEX_BUILD_FAILED" });
  await app.inject({ method: "DELETE", url: `/v1/system/api-clients/${client.clientId}`, headers: auth });
  const result = (await app.inject({ url: `/v1/system/audit-events?includeSummary=true&clientId=${client.clientId}`, headers: auth })).json().data;
  expect(response.statusCode).toBe(200); expect(result.total).toBe(2);
  expect(result.events.every((event: any) => event.clientName === "历史 Agent")).toBe(true);
  expect(result.overview.calls).toBe(1);
  expect(JSON.stringify(result)).not.toContain(client.apiKey);
});

it("validates audit ranges and pagination and restricts audit access to administrators", async () => {
  const app = setup();
  for (const query of ["limit=-1", "limit=201", "offset=-1", "start=invalid", "start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z"]) {
    expect((await app.inject({ url: `/v1/system/audit-events?${query}`, headers: auth })).statusCode).toBe(400);
  }
  const client = (await app.inject({ method: "POST", url: "/v1/system/api-clients", headers: auth, payload: { name: "只读 Agent", scopes: ["ontology:read"] } })).json().data;
  expect((await app.inject({ url: "/v1/system/audit-events?includeSummary=true", headers: { authorization: `Bearer ${client.apiKey}` } })).statusCode).toBe(403);
});

it("accepts name-based detail requests through SDK HTTP and MCP in one call", async () => {
  const app = setup();
  let calls = 0;
  const client = new OntologyPlatformClient({ baseUrl: "http://test", apiKey: "test-key", fetch: async (url, init) => {
    calls++;
    const response = await app.inject({ method: "POST", url: new URL(String(url)).pathname, headers: Object.fromEntries(new Headers(init?.headers)), payload: String(init?.body) });
    return new Response(response.body, { status: response.statusCode });
  } });
  const input = { namespace: "retail", queryMode: "INTENT" as const, intent: { resultKind: "detail" as const, object: "订单", includeObjects: ["店铺"] }, options: { includeSqlPreview: true, includeQueryIr: true } };
  const http: any = await client.executeSemanticQuery(input);
  const mcp: any = await new OntologyMcpAdapter(app.platformService).callTool("ExecuteSemanticQuery", input);
  expect(calls).toBe(1);
  expect(http.status).toBe("SUCCEEDED");
  expect(mcp.status).toBe("SUCCEEDED");
  expect(http.data.resultKind).toBe("detail");
  expect(http.data.columnBindings).toEqual(mcp.data.columnBindings);
  expect(http.data.columnBindings.some((column: any) => column.objectId === "o_store")).toBe(true);
  expect(http.data.sqlPreview.sql).not.toMatch(/GROUP BY|SUM\(|DISTINCT/i);
});
