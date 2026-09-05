import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { decryptCredential } from "../../adapters/query-gateway-selectdb/src/credentials.js";
import { resolveMcpApiKey, resolveRuntimeKeys, runtimeKeysPath } from "../../adapters/runtime-keys/src/index.js";
const executeFile = promisify(execFile);
let directory: string;
let databasePath: string;
let apps: ReturnType<typeof buildApp>[];
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "platform-keys-"));
  databasePath = path.join(directory, "platform.sqlite");
  apps = [];
  vi.stubEnv("ONTOLOGY_API_KEY", "");
  vi.stubEnv("ONTOLOGY_ENCRYPTION_KEY", "");
  vi.stubEnv("ONTOLOGY_KEYS_PATH", "");
});
afterEach(async () => {
  await Promise.all(apps.map(app => app.close()));
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("automatically generated platform keys", () => {
  it("starts without manual keys, authenticates, encrypts credentials and survives restart", async () => {
    const first = buildApp({ databasePath });
    const keys = resolveRuntimeKeys({ databasePath });
    const auth = { authorization: `Bearer ${keys.apiKey}` };
    expect((await first.inject({ method: "GET", url: "/v1/system/api-clients" })).statusCode).toBe(401);
    expect((await first.inject({ method: "GET", url: "/v1/system/api-clients", headers: auth })).statusCode).toBe(200);
    const saved = await first.inject({ method: "PUT", url: "/v1/data-sources/selectdb", headers: auth, payload: { host: "localhost", port: 9030, username: "reader", password: "test-password", catalog: "internal", database: "retail", tls: true } });
    expect(saved.statusCode).toBe(200);
    const ciphertext = first.platformStore.getCredentialCiphertext("selectdb")!;
    expect(decryptCredential(ciphertext, "selectdb", keys.encryptionKey)).toBe("test-password");
    const publicOutput = JSON.stringify([saved.json(), (await first.inject({ method: "GET", url: "/v1/health" })).json(), first.platformStore.listAudit()]);
    expect(publicOutput).not.toContain(keys.apiKey);
    expect(publicOutput).not.toContain(keys.encryptionKey);
    expect(publicOutput).not.toContain("test-password");
    await first.close();
    const second = buildApp({ databasePath }); apps.push(second);
    expect(resolveRuntimeKeys({ databasePath })).toEqual(keys);
    expect((await second.inject({ method: "GET", url: "/v1/system/api-clients", headers: auth })).statusCode).toBe(200);
    expect(decryptCredential(second.platformStore.getCredentialCiphertext("selectdb")!, "selectdb", resolveRuntimeKeys({ databasePath }).encryptionKey)).toBe("test-password");
    if (process.platform !== "win32") expect(statSync(keys.filePath!).mode & 0o777).toBe(0o600);
  });
  it("gives separate installations independent keys and preserves explicit overrides", () => {
    const a = resolveRuntimeKeys({ databasePath });
    const b = resolveRuntimeKeys({ databasePath: path.join(directory, "other.sqlite") });
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.encryptionKey).not.toBe(b.encryptionKey);
    expect(resolveRuntimeKeys({ databasePath, apiKey: "existing-admin" }).apiKey).toBe("existing-admin");
    expect(resolveRuntimeKeys({ databasePath }).apiKey).toBe(a.apiKey);
  });
  it("never replaces a malformed existing key file", () => {
    const filename = runtimeKeysPath(databasePath);
    writeFileSync(filename, "broken file");
    expect(() => resolveRuntimeKeys({ databasePath })).toThrow("平台密钥文件无效");
    expect(readFileSync(filename, "utf8")).toBe("broken file");
  });
  it("lets local MCP reuse the key but refuses to send it to a remote endpoint automatically", () => {
    const keys = resolveRuntimeKeys({ databasePath });
    expect(resolveMcpApiKey("http://127.0.0.1:4300", { databasePath })).toBe(keys.apiKey);
    expect(() => resolveMcpApiKey("https://remote.example", { databasePath })).toThrow("远程 MCP");
    expect(resolveMcpApiKey("https://remote.example", { databasePath, apiKey: "remote-generated-key" })).toBe("remote-generated-key");
  });
  it("publishes one complete key file during concurrent startup", async () => {
    const script = `import { resolveRuntimeKeys } from './adapters/runtime-keys/src/index.ts'; import { createHash } from 'node:crypto'; process.stdout.write(createHash('sha256').update(resolveRuntimeKeys({ databasePath: process.argv[1] }).apiKey).digest('hex'));`;
    const results = await Promise.all(Array.from({ length: 4 }, () => executeFile(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, databasePath])));
    expect(new Set(results.map(result => result.stdout)).size).toBe(1);
    expect(JSON.parse(readFileSync(runtimeKeysPath(databasePath), "utf8")).version).toBe(1);
  });
  it("shows the existing administrator key only when the local operator command is invoked", async () => {
    const keys = resolveRuntimeKeys({ databasePath });
    const output = await executeFile(process.execPath, ["--import", "tsx", "scripts/show-api-key.ts"], { env: { ...process.env, ONTOLOGY_DB_PATH: databasePath } });
    expect(output.stdout.trim()).toBe(keys.apiKey);
    expect(output.stdout).not.toContain(keys.encryptionKey);
  });
});
