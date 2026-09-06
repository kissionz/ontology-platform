import { ENVELOPE_FIELDS, RESPONSE_FIELDS, QUERY_RESPONSE_EXAMPLES } from "./response-docs.js";
import { jsonSchemas } from "./index.js";

import { API_DOCS, PATH_DESCRIPTIONS, REQUEST_DOCS, QUERY_FIELD_DESCRIPTIONS } from "./api-docs.js";

const security = [{ bearerAuth: [] }];
const pathParameter = (name: string) => ({ in: "path", name, required: true, description: PATH_DESCRIPTIONS[name], schema: { type: "string" } });
const request = (name: string) => ({ required: !["CreateDraftInput", "ValidateDraftInput"].includes(name), description: "JSON 请求体，字段说明与实际契约一致。", content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` }, example: REQUEST_DOCS[name]?.example } } });
const queryParameter = (name: string, description: string, schema: Record<string, unknown>) => ({ in: "query", name, required: false, description, schema });
const versionQuery = queryParameter("version", "发布版本号或 latest；省略时读取最新发布版本。", { type: "string", default: "latest" });
const versioned = new Set(["GetOntologySummary", "GetOntologySnapshot", "GetOntologyGraph", "ListAxiomAssertions", "ListInferredAssertions", "ExplainInference", "GetValueIndexStatus", "RebuildValueIndex"]);
const operation = (operationId: keyof typeof API_DOCS, parameters: ReturnType<typeof pathParameter>[] = []) => {
  const docs = API_DOCS[operationId];
  const queries = [
    ...(versioned.has(operationId) ? [versionQuery] : []),
    ...(operationId === "GetOntologyGraph" ? [queryParameter("projection", "图谱视图：relations 关系、metrics 指标、axioms 公理。", { type: "string", enum: ["relations", "metrics", "axioms"], default: "relations" })] : []),
    ...(operationId === "DiffOntologyVersions" ? [queryParameter("baseVersion", "基线版本号；省略时使用目标版本的记录基线或前一版本。", { type: "integer", minimum: 0 })] : []),
    ...(operationId === "ListAuditEvents" ? [
      queryParameter("start", "开始时间（含），ISO 8601，须带时区。", { type: "string", format: "date-time" }),
      queryParameter("end", "结束时间（含），ISO 8601，须带时区。", { type: "string", format: "date-time" }),
      queryParameter("clientId", "精确匹配密钥所属客户端 ID；bootstrap 为管理员，anonymous 为未认证请求。", { type: "string" }),
      queryParameter("clientName", "按密钥名称包含匹配，大小写不敏感。", { type: "string" }),
      queryParameter("event", "精确匹配调用事件，例如 GET /v1/namespaces/:ns/summary 或 ValueIndexFailed。", { type: "string" }),
      queryParameter("includeSummary", "true 返回 events、total、overview 和筛选选项；默认 false 保持事件数组。", { type: "boolean", default: false }),
      queryParameter("limit", "每页条数，1–200，默认 100。", { type: "integer", default: 100, minimum: 1, maximum: 200 }),
      queryParameter("offset", "分页偏移量，从 0 开始。", { type: "integer", default: 0, minimum: 0 }),
    ] : []),
  ];
  const headers = ["PatchOntologyDraft", "DiscardOntologyDraft"].includes(operationId) ? [{ in: "header", name: "If-Match", required: operationId === "DiscardOntologyDraft", description: operationId === "DiscardOntologyDraft" ? "必填，填写草稿当前 revision，防止丢弃他人更新。" : "可替代请求体 revision，值为草稿当前修订号。", schema: { type: "string" } }] : operationId === "GetOntologySnapshot" ? [{ in: "header", name: "If-None-Match", required: false, description: "上次响应的 ETag，相同则返回 304。", schema: { type: "string" } }] : [];
  return { operationId, summary: docs.summary, description: docs.description, security, "x-required-scopes": docs.scopes, "x-envelope-fields": ["GetHealth", "GetOpenApiDocument"].includes(operationId) ? [] : ENVELOPE_FIELDS, "x-response-fields": RESPONSE_FIELDS[operationId], "x-response-examples": ["ExecuteSemanticQuery", "ContinueSemanticQuery"].includes(operationId) ? QUERY_RESPONSE_EXAMPLES : undefined, parameters: [...parameters, ...queries, ...headers], responses: {
    "200": { description: docs.returns, content: { "application/json": { schema: { type: "object" } } } },
    ...(operationId === "GetOntologySnapshot" ? { "304": { description: "快照未改变，响应体为空。" } } : {}),
    "400": { description: "参数不符合契约，检查 error.message 和 error.details。" },
    ...(docs.scopes !== "无需认证" ? { "401": { description: "缺少或使用了无效 Bearer API Key。" }, "403": { description: "密钥缺少所需权限，检查 error.details.requiredScopes。" }, "429": { description: "请求超过客户端限额，稍后重试。" } } : {}),
    "default": { description: "检查响应 status 以及 error 的 code、message、stage、retryable、action；用 auditId 关联调用审计。" },
  } };
};

export function createOpenApiDocument() {
  const qualifyRefs = (value: unknown, name: string): unknown => {
    if (Array.isArray(value)) return value.map(item => qualifyRefs(item, name));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "$ref" && typeof item === "string" && item.startsWith("#/") ? `#/components/schemas/${name}/${item.slice(2)}` : qualifyRefs(item, name)]));
    return value;
  };
  const schemas = Object.fromEntries(Object.entries(jsonSchemas()).map(([name, rawSchema]) => {
    const schema = rawSchema as { properties?: Record<string, unknown> };
    const described = { ...schema, ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, { ...(value as object), ...(REQUEST_DOCS[name]?.fields[key] ? { description: REQUEST_DOCS[name].fields[key] } : {}) }])) } : {}) };
    const describeNested = (node: any, prefix = "") => {
      for (const [key, raw] of Object.entries(node.properties ?? {})) {
        const value = raw as any; const path = prefix ? `${prefix}.${key}` : key;
        if (name === "ExecuteSemanticQueryInput" && QUERY_FIELD_DESCRIPTIONS[path]) value.description = QUERY_FIELD_DESCRIPTIONS[path];
        describeNested(value.items ?? value, path + (value.items ? "[]" : ""));
      }
    };
    describeNested(described);
    return [name, qualifyRefs(described, name)];
  }));
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
        delete: operation("DiscardOntologyDraft", [pathParameter("ns"), pathParameter("draftId")]),
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
      "/system/api-clients": { get: operation("ListApiClients"), post: { ...operation("CreateApiClient"), requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "scopes"], properties: { name: { type: "string", minLength: 1, description: "客户端名称。" }, scopes: { type: "array", description: "允许的权限列表；只读语义接入可用 ontology:read、semantic:read。", items: { type: "string", enum: ["ontology:read", "ontology:draft", "ontology:publish", "semantic:read", "semantic:plan", "data:execute", "system:admin"] } }, rateLimit: { type: "integer", minimum: 1, default: 120, description: "每分钟请求上限，默认 120。" } } }, example: { name: "外部 Agent", scopes: ["ontology:read", "semantic:read"], rateLimit: 120 } } } } } },
      "/system/api-clients/{clientId}": { delete: operation("RevokeApiClient", [pathParameter("clientId")]) },
      "/system/audit-events": { get: operation("ListAuditEvents") },
      "/system/metrics": { get: operation("GetSystemMetrics") },
    },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } }, schemas },
  } as const;
}
