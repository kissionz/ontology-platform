import { expect, it } from "vitest";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { finalizeSnapshot } from "../../packages/domain/src/index.js";
import { ResolveSemanticContextInputSchema } from "../../packages/contracts/src/index.js";
import { validSnapshot } from "../fixtures-v3.js";

function setup(snapshot = validSnapshot()) {
  const store = new SqlitePlatformStore(":memory:");
  store.savePublished(snapshot);
  return new OntologyPlatform(store);
}
const base = { namespace: "retail", purpose: "PLAN" as const };

it("does not return the entire ontology on no match or a shared Chinese character", () => {
  const platform = setup();
  for (const question of ["天气预报", "销", "销售天气"]) {
    const context = platform.resolveOntologyContext({ ...base, question });
    expect(context.retrieval.status).toBe("NO_MATCH");
    for (const key of ["objects", "metrics", "relations", "axioms", "inferences", "candidates", "values"] as const) expect(context[key]).toEqual([]);
    expect(context.refs).toEqual({});
  }
});

it("prioritizes explicit unified terms and excludes unrelated question definitions", () => {
  const context = setup().resolveOntologyContext({ ...base, question: "各事业部毛利率和成本额", terms: [{ term: "销售额", role: "metrics" }], concepts: { dimensions: ["事业部"] }, projection: "standard" });
  expect(context.objects.map(o => o.id)).toEqual(["o_order"]);
  expect(context.metrics.map(m => m.id)).toEqual(["m_sales"]);
  expect(context.objects[0]!.properties.map(p => p.id)).toEqual(["p_order_id", "p_order_date", "p_sales"]);
  expect(context.relations).toEqual([]);
  expect(context.candidates).toEqual([expect.objectContaining({ kind: "metric", matchedBy: "销售额", role: "metrics", reason: expect.stringContaining("业务名称命中") })]);
});

it("returns intermediate join definitions and their closed axiom proof dependencies", () => {
  const context = setup().resolveOntologyContext({ ...base, projection: "standard", include: { axioms: true, inferences: true, evidence: true }, concepts: { metrics: ["销售额"], dimensions: ["事业部"] } });
  expect(context.relations.map(r => r.id)).toEqual(["r_order_store", "r_store_dept", "r_dept_bu"]);
  expect(context.inferences.some(i => i.predicate === "RELATION_REACHABLE" && i.subjectId === "o_order" && i.objectId === "o_bu")).toBe(true);
  const ids = new Set([...context.objects.flatMap(o => [o.id, ...o.properties.map(p => p.id)]), ...context.metrics.map(m => m.id), ...context.relations.map(r => r.id), ...context.hierarchies.map(h => h.id)]);
  for (const a of context.axioms) expect(a.sourceDefinitionIds.every(id => ids.has(id))).toBe(true);
  for (const inference of context.inferences) {
    expect(inference.axiomAssertionIds.every(id => context.axioms.some(a => a.id === id))).toBe(true);
    expect(inference.premiseAssertionIds.every(id => ids.has(id) || id.split(":").every(part => ids.has(part)))).toBe(true);
  }
});

it("includes derived metric operands and their numeric aggregation rules", () => {
  const context = setup().resolveOntologyContext({ ...base, projection: "standard", include: { axioms: true, inferences: true }, concepts: { metrics: ["毛利率"] } });
  expect(context.metrics.map(m => m.id)).toEqual(expect.arrayContaining(["m_margin", "m_sales", "m_cost"]));
  expect(context.axioms.some(a => a.axiomCode === "RATIO_NON_ADDITIVE" && a.subjectId === "m_margin")).toBe(true);
  expect(context.inferences.some(i => i.subjectId === "m_margin")).toBe(true);
  expect(context.objects[0]!.properties.map(p => p.id)).toEqual(expect.arrayContaining(["p_sales", "p_cost"]));
});

it("reports synonyms with multiple definitions as ambiguous without selecting one", () => {
  const snapshot = validSnapshot();
  snapshot.metrics[0]!.synonyms.push("金额"); snapshot.metrics[1]!.synonyms.push("金额");
  const context = setup(finalizeSnapshot(snapshot)).resolveOntologyContext({ ...base, concepts: { metrics: ["金额"] } });
  expect(context.retrieval.status).toBe("AMBIGUOUS");
  expect(context.ambiguities[0]!.candidates.map(c => c.id)).toEqual(["m_sales", "m_cost"]);
  expect(context.candidates.every(c => c.reason === "同义词命中")).toBe(true);
});

