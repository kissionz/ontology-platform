import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export async function backupDatabase(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`数据库不存在：${source}`);
  if (existsSync(destination)) throw new Error(`备份已存在：${destination}`);
  mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    await sqliteBackup(database, destination);
  } finally {
    database.close();
  }
  assertIntegrity(destination);
  return destination;
}

export function restoreDatabase(
  source: string,
  destination: string,
  force = false,
) {
  if (!existsSync(source)) throw new Error(`备份不存在：${source}`);
  if (existsSync(destination) && !force)
    throw new Error("目标数据库已存在；确认服务停止后使用 --force 覆盖");
  assertIntegrity(source);
  mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  const temporary = `${destination}.restore-${process.pid}`;
  copyFileSync(source, temporary);
  try {
    assertIntegrity(temporary);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return destination;
}

function assertIntegrity(filename: string) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const rows = database.prepare("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    if (rows.some((row) => row.integrity_check !== "ok"))
      throw new Error(`SQLite 完整性检查失败：${filename}`);
  } finally {
    database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      source: { type: "string" },
      destination: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const database = path.resolve(
    process.env.ONTOLOGY_DB_PATH ?? ".data/ontology-platform.sqlite",
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (command === "backup") {
    const output = path.resolve(
      values.destination ?? `.data/backups/ontology-${stamp}.sqlite`,
    );
    await backupDatabase(path.resolve(values.source ?? database), output);
    console.log(JSON.stringify({ status: "SUCCEEDED", backup: output }));
  } else if (command === "restore") {
    if (!values.source) throw new Error("restore 必须提供 --source");
    const output = restoreDatabase(
      path.resolve(values.source),
      path.resolve(values.destination ?? database),
      values.force,
    );
    console.log(JSON.stringify({ status: "SUCCEEDED", restored: output }));
  } else {
    throw new Error("用法：backup.ts <backup|restore> [--source] [--destination] [--force]");
  }
}
