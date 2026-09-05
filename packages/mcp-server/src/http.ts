import { OntologyPlatformClient } from "../../sdk-typescript/src/index.js";
import { MCP_TOOLS } from "./index.js";

/** Production MCP uses HTTP so authentication, scopes, rate limits and audits are identical. */
export class OntologyHttpMcpAdapter {
  constructor(private readonly client: OntologyPlatformClient) {}
  listTools() { return MCP_TOOLS; }
  async callTool(name: string, input: Record<string, unknown>) {
    const ns = encodeURIComponent(String(input.namespace ?? "")), id = encodeURIComponent(String(input.draftId ?? ""));
    let endpoint: string, method = "POST", payload: unknown = input;
    switch (name) {
      case "ResolveOntologyContext": endpoint = "/v1/semantic-context:resolve"; break;
      case "ExecuteSemanticQuery": endpoint = "/v1/semantic-query"; break;
      case "ContinueSemanticQuery": endpoint = `/v1/semantic-query/clarifications/${encodeURIComponent(String(input.clarificationId))}:continue`; payload = { selections: input.selections }; break;
      case "GetOntologySnapshot": endpoint = `/v1/namespaces/${ns}/ontology?version=${encodeURIComponent(String(input.version ?? "latest"))}`; method = "GET"; break;
      case "ApplyOntologyDraftPatch": endpoint = `/v1/namespaces/${ns}/drafts/${id}`; method = "PATCH"; payload = { revision: input.revision, operations: input.operations }; break;
      case "ValidateOntologyDraft": endpoint = `/v1/namespaces/${ns}/drafts/${id}/validate`; payload = { goldenCases: input.goldenCases }; break;
      case "PublishOntologyDraft": endpoint = `/v1/namespaces/${ns}/drafts/${id}/publish`; payload = { baseVersion: input.baseVersion, changeSummary: input.changeSummary }; break;
      case "ExplainInference": endpoint = `/v1/namespaces/${ns}/inferences/${encodeURIComponent(String(input.id))}/explanation?version=${encodeURIComponent(String(input.version))}`; method = "GET"; break;
      default: throw new Error(`Unknown MCP tool: ${name}`);
    }
    const result = await this.client.request(endpoint, { method, ...(method === "GET" ? {} : { body: JSON.stringify(payload) }) });
    // Semantic queries already return the standard execution envelope.
    return name === "ExecuteSemanticQuery" || name === "ContinueSemanticQuery" ? result : result?.data;
  }
}
