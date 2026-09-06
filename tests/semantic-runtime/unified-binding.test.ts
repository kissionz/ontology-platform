import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { finalizeSnapshot, runKernel } from "../../packages/domain/src/index.js";
import { validSnapshot, physicalTables, property } from "../fixtures-v3.js";

const stores: SqlitePlatformStore[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
function fixture() {
  const snapshot = validSnapshot();
  const org = snapshot.objects.find(o => o.id === "o_bu")!;
  org.label = "组织渠道"; org.bindingPriority = 80;
  org.properties[1]!.label = "组织渠道"; org.properties[1]!.synonyms = [];
  const dept = snapshot.objects.find(o => o.id === "o_dept")!;
  return { snapshot, org, dept };
}
function setup(snapshot = fixture().snapshot) {
  const store = new SqlitePlatformStore(":memory:"); stores.push(store);
  store.savePublished(finalizeSnapshot(snapshot)); physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
  store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [{ displayValue: "线上", frequency: 1 }, { displayValue: "线上渠道", frequency: 1 }]);
  store.replaceIndexedValues("retail", 1, "o_dept", "p_dept_name", [{ displayValue: "线上", frequency: 900 }]);
  return { store, app: new OntologyPlatform(store) };
}
const base = { namespace: "retail", purpose: "PLAN" as const };

it("merges an object with its primary name property while retaining concrete values", () => {
  const { app, store } = setup();
  const result = app.resolveOntologyContext({ ...base, terms: ["组织渠道"] });
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ kind: "object", id: "o_bu", propertyId: "p_bu_name", identityPropertyIds: ["p_bu_id"], matchedSources: ["object", "property"] });
  store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [{ displayValue: "组织渠道", frequency: 1 }]);
  const ambiguous = app.resolveOntologyContext({ ...base, terms: ["组织渠道"] });
  expect(ambiguous.retrieval.status).toBe("AMBIGUOUS");
  expect(ambiguous.candidates.map(c => c.kind)).toEqual(["object", "value"]);
});

it("uses business priority instead of value frequency, and clarifies equal priority", () => {
  const { snapshot, org } = fixture();
  const { app } = setup(snapshot);
  expect(app.resolveOntologyContext({ ...base, terms: ["线上"] }).values.map(v => v.objectId)).toEqual(["o_bu"]);
  org.bindingPriority = 50;
  const tie = setup(snapshot).app.resolveOntologyContext({ ...base, terms: ["线上"] });
  expect(tie.retrieval.status).toBe("AMBIGUOUS");
  expect(tie.ambiguities).toHaveLength(1);
  expect(tie.ambiguities[0]!.candidates).toHaveLength(2);
  org.properties[1]!.inheritBindingPriority = false; org.properties[1]!.bindingPriority = 90;
  expect(setup(snapshot).app.resolveOntologyContext({ ...base, terms: ["线上"] }).values.map(v => v.objectId)).toEqual(["o_bu"]);
});

it("enforces explicit scope before priority and never falls back outside an unknown scope", () => {
  const { app } = setup();
  const scoped = app.resolveOntologyContext({ ...base, terms: [{ term: "线上", role: "values", object: "部门", property: "部门名称" }] });
  expect(scoped.values.map(v => v.objectId)).toEqual(["o_dept"]);
  expect(scoped.bindings[0]).toMatchObject({ status: "BOUND", selected: { objectId: "o_dept", propertyId: "p_dept_name" }, filter: { propertyId: "p_dept_name", operator: "EQ", value: "线上" } });
  const unknown = app.resolveOntologyContext({ ...base, terms: [{ term: "线上", object: "不存在的对象" }] });
  expect(unknown.retrieval.status).toBe("NO_MATCH"); expect(unknown.values).toEqual([]);
  const compatible = app.resolveOntologyContext({ ...base, concepts: { filters: [{ object: "部门", value: "线上" }] } });
  expect(compatible.values[0]!.objectId).toBe("o_dept");
});

it("does not infer filter ownership from a grouping dimension", () => {
  const result = setup().app.resolveOntologyContext({ ...base, terms: ["销售额", { term: "部门", role: "dimensions" }, { term: "线上", role: "values" }] });
  expect(result.values[0]!.objectId).toBe("o_bu");
  expect(result.bindings.find(b => b.role === "dimensions")?.selected).toMatchObject({ objectId: "o_dept", propertyId: "p_dept_name" });
});

it("discovers an indexed value without requiring its property to be mentioned", () => {
  const result = setup().app.resolveOntologyContext({ ...base, terms: ["销售额", "线上渠道"] });
  expect(result.retrieval.status).toBe("MATCHED");
  expect(result.values).toEqual([expect.objectContaining({ objectId: "o_bu", objectLabel: "组织渠道", propertyId: "p_bu_name", propertyLabel: "组织渠道", displayValue: "线上渠道" })]);
  expect(result.objects.map(o => o.id)).toEqual(["o_order", "o_bu"]);
  expect(result.relations).toEqual([]); expect(result.hierarchies).toEqual([]);
  expect(result.axioms).toEqual([]); expect(result.inferences).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("joinExpression"); expect(JSON.stringify(result)).not.toContain('"expression"');
  const details = setup().app.resolveOntologyContext({ ...base, terms: ["毛利率", "线上渠道"], projection: "standard" });
  expect(details.metrics.map(m => m.id)).toEqual(expect.arrayContaining(["m_sales", "m_cost", "m_margin"]));
  expect(details.relations).toHaveLength(3);
});

