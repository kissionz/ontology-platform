import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { OntologyRelation } from "../../packages/contracts/src/index.js";
import type { OntologySnapshot, PhysicalTable } from "../../packages/contracts/src/legacy.js";
import { runKernel } from "../../packages/domain/src/index.js";
import { relationTraversals, relationJoinExpression, RELATION_RULES } from "../../packages/domain/src/relations.js";
import { QueryIrCompiler } from "../../packages/sql-selectdb/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

const shape = { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: ["p_store_name"], filters: [], resultKind: "aggregate" as const, title: "店铺销售" };
function compile(snapshot: ReturnType<typeof validSnapshot>, intent = shape) {
  return new QueryIrCompiler().compile(intent, snapshot as unknown as OntologySnapshot, physicalTables() as unknown as PhysicalTable[]);
}

it.each(Object.keys(RELATION_RULES) as OntologyRelation["type"][])("%s produces type-specific axioms and query or lineage evidence", type => {
  const snapshot = validSnapshot();
  const relation = snapshot.relations[0]!;
  relation.type = type;
  if (type === "IDENTITY") { relation.sourcePropertyId = "p_order_id"; relation.cardinality = "ONE_TO_ONE"; }
  if (type === "HIERARCHY") { snapshot.objects[0]!.objectType = "ENTITY"; }
  if (type === "COMPOSITION") relation.composition = { parentObjectId: "o_store", childObjectId: "o_order", ownership: "OWNED", aggregationPolicy: "PRE_AGGREGATE_CHILD" };
  relation.joinExpression = relationJoinExpression(snapshot, relation);
  const result = runKernel(snapshot);
  expect(result.issues).toEqual([]);
  expect(result.axioms.find(a => a.subjectId === relation.id && a.axiomCode === RELATION_RULES[type])?.parameters).toMatchObject({ type, enabled: true, required: false });
  const evidence = result.inferences.find(i => i.premiseAssertionIds.includes(relation.id) && i.predicate === (type === "DERIVED" ? "RELATION_LINEAGE" : "RELATION_QUERY_POLICY"));
  expect(evidence?.proof.map(p => p.kind)).toEqual(["FACT", "AXIOM", "DERIVATION"]);
  expect(evidence?.axiomAssertionIds.every(id => result.axioms.some(a => a.id === id))).toBe(true);
  if (type === "DERIVED") expect(() => compile(snapshot)).toThrow("没有可用关系");
  else expect(compile(snapshot).sql).toContain("JOIN");
});

it("rejects invalid identity, event, hierarchy, composition and field mappings", () => {
  const snapshot = validSnapshot();
  const relation = snapshot.relations[0]!;
  relation.type = "IDENTITY";
  expect(runKernel(snapshot).issues.some(i => i.code === "RELATION_IDENTITY")).toBe(true);
  relation.type = "EVENT_PARTICIPATION";
  snapshot.objects[0]!.objectType = "ENTITY";
  expect(runKernel(snapshot).issues.some(i => i.code === "RELATION_EVENT")).toBe(true);
  relation.type = "COMPOSITION";
  expect(runKernel(snapshot).issues.some(i => i.code === "RELATION_COMPOSITION")).toBe(true);
  relation.type = "ASSOCIATION";
  relation.targetPropertyId = "p_store_name";
  relation.joinExpression = relationJoinExpression(snapshot, relation);
  expect(runKernel(snapshot).issues.some(i => i.code === "RELATION_CARDINALITY_FANOUT")).toBe(true);
  relation.targetPropertyId = "p_store_id";
  expect(runKernel(snapshot).issues.some(i => i.code === "RELATION_BINDING")).toBe(true);
  for (const type of ["HIERARCHY", "COMPOSITION", "DERIVED"] as const) {
    const s = validSnapshot();
    const forward = { ...s.relations[1]!, type };
    if (type === "COMPOSITION") forward.composition = { childObjectId: "o_store", parentObjectId: "o_dept", ownership: "SHARED", aggregationPolicy: "PRE_AGGREGATE_CHILD" };
    const reverse = { ...forward, id: "cycle", sourceObjectId: forward.targetObjectId, targetObjectId: forward.sourceObjectId };
    if (type === "COMPOSITION") reverse.composition = { ...forward.composition!, childObjectId: "o_dept", parentObjectId: "o_store" };
    s.relations = [forward, reverse];
    expect(runKernel(s).issues.some(i => i.code === RELATION_RULES[type] && i.message.includes("循环"))).toBe(true);
  }
});

