import { describe, expect, it } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import type { OntologySnapshot as LegacySnapshot, PhysicalTable as LegacyTable } from "../../packages/contracts/src/legacy.js";
import { QueryIrCompiler } from "../../packages/sql-selectdb/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

const compile = (snapshot = validSnapshot(), rootObjectId = "o_order", dimensionPropertyIds = ["p_store_name"]) =>
  new QueryIrCompiler().compile(
    {
      rootObjectId,
      measureIds: rootObjectId === "o_order" ? ["m_sales"] : [],
      dimensionPropertyIds,
      filters: [],
      resultKind: "aggregate",
      title: "关系安全验收",
    },
    snapshot as unknown as LegacySnapshot,
    physicalTables() as unknown as LegacyTable[],
  );

describe("Q01-Q14 acceptance matrix additions", () => {
  it("Q01 permits MANY_TO_ONE traversal from source to target", () => {
    expect(compile().ir.relationIds).toContain("r_order_store");
  });

  it("Q02 rejects expanding MANY_TO_ONE traversal from target to source", () => {
    const snapshot = validSnapshot();
    snapshot.relations = snapshot.relations.map((relation) => ({ ...relation, direction: "BIDIRECTIONAL" }));
    expect(() => compile(snapshot, "o_store", ["p_order_id"])).toThrow(/放大|重复聚合/);
  });

  it("Q03 rejects MANY_TO_MANY in an aggregate path", () => {
    const snapshot = validSnapshot();
    snapshot.relations[0] = { ...snapshot.relations[0]!, cardinality: "MANY_TO_MANY", fanoutRisk: "HIGH" };
    expect(() => compile(snapshot)).toThrow(/扇出|MANY_TO_MANY|放大|重复聚合/);
  });

  it("Q05 emits INNER JOIN for a required relationship", () => {
    const snapshot = validSnapshot();
    snapshot.relations[0] = { ...snapshot.relations[0]!, required: true };
    expect(compile(snapshot).sql).toContain("INNER JOIN");
  });

  it("Q11 preserves a FIXED_SHAPE fingerprint across dynamic parameter values", async () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    physicalTables().forEach((table) => store.putPhysicalTable("selectdb", table));
    const platform = new OntologyPlatform(store, { execute: async () => ({ columns: [], rows: [], rowCount: 0, truncated: false }) });
    const run = (id: string) => platform.executeSemanticQuery({
      queryMode: "FIXED_SHAPE",
      namespace: "retail",
      ontologyVersion: 1,
      queryShape: {
        rootObjectId: "o_order",
        measureIds: ["m_sales"],
        dimensionPropertyIds: [],
        filters: [{ propertyId: "p_order_id", operator: "EQ", value: "$id" }],
        sort: [],
        limit: 10,
      },
      parameters: { id },
    });
    await run("A");
    await run("B");
    const cached = store.db.prepare("SELECT fingerprint FROM query_shape_cache WHERE namespace='retail' AND ontology_version=1").all();
    expect(cached).toHaveLength(1);
    store.close();
  });

  it("Q12 isolates shape cache entries by ontology version", async () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    const next = validSnapshot("retail", 2);
    next.baseVersion = 1;
    store.savePublished(next);
    physicalTables().forEach((table) => store.putPhysicalTable("selectdb", table));
    const platform = new OntologyPlatform(store, { execute: async () => ({ columns: [], rows: [], rowCount: 0, truncated: false }) });
    const shape = { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [], sort: [], limit: 10 };
    await platform.executeSemanticQuery({ queryMode: "FIXED_SHAPE", namespace: "retail", ontologyVersion: 1, queryShape: shape });
    await platform.executeSemanticQuery({ queryMode: "FIXED_SHAPE", namespace: "retail", ontologyVersion: 2, queryShape: shape });
    const versions = store.db.prepare("SELECT ontology_version version FROM query_shape_cache ORDER BY ontology_version").all();
    expect(versions).toEqual([{ version: 1 }, { version: 2 }]);
    store.close();
  });
});