it("rejects unreachable high-priority candidates before selecting a reachable value", () => {
  const { snapshot, org } = fixture();
  const other = structuredClone(org); other.id = "o_other"; other.bindingPriority = 100;
  other.properties.forEach(p => p.id += "_other"); other.grainPropertyIds = [other.properties[0]!.id];
  snapshot.objects.push(other);
  const { app, store } = setup(snapshot);
  store.replaceIndexedValues("retail", 1, "o_other", other.properties[1]!.id, [{ displayValue: "线上渠道", frequency: 999 }]);
  const result = app.resolveOntologyContext({ ...base, terms: ["销售额", "线上渠道"] });
  expect(result.values.map(v => v.objectId)).toEqual(["o_bu"]);
  snapshot.relations[2]!.enabled = false;
  const blocked = setup(snapshot).app.resolveOntologyContext({ ...base, terms: ["销售额", { term: "线上渠道", object: "组织渠道" }] });
  expect(blocked.retrieval.status).toBe("PARTIAL_MATCH"); expect(blocked.values).toEqual([]);
});

it("requires a primary name when multiple name attributes exist", () => {
  const { snapshot, org } = fixture(); org.properties.push(property("p_org_alias", "简称", "NAME"));
  const ambiguous = setup(snapshot).app.resolveOntologyContext({ ...base, terms: [{ term: "组织渠道", role: "dimensions" }] });
  expect(ambiguous.retrieval.status).toBe("AMBIGUOUS");
  org.primaryNamePropertyId = "p_org_alias";
  const resolved = setup(snapshot).app.resolveOntologyContext({ ...base, terms: [{ term: "组织渠道", role: "dimensions" }] });
  expect(resolved.candidates[0]!.propertyId).toBe("p_org_alias");
  org.primaryNamePropertyId = "p_bu_id";
  expect(runKernel(snapshot).valid).toBe(false);
});

it("respects version, visibility, index enablement and exact-value matching", () => {
  const { snapshot, org } = fixture(); org.properties[1]!.valueSearchable = false;
  const { app, store } = setup(snapshot);
  store.replaceIndexedValues("retail", 2, "o_dept", "p_dept_name", [{ displayValue: "未来值", frequency: 999 }]);
  expect(app.resolveOntologyContext({ ...base, terms: ["线上渠道"] }).values).toEqual([]);
  expect(app.resolveOntologyContext({ ...base, terms: ["未来值"] }).values).toEqual([]);
  expect(app.resolveOntologyContext({ ...base, terms: ["线"] }).values).toEqual([]);
  expect(app.resolveOntologyContext({ ...base, terms: ["线上"], include: { values: false } }).values).toEqual([]);
});

it("executes a value binding from compact output and keeps identical entity names separate", async () => {
  const { app, store } = setup();
  const context = app.resolveOntologyContext({ ...base, terms: ["销售额", { term: "店铺", role: "dimensions" }] });
  const name = context.bindings.find(b => b.role === "dimensions")!.selected!.propertyId!;
  const data = new DatabaseSync(":memory:");
  try {
    data.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT,store_ref TEXT,sales REAL); CREATE TABLE retail.store(store_id TEXT,store_name TEXT); INSERT INTO retail.orders VALUES ('1','a',100),('2','b',200); INSERT INTO retail.store VALUES ('a','同名店铺'),('b','同名店铺');");
    const runtime = new OntologyPlatform(store, { execute: async (sql, parameters) => { const rows = data.prepare(sql).all(...parameters as string[]) as Record<string, unknown>[]; return { columns: Object.keys(rows[0] ?? {}), rows, rowCount: rows.length, truncated: false }; } });
    const result = await runtime.executeSemanticQuery({ namespace: "retail", queryMode: "FIXED_SHAPE", sessionId: context.sessionId, queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [name], filters: [], sort: [] } });
    expect(result.status).toBe("SUCCEEDED"); expect((result.data as any).rows).toEqual([{ 店铺名称: "同名店铺", 销售额: 100 }, { 店铺名称: "同名店铺", 销售额: 200 }]);
    store.replaceIndexedValues("retail", 1, "o_store", "p_store_name", [{ displayValue: "同名店铺", frequency: 2 }]);
    const filterContext = app.resolveOntologyContext({ ...base, terms: ["销售额", { term: "同名店铺", object: "店铺" }] });
    const filtered = await runtime.executeSemanticQuery({ namespace: "retail", queryMode: "FIXED_SHAPE", sessionId: filterContext.sessionId, queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: filterContext.values.map(v => v.filter), sort: [] } });
    expect(filtered.status).toBe("SUCCEEDED"); expect((filtered.data as any).rows).toEqual([{ 销售额: 300 }]);
  } finally { data.close(); }
});
