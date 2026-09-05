import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { validSnapshot, physicalTables } from "../fixtures-v3.js";

function seed(store: SqlitePlatformStore) {
  const snapshot = validSnapshot();
  snapshot.metrics.push({ ...snapshot.metrics[0]!, id: "m_sales_other", name: "sales_other" });
  store.savePublished(snapshot);
  physicalTables().forEach(table => store.putPhysicalTable("selectdb", table));
  store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [{ displayValue: "品牌电商", frequency: 20 }]);
}
const emptyResult = { columns: [], rows: [], rowCount: 0, truncated: false };
const question = { queryMode: "AUTO" as const, namespace: "retail", question: "品牌电商销售额" };
function pending(result: any) {
  expect(result.status).toBe("NEEDS_CLARIFICATION");
  return {
    id: result.data.clarificationId as string,
    selections: Object.fromEntries(result.data.clarifications.map((item: any) => [item.id, item.candidates[0].id])),
  };
}

describe("durable semantic clarification", () => {
  it("resumes after reopening SQLite with the original version and indexed values", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "clarification-recovery-"));
    const filename = path.join(directory, "platform.sqlite");
    let store = new SqlitePlatformStore(filename);
    try {
      seed(store);
      const request = pending(await new OntologyPlatform(store).executeSemanticQuery(question));
      store.close();
      store = new SqlitePlatformStore(filename);
      store.savePublished(validSnapshot("retail", 2));
      store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", []);
      const calls: unknown[][] = [];
      const platform = new OntologyPlatform(store, { async execute(_sql, parameters) { calls.push(parameters); return emptyResult; } });
      const result = await platform.continueSemanticQuery(request.id, request.selections);
      expect(result).toMatchObject({ status: "SUCCEEDED", ontologyVersion: 1 });
      expect(calls[0]).toContain("品牌电商");
      expect(store.getClarification(request.id)).toBeUndefined();
      await expect(platform.continueSemanticQuery(request.id, request.selections)).rejects.toThrow("不存在或已过期");
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retains the request after invalid selections and transient execution failures", async () => {
    const store = new SqlitePlatformStore(":memory:");
    try {
      seed(store);
      let attempts = 0;
      const platform = new OntologyPlatform(store, { async execute() { if (++attempts === 1) throw new Error("temporary connection loss"); return emptyResult; } });
      const request = pending(await platform.executeSemanticQuery(question));
      await expect(platform.continueSemanticQuery(request.id, {})).rejects.toThrow("缺少或无效");
      expect(attempts).toBe(0);
      expect((await platform.continueSemanticQuery(request.id, request.selections)).status).toBe("FAILED");
      expect(store.getClarification(request.id)).toBeDefined();
      expect((await platform.continueSemanticQuery(request.id, request.selections)).status).toBe("SUCCEEDED");
      expect(attempts).toBe(2);
    } finally { store.close(); }
  });

  it("rejects expired requests without executing SQL", async () => {
    const store = new SqlitePlatformStore(":memory:");
    try {
      seed(store);
      let now = new Date("2099-01-01T00:00:00Z");
      let calls = 0;
      const platform = new OntologyPlatform(store, { async execute() { calls++; return emptyResult; } }, () => now);
      const request = pending(await platform.executeSemanticQuery(question));
      now = new Date("2099-01-01T00:30:00Z");
      await expect(platform.continueSemanticQuery(request.id, request.selections)).rejects.toThrow("不存在或已过期");
      expect(calls).toBe(0);
    } finally { store.close(); }
  });
});
