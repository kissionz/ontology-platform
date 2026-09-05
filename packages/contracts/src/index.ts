import { z } from "zod";

export const EntityStatusSchema = z.enum(["DRAFT", "VERIFIED", "PUBLISHED", "DEPRECATED"]);
export const ObjectTypeSchema = z.enum(["ENTITY", "EVENT", "SNAPSHOT", "AGGREGATE", "RELATIONSHIP"]);
export const PropertyMeaningSchema = z.enum(["ID", "CODE", "NAME", "ENTITY_REFERENCE", "CATEGORY", "TIME", "NUMBER", "BOOLEAN", "GEOGRAPHY", "TEXT"]);
export const PropertyVisibilitySchema = z.enum(["ANALYTICAL", "DETAIL_ONLY", "HIDDEN"]);
export const NumericPropertySpecSchema = z.object({
  kind: z.enum(["GENERAL", "CURRENCY", "RATIO"]),
  unit: z.string().optional(), currency: z.string().optional(),
  defaultAggregation: z.enum(["SUM", "AVG", "MIN", "MAX", "NONE"]),
  aggregationBehavior: z.enum(["ADDITIVE", "SEMI_ADDITIVE", "NON_ADDITIVE"])
}).strict();
export const OntologyPropertySchema = z.object({
  id: z.string().min(1), name: z.string().min(1), label: z.string().min(1), description: z.string().default(""),
  dataType: z.string().min(1), sourceColumn: z.string().min(1), sensitive: z.boolean(), meaning: PropertyMeaningSchema,
  unique: z.boolean(), valueSearchable: z.boolean(), numericSpec: NumericPropertySpecSchema.optional(),
  visibility: PropertyVisibilitySchema, synonyms: z.array(z.string()), format: z.string().optional(), detailOrder: z.number().int().positive().optional(),
  defaultDisplay: z.boolean(), exportable: z.boolean(), nullDisplay: z.string().optional(), bindingPriority: z.number().int().min(0).max(100)
}).strict();
export const OntologyObjectSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), label: z.string().min(1), description: z.string(), sourceTableId: z.string().min(1),
  status: EntityStatusSchema, objectType: ObjectTypeSchema, grainPropertyIds: z.array(z.string()), grain: z.string(),
  identityReviewRequired: z.boolean().optional(), defaultTimePropertyId: z.string().optional(), defaultFilter: z.string().optional(),
  category: z.string().optional(), owner: z.string().optional(), exampleQuestions: z.array(z.string()), properties: z.array(OntologyPropertySchema),
  synonyms: z.array(z.string()), bindingPriority: z.number().int().min(0).max(100)
}).strict();
export const MetricSchema = z.object({
  id: z.string().min(1), metricType: z.enum(["BASE", "DERIVED"]), name: z.string().min(1), label: z.string().min(1), description: z.string(),
  objectId: z.string().min(1), expression: z.string(), definitionMode: z.enum(["VISUAL", "SQL"]), sourcePropertyId: z.string().optional(),
  filterExpression: z.string().optional(), timePropertyId: z.string().optional(), leftMetricId: z.string().optional(), rightMetricId: z.string().optional(),
  calculationOperator: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "RATIO"]).optional(), scale: z.number().positive().optional(),
  aggregation: z.enum(["SUM", "COUNT", "COUNT_DISTINCT", "AVG", "MIN", "MAX", "CUSTOM"]), format: z.enum(["currency", "number", "percent"]),
  unit: z.string().optional(), synonyms: z.array(z.string()), status: EntityStatusSchema
}).strict();
export const OntologyRelationSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), sourceObjectId: z.string().min(1), targetObjectId: z.string().min(1),
  type: z.enum(["REFERENCE", "COMPOSITION", "ASSOCIATION", "HIERARCHY", "EVENT_PARTICIPATION", "IDENTITY", "DERIVED"]),
  cardinality: z.enum(["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"]), joinExpression: z.string().min(1),
  sourcePropertyId: z.string().optional(), targetPropertyId: z.string().optional(), direction: z.enum(["BIDIRECTIONAL", "SOURCE_TO_TARGET", "TARGET_TO_SOURCE"]),
  composition: z.object({ parentObjectId: z.string(), childObjectId: z.string(), ownership: z.enum(["OWNED", "SHARED"]), aggregationPolicy: z.enum(["PRE_AGGREGATE_CHILD", "EXISTS_ONLY"]) }).optional(),
  required: z.boolean(), enabled: z.boolean(), fanoutRisk: z.enum(["NONE", "LOW", "HIGH"]), status: EntityStatusSchema
}).strict();
const HierarchyLevelSchema = z.object({ objectId: z.string(), propertyId: z.string() }).strict();
export const DimensionHierarchySchema = z.object({
  id: z.string().min(1), name: z.string().min(1), label: z.string().min(1), description: z.string().optional(),
  kind: z.enum(["FIXED_LEVELS", "ADJACENCY_LIST"]), levels: z.array(HierarchyLevelSchema),
  adjacency: z.object({ objectId: z.string(), nodeIdPropertyId: z.string(), parentIdPropertyId: z.string(), labelPropertyId: z.string(), maxDepth: z.number().int().positive(),
    closure: z.object({ objectId: z.string(), ancestorPropertyId: z.string(), descendantPropertyId: z.string(), depthPropertyId: z.string() }).optional() }).optional(),
  status: EntityStatusSchema
}).strict();
export const ProofStepSchema = z.object({ sequence: z.number().int().positive(), kind: z.enum(["FACT", "AXIOM", "DERIVATION"]), refId: z.string(), statement: z.string() }).strict();
export const AxiomAssertionSchema = z.object({
  id: z.string(), axiomCode: z.string(), kernelVersion: z.string(), domain: z.enum(["IDENTITY", "GRAIN", "TYPE", "METRIC_ALGEBRA", "RELATION", "HIERARCHY", "VISIBILITY"]),
  subjectType: z.enum(["OBJECT", "PROPERTY", "METRIC", "RELATION", "HIERARCHY"]), subjectId: z.string(), parameters: z.record(z.string(), z.unknown()),
  sourceDefinitionIds: z.array(z.string()), enforcement: z.enum(["DRAFT_VALIDATION", "PUBLISH_VALIDATION", "SEMANTIC_PLANNING", "QUERY_COMPILATION"]),
  severity: z.enum(["ERROR", "WARNING", "INVARIANT"])
}).strict();
export const InferredAssertionSchema = z.object({
  id: z.string(), predicate: z.string(), subjectId: z.string(), objectId: z.string().optional(), value: z.unknown().optional(), ontologyVersion: z.number().int().nonnegative(),
  axiomAssertionIds: z.array(z.string()), premiseAssertionIds: z.array(z.string()), proof: z.array(ProofStepSchema),
  materialization: z.enum(["PUBLISHED", "ON_DEMAND"]), deterministic: z.literal(true)
}).strict();
export const OntologySnapshotV3Schema = z.object({
  schemaVersion: z.literal(3), namespace: z.string().min(1), version: z.number().int().nonnegative(), baseVersion: z.number().int().nonnegative().optional(),
  status: EntityStatusSchema, publishedAt: z.string().optional(), contentDigest: z.string(), objects: z.array(OntologyObjectSchema),
  relations: z.array(OntologyRelationSchema), metrics: z.array(MetricSchema), dimensionHierarchies: z.array(DimensionHierarchySchema),
  axiomAssertions: z.array(AxiomAssertionSchema), inferredAssertions: z.array(InferredAssertionSchema), inferenceDigest: z.string()
}).strict();

