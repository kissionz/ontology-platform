import { existsSync, unlinkSync } from "node:fs";
import { buildApp } from "../apps/api/src/server.js";
import type { QueryExecutorPort } from "../packages/application/src/index.js";
import { physicalTables, validSnapshot } from "../tests/fixtures-v3.js";

const databasePath = "/private/tmp/ontology-platform-e2e.sqlite";
for (const suffix of ["", "-wal", "-shm"])
  if (existsSync(`${databasePath}${suffix}`))
    unlinkSync(`${databasePath}${suffix}`);

const executor: QueryExecutorPort = {
  async execute(sql) {
    if (sql.includes("indexed_value")) return { columns: ["indexed_value", "value_frequency"], rows: [{ indexed_value: "品牌电商", value_frequency: 20 }], rowCount: 1, truncated: false };
    return {
      columns: ["事业部", "销售额"],
      rows: [{ 事业部: "品牌电商", 销售额: 120 }],
      rowCount: 1,
      truncated: false,
      executionMs: 8,
    };
  },
};
const gateway = {
  ...executor,
  async testConnection() {
    return { status: "ready", databaseVersion: "SelectDB 3.x", elapsedMs: 8 };
  },
  async scanSchema() {
    return physicalTables().map((table) => ({
      name: table.name,
      type: table.type,
      columns: table.columns.map(({ name, dataType, nullable }) => ({
        name,
        dataType,
        nullable,
      })),
    }));
  },
  async close() {},
};
const app = buildApp({
  databasePath,
  apiKey: "e2e-key",
  logger: false,
  queryExecutor: executor,
  queryGateway: gateway,
});
const version1 = validSnapshot("retail", 1);
app.platformStore.savePublished(version1);
const version2 = validSnapshot("retail", 2);
version2.baseVersion = 1;
app.platformStore.savePublished(version2);
app.platformStore.putPhysicalSource(
  "selectdb",
  {
    host: "selectdb.internal",
    port: 9030,
    catalog: "internal",
    database: "retail",
    tls: true,
  },
  "test-only-credential-reference",
);
physicalTables().forEach((table) =>
  app.platformStore.putPhysicalTable("selectdb", table),
);
app.platformStore.saveIndexStatus(
  "retail",
  2,
  "o_bu",
  "p_bu_name",
  "ready",
  4,
  100,
);

await app.listen({ port: 4331, host: "127.0.0.1" });
