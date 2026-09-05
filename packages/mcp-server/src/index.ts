import { z } from "zod";
import type { OntologyPlatform } from "../../application/src/index.js";
import { DraftPatchOperationSchema, ExecuteSemanticQueryInputSchema, ResolveSemanticContextInputSchema, PlatformException } from "../../contracts/src/index.js";
const namespace = z.string().min(1), draftId = z.string().min(1), version = z.number().int().nonnegative();
export const MCP_INPUT_SCHEMAS = {
  ResolveOntologyContext: ResolveSemanticContextInputSchema,
  ExecuteSemanticQuery: ExecuteSemanticQueryInputSchema,
  ContinueSemanticQuery: z.object({ clarificationId: z.string().min(1), selections: z.record(z.string(), z.string()) }).strict(),
  GetOntologySnapshot: z.object({ namespace, version: z.union([version, z.literal("latest")]).optional() }).strict(),
  ApplyOntologyDraftPatch: z.object({ namespace, draftId, revision: z.number().int().positive(), operations: z.array(DraftPatchOperationSchema).min(1) }).strict(),
  ValidateOntologyDraft: z.object({ namespace, draftId }).strict(),
  PublishOntologyDraft: z.object({ namespace, draftId, baseVersion: version, changeSummary: z.string().optional() }).strict(),
  ExplainInference: z.object({ namespace, version, id: z.string().min(1) }).strict(),
};
const descriptions = {
  ResolveOntologyContext: "Resolve version-pinned ontology context, values, axioms, inferences and evidence in one call",
  ExecuteSemanticQuery: "Resolve, plan, compile and execute a semantic query in one call",
  ContinueSemanticQuery: "Submit all clarification selections and continue",
  GetOntologySnapshot: "Read a versioned ontology snapshot",
  ApplyOntologyDraftPatch: "Apply an atomic ontology draft patch",
  ValidateOntologyDraft: "Validate a draft and preview axioms and inferences",
  PublishOntologyDraft: "Publish an immutable ontology version",
  ExplainInference: "Return the complete proof path for an inference",
};
export const MCP_TOOLS = Object.entries(MCP_INPUT_SCHEMAS).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof descriptions], inputSchema: z.toJSONSchema(schema, { target: "draft-2020-12" }) }));
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
      case "ValidateOntologyDraft": { const value = MCP_INPUT_SCHEMAS.ValidateOntologyDraft.parse(input); return this.application.validateDraft(value.namespace, value.draftId); }
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