export const ResolveSemanticContextInputSchema = z.object({
  namespace: z.string().min(1), ontologyVersion: z.union([z.number().int().nonnegative(), z.literal("latest")]).optional(), question: z.string().optional(),
  terms: z.array(z.string()).optional(), purpose: z.enum(["ANSWER", "PLAN", "EXPLAIN", "MODEL"]), projection: z.enum(["compact", "standard", "full"]).optional(),
  include: z.object({ values: z.boolean().optional(), axioms: z.boolean().optional(), inferences: z.boolean().optional(), evidence: z.boolean().optional() }).optional()
}).strict();
export const QueryFilterSchema = z.object({ propertyId: z.string(), operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "CONTAINS", "PREFIX", "IS_NULL", "NOT_NULL"]), value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional() }).strict();
export const QueryIrSchema = z.object({
  version: z.literal(3), ontologyVersion: z.number().int(), rootObjectId: z.string(), measureIds: z.array(z.string()), dimensionPropertyIds: z.array(z.string()),
  filters: z.array(QueryFilterSchema), relationIds: z.array(z.string()), grain: z.string(), resultKind: z.enum(["aggregate", "detail"]),
  sort: z.array(z.object({ entityId: z.string(), direction: z.enum(["ASC", "DESC"]) })), limit: z.number().int().positive()
}).strict();
export const FixedQueryShapeSchema = z.object({ rootObjectId: z.string(), measureIds: z.array(z.string()), dimensionPropertyIds: z.array(z.string()), filters: z.array(QueryFilterSchema).default([]), sort: z.array(z.object({ entityId: z.string(), direction: z.enum(["ASC", "DESC"]) })).default([]), limit: z.number().int().positive().max(10_000).default(200) }).strict();
export const ExecuteSemanticQueryInputSchema = z.object({
  queryMode: z.enum(["AUTO", "FIXED_SHAPE", "ANALYSIS"]), namespace: z.string().min(1), ontologyVersion: z.union([z.number().int().nonnegative(), z.literal("latest")]).optional(),
  question: z.string().optional(), queryShape: FixedQueryShapeSchema.optional(), parameters: z.record(z.string(), z.unknown()).optional(), sessionId: z.string().optional(),
  pagination: z.object({ pageSize: z.number().int().positive().max(10_000).optional(), cursor: z.string().optional() }).optional(),
  options: z.object({ includeResolution: z.boolean().optional(), includeOntologyContext: z.boolean().optional(), includeAxioms: z.boolean().optional(), includeInferenceEvidence: z.boolean().optional(), includeQueryIr: z.boolean().optional(), includeSqlPreview: z.boolean().optional() }).optional()
}).strict();
export const ContinueSemanticQueryInputSchema = z.object({ selections: z.record(z.string(), z.string()) }).strict();

