import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import path from "node:path";
import { OntologySnapshotV3Schema, type PhysicalTable, type PlatformError } from "../packages/contracts/src/index.js";
import type { OntologySnapshot as OntologySnapshotV2 } from "../packages/contracts/src/legacy.js";
import { migrateV2ToV3, digest, runKernel } from "../packages/domain/src/index.js";
import { SqlitePlatformStore } from "../adapters/ontology-store-sqlite/src/index.js";

export interface MigrationReport {
  sourceVersions: number[]; importedVersions: number[]; importedDraftIds: string[];
  objectCount: number; propertyCount: number; relationCount: number; metricCount: number;
  hierarchyCount: number; axiomAssertionCount: number; inferredAssertionCount: number;
  valueIndexCount: number; preservedIds: boolean; digestMatches: boolean; issues: PlatformError[];
}
export function importInsightFlow(sourcePath: string, targetPath: string, namespace: string): MigrationReport {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) throw new Error("来源和目标数据库必须不同");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const target = new SqlitePlatformStore(targetPath);
  const report: MigrationReport = {
    sourceVersions: [], importedVersions: [], importedDraftIds: [], objectCount: 0,
    propertyCount: 0, relationCount: 0, metricCount: 0, hierarchyCount: 0,
    axiomAssertionCount: 0, inferredAssertionCount: 0, valueIndexCount: 0,
    preservedIds: true, digestMatches: true, issues: [],
  };
  try {
    source.exec("BEGIN");
    const tables = new Set((source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
    if (!tables.has("ontology_versions")) throw new Error("来源库缺少 ontology_versions 表");
    const columns = new Set((source.prepare("PRAGMA table_info(ontology_versions)").all() as Array<{ name: string }>).map(row => row.name));
    if (!columns.has("payload") || !columns.has("version") || !columns.has("status")) throw new Error("来源 ontology_versions 缺少 version、status 或 payload");
    const rows = source.prepare(`SELECT version,status,${columns.has("created_at") ? "created_at" : "NULL"} createdAt,payload FROM ontology_versions ORDER BY version`).all() as Array<{ version: number; status: string; createdAt: string | null; payload: string }>;
    report.sourceVersions = rows.map(row => row.version);
    target.transaction(() => {
      for (const row of rows) {
        const raw = JSON.parse(row.payload) as OntologySnapshotV2;
        if (!raw || !Array.isArray(raw.objects) || !Array.isArray(raw.relations) || !Array.isArray(raw.metrics)) throw new Error(`v${row.version}: 本体集合缺失或格式错误`);
        if (raw.version !== row.version || raw.status !== row.status) throw new Error(`v${row.version}: 版本元数据与载荷不一致`);
        const v2 = { ...raw, schemaVersion: 2 as const, dimensionHierarchies: raw.dimensionHierarchies ?? [] };
        const v3 = OntologySnapshotV3Schema.parse(migrateV2ToV3(v2, namespace));
        const before = collectDefinitions(v2), after = collectDefinitions(v3);
        report.preservedIds &&= digest(collectIds(v2)) === digest(collectIds(v3));
        // Compare all original fields; v3 may only add backward-compatible defaults.
        report.digestMatches &&= before.every((definition, i) => Object.entries(definition).every(([key, value]) => digest(value) === digest(after[i]?.[key])));
        if (!report.preservedIds || !report.digestMatches) throw new Error(`v${row.version}: 内容或稳定 ID 校验失败`);
        if (v3.status === "DRAFT" || v3.status === "VERIFIED") {
          const draftId = `imported_v${v3.version}`;
          target.importDraft({ namespace, draftId, baseVersion: v3.baseVersion, revision: 1, snapshot: v3, updatedAt: row.createdAt ?? "1970-01-01T00:00:00.000Z" });
          report.importedDraftIds.push(draftId);
        } else {
          const kernel = runKernel(v3);
          if (!kernel.valid) throw new Error(`v${row.version}: 发布公理校验失败 ${kernel.issues.map(issue => issue.code).join(",")}`);
          const existing = target.getSnapshot(namespace, v3.version);
          if (existing && existing.contentDigest !== v3.contentDigest) throw new Error(`v${row.version}: IMPORT_VERSION_CONFLICT`);
          if (!existing) target.savePublished(v3);
          report.importedVersions.push(v3.version);
        }
        report.objectCount += v3.objects.length;
        report.propertyCount += v3.objects.reduce((sum, o) => sum + o.properties.length, 0);
        report.relationCount += v3.relations.length; report.metricCount += v3.metrics.length;
        report.hierarchyCount += v3.dimensionHierarchies.length;
        report.axiomAssertionCount += v3.axiomAssertions.length; report.inferredAssertionCount += v3.inferredAssertions.length;
      }
      if (tables.has("physical_tables")) {
        const physicalRows = source.prepare("SELECT id,payload FROM physical_tables").all() as Array<{ id: string; payload: string }>;
        for (const row of physicalRows) {
          const table = JSON.parse(row.payload) as PhysicalTable;
          if (!table.database || !table.name || !Array.isArray(table.columns)) throw new Error(`物理表 ${row.id} 载荷不合法`);
          target.putPhysicalTable("insightflow", { ...table, id: row.id, sourceId: "insightflow" });
        }
      }
      const eligible = (version: number, objectId: string, propertyId: string) => {
        const snapshot = target.getSnapshot(namespace, version);
        const property = snapshot?.objects.find(o => o.id === objectId)?.properties.find(p => p.id === propertyId);
        return property && !property.sensitive && property.visibility === "ANALYTICAL" && property.valueSearchable && ["CODE", "NAME", "CATEGORY", "BOOLEAN", "GEOGRAPHY"].includes(property.meaning);
      };
      if (tables.has("property_value_index")) {
        const values = source.prepare("SELECT ontology_version version,object_id objectId,property_id propertyId,display_value displayValue,frequency FROM property_value_index ORDER BY ontology_version,property_id,normalized_value").all() as Array<{ version: number; objectId: string; propertyId: string; displayValue: string; frequency: number }>;
        const grouped = new Map<string, typeof values>();
        for (const value of values) {
          if (!eligible(value.version, value.objectId, value.propertyId)) throw new Error(`v${value.version}: 值索引属性 ${value.propertyId} 不满足索引安全条件`);
          const key = JSON.stringify([value.version, value.objectId, value.propertyId]);
          const group = grouped.get(key) ?? []; group.push(value); grouped.set(key, group);
        }
        for (const group of grouped.values()) {
          const first = group[0]!;
          target.replaceIndexedValues(namespace, first.version, first.objectId, first.propertyId, group);
          target.saveIndexStatus(namespace, first.version, first.objectId, first.propertyId, "ready", group.length, group.reduce((sum, item) => sum + item.frequency, 0));
          report.valueIndexCount += group.length;
        }
      }
      if (tables.has("property_value_index_properties")) {
        const statuses = source.prepare("SELECT ontology_version version,object_id objectId,property_id propertyId,status,distinct_values distinctValues,covered_rows coveredRows,error FROM property_value_index_properties").all() as Array<{ version: number; objectId: string; propertyId: string; status: string; distinctValues: number; coveredRows: number; error?: string }>;
        for (const item of statuses) {
          if (!eligible(item.version, item.objectId, item.propertyId)) throw new Error(`v${item.version}: 索引状态属性 ${item.propertyId} 不满足安全条件`);
          target.saveIndexStatus(namespace, item.version, item.objectId, item.propertyId, item.status, item.distinctValues, item.coveredRows, item.error);
        }
      }
      target.appendAudit(`import_${digest({ namespace, versions: report.sourceVersions })}`, "ontology-import", "OntologyImported", report);
    });
  } catch (error) {
    report.importedVersions = []; report.importedDraftIds = []; report.valueIndexCount = 0;
    report.issues.push({ code: "IMPORT_FAILED", message: error instanceof Error ? error.message : String(error), stage: "migration", retryable: false });
  } finally { source.close(); target.close(); }
  return report;
}
function collectDefinitions(snapshot: OntologySnapshotV2) {
  return [...snapshot.objects, ...snapshot.objects.flatMap(o => o.properties), ...snapshot.relations, ...snapshot.metrics, ...(snapshot.dimensionHierarchies ?? [])].map(item => {
    // Properties are compared independently so added v3 defaults remain compatible.
    const { properties: _properties, ...definition } = item as unknown as Record<string, unknown>;
    return definition;
  });
}
function collectIds(snapshot: OntologySnapshotV2) { return collectDefinitions(snapshot).map(item => item.id); }
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { source: { type: "string" }, target: { type: "string", default: path.resolve(".data/ontology-platform.sqlite") }, namespace: { type: "string" }, mode: { type: "string", default: "verify-and-import" } } });
  if (!values.source || !values.namespace || values.mode !== "verify-and-import") throw new Error("用法: ontology:import --source <sqlite> --namespace <namespace> [--target <sqlite>] --mode verify-and-import");
  const report = importInsightFlow(values.source, values.target!, values.namespace);
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length || !report.preservedIds || !report.digestMatches) process.exitCode = 1;
}