it("separates metric, dimension, filter and time fields and reports partial matches", () => {
  const context = setup().resolveOntologyContext({ ...base, concepts: { metrics: ["销售额"], dimensions: ["店铺"], filters: ["事业部"], time: ["业务日期", "今年"] } });
  expect(context.candidates.filter(c => c.role === "dimensions").map(c => c.propertyId)).toEqual(["p_store_name"]);
  expect(context.candidates.filter(c => c.role === "filters").map(c => c.propertyId)).toEqual(["p_bu_name"]);
  expect(context.retrieval).toMatchObject({ status: "PARTIAL_MATCH", unmatchedTerms: [{ role: "time", term: "今年", reason: "指定范围内未命中" }] });
});

it("preserves complete business terms and direct object ID matching", () => {
  const context = setup().resolveOntologyContext({ ...base, question: "事业部成本额", terms: ["o_order"] });
  expect(context.objects.map(o => o.id)).toEqual(["o_order"]);
  expect(context.metrics).toEqual([]);
  expect(context.retrieval.mode).toBe("UNIFIED");
});

it("validates bounded, nonblank concept arrays and rejects empty input", () => {
  expect(ResolveSemanticContextInputSchema.safeParse({ ...base, concepts: { metrics: [" "] } }).success).toBe(false);
  expect(ResolveSemanticContextInputSchema.safeParse({ ...base, concepts: { metrics: Array(17).fill("销售额") } }).success).toBe(false);
  expect(() => setup().resolveOntologyContext({ ...base, question: "  " })).toThrow("非空内容");
});

it("omits evidence by default while keeping the same candidates, definitions and planning constraints", () => {
  const platform = setup();
  const input = { ...base, concepts: { metrics: ["毛利率"], dimensions: ["事业部"] } };
  const minimal = platform.resolveOntologyContext(input);
  const debug = platform.resolveOntologyContext({ ...input, include: { axioms: true, inferences: true, evidence: true } });
  expect(minimal.axioms).toEqual([]);
  expect(minimal.inferences).toEqual([]);
  expect(Object.keys(minimal.refs).some(key => /^[AI]\d+$/.test(key))).toBe(false);
  for (const key of ["objects", "metrics", "relations", "candidates", "ambiguities", "relationPaths", "grainSummary", "additivitySummary"] as const) expect(minimal[key]).toEqual(debug[key]);
  expect(debug.axioms.length).toBeGreaterThan(0);
  expect(debug.inferences.some(i => "proof" in i && i.proof.length > 0)).toBe(true);
  const conclusions = platform.resolveOntologyContext({ ...input, include: { inferences: true } });
  expect(conclusions.inferences.length).toBeGreaterThan(0);
  expect(conclusions.inferences.every(i => !("proof" in i))).toBe(true);
  expect(conclusions.axioms).toEqual([]);
});

it("analysis mode forwards explicit evidence options but defaults to minimal context", async () => {
  const platform = setup();
  const input = { namespace: "retail", queryMode: "ANALYSIS" as const, question: "毛利率事业部" };
  const minimal = await platform.executeSemanticQuery(input);
  expect(minimal.data).toMatchObject({ context: { axioms: [], inferences: [] } });
  const debug = await platform.executeSemanticQuery({ ...input, options: { includeAxioms: true, includeInferenceEvidence: true } });
  expect((debug.data as any).context.axioms.length).toBeGreaterThan(0);
  expect((debug.data as any).context.inferences.some((i: any) => i.proof.length)).toBe(true);
});

it("query context stays minimal and invalid aggregation is still blocked before execution", async () => {
  const { physicalTables } = await import("../fixtures-v3.js");
  const store = new SqlitePlatformStore(":memory:");
  let executions = 0;
  try {
    const snapshot = validSnapshot();
    store.savePublished(snapshot); physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
    const platform = new OntologyPlatform(store, { execute: async () => { executions++; return { rows: [{ 销售额: 100 }], columns: ["销售额"], rowCount: 1, truncated: false }; } });
    const input = { namespace: "retail", queryMode: "FIXED_SHAPE" as const, queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [], sort: [] }, options: { includeOntologyContext: true } };
    const result = await platform.executeSemanticQuery(input);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.data).toMatchObject({ ontologyContext: { axioms: [], inferences: [] } });
    const invalid = validSnapshot("retail", 2);
    invalid.objects[0]!.properties.find(p => p.id === "p_sales")!.numericSpec!.aggregationBehavior = "NON_ADDITIVE";
    store.savePublished(finalizeSnapshot(invalid));
    const blocked = await platform.executeSemanticQuery({ ...input, ontologyVersion: 2 });
    expect(blocked.status).not.toBe("SUCCEEDED");
    expect(executions).toBe(1);
  } finally { store.close(); }
});