export const DraftPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("UPSERT_OBJECT"), value: OntologyObjectSchema }).strict(),
  z.object({ op: z.literal("REMOVE_OBJECT"), id: z.string().min(1) }).strict(),
  z.object({ op: z.literal("UPSERT_METRIC"), value: MetricSchema }).strict(),
  z.object({ op: z.literal("REMOVE_METRIC"), id: z.string().min(1) }).strict(),
  z.object({ op: z.literal("UPSERT_RELATION"), value: OntologyRelationSchema }).strict(),
  z.object({ op: z.literal("REMOVE_RELATION"), id: z.string().min(1) }).strict(),
  z.object({ op: z.literal("UPSERT_HIERARCHY"), value: DimensionHierarchySchema }).strict(),
  z.object({ op: z.literal("REMOVE_HIERARCHY"), id: z.string().min(1) }).strict(),
]);
export const CreateDraftInputSchema = z.object({ baseVersion: z.union([z.number().int().nonnegative(), z.literal("latest")]).optional(), sourceVersion: z.number().int().nonnegative().optional() }).strict();
export const DraftPatchInputSchema = z.object({ revision: z.number().int().positive().optional(), operations: z.array(DraftPatchOperationSchema).min(1) }).strict();
export const PublishDraftInputSchema = z.object({ baseVersion: z.number().int().nonnegative(), changeSummary: z.string().optional() }).strict();
export const DataSourceInputSchema = z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535), username: z.string().min(1), password: z.string().min(1).optional(), catalog: z.string(), database: z.string().min(1), tls: z.boolean() }).strict();

