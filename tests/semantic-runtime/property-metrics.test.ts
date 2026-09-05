import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { finalizeSnapshot, runKernel } from "../../packages/domain/src/index.js";
import { effectiveMetrics } from "../../packages/domain/src/property-metrics.js";
import { validSnapshot, physicalTables } from "../fixtures-v3.js";

it("executes property measures independently and composes their aggregates with proof references", async () => {
  const store = new SqlitePlatformStore(":memory:"); const data = new DatabaseSync(":memory:");
  try {
    data.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT, order_date TEXT, sales REAL, cost REAL); INSERT INTO retail.orders VALUES ('a','2026-01-01',100,30),('b','2026-01-02',300,70);");
    const snapshot = validSnapshot();
    snapshot.metrics[0]!.aggregation = "AVG";
    snapshot.metrics.push({ ...snapshot.metrics[2]!, id: "m_cost_share", label: "成本占比", name: "cost_share", leftMetricId: "p_cost", rightMetricId: "p_sales" });
    snapshot.metrics.push({ ...snapshot.metrics[0]!, id: "m_positive_cost", name: "positive_cost", label: "正数成本", definitionMode: "SQL", sourcePropertyId: "p_cost", aggregation: "CUSTOM", expression: "SUM(CASE WHEN `orders`.`cost` > 0 THEN `orders`.`cost` ELSE 0 END)" });
    expect(runKernel(snapshot).valid).toBe(true);
    store.savePublished(finalizeSnapshot(snapshot)); physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
    const platform = new OntologyPlatform(store, { execute: async (sql, parameters) => {
      const rows = data.prepare(sql).all(...parameters as string[]) as Record<string, unknown>[];
      return { rows, columns: Object.keys(rows[0] ?? {}), rowCount: rows.length, truncated: false };
    } });
    const context = platform.resolveOntologyContext({ namespace: "retail", purpose: "PLAN", include: { axioms: true, inferences: true }, concepts: { metrics: ["m_cost_share"] } });
    expect(context.metrics.map(m => m.id)).toEqual(expect.arrayContaining(["m_cost_share", "p_sales", "p_cost"]));
    expect(context.axioms.some(a => a.subjectId === "p_sales" && a.axiomCode === "NUMBER_SPEC_REQUIRED")).toBe(true);
    expect(context.inferences.find(i => i.subjectId === "m_cost_share")?.premiseAssertionIds).toEqual(["p_cost", "p_sales"]);
    const result = await platform.executeSemanticQuery({ namespace: "retail", queryMode: "FIXED_SHAPE", sessionId: context.sessionId, queryShape: { rootObjectId: "o_order", measureIds: ["p_sales", "m_sales", "m_cost_share", "m_positive_cost"], dimensionPropertyIds: [], filters: [], sort: [] }, options: { includeQueryIr: true, includeSqlPreview: true, includeAxioms: true } });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.data).toMatchObject({ rows: [{ 销售金额: 400, 销售额: 200, 成本占比: 25, 正数成本: 100 }] });
    expect((result.data as any).queryIr.measureIds).toEqual(["p_sales", "m_sales", "m_cost_share", "m_positive_cost"]);
  } finally { store.close(); data.close(); }
});

it("retrieves and queries a measure field when no named metrics exist", async () => {
  const snapshot = validSnapshot(); snapshot.metrics = [];
  const store = new SqlitePlatformStore(":memory:");
  try {
    store.savePublished(finalizeSnapshot(snapshot)); physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
    const platform = new OntologyPlatform(store, { execute: async () => ({ rows: [{ 销售金额: 100 }], columns: ["销售金额"], rowCount: 1, truncated: false }) });
    const context = platform.resolveOntologyContext({ namespace: "retail", purpose: "PLAN", concepts: { metrics: ["销售额"] } });
    expect(context.metrics.map(m => m.id)).toEqual(["p_sales"]);
    const result = await platform.executeSemanticQuery({ namespace: "retail", queryMode: "AUTO", question: "销售金额", options: { includeQueryIr: true } });
    expect(result.status).toBe("SUCCEEDED");
    expect((result.data as any).queryIr.measureIds).toEqual(["p_sales"]);
  } finally { store.close(); }
});

it("rejects unusable numeric defaults, hidden operands and cross-object compositions", () => {
  const snapshot = validSnapshot();
  const sales = snapshot.objects[0]!.properties.find(p => p.id === "p_sales")!;
  for (const patch of [{ sensitive: true }, { visibility: "DETAIL_ONLY" as const }, { numericSpec: { ...sales.numericSpec!, defaultAggregation: "NONE" as const } }, { numericSpec: { ...sales.numericSpec!, aggregationBehavior: "NON_ADDITIVE" as const } }]) {
    const copy = structuredClone(snapshot); Object.assign(copy.objects[0]!.properties.find(p => p.id === "p_sales")!, patch);
    expect(effectiveMetrics(copy).some(m => m.id === "p_sales")).toBe(false);
    copy.metrics[2]!.leftMetricId = "p_sales";
    expect(runKernel(copy).valid).toBe(false);
  }
  snapshot.metrics[2]!.leftMetricId = "p_sales"; snapshot.metrics[2]!.objectId = "o_store";
  expect(runKernel(snapshot).issues.some(i => i.code === "METRIC_SINGLE_FACT")).toBe(true);
});
