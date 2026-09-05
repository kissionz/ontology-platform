import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importInsightFlow } from "../../scripts/import-ontology.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { validSnapshot } from "../fixtures-v3.js";

function sourceFixture(invalid = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "ontology-atomic-"));
  const source = path.join(dir, "source.sqlite"), target = path.join(dir, "target.sqlite");
  const db = new DatabaseSync(source);
  db.exec("CREATE TABLE ontology_versions(version INTEGER PRIMARY KEY,status TEXT,created_at TEXT,payload TEXT)");
  const insert = db.prepare("INSERT INTO ontology_versions VALUES(?,?,?,?)");
  const published = { ...validSnapshot(), schemaVersion: 2 };
  insert.run(1, "PUBLISHED", published.publishedAt!, JSON.stringify(published));
  const draft = { ...validSnapshot("retail", 2), schemaVersion: 2, status: "DRAFT", baseVersion: 1 };
  for (const item of [...draft.objects, ...draft.metrics, ...draft.relations, ...draft.dimensionHierarchies]) item.status = "DRAFT";
  draft.objects[0]!.description = "未发布的业务定义";
  insert.run(2, "DRAFT", "2026-09-05T00:00:00.000Z", invalid ? "{}" : JSON.stringify(draft));
  db.close();
  return { source, target, draft };
}
describe("transactional InsightFlow import", () => {
  it("preserves the current draft separately and keeps latest on the published version", () => {
    const { source, target, draft } = sourceFixture();
    const report = importInsightFlow(source, target, "retail");
    expect(report.issues).toEqual([]);
    expect(report.importedVersions).toEqual([1]);
    expect(report.importedDraftIds).toEqual(["imported_v2"]);
    const store = new SqlitePlatformStore(target);
    expect(store.latestVersion("retail")).toBe(1);
    expect(store.getDraft("retail", "imported_v2")?.snapshot.objects).toEqual(draft.objects);
    store.close();
    expect(importInsightFlow(source, target, "retail").issues).toEqual([]);
  });
  it("rolls back all versions when a later payload is malformed", () => {
    const { source, target } = sourceFixture(true);
    const report = importInsightFlow(source, target, "retail");
    expect(report.issues[0]?.code).toBe("IMPORT_FAILED");
    expect(report.importedVersions).toEqual([]);
    const store = new SqlitePlatformStore(target);
    expect(store.listVersions("retail")).toEqual([]);
    expect(store.listNamespaces()).toEqual([]);
    store.close();
  });
});
