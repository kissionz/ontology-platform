import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { QueryIrSchema } from "../../packages/contracts/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

let app: ReturnType<typeof buildApp>;
let calls: Array<{ sql: string; parameters: unknown[] }>;
const base = { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: ["p_bu_name"], filters: [], sort: [], limit: 20 };
beforeEach(() => {
  calls = [];
  app = buildApp({ databasePath: ":memory:", apiKey: "advanced-test", logger: false, queryExecutor: { async execute(sql, parameters) { calls.push({ sql, parameters }); return { columns: [], rows: [], rowCount: 0, truncated: false }; } } });
  app.platformStore.savePublished(validSnapshot());
  physicalTables().forEach(table => app.platformStore.putPhysicalTable("selectdb", table));
});
afterEach(async () => { await app.close(); });
async function query(shape: Record<string, unknown>, parameters?: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/v1/semantic-query", headers: { authorization: "Bearer advanced-test" }, payload: { queryMode: "FIXED_SHAPE", namespace: "retail", queryShape: { ...base, ...shape }, parameters, options: { includeQueryIr: true } } });
}
function successful(response: Awaited<ReturnType<typeof query>>) {
  const body = response.json();
  expect(body, JSON.stringify(body)).toMatchObject({ status: "SUCCEEDED" });
  expect(QueryIrSchema.safeParse(body.data.queryIr).error).toBeUndefined();
  return body.data.queryIr;
}
describe("advanced calculations through the public HTTP contract", () => {
  it("computes percent of total and group Top N in SQL", async () => {
    const ir = successful(await query({
      dimensionPropertyIds: ["p_bu_name", "p_store_name"],
      windowCalculations: [{ id: "share", label: "销售占比", measureId: "m_sales", operator: "PERCENT_OF_TOTAL", partitionByPropertyIds: [], scale: 100 }],
      groupSelections: [{ id: "top", label: "事业部前二", operator: "TOP_N", partitionByPropertyIds: ["p_bu_name"], orderByEntityId: "m_sales", count: 2, ties: "EXCLUDE" }],
    }));
    expect(ir.windowCalculations[0].operator).toBe("PERCENT_OF_TOTAL");
    expect(calls[0]?.sql).toContain("OVER");
    expect(calls[0]?.sql).toContain("ROW_NUMBER()");
  });
  it("preserves grouped filter logic, dynamic values and aggregate conditions", async () => {
    const ir = successful(await query({
      filterExpression: { type: "GROUP", operator: "OR", children: [
        { type: "CONDITION", filter: { propertyId: "p_bu_name", operator: "EQ", value: "$division" } },
        { type: "NOT", child: { type: "CONDITION", filter: { propertyId: "p_bu_name", operator: "PREFIX", value: "直营" } } },
      ] },
      aggregateFilters: [{ entityId: "m_sales", operator: "GT", value: 100 }],
    }, { division: "品牌电商" }));
    expect(ir.filterExpression.operator).toBe("OR");
    expect(calls[0]?.parameters).toEqual(expect.arrayContaining(["品牌电商", "直营", 100]));
    expect(calls[0]?.sql).toContain(" OR ");
    expect(calls[0]?.sql).not.toContain("品牌电商");
  });
  it("executes structured time comparison and running totals", async () => {
    const ir = successful(await query({
      dimensionPropertyIds: [],
      timeRange: { expression: "2025年", kind: "ABSOLUTE_YEAR", year: 2025 },
      timeGrain: { unit: "MONTH" },
      timeComparisons: [{ id: "growth", label: "同比", measureId: "m_sales", comparison: "YEAR_OVER_YEAR", output: "GROWTH_RATE" }],
      windowCalculations: [{ id: "running", label: "累计", measureId: "m_sales", operator: "RUNNING_SUM", partitionByPropertyIds: [], orderBy: { entityId: "__time__", direction: "ASC" } }],
    }));
    expect(ir.timeRange.start).toContain("2025-01-01");
    expect(ir.timeComparisons).toHaveLength(1);
    expect(calls[0]?.sql).toContain("UNBOUNDED PRECEDING");
  });
  it("applies every-period conditions and derived calculations", async () => {
    const ir = successful(await query({
      measureIds: ["m_sales", "m_cost"],
      timeRange: { expression: "近三年" }, timeGrain: { unit: "YEAR" },
      derivedMeasures: [{ id: "profit", label: "毛利额", operator: "SUBTRACT", leftMeasureId: "m_sales", rightMeasureId: "m_cost" }],
      periodConditions: [{ id: "each_year", label: "每年达标", measureId: "m_sales", operator: "GT", value: 100, quantifier: "EVERY", groupByPropertyIds: ["p_bu_name"], missingPeriodPolicy: "FAIL" }],
    }));
    expect(ir.periodConditions[0].expectedPeriodCount).toBe(3);
    expect(ir.derivedMeasures[0].operator).toBe("SUBTRACT");
    expect(calls[0]?.parameters).toContain(100);
  });
  it("rejects malformed advanced definitions before database execution", async () => {
    const response = await query({ groupSelections: [{ id: "bad", label: "bad", operator: "TOP_N", partitionByPropertyIds: [], orderByEntityId: "m_sales", count: -1, ties: "EXCLUDE" }] });
    expect(response.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
