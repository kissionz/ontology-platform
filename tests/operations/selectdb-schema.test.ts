import mysql, { type Pool } from "mysql2/promise";
import { expect, it, vi } from "vitest";
import { SelectDbGateway } from "../../adapters/query-gateway-selectdb/src/index.js";

it("qualifies joined schema columns and preserves bound database names and table metadata", async () => {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    // SelectDB can retain both copies of USING columns; every metadata reference must be qualified.
    expect(sql).not.toMatch(/\bUSING\s*\(/i);
    const references = [...sql.matchAll(/(?:(\w+)\.)?\b(TABLE_SCHEMA|TABLE_NAME|TABLE_TYPE|TABLE_COMMENT|COLUMN_NAME|COLUMN_TYPE|IS_NULLABLE|COLUMN_COMMENT|ORDINAL_POSITION)\b/g)];
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(match => match[1] === "c" || match[1] === "t")).toBe(true);
    expect(sql).toMatch(/ON c\.TABLE_SCHEMA = t\.TABLE_SCHEMA AND c\.TABLE_NAME = t\.TABLE_NAME/);
    expect(sql).toMatch(/WHERE c\.TABLE_SCHEMA = \?/);
    expect(sql).toMatch(/ORDER BY c\.TABLE_NAME, c\.ORDINAL_POSITION/);
    expect(values).toEqual(["retail'archive"]);
    expect(sql).not.toContain("retail'archive");
    return [[
      { tableName: "orders", tableType: "BASE TABLE", tableComment: "订单明细", columnName: "id", dataType: "bigint", nullable: "NO", comment: "订单标识" },
      { tableName: "orders", tableType: "BASE TABLE", columnName: "amount", dataType: "decimal(18,2)", nullable: "YES", comment: "" },
      { tableName: "sales_view", tableType: "VIEW", columnName: "total", dataType: "double", nullable: "YES", comment: "" },
    ], []];
  });
  const end = vi.fn(async () => {});
  const createPool = vi.spyOn(mysql, "createPool").mockReturnValue({ query, end } as unknown as Pool);
  const gateway = new SelectDbGateway({ host: "fixture", port: 9030, username: "fixture", password: "fixture", database: "retail'archive" });
  try {
    expect(await gateway.scanSchema()).toEqual([
      { name: "orders", type: "TABLE", comment: "订单明细", columns: [{ name: "id", dataType: "bigint", nullable: false, comment: "订单标识" }, { name: "amount", dataType: "decimal(18,2)", nullable: true }] },
      { name: "sales_view", type: "VIEW", columns: [{ name: "total", dataType: "double", nullable: true }] },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  } finally { await gateway.close(); createPool.mockRestore(); }
  expect(end).toHaveBeenCalledOnce();
});
