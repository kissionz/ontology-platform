import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { OntologyObject, OntologyRelation } from "../../packages/contracts/src/index.js";
import { runKernel } from "../../packages/domain/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import type { OntologySnapshot as LegacySnapshot, PhysicalTable as LegacyTable } from "../../packages/contracts/src/legacy.js";
import { QueryIrCompiler } from "../../packages/sql-selectdb/src/index.js";
import { physicalTables, property, validSnapshot } from "../fixtures-v3.js";

describe("Phase 7 non-functional targets", () => {
  it("rebuilds axioms and inferences for 1,000 objects and 5,000 relations within 5 seconds", () => {
    const objects: OntologyObject[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `o_${index}`,
      name: `object_${index}`,
      label: `对象 ${index}`,
      description: "性能验收对象",
      sourceTableId: `t_${index}`,
      status: "PUBLISHED",
      objectType: "ENTITY",
      grainPropertyIds: [`p_${index}_id`],
      grain: "ID",
      exampleQuestions: [],
      properties: [property(`p_${index}_id`, `ID ${index}`, "ID")],
      synonyms: [],
      bindingPriority: 50,
    }));
    const relations: OntologyRelation[] = Array.from({ length: 5_000 }, (_, index) => ({
      id: `r_${index}`,
      name: `关系 ${index}`,
      sourceObjectId: "o_0",
      targetObjectId: "o_999",
      type: "REFERENCE",
      cardinality: "MANY_TO_ONE",
      joinExpression: `t_0.id = t_999.id`,
      sourcePropertyId: "p_0_id",
      targetPropertyId: "p_999_id",
      direction: "SOURCE_TO_TARGET",
      required: false,
      enabled: true,
      fanoutRisk: "NONE",
      status: "PUBLISHED",
    }));
    const started = performance.now();
    const result = runKernel({ version: 1, objects, relations, metrics: [], dimensionHierarchies: [] });
    const elapsed = performance.now() - started;
    expect(result.valid).toBe(true);
    expect(result.axioms.length).toBe(18_000);
    expect(elapsed).toBeLessThanOrEqual(5_000);
  }, 10_000);

  it("meets summary, context, value search and plan compile P95 targets", () => {
    const store = new SqlitePlatformStore(":memory:");
    const snapshot = validSnapshot();
    store.savePublished(snapshot);
    physicalTables().forEach((table) => store.putPhysicalTable("selectdb", table));
    store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [{ displayValue: "品牌电商", frequency: 10 }]);
    const platform = new OntologyPlatform(store);
    const compiler = new QueryIrCompiler();
    const summary = measure(80, () => platform.summary("retail", 1));
    const context = measure(40, () => platform.resolveOntologyContext({ namespace: "retail", ontologyVersion: 1, question: "品牌电商事业部销售额", purpose: "PLAN", include: { values: true, axioms: true, inferences: true, evidence: true } }));
    const values = measure(80, () => store.searchValues("retail", 1, "品牌", 20));
    const compile = measure(80, () => compiler.compile({ rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: ["p_bu_name"], filters: [], resultKind: "aggregate", title: "性能验收" }, snapshot as unknown as LegacySnapshot, physicalTables() as unknown as LegacyTable[]));
    expect(p95(summary)).toBeLessThanOrEqual(150);
    expect(p95(context)).toBeLessThanOrEqual(300);
    expect(p95(values)).toBeLessThanOrEqual(300);
    expect(p95(compile)).toBeLessThanOrEqual(500);
    store.close();
  });
});

function measure(count: number, work: () => unknown) {
  return Array.from({ length: count }, () => {
    const started = performance.now();
    work();
    return performance.now() - started;
  });
}
function p95(values: number[]) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;
}
