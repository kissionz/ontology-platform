import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { QueryIrCompiler } from "../../packages/sql-selectdb/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

it("reuses a durable SQL template, binds fresh parameters, and invalidates on shape, schema or version changes", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "query-template-"));
  const filename = path.join(directory, "platform.sqlite");
  let store = new SqlitePlatformStore(filename);
  const compile = vi.spyOn(QueryIrCompiler.prototype, "compile");
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const executor = { async execute(sql: string, parameters: unknown[]) { calls.push({ sql, parameters }); return { columns: [], rows: [], rowCount: 0, truncated: false }; } };
  const request = (ids: string[], version = 1) => ({
    queryMode: "FIXED_SHAPE" as const, namespace: "retail", ontologyVersion: version,
    queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [{ propertyId: "p_order_id", operator: "IN" as const, value: "$ids" }], sort: [], limit: 20 },
    parameters: { ids }, options: { includeQueryIr: true },
  });
  try {
    store.savePublished(validSnapshot());
    physicalTables().forEach(table => store.putPhysicalTable("selectdb", table));
    expect((await new OntologyPlatform(store, executor).executeSemanticQuery(request(["secret-A", "secret-B"]))).status).toBe("SUCCEEDED");
    const payload = (store.db.prepare("SELECT payload FROM compiled_query_templates").get() as { payload: string }).payload;
    expect(payload).not.toContain("secret-");
    expect(compile).toHaveBeenCalledTimes(1);
    store.close();
    store = new SqlitePlatformStore(filename);
    const platform = new OntologyPlatform(store, executor);
    const result = await platform.executeSemanticQuery(request(["fresh-C", "fresh-D"]));
    expect(result).toMatchObject({ status: "SUCCEEDED", data: { queryIr: { filters: [{ value: ["fresh-C", "fresh-D"] }] } } });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(calls[1]?.sql).toBe(calls[0]?.sql);
    expect(calls[1]?.parameters).toEqual(["fresh-C", "fresh-D"]);
    expect((await platform.executeSemanticQuery(request(["one"]))).status).toBe("SUCCEEDED");
    expect(compile).toHaveBeenCalledTimes(2);
    expect(calls[2]?.sql).toContain("IN (?)");
    expect((await platform.executeSemanticQuery(request([]))).status).toBe("REJECTED");
    expect(calls).toHaveLength(3);
    const table = physicalTables()[0]!;
    store.putPhysicalTable("selectdb", { ...table, name: "orders_relocated", fingerprint: "schema-2" });
    expect((await platform.executeSemanticQuery(request(["one"]))).status).toBe("SUCCEEDED");
    expect(compile).toHaveBeenCalledTimes(3);
    expect(calls[3]?.sql).toContain("orders_relocated");
    store.savePublished(validSnapshot("retail", 2));
    expect((await platform.executeSemanticQuery(request(["one"], 2))).status).toBe("SUCCEEDED");
    expect(compile).toHaveBeenCalledTimes(4);
  } finally {
    compile.mockRestore();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
