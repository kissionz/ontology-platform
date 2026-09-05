import { expect, it } from "vitest";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import type { GoldenCase } from "../../packages/contracts/src/index.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";
const salesCase: GoldenCase = {
  id: "sales", label: "销售指标编译", queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [], sort: [], limit: 20 },
  expected: { rootObjectId: "o_order", measureIds: ["m_sales"], sqlContains: ["销售额"] },
};
function setup() {
  const store = new SqlitePlatformStore(":memory:");
  store.savePublished(validSnapshot());
  physicalTables().forEach(table => store.putPhysicalTable("selectdb", table));
  return { store, platform: new OntologyPlatform(store) };
}
it("stores revision-bound Golden reports and links publication audit to the fresh report", () => {
  const { store, platform } = setup();
  try {
    const draft = platform.createDraft("retail", 1);
    const report = platform.validateDraft("retail", draft.draftId, [salesCase]);
    expect(report).toMatchObject({ valid: true, revision: 1, goldenCases: { status: "PASSED", mode: "COMPILATION" } });
    expect(store.getGoldenReport("retail", draft.draftId)?.reportId).toBe(report.goldenCases.reportId);
    const resumed = new OntologyPlatform(store);
    expect(resumed.publishDraft("retail", draft.draftId, 1).version).toBe(2);
    const publishedReport = store.getGoldenReport("retail", draft.draftId)!;
    expect(publishedReport.reportId).not.toBe(report.goldenCases.reportId);
    expect(store.listAudit()).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "OntologyPublished", payload: expect.objectContaining({ goldenReportId: publishedReport.reportId, goldenStatus: "PASSED" }) })]));
  } finally { store.close(); }
});
it("rechecks Golden Cases after a draft change and blocks regressions atomically", () => {
  const { store, platform } = setup();
  try {
    const draft = platform.createDraft("retail", 1);
    platform.validateDraft("retail", draft.draftId, [salesCase]);
    platform.applyDraftPatch("retail", draft.draftId, 1, [{ op: "UPSERT_METRIC", value: { ...draft.snapshot.metrics[0]!, label: "成交额" } }]);
    expect(() => platform.publishDraft("retail", draft.draftId, 1)).toThrow("本体未通过发布校验");
    expect(store.latestVersion("retail")).toBe(1);
    expect(store.getDraft("retail", draft.draftId)?.revision).toBe(2);
    const validation = platform.validateDraft("retail", draft.draftId);
    expect(validation).toMatchObject({ valid: false, revision: 2, goldenCases: { status: "FAILED" } });
    expect(validation.goldenCases.results[0]?.issues.join()).toContain("销售额");
  } finally { store.close(); }
});
it("reports unconfigured business cases explicitly", () => {
  const { store, platform } = setup();
  try {
    const draft = platform.createDraft("retail", 1);
    expect(platform.validateDraft("retail", draft.draftId).goldenCases).toMatchObject({ status: "NOT_CONFIGURED", results: [] });
  } finally { store.close(); }
});