export const ERROR_CODES = ["ONTOLOGY_VERSION_NOT_FOUND", "SESSION_VERSION_MISMATCH", "VALUE_NOT_FOUND", "VALUE_AMBIGUOUS", "RELATION_PATH_NOT_FOUND", "RELATION_FANOUT_UNSAFE", "CROSS_FACT_MEASURE", "NON_ADDITIVE_SUM", "SEMI_ADDITIVE_TIME_SUM", "DERIVED_METRIC_CYCLE", "READ_ONLY_VIOLATION", "CURSOR_CONTEXT_MISMATCH", "QUERY_TIMEOUT", "ONTOLOGY_VALIDATION_FAILED", "ONTOLOGY_VERSION_CONFLICT", "AUTHENTICATION_REQUIRED", "INSUFFICIENT_SCOPE", "DATA_SOURCE_NOT_CONFIGURED", "DATA_SOURCE_UNAVAILABLE", "INVALID_REQUEST"] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export interface PlatformError { code: ErrorCode | string; message: string; stage: string; retryable: boolean; action?: string; details?: Record<string, unknown>; evidenceRefs?: string[] }
export class PlatformException extends Error { constructor(public readonly error: PlatformError, public readonly statusCode = 400) { super(error.message); this.name = "PlatformException"; } }

export type OntologySnapshotV3 = z.infer<typeof OntologySnapshotV3Schema>;
export type OntologySnapshot = OntologySnapshotV3;
export type OntologyObject = z.infer<typeof OntologyObjectSchema>;
export type OntologyProperty = z.infer<typeof OntologyPropertySchema>;
export type OntologyRelation = z.infer<typeof OntologyRelationSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type DimensionHierarchy = z.infer<typeof DimensionHierarchySchema>;
export type AxiomAssertion = z.infer<typeof AxiomAssertionSchema>;
export type InferredAssertion = z.infer<typeof InferredAssertionSchema>;
export type ProofStep = z.infer<typeof ProofStepSchema>;
export type ResolveSemanticContextInput = z.infer<typeof ResolveSemanticContextInputSchema>;
export type ExecuteSemanticQueryInput = z.infer<typeof ExecuteSemanticQueryInputSchema>;
export type QueryIR = z.infer<typeof QueryIrSchema>;
export type FixedQueryShape = z.infer<typeof FixedQueryShapeSchema>;
export type QueryFilter = z.infer<typeof QueryFilterSchema>;
export interface PhysicalTable { id: string; sourceId?: string; catalog: string; database: string; name: string; type: "TABLE" | "VIEW"; status: "UNMODELED" | "DRAFTING" | "MODELED" | "CHANGED" | "IGNORED" | "REMOVED"; rowEstimate?: number; description?: string; columns: Array<{ name: string; dataType: string; nullable: boolean; sensitive: boolean; comment?: string }>; fingerprint: string; scannedAt: string }
export interface QueryResult { columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; truncated: boolean; executionMs?: number }
export type Scope = "ontology:read" | "ontology:draft" | "ontology:publish" | "semantic:read" | "semantic:plan" | "data:execute" | "system:admin";

export const CONTRACT_SCHEMAS = {
  OntologySnapshotV3: OntologySnapshotV3Schema,
  ResolveSemanticContextInput: ResolveSemanticContextInputSchema,
  ExecuteSemanticQueryInput: ExecuteSemanticQueryInputSchema,
  ContinueSemanticQueryInput: ContinueSemanticQueryInputSchema,
  CreateDraftInput: CreateDraftInputSchema,
  DraftPatchInput: DraftPatchInputSchema,
  PublishDraftInput: PublishDraftInputSchema,
  DataSourceInput: DataSourceInputSchema,
  QueryIR: QueryIrSchema
} as const;

export function jsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(CONTRACT_SCHEMAS).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })]));
}
