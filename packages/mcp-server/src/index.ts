import { API_DOCS, REQUEST_DOCS } from "../../contracts/src/api-docs.js";
import { z } from "zod";
import type { OntologyPlatform } from "../../application/src/index.js";
import { ValidateDraftInputSchema, DraftPatchOperationSchema, ExecuteSemanticQueryInputSchema, ResolveSemanticContextInputSchema, PlatformException } from "../../contracts/src/index.js";
const namespace = z.string().min(1), draftId = z.string().min(1), version = z.number().int().nonnegative();
export const MCP_INPUT_SCHEMAS = {
  ResolveOntologyContext: ResolveSemanticContextInputSchema,
  ExecuteSemanticQuery: ExecuteSemanticQueryInputSchema,
  ContinueSemanticQuery: z.object({ clarificationId: z.string().min(1), selections: z.record(z.string(), z.string()) }).strict(),
  GetOntologySnapshot: z.object({ namespace, version: z.union([version, z.literal("latest")]).optional() }).strict(),
  ApplyOntologyDraftPatch: z.object({ namespace, draftId, revision: z.number().int().positive(), operations: z.array(DraftPatchOperationSchema).min(1) }).strict(),
  ValidateOntologyDraft: ValidateDraftInputSchema.extend({ namespace, draftId }),
  PublishOntologyDraft: z.object({ namespace, draftId, baseVersion: version, changeSummary: z.string().optional() }).strict(),
  ExplainInference: z.object({ namespace, version, id: z.string().min(1) }).strict(),
};
export const MCP_API_OPERATIONS = {
  ResolveOntologyContext: "ResolveOntologyContext", ExecuteSemanticQuery: "ExecuteSemanticQuery", ContinueSemanticQuery: "ContinueSemanticQuery", GetOntologySnapshot: "GetOntologySnapshot", ApplyOntologyDraftPatch: "PatchOntologyDraft", ValidateOntologyDraft: "ValidateOntologyDraft", PublishOntologyDraft: "PublishOntologyDraft", ExplainInference: "ExplainInference",
} as const;
const toolRequestDocs: Record<string, string> = { ResolveOntologyContext: "ResolveSemanticContextInput", ExecuteSemanticQuery: "ExecuteSemanticQueryInput", ContinueSemanticQuery: "ContinueSemanticQueryInput", ApplyOntologyDraftPatch: "DraftPatchInput", ValidateOntologyDraft: "ValidateDraftInput", PublishOntologyDraft: "PublishDraftInput" };
export const MCP_TOOL_DOCS = Object.fromEntries(Object.entries(MCP_API_OPERATIONS).map(([name, operation]) => {
  const base = API_DOCS[operation];
  const fields: Record<string, string> = { namespace: "本体命名空间，例如 retail。", draftId: "REST 创建草稿返回的 draftId。", version: name === "GetOntologySnapshot" ? "发布版本号或 latest，省略时读取最新发布版本。" : "推论所属的数字发布版本，必须明确指定。", id: "指定版本的推论 ID。", clarificationId: "查询响应中的澄清 ID。", ...REQUEST_DOCS[toolRequestDocs[name] ?? ""]?.fields };
  if (name === "ApplyOntologyDraftPatch") fields.revision = "草稿当前修订号，必填，使用最近一次草稿响应中的值。";
  return [name, { ...base, fields, description: name === "GetOntologySnapshot" ? "读取指定发布版本的可导出本体快照，包含对象、关系、公理和推论，遵循敏感字段边界。" : base.description,
    returns: name === "GetOntologySnapshot" ? "返回本体快照对象，包含 version、objects、relations、metrics、axiomAssertions 和 inferredAssertions。" : name === "ExecuteSemanticQuery" || name === "ContinueSemanticQuery" ? base.returns : base.returns.replace(/^data /, "工具结果 ") }];
}));
export const MCP_TOOLS = Object.entries(MCP_INPUT_SCHEMAS).map(([name, schema]) => ({ name, description: `${MCP_TOOL_DOCS[name]!.description} 所需权限：${MCP_TOOL_DOCS[name]!.scopes}。`, inputSchema: z.toJSONSchema(schema, { target: "draft-2020-12" }) }));
export class OntologyMcpAdapter {
  constructor(private readonly application: OntologyPlatform) {}
  listTools() { return MCP_TOOLS; }
  async callTool(name: string, input: unknown) {
    switch (name) {
      case "ResolveOntologyContext": return this.application.resolveOntologyContext(MCP_INPUT_SCHEMAS.ResolveOntologyContext.parse(input));
      case "ExecuteSemanticQuery": return this.application.executeSemanticQuery(MCP_INPUT_SCHEMAS.ExecuteSemanticQuery.parse(input));
      case "ContinueSemanticQuery": { const value = MCP_INPUT_SCHEMAS.ContinueSemanticQuery.parse(input); return this.application.continueSemanticQuery(value.clarificationId, value.selections); }
      case "GetOntologySnapshot": { const value = MCP_INPUT_SCHEMAS.GetOntologySnapshot.parse(input); return this.application.getExportSnapshot(value.namespace, value.version); }
      case "ApplyOntologyDraftPatch": { const value = MCP_INPUT_SCHEMAS.ApplyOntologyDraftPatch.parse(input); return this.application.applyDraftPatch(value.namespace, value.draftId, value.revision, value.operations); }
      case "ValidateOntologyDraft": { const value = MCP_INPUT_SCHEMAS.ValidateOntologyDraft.parse(input); return this.application.validateDraft(value.namespace, value.draftId, value.goldenCases); }
      case "PublishOntologyDraft": { const value = MCP_INPUT_SCHEMAS.PublishOntologyDraft.parse(input); return this.application.publishDraft(value.namespace, value.draftId, value.baseVersion, value.changeSummary); }
      case "ExplainInference": {
        const value = MCP_INPUT_SCHEMAS.ExplainInference.parse(input);
        const result = this.application.getExportSnapshot(value.namespace, value.version).inferredAssertions.find(item => item.id === value.id);
        if (!result) throw new PlatformException({ code: "VALUE_NOT_FOUND", message: "推论不存在", stage: "inference", retryable: false }, 404);
        return result;
      }
      default: throw new Error(`Unknown MCP tool: ${name}`);
    }
  }
}
