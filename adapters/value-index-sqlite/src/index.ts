import type { OntologySnapshotV3 } from "../../../packages/contracts/src/index.js";
import type { SqlitePlatformStore } from "../../ontology-store-sqlite/src/index.js";
import type { QueryExecutorPort } from "../../../packages/application/src/index.js";
const ALLOWED = new Set(["CODE", "NAME", "CATEGORY", "BOOLEAN", "GEOGRAPHY"]);
export class PropertyValueIndexService {
  constructor(private readonly store: SqlitePlatformStore, private readonly executor: QueryExecutorPort) {}
  async rebuild(snapshot: OntologySnapshotV3) {
    const tables = new Map(this.store.listPhysicalTables().map(table => [table.id, table]));
    const candidates = snapshot.objects.flatMap(object => object.properties.filter(p => p.valueSearchable && !p.sensitive && p.visibility === "ANALYTICAL" && ALLOWED.has(p.meaning)).map(property => ({ object, property, table: tables.get(object.sourceTableId) })));
    for (const { object, property } of candidates) this.store.saveIndexStatus(snapshot.namespace, snapshot.version, object.id, property.id, "building", 0, 0);
    for (const { object, property, table } of candidates) {
      try {
        if (!table || !table.columns.some(c => c.name === property.sourceColumn)) throw new Error("属性物理映射不存在，请先扫描 Schema");
        const column = quote(property.sourceColumn);
        const result = await this.executor.execute(`SELECT CAST(${column} AS CHAR) indexed_value, COUNT(*) value_frequency FROM ${quote(table.database)}.${quote(table.name)} WHERE ${column} IS NOT NULL GROUP BY ${column} ORDER BY value_frequency DESC LIMIT 5001`, [], 5001, 60_000);
        const partial = result.truncated || result.rows.length > 5000;
        const grouped = new Map<string, { displayValue: string; frequency: number }>();
        for (const row of result.rows.slice(0, 5000)) {
          if (!("indexed_value" in row) || !("value_frequency" in row)) throw new Error("值索引查询响应缺少所需字段");
          const displayValue = String(row.indexed_value ?? ""), frequency = Number(row.value_frequency);
          if (!displayValue.trim()) continue;
          if (!Number.isFinite(frequency) || frequency < 0) throw new Error("值索引频次无效");
          const normalized = displayValue.trim().toLocaleLowerCase("zh-CN").normalize("NFKC"), existing = grouped.get(normalized);
          grouped.set(normalized, { displayValue: existing?.displayValue ?? displayValue, frequency: (existing?.frequency ?? 0) + frequency });
        }
        const values = [...grouped.values()];
        this.store.transaction(() => {
          this.store.replaceIndexedValues(snapshot.namespace, snapshot.version, object.id, property.id, values);
          this.store.saveIndexStatus(snapshot.namespace, snapshot.version, object.id, property.id, partial ? "partial" : values.length ? "ready" : "empty", values.length, values.reduce((sum, v) => sum + v.frequency, 0));
        });
      } catch (error) { this.store.saveIndexStatus(snapshot.namespace, snapshot.version, object.id, property.id, "failed", 0, 0, error instanceof Error ? error.message : String(error)); }
    }
    return this.store.getIndexStatus(snapshot.namespace, snapshot.version);
  }
}
function quote(value: string) { return `\`${value.replaceAll("`", "``")}\``; }
