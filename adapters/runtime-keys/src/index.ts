import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const StoredKeysSchema = z.object({
  version: z.literal(1),
  apiKey: z.string().regex(/^op_admin_[A-Za-z0-9_-]{43}$/),
  encryptionKey: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
type StoredKeys = z.infer<typeof StoredKeysSchema>;
export interface KeyOptions {
  databasePath: string;
  keysPath?: string;
  apiKey?: string;
  encryptionKey?: string;
}
export function defaultDatabasePath(): string {
  return process.env.ONTOLOGY_DB_PATH?.trim() || path.resolve(".data/ontology-platform.sqlite");
}
export function runtimeKeysPath(databasePath: string, configured?: string): string {
  return path.resolve(configured?.trim() || `${databasePath}.keys.json`);
}
function generatedKeys(): StoredKeys {
  return { version: 1, apiKey: `op_admin_${randomBytes(32).toString("base64url")}`, encryptionKey: randomBytes(32).toString("hex") };
}
function readStoredKeys(filename: string): StoredKeys | undefined {
  let contents: string;
  try { contents = readFileSync(filename, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`无法读取平台密钥文件：${filename}`);
  }
  try {
    const keys = StoredKeysSchema.parse(JSON.parse(contents));
    if (process.platform !== "win32") chmodSync(filename, 0o600);
    return keys;
  } catch { throw new Error(`平台密钥文件无效或权限不可用：${filename}；请恢复原文件，不会覆盖已有密钥`); }
}
function persistedKeys(filename: string): StoredKeys {
  const existing = readStoredKeys(filename);
  if (existing) return existing;
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(generatedKeys())}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    // Publish the complete file atomically. Concurrent starters all read the winner.
    try { linkSync(temporary, filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return readStoredKeys(filename)!;
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function resolveRuntimeKeys(options: KeyOptions): { apiKey: string; encryptionKey: string; filePath?: string } {
  const apiKey = options.apiKey?.trim() || undefined;
  const encryptionKey = options.encryptionKey?.trim() || undefined;
  if (encryptionKey && !/^[a-f0-9]{64}$/i.test(encryptionKey)) throw new Error("ONTOLOGY_ENCRYPTION_KEY 必须为 32 字节密钥的 64 位十六进制编码");
  if (apiKey && encryptionKey) return { apiKey, encryptionKey };
  const filePath = options.databasePath === ":memory:" ? undefined : runtimeKeysPath(options.databasePath, options.keysPath);
  const stored = filePath ? persistedKeys(filePath) : generatedKeys();
  return { apiKey: apiKey ?? stored.apiKey, encryptionKey: encryptionKey ?? stored.encryptionKey, filePath };
}
export function resolveMcpApiKey(baseUrl: string, options: Pick<KeyOptions, "databasePath" | "keysPath" | "apiKey">): string {
  if (options.apiKey?.trim()) return options.apiKey.trim();
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("远程 MCP 连接需要配置目标平台生成的 ONTOLOGY_API_KEY");
  const filename = runtimeKeysPath(options.databasePath, options.keysPath);
  const stored = readStoredKeys(filename);
  if (!stored) throw new Error("本机平台密钥尚未生成，请先运行 npm start");
  return stored.apiKey;
}
