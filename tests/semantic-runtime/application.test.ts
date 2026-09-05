import { describe, expect, it } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { validSnapshot, physicalTables } from "../fixtures-v3.js";
function setup() {
  const store = new SqlitePlatformStore(":memory:");
  const snapshot = validSnapshot();
  store.savePublished(snapshot);
  physicalTables().forEach((table) =>
    store.putPhysicalTable("selectdb", table),
  );
  store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [
    { displayValue: "品牌电商", frequency: 20 },
  ]);
  return {
    store,
    platform: new OntologyPlatform(store, {
      execute: async () => ({
        columns: ["事业部名称", "销售额"],
        rows: [{ 事业部名称: "品牌电商", 销售额: 120 }],
        rowCount: 1,
        truncated: false,
      }),
    }),
  };
}
describe("Phase 3 semantic facade", () => {
  it("resolves complete version-pinned context in one call", () => {
    const { platform } = setup();
    const context = platform.resolveOntologyContext({
      namespace: "retail",
      ontologyVersion: "latest",
      question: "品牌电商事业部销售额",
      purpose: "ANSWER",
      include: { values: true, axioms: true, inferences: true, evidence: true },
    });
    expect(context.ontologyVersion).toBe(1);
    expect(context.objects.length).toBeGreaterThan(0);
    expect(context.metrics.map((m) => m.id)).toContain("m_sales");
    expect(context.values.map((v) => v.displayValue)).toContain("品牌电商");
    expect(context.axioms.length).toBeGreaterThan(0);
    expect(context.inferences.length).toBeGreaterThan(0);
    expect(Object.keys(context.refs)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^O/),
        expect.stringMatching(/^M/),
        expect.stringMatching(/^A/),
      ]),
    );
    expect(context.contextDigest).toHaveLength(64);
  });
  it("keeps candidate ranking and digest stable", () => {
    const { platform } = setup();
    const input = {
      namespace: "retail",
      ontologyVersion: "latest" as const,
      question: "按事业部看销售额",
      purpose: "PLAN" as const,
    };
    const a = platform.resolveOntologyContext(input),
      b = platform.resolveOntologyContext(input);
    expect(a.candidates).toEqual(b.candidates);
    const { sessionId: _a, expiresAt: _ea, ...restA } = a,
      { sessionId: _b, expiresAt: _eb, ...restB } = b;
    expect(restA.contextDigest).toBe(restB.contextDigest);
  });
  it("Q09 completes a clear AUTO query in one application call", async () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    physicalTables().forEach((table) => store.putPhysicalTable("selectdb", table));
    let calls = 0;
    const platform = new OntologyPlatform(store, {
      execute: async () => {
        calls += 1;
        return { columns: ["销售额"], rows: [{ 销售额: 120 }], rowCount: 1, truncated: false };
      },
    });
    const result: any = await platform.executeSemanticQuery({
      queryMode: "AUTO",
      namespace: "retail",
      question: "按事业部看销售额",
      options: { includeQueryIr: true, includeSqlPreview: true },
    });
    expect(result.data.status).toBe("SUCCEEDED");
    expect(result.data.rows).toHaveLength(1);
    expect(result.data.sqlPreview.sql).toContain("SELECT");
    expect(calls).toBe(1);
    store.close();
  });
  it("rejects a session reused against another ontology version", async () => {
    const { platform, store } = setup();
    const context = platform.resolveOntologyContext({
      namespace: "retail",
      question: "销售额",
      purpose: "PLAN",
    });
    const v2 = validSnapshot("retail", 2);
    v2.baseVersion = 1;
    store.savePublished(v2);
    const result: any = await platform.executeSemanticQuery({
      queryMode: "FIXED_SHAPE",
      namespace: "retail",
      ontologyVersion: 2,
      sessionId: context.sessionId,
      queryShape: {
        rootObjectId: "o_order",
        measureIds: ["m_sales"],
        dimensionPropertyIds: [],
        filters: [],
        sort: [],
        limit: 10,
      },
    });
    expect(result.error.code).toBe("SESSION_VERSION_MISMATCH");
  });
  it("Q10 returns every ambiguity together", async () => {
    const { platform, store } = setup();
    const v2 = validSnapshot("ambiguous", 1);
    v2.metrics.push({
      ...v2.metrics[0]!,
      id: "m_sales_duplicate",
      name: "sales_duplicate",
    });
    store.savePublished(v2);
    const result: any = await platform.executeSemanticQuery({
      queryMode: "AUTO",
      namespace: "ambiguous",
      question: "销售额",
    });
    expect(result.data.status).toBe("NEEDS_CLARIFICATION");
    expect(result.data.clarifications[0].candidates).toHaveLength(2);
  });
});

it("binds business values into parameterized SQL and executes session short references", async () => {
  const store = new SqlitePlatformStore(":memory:");
  store.savePublished(validSnapshot());
  physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
  store.replaceIndexedValues("retail", 1, "o_bu", "p_bu_name", [{ displayValue: "品牌电商", frequency: 20 }]);
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const platform = new OntologyPlatform(store, { async execute(sql, parameters) { calls.push({ sql, parameters }); return { columns: [], rows: [], rowCount: 0, truncated: false }; } });
  const result = await platform.executeSemanticQuery({ queryMode: "AUTO", namespace: "retail", question: "品牌电商销售额" });
  expect(result.status).toBe("SUCCEEDED");
  expect(calls[0]?.parameters).toContain("品牌电商");
  expect(calls[0]?.sql).not.toContain("品牌电商");
  const context = platform.resolveOntologyContext({ namespace: "retail", question: "销售额", purpose: "PLAN" });
  const objectRef = Object.keys(context.refs).find(key => context.refs[key] === "o_order")!;
  const metricRef = Object.keys(context.refs).find(key => context.refs[key] === "m_sales")!;
  const fixed = await platform.executeSemanticQuery({ queryMode: "FIXED_SHAPE", namespace: "retail", sessionId: context.sessionId, queryShape: { rootObjectId: objectRef, measureIds: [metricRef], dimensionPropertyIds: [], filters: [], sort: [], limit: 20 } });
  expect(fixed.status).toBe("SUCCEEDED");
  store.close();
});

it("carries AUTO time ranges through the migrated SQL compiler", async () => {
  const store = new SqlitePlatformStore(":memory:");
  store.savePublished(validSnapshot());
  physicalTables().forEach(t => store.putPhysicalTable("selectdb", t));
  const calls: unknown[][] = [];
  const platform = new OntologyPlatform(store, { async execute(_sql, parameters) { calls.push(parameters); return { columns: [], rows: [], rowCount: 0, truncated: false }; } }, () => new Date("2026-09-05T04:00:00.000Z"));
  const result = await platform.executeSemanticQuery({ queryMode: "AUTO", namespace: "retail", question: "今年销售额", options: { includeQueryIr: true } });
  expect(result).toMatchObject({ status: "SUCCEEDED", data: { queryIr: { timeRange: { start: "2026-01-01 00:00:00", endExclusive: "2026-09-06 00:00:00" } } } });
  expect(calls[0]).toEqual(expect.arrayContaining(["2026-01-01 00:00:00", "2026-09-06 00:00:00"]));
  store.close();
});
