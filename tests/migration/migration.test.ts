import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrateV2ToV3 } from "../../packages/domain/src/index.js";
import { importInsightFlow } from "../../scripts/import-ontology.js";
import { testOntology } from "../sql-golden/fixtures.js";

const referenceDatabase =
  "/Users/kissionz/Documents/insightflow-data-agent/.montane/data-agent/ontology.sqlite";

describe("Phase 1 migration", () => {
  it("preserves every stable v2 ID", () => {
    const v3 = migrateV2ToV3(testOntology, "retail");
    expect(v3.objects.map((object) => object.id)).toEqual(
      testOntology.objects.map((object) => object.id),
    );
    expect(v3.objects.flatMap((object) => object.properties.map((property) => property.id))).toEqual(
      testOntology.objects.flatMap((object) => object.properties.map((property) => property.id)),
    );
    expect(v3.metrics.map((metric) => metric.id)).toEqual(
      testOntology.metrics.map((metric) => metric.id),
    );
    expect(v3.schemaVersion).toBe(3);
  });

  it.skipIf(!existsSync(referenceDatabase))(
    "imports the real InsightFlow SQLite shape without assuming new columns",
    () => {
      const target = path.join(
        mkdtempSync(path.join(tmpdir(), "ontology-import-")),
        "target.sqlite",
      );
      const report = importInsightFlow(referenceDatabase, target, "retail");
      expect(report.sourceVersions).toEqual([0]);
      expect(report.importedVersions).toEqual([0]);
      expect(report.preservedIds).toBe(true);
      expect(report.digestMatches).toBe(true);
      expect(report.issues).toEqual([]);
    },
  );
});
