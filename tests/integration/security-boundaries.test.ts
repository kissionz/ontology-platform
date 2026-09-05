import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { decryptCredential, encryptCredential } from "../../adapters/query-gateway-selectdb/src/credentials.js";
import { OntologyMcpAdapter } from "../../packages/mcp-server/src/index.js";
import { validSnapshot, property, physicalTables } from "../fixtures-v3.js";
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(apps.splice(0).map(app => app.close())); });
function setup() { const app = buildApp({ databasePath: ":memory:", apiKey: "test-key" }); apps.push(app); return app; }
const auth = { authorization: "Bearer test-key" };
describe("shared security boundaries", () => {
  it("excludes sensitive definitions and stale indexed values from every context projection and MCP export", async () => {
    const app = setup(), snapshot = validSnapshot();
    snapshot.objects[0]!.properties.push(property("private_customer", "客户隐私", "NAME", { sensitive: true }));
    app.platformStore.savePublished(snapshot);
    app.platformStore.replaceIndexedValues("retail", 1, "o_order", "private_customer", [{ displayValue: "销售额-private", frequency: 1 }]);
    for (const projection of ["compact", "standard", "full"] as const) {
      const context = app.platformService.resolveOntologyContext({ namespace: "retail", question: "销售额", purpose: "PLAN", projection, include: { values: true } });
      expect(JSON.stringify(context)).not.toContain("private_customer");
      expect(JSON.stringify(context)).not.toContain("销售额-private");
    }
    const http = await app.inject({ method: "GET", url: "/v1/namespaces/retail/ontology", headers: auth });
    const mcp = await new OntologyMcpAdapter(app.platformService).callTool("GetOntologySnapshot", { namespace: "retail" });
    expect(http.body).not.toContain("private_customer");
    expect(JSON.stringify(mcp)).not.toContain("private_customer");
  });
  it("uses the session's pinned version after a newer version is published", async () => {
    const app = buildApp({ databasePath: ":memory:", queryExecutor: { async execute() { return { columns: [], rows: [], rowCount: 0, truncated: false }; } } }); apps.push(app);
    app.platformStore.savePublished(validSnapshot());
    physicalTables().forEach(table => app.platformStore.putPhysicalTable("selectdb", table));
    const context = app.platformService.resolveOntologyContext({ namespace: "retail", question: "销售额", purpose: "PLAN" });
    app.platformStore.savePublished(validSnapshot("retail", 2));
    const result = await app.platformService.executeSemanticQuery({ queryMode: "AUTO", namespace: "retail", question: "销售额", sessionId: context.sessionId });
    expect(result.status).toBe("SUCCEEDED");
    expect(result).toMatchObject({ ontologyVersion: 1 });
  });
  it("encrypts credentials with source-bound authenticated encryption", async () => {
    vi.stubEnv("ONTOLOGY_ENCRYPTION_KEY", "ab".repeat(32));
    const app = setup();
    const response = await app.inject({ method: "PUT", url: "/v1/data-sources/selectdb", headers: auth, payload: { host: "localhost", port: 9030, username: "reader", password: "private-password", catalog: "internal", database: "retail", tls: true } });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("private-password");
    const encrypted = app.platformStore.getCredentialCiphertext("selectdb")!;
    expect(encrypted).not.toContain("private-password");
    expect(decryptCredential(encrypted, "selectdb", "ab".repeat(32))).toBe("private-password");
    expect(() => decryptCredential(encrypted, "another-source", "ab".repeat(32))).toThrow();
    expect(JSON.stringify(app.platformStore.listAudit())).not.toContain("private-password");
  });
  it("rejects password persistence when the deployment encryption key is missing", () => {
    expect(() => encryptCredential("secret", "selectdb")).toThrow(/ONTOLOGY_ENCRYPTION_KEY/);
  });
});
