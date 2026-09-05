import { describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

describe("empty installation onboarding", () => {
  it("configures and scans a source, creates and resumes a first draft, then publishes v1", async () => {
    const app = buildApp({ databasePath: ":memory:", apiKey: "test-key", queryGateway: {
      async testConnection() { return { status: "ready", databaseVersion: "fixture", elapsedMs: 0 }; },
      async scanSchema() { return physicalTables().map(table => ({ name: table.name, type: table.type, comment: "测试表注释", columns: table.columns })); },
      async execute() { return { columns: [], rows: [], rowCount: 0, truncated: false }; },
      async close() {},
    } });
    const headers = { authorization: "Bearer test-key" };
    try {
      expect((await app.inject({ method: "GET", url: "/v1/data-sources/selectdb", headers })).statusCode).toBe(200);
      expect((await app.inject({ method: "PUT", url: "/v1/data-sources/selectdb", headers, payload: { host: "fixture", port: 9030, username: "test", password: "test", catalog: "internal", database: "retail", tls: false } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/v1/data-sources/selectdb:test", headers })).statusCode).toBe(200);
      const scanned = await app.inject({ method: "POST", url: "/v1/data-sources/selectdb/schema:scan", headers });
      expect(scanned.statusCode).toBe(200);
      expect(scanned.json().data.tables[0].description).toBe("测试表注释");
      expect((await app.inject({ method: "GET", url: "/v1/data-sources/selectdb", headers })).json().data.tables[0].description).toBe("测试表注释");
      const created = await app.inject({ method: "POST", url: "/v1/namespaces/retail/drafts", headers, payload: {} });
      expect(created.statusCode).toBe(200);
      const draft = created.json().data;
      expect(draft).toMatchObject({ baseVersion: 0, revision: 1, snapshot: { version: 1, objects: [] } });
      expect(app.platformStore.listVersions("retail")).toEqual([]);
      const sibling = (await app.inject({ method: "POST", url: "/v1/namespaces/retail/drafts", headers, payload: {} })).json().data;
      const object = structuredClone(validSnapshot().objects.find(object => object.id === "o_bu")!);
      object.sourceTableId = scanned.json().data.tables.find((table: { name: string }) => table.name === physicalTables().find(table => table.id === object.sourceTableId)!.name).id;
      object.status = "DRAFT";
      const updated = await app.inject({ method: "PATCH", url: `/v1/namespaces/retail/drafts/${draft.draftId}`, headers, payload: { revision: 1, operations: [{ op: "UPSERT_OBJECT", value: object }] } });
      expect(updated.statusCode).toBe(200);
      const resumed = await app.inject({ method: "GET", url: `/v1/namespaces/retail/drafts/${draft.draftId}`, headers });
      expect(resumed.json().data.snapshot.objects).toHaveLength(1);
      const published = await app.inject({ method: "POST", url: `/v1/namespaces/retail/drafts/${draft.draftId}/publish`, headers, payload: { baseVersion: 0, changeSummary: "首次建模" } });
      expect(published.statusCode).toBe(200);
      expect(published.json().data.version).toBe(1);
      expect(app.platformStore.getSnapshot("retail")?.objects).toHaveLength(1);
      const stale = await app.inject({ method: "POST", url: `/v1/namespaces/retail/drafts/${sibling.draftId}/publish`, headers, payload: { baseVersion: 0 } });
      expect(stale.statusCode).toBe(409);
    } finally { await app.close(); }
  });

  it("still rejects missing explicit base and rollback versions without leaving drafts", async () => {
    const app = buildApp({ databasePath: ":memory:", apiKey: "test-key" });
    try {
      for (const payload of [{ baseVersion: 7 }, { sourceVersion: 7 }]) {
        const response = await app.inject({ method: "POST", url: "/v1/namespaces/new/drafts", headers: { authorization: "Bearer test-key" }, payload });
        expect(response.statusCode).toBe(404);
      }
      expect(app.platformStore.db.prepare("SELECT * FROM ontology_drafts").all()).toEqual([]);
      expect(app.platformStore.listNamespaces()).toEqual([]);
    } finally { await app.close(); }
  });
});
