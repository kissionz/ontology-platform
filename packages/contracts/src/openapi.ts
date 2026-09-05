import { jsonSchemas } from "./index.js";

const security = [{ bearerAuth: [] }];
const ok = { "200": { description: "Successful response", content: { "application/json": { schema: { type: "object" } } } } };
const pathParameter = (name: string) => ({ in: "path", name, required: true, schema: { type: "string" } });
const request = (name: string) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } } });
const operation = (operationId: string, parameters: ReturnType<typeof pathParameter>[] = []) => ({ operationId, security, parameters, responses: ok });

export function createOpenApiDocument() {
  const qualifyRefs = (value: unknown, name: string): unknown => {
    if (Array.isArray(value)) return value.map(item => qualifyRefs(item, name));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "$ref" && typeof item === "string" && item.startsWith("#/") ? `#/components/schemas/${name}/${item.slice(2)}` : qualifyRefs(item, name)]));
    return value;
  };
  const schemas = Object.fromEntries(Object.entries(jsonSchemas()).map(([name, schema]) => [name, qualifyRefs(schema, name)]));
  return {
    openapi: "3.1.0",
    info: { title: "Ontology Platform API", version: "1.0.0", description: "独立本体管理、语义解析与安全查询 API" },
    servers: [{ url: "/v1" }],
    paths: {
      "/health": { get: { ...operation("GetHealth"), security: [] } },
      "/system/openapi.json": { get: { ...operation("GetOpenApiDocument"), security: [] } },
      "/namespaces/{ns}/summary": { get: operation("GetOntologySummary", [pathParameter("ns")]) },
      "/namespaces/{ns}/ontology": { get: operation("GetOntologySnapshot", [pathParameter("ns")]) },
      "/namespaces/{ns}/graph": { get: operation("GetOntologyGraph", [pathParameter("ns")]) },
      "/namespaces/{ns}/versions": { get: operation("ListOntologyVersions", [pathParameter("ns")]) },
      "/namespaces/{ns}/versions/{version}/diff": { get: operation("DiffOntologyVersions", [pathParameter("ns"), pathParameter("version")]) },
      "/namespaces/{ns}/drafts": { post: { ...operation("CreateOntologyDraft", [pathParameter("ns")]), requestBody: request("CreateDraftInput") } },
      "/namespaces/{ns}/drafts/{draftId}": {
        get: operation("GetOntologyDraft", [pathParameter("ns"), pathParameter("draftId")]),
        patch: { ...operation("PatchOntologyDraft", [pathParameter("ns"), pathParameter("draftId")]), requestBody: request("DraftPatchInput") },
      },
      "/namespaces/{ns}/drafts/{draftId}/validate": { post: { ...operation("ValidateOntologyDraft", [pathParameter("ns"), pathParameter("draftId")]), requestBody: request("ValidateDraftInput") } },
      "/namespaces/{ns}/drafts/{draftId}/publish": { post: { ...operation("PublishOntologyDraft", [pathParameter("ns"), pathParameter("draftId")]), requestBody: request("PublishDraftInput") } },
      "/namespaces/{ns}/axioms": { get: operation("ListAxiomAssertions", [pathParameter("ns")]) },
      "/namespaces/{ns}/inferences": { get: operation("ListInferredAssertions", [pathParameter("ns")]) },
      "/namespaces/{ns}/inferences/{id}/explanation": { get: operation("ExplainInference", [pathParameter("ns"), pathParameter("id")]) },
      "/semantic-context:resolve": { post: { ...operation("ResolveOntologyContext"), requestBody: request("ResolveSemanticContextInput") } },
      "/semantic-query": { post: { ...operation("ExecuteSemanticQuery"), requestBody: request("ExecuteSemanticQueryInput") } },
      "/semantic-query/clarifications/{clarificationId}:continue": { post: { ...operation("ContinueSemanticQuery", [pathParameter("clarificationId")]), requestBody: request("ContinueSemanticQueryInput") } },
      "/data-sources/{sourceId}": {
        get: operation("GetDataSource", [pathParameter("sourceId")]),
        put: { ...operation("PutDataSource", [pathParameter("sourceId")]), requestBody: request("DataSourceInput") },
      },
      "/data-sources/{sourceId}:test": { post: operation("TestDataSource", [pathParameter("sourceId")]) },
      "/data-sources/{sourceId}/schema:scan": { post: operation("ScanDataSourceSchema", [pathParameter("sourceId")]) },
      "/namespaces/{ns}/value-index/status": { get: operation("GetValueIndexStatus", [pathParameter("ns")]) },
      "/namespaces/{ns}/value-index:rebuild": { post: operation("RebuildValueIndex", [pathParameter("ns")]) },
      "/system/api-clients": { get: operation("ListApiClients"), post: operation("CreateApiClient") },
      "/system/api-clients/{clientId}": { delete: operation("RevokeApiClient", [pathParameter("clientId")]) },
      "/system/audit-events": { get: operation("ListAuditEvents") },
      "/system/metrics": { get: operation("GetSystemMetrics") },
    },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } }, schemas },
  } as const;
}