it("direction, enablement, fanout and composition policy change both paths and SQL eligibility", () => {
  const snapshot = validSnapshot();
  const r = snapshot.relations[0]!;
  const original = runKernel(snapshot).inferenceDigest;
  r.direction = "TARGET_TO_SOURCE";
  expect(relationTraversals(r)).toEqual([{ from: "o_store", to: "o_order", cardinality: "ONE_TO_MANY", safe: false }]);
  expect(runKernel(snapshot).inferences.some(i => i.predicate === "RELATION_REACHABLE" && i.subjectId === "o_order")).toBe(false);
  expect(() => compile(snapshot)).toThrow("没有可用关系");
  r.direction = "SOURCE_TO_TARGET"; r.enabled = false;
  expect(relationTraversals(r)).toEqual([]);
  expect(() => compile(snapshot)).toThrow("没有可用关系");
  r.enabled = true; r.fanoutRisk = "HIGH";
  expect(relationTraversals(r)[0]?.safe).toBe(false);
  expect(() => compile(snapshot)).toThrow("高扇出");
  r.fanoutRisk = "NONE"; r.type = "COMPOSITION"; r.direction = "BIDIRECTIONAL";
  r.composition = { parentObjectId: "o_store", childObjectId: "o_order", ownership: "OWNED", aggregationPolicy: "PRE_AGGREGATE_CHILD" };
  const query = { ...shape, rootObjectId: "o_store" };
  expect(compile(snapshot, query).ir.rootObjectId).toBe("o_order");
  r.composition.aggregationPolicy = "EXISTS_ONLY";
  expect(relationTraversals(r).every(p => !p.safe)).toBe(true);
  expect(() => compile(snapshot)).toThrow("仅允许用于 EXISTS");
  const existsQuery = new QueryIrCompiler().compile({ ...shape, dimensionPropertyIds: [], filters: [{ kind: "BOUND_VALUE", valueBindingId: "store_match", objectId: "o_store", propertyId: "p_store_name", operator: "EQ", value: "一店", businessValue: "一店", evidenceTier: "EXACT_VALUE", objectPriority: 50, propertyPriority: 50 }] }, snapshot as unknown as OntologySnapshot, physicalTables() as unknown as PhysicalTable[]);
  expect(existsQuery.sql).toContain("WHERE EXISTS (");
  expect(existsQuery.parameters).toEqual(["一店"]);
  expect(existsQuery.ir.relationIds).toContain(r.id);
  expect(runKernel(snapshot).inferenceDigest).not.toBe(original);
});

it("publishing a required relationship changes actual query rows and emits the governing axiom", async () => {
  const data = new DatabaseSync(":memory:");
  const store = new SqlitePlatformStore(":memory:");
  try {
    data.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT, store_ref TEXT, sales REAL); CREATE TABLE retail.store(store_id TEXT, store_name TEXT); INSERT INTO retail.store VALUES ('s1','一店'); INSERT INTO retail.orders VALUES ('a','s1',70),('b','missing',30);");
    store.savePublished(validSnapshot());
    physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
    const platform = new OntologyPlatform(store, { execute: async (sql, parameters) => {
      const rows = data.prepare(sql).all(...parameters as string[]) as Record<string, unknown>[];
      return { columns: Object.keys(rows[0] ?? {}), rows, rowCount: rows.length, truncated: false };
    } });
    const execute = (version: number) => platform.executeSemanticQuery({ namespace: "retail", ontologyVersion: version, queryMode: "FIXED_SHAPE", queryShape: { ...shape, sort: [] }, options: { includeSqlPreview: true, includeAxioms: true, includeInferenceEvidence: true } });
    const before = await execute(1);
    expect(before.status).toBe("SUCCEEDED");
    expect((before.data as any).rows).toHaveLength(2);
    const draft = platform.createDraft("retail");
    const relation = { ...draft.snapshot.relations[0]!, required: true };
    const edited = platform.applyDraftPatch("retail", draft.draftId, draft.revision, [{ op: "UPSERT_RELATION", value: relation }]);
    expect(edited.validation.valid).toBe(true);
    platform.publishDraft("retail", draft.draftId, 1, "必须匹配店铺");
    const after = await execute(2);
    expect(after.status).toBe("SUCCEEDED");
    expect((after.data as any).rows).toEqual([{ 店铺名称: "一店", 销售额: 70 }]);
    expect((after.data as any).sqlPreview.sql).toContain("INNER JOIN");
    expect((after.data as any).axioms.some((a: any) => a.subjectId === relation.id && a.parameters.required === true)).toBe(true);
    expect((await execute(1)).data).toMatchObject({ rows: (before.data as any).rows });
    const context = platform.resolveOntologyContext({ namespace: "retail", purpose: "PLAN", terms: ["订单", "店铺"], ontologyVersion: 2 });
    expect(context.relationPaths.find(p => p.relationIds.includes(relation.id))).toMatchObject({ from: "o_order", to: "o_store", safe: true, required: true });
    const invalid = platform.createDraft("retail");
    platform.applyDraftPatch("retail", invalid.draftId, invalid.revision, [{ op: "UPSERT_RELATION", value: { ...relation, type: "IDENTITY" } }]);
    expect(() => platform.publishDraft("retail", invalid.draftId, 2)).toThrow();
  } finally { store.close(); data.close(); }
});

it("keeps physical joins and axiom parameters synchronized when an object is renamed", () => {
  const store = new SqlitePlatformStore(":memory:");
  try {
    store.savePublished(validSnapshot());
    const platform = new OntologyPlatform(store);
    const draft = platform.createDraft("retail");
    const object = { ...draft.snapshot.objects[0]!, name: "sales_events" };
    const edited = platform.applyDraftPatch("retail", draft.draftId, draft.revision, [{ op: "UPSERT_OBJECT", value: object }]);
    expect(edited.validation.valid).toBe(true);
    expect(edited.snapshot.relations[0]!.joinExpression).toBe("sales_events.store_ref = store.store_id");
    expect(edited.snapshot.axiomAssertions.find(a => a.subjectId === "r_order_store" && a.axiomCode === "RELATION_BINDING")?.parameters.joinExpression).toBe("sales_events.store_ref = store.store_id");
    expect(compile(edited.snapshot).sql).toContain("t0.`store_ref` = t1.`store_id`");
  } finally { store.close(); }
});
