import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { OntologyPlatformClient } from "../../packages/sdk-typescript/src/index.js";
import { OntologyHttpMcpAdapter } from "../../packages/mcp-server/src/http.js";
import { physicalTables, validSnapshot } from "../fixtures-v3.js";

describe("HTTP, TypeScript SDK, Python SDK and MCP share fixtures", () => {
  it("executes the same query through TypeScript and authenticated HTTP MCP", async () => {
    const app = buildApp({ databasePath: ":memory:", apiKey: "sdk-key", queryExecutor: { async execute() { return { columns: ["销售额"], rows: [{ 销售额: 12 }], rowCount: 1, truncated: false }; } } });
    try {
      app.platformStore.savePublished(validSnapshot());
      physicalTables().forEach(t => app.platformStore.putPhysicalTable("selectdb", t));
      const localFetch: typeof fetch = async (url, init) => {
        const response = await app.inject({ method: (init?.method ?? "GET") as "POST", url: new URL(String(url)).pathname, headers: Object.fromEntries(new Headers(init?.headers)), ...(init?.body ? { payload: JSON.parse(String(init.body)) } : {}) });
        return new Response(response.body, { status: response.statusCode, headers: { "content-type": "application/json" } });
      };
      const client = new OntologyPlatformClient({ baseUrl: "http://platform", apiKey: "sdk-key", fetch: localFetch });
      const input = { namespace: "retail", queryMode: "AUTO" as const, question: "销售额" };
      const ts = await client.executeSemanticQuery(input);
      const mcp = await new OntologyHttpMcpAdapter(client).callTool("ExecuteSemanticQuery", input);
      expect(ts).toMatchObject({ status: "SUCCEEDED", ontologyVersion: 1, data: { rows: [{ 销售额: 12 }] } });
      expect(mcp).toMatchObject({ data: ts?.data });
      const bad = new OntologyHttpMcpAdapter(new OntologyPlatformClient({ baseUrl: "http://platform", apiKey: "wrong-key", fetch: localFetch }));
      await expect(bad.callTool("GetOntologySnapshot", { namespace: "retail" })).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
      // Python consumes the exact same envelope; capture its real urllib request.
      const python = execFileSync("python3", ["-c", `
import sys, json, io
sys.path.insert(0, "packages/sdk-python")
import ontology_platform as sdk
payload = json.load(sys.stdin)
captured = {}
def transport(req, timeout):
    captured.update(url=req.full_url, authorization=req.get_header("Authorization"), body=json.loads(req.data))
    return io.BytesIO(json.dumps(payload["response"]).encode())
sdk.request.urlopen = transport
result = sdk.OntologyPlatformClient("http://platform/", "sdk-key").execute_semantic_query(payload["input"])
print(json.dumps({"captured": captured, "result": result}))
`], { input: JSON.stringify({ input, response: ts }), encoding: "utf8" });
      const decoded = JSON.parse(python);
      expect(decoded.result).toEqual(ts);
      expect(decoded.captured).toEqual({ url: "http://platform/v1/semantic-query", authorization: "Bearer sdk-key", body: input });
    } finally { await app.close(); }
  });
});
