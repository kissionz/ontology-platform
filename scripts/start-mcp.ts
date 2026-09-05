import { createInterface } from "node:readline";
import { PlatformException } from "../packages/contracts/src/index.js";
import { MCP_TOOLS } from "../packages/mcp-server/src/index.js";
import { OntologyHttpMcpAdapter } from "../packages/mcp-server/src/http.js";
import { OntologyPlatformClient } from "../packages/sdk-typescript/src/index.js";

if (!process.env.ONTOLOGY_API_KEY) throw new Error("MCP 需要 ONTOLOGY_API_KEY，所有调用通过已认证 HTTP API 执行");
const adapter = new OntologyHttpMcpAdapter(new OntologyPlatformClient({
  baseUrl: process.env.ONTOLOGY_API_URL ?? "http://127.0.0.1:4300",
  apiKey: process.env.ONTOLOGY_API_KEY,
}));
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", async (line) => {
  if (!line.trim()) return;
  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: any };
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (message.id == null) return;
  try {
    if (message.method === "initialize")
      send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "ontology-platform", version: "1.0.0" } } });
    else if (message.method === "ping") send({ jsonrpc: "2.0", id: message.id, result: {} });
    else if (message.method === "tools/list") send({ jsonrpc: "2.0", id: message.id, result: { tools: MCP_TOOLS } });
    else if (message.method === "tools/call") {
      const result = await adapter.callTool(message.params?.name, message.params?.arguments ?? {});
      send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
    } else send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    const detail = error instanceof PlatformException ? error.error : (error as { response?: { error?: unknown } })?.response?.error ?? { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : String(error), stage: "mcp", retryable: false };
    send({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: JSON.stringify(detail) }], structuredContent: { error: detail } } });
  }
});

function send(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function shutdown() {
  input.close();

}
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
