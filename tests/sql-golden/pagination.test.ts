import { describe, expect, it } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

describe("Q14 pagination continuation", () => {
  it("pins IR, parameters, sort, page size and ontology version", async () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    physicalTables().forEach((table) => store.putPhysicalTable("selectdb", table));
    const calls: Array<{ sql: string; parameters: unknown[] }> = [];
    const platform = new OntologyPlatform(store, {
      execute: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return {
          columns: ["sales"],
          rows: [{ sales: 1 }],
          rowCount: 1,
          truncated: calls.length === 1,
        };
      },
    });
    const request = (id: string, cursor?: string) => ({
      queryMode: "FIXED_SHAPE" as const,
      namespace: "retail",
      ontologyVersion: 1,
      queryShape: {
        rootObjectId: "o_order",
        measureIds: ["m_sales"],
        dimensionPropertyIds: [],
        filters: [{ propertyId: "p_order_id", operator: "EQ" as const, value: "$id" }],
        sort: [{ entityId: "m_sales", direction: "DESC" as const }],
        limit: 10,
      },
      parameters: { id },
      pagination: { pageSize: 2, ...(cursor ? { cursor } : {}) },
    });
    const first: any = await platform.executeSemanticQuery(request("A"));
    expect(first.completeness).toMatchObject({ complete: false, truncated: true });
    const second: any = await platform.executeSemanticQuery(request("A", first.completeness.nextCursor));
    expect(second.status).toBe("SUCCEEDED");
    expect(calls[1]?.sql).toMatch(/LIMIT 2, 2$/);
    expect(calls[1]?.parameters).toEqual(calls[0]?.parameters);
    const mismatch: any = await platform.executeSemanticQuery(request("B", first.completeness.nextCursor));
    expect(mismatch.error.code).toBe("CURSOR_CONTEXT_MISMATCH");
    expect(calls).toHaveLength(2);
    store.close();
  });
});
