import type { ExecuteSemanticQueryInput, ResolveSemanticContextInput, PlatformError } from "../../contracts/src/index.js";
export interface PlatformResponse<T = unknown> {
  requestId: string; namespace: string; ontologyVersion?: number; status: string;
  data?: T; error?: PlatformError; auditId: string;
  completeness: { complete: boolean; truncated: boolean; nextCursor: string | null };
}
export class OntologyPlatformClient {
  constructor(private readonly options: { baseUrl: string; apiKey: string; fetch?: typeof fetch }) {}
  resolveOntologyContext(input: ResolveSemanticContextInput) { return this.request("/v1/semantic-context:resolve", { method: "POST", body: JSON.stringify(input) }); }
  executeSemanticQuery(input: ExecuteSemanticQueryInput) { return this.request("/v1/semantic-query", { method: "POST", body: JSON.stringify(input) }); }
  continueSemanticQuery(id: string, selections: Record<string, string>) { return this.request(`/v1/semantic-query/clarifications/${encodeURIComponent(id)}:continue`, { method: "POST", body: JSON.stringify({ selections }) }); }
  getOntology(namespace: string, version: number | "latest" = "latest") { return this.request(`/v1/namespaces/${encodeURIComponent(namespace)}/ontology?version=${version}`); }
  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<PlatformResponse<T> | undefined> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.apiKey}`);
    headers.set("content-type", "application/json");
    const response = await (this.options.fetch ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
    if (response.status === 304) return undefined;
    const body = await response.json() as PlatformResponse<T>;
    if (!response.ok) throw Object.assign(new Error(body.error?.message ?? `HTTP ${response.status}`), { response: body, status: response.status, code: body.error?.code });
    return body;
  }
}
