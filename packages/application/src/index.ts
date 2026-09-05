import { effectiveMetrics } from "../../domain/src/property-metrics.js";
import { retrieveContext } from "./context-retrieval.js";
import { relationJoinExpression, relationTraversals } from "../../domain/src/relations.js";
import { randomUUID } from "node:crypto";
import type {
  ExecuteSemanticQueryInput,
  GoldenCase,
  FixedQueryShape,
  OntologyObject,
  OntologyProperty,
  OntologySnapshotV3,
  PhysicalTable,
  QueryIR,
  QueryResult,
  ResolveSemanticContextInput,
} from "../../contracts/src/index.js";
import { DraftPatchOperationSchema, PlatformException } from "../../contracts/src/index.js";
import type {
  AnalysisIntent,
  OntologySnapshot as LegacySnapshot,
  PhysicalTable as LegacyTable,
} from "../../contracts/src/legacy.js";
import { digest, finalizeSnapshot, runKernel, visibleSnapshot } from "../../domain/src/index.js";
import { SemanticIndex } from "../../domain/src/semantic-index.js";
import {
  QueryIrCompiler,
  type CompiledQuery,
  guardReadOnlySql,
} from "../../sql-selectdb/src/index.js";

export interface DraftRecord {
  namespace: string;
  draftId: string;
  baseVersion?: number;
  revision: number;
  snapshot: OntologySnapshotV3;
  updatedAt: string;
}
export interface GoldenReport {
  reportId: string;
  draftId: string;
  revision: number;
  checkedAt: string;
  snapshotDigest: string;
  schemaDigest: string;
  mode: "COMPILATION";
  status: "PASSED" | "FAILED" | "NOT_CONFIGURED";
  cases: GoldenCase[];
  results: Array<{ id: string; label: string; passed: boolean; issues: string[]; sqlDigest?: string }>;
}
export type CompiledTemplate = Pick<CompiledQuery, "ir" | "sql">;

export interface ClarificationRecord {
  clarificationId: string;
  input: ExecuteSemanticQueryInput;
  version: number;
  choices: Record<string, string[]>;
  indexedValues: Array<{ objectId: string; propertyId: string; displayValue: string; frequency: number }>;
  expiresAt: string;
}
export interface PlatformStorePort {
  saveGoldenReport(namespace: string, report: GoldenReport): void;
  getGoldenReport(namespace: string, draftId: string): GoldenReport | undefined;
  getCompiledTemplate(namespace: string, version: number, key: string): CompiledTemplate | undefined;
  putCompiledTemplate(namespace: string, version: number, key: string, template: CompiledTemplate): void;
  saveClarification(record: ClarificationRecord): void;
  getClarification(clarificationId: string): ClarificationRecord | undefined;
  deleteClarification(clarificationId: string): void;
  transaction<T>(work: () => T): T;
  latestVersion(namespace: string): number | undefined;
  getSnapshot(
    namespace: string,
    version: number | "latest",
  ): OntologySnapshotV3 | undefined;
  listVersions(namespace: string): unknown[];
  savePublished(snapshot: OntologySnapshotV3): void;
  saveVersionMetadata(
    namespace: string,
    version: number,
    publishedBy: string,
    changeSummary: string,
  ): void;
  createDraft(namespace: string, baseVersion: number | "latest"): DraftRecord;
  getDraft(namespace: string, draftId: string): DraftRecord | undefined;
  saveDraft(record: DraftRecord, expectedRevision: number): DraftRecord;
  deleteDraft(namespace: string, draftId: string): void;
  getAxioms(
    namespace: string,
    version: number,
  ): OntologySnapshotV3["axiomAssertions"];
  getInferences(
    namespace: string,
    version: number,
  ): OntologySnapshotV3["inferredAssertions"];
  explainInference(
    namespace: string,
    version: number,
    id: string,
  ): OntologySnapshotV3["inferredAssertions"][number] | undefined;
  saveSession(session: {
    sessionId: string;
    namespace: string;
    ontologyVersion: number;
    refs: Record<string, string>;
    expiresAt: string;
  }): void;
  getSession(
    sessionId: string,
  ):
    | {
        sessionId: string;
        namespace: string;
        ontologyVersion: number;
        refs: Record<string, string>;
        expiresAt: string;
      }
    | undefined;
  appendAudit(
    auditId: string,
    requestId: string,
    eventType: string,
    payload: unknown,
  ): void;
  listAudit(limit?: number): unknown[];
  listPhysicalTables(sourceId?: string): PhysicalTable[];
  matchValues(namespace: string, version: number, question: string): Array<{ objectId: string; propertyId: string; displayValue: string; frequency: number }>;
  searchValues(
    namespace: string,
    version: number,
    query: string,
    limit?: number,
  ): Array<{
    objectId: string;
    propertyId: string;
    displayValue: string;
    frequency: number;
  }>;
  getIndexStatus(namespace: string, version: number): Record<string, unknown>;
  putShape(
    namespace: string,
    version: number,
    fingerprint: string,
    ir: QueryIR,
    parameterSchema: unknown,
  ): void;
  getShape(
    namespace: string,
    version: number,
    fingerprint: string,
  ): QueryIR | undefined;
}
export interface QueryExecutorPort {
  execute(
    sql: string,
    parameters: unknown[],
    maxRows: number,
    timeoutMs: number,
  ): Promise<QueryResult>;
}
export type DraftPatchOperation =
  | { op: "UPSERT_OBJECT"; value: OntologySnapshotV3["objects"][number] }
  | { op: "REMOVE_OBJECT"; id: string }
  | { op: "UPSERT_METRIC"; value: OntologySnapshotV3["metrics"][number] }
  | { op: "REMOVE_METRIC"; id: string }
  | { op: "UPSERT_RELATION"; value: OntologySnapshotV3["relations"][number] }
  | { op: "REMOVE_RELATION"; id: string }
  | {
      op: "UPSERT_HIERARCHY";
      value: OntologySnapshotV3["dimensionHierarchies"][number];
    }
  | { op: "REMOVE_HIERARCHY"; id: string };

export class OntologyPlatform {
  private readonly compiler: QueryIrCompiler;
  constructor(
    private readonly store: PlatformStorePort,
    private readonly executor?: QueryExecutorPort,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.compiler = new QueryIrCompiler(now);
  }

  resolveVersion(
    namespace: string,
    requested: number | "latest" | undefined,
  ): number {
    const version =
      requested == null || requested === "latest"
        ? this.store.latestVersion(namespace)
        : requested;
    if (version == null || !this.store.getSnapshot(namespace, version))
      throw new PlatformException(
        {
          code: "ONTOLOGY_VERSION_NOT_FOUND",
          message: `命名空间 ${namespace} 没有可用的已发布版本`,
          stage: "session",
          retryable: false,
          action: "先导入或发布本体版本",
          details: { availableVersions: this.store.listVersions(namespace) },
        },
        404,
      );
    return version;
  }
  getSnapshot(namespace: string, version: number | "latest" = "latest") {
    const resolved = this.resolveVersion(namespace, version);
    return this.store.getSnapshot(namespace, resolved)!;
  }
  getExportSnapshot(namespace: string, version: number | "latest" = "latest") {
    return visibleSnapshot(this.getSnapshot(namespace, version));
  }
  summary(namespace: string, version: number | "latest" = "latest") {
    const snapshot = this.getExportSnapshot(namespace, version);
    return {
      ontologyVersion: snapshot.version,
      status: snapshot.status,
      contentDigest: snapshot.contentDigest,
      counts: {
        objects: snapshot.objects.length,
        properties: snapshot.objects.reduce(
          (sum, o) => sum + o.properties.length,
          0,
        ),
        relations: snapshot.relations.length,
        metrics: snapshot.metrics.length,
        hierarchies: snapshot.dimensionHierarchies.length,
        axioms: snapshot.axiomAssertions.length,
        inferences: snapshot.inferredAssertions.length,
      },
      valueIndex: this.store.getIndexStatus(namespace, snapshot.version),
      defaultObject: snapshot.objects[0] ?? null,
      graph: this.graph(namespace, snapshot.version, "relations"),
    };
  }
  graph(
    namespace: string,
    version: number | "latest" = "latest",
    projection: "relations" | "metrics" | "axioms" = "relations",
  ) {
    const snapshot = this.getExportSnapshot(namespace, version);
    const nodes: Array<{ id: string; label: string; kind: string; objectType: string; propertyCount: number; detail: unknown }> = [
      ...snapshot.objects.map((o) => ({
        id: o.id,
        label: o.label,
        kind: "OBJECT",
        objectType: o.objectType,
        propertyCount: o.properties.length,
        detail: o,
      })),
    ];
    if (projection === "metrics")
      nodes.push(
        ...snapshot.metrics.map((m) => ({
          id: m.id,
          label: m.label,
          kind: "METRIC",
          objectType: "METRIC",
          propertyCount: 0,
          detail: m,
        })),
      );
    if (projection === "axioms")
      nodes.push(
        ...snapshot.axiomAssertions.map((a) => ({
          id: a.id,
          label: a.axiomCode,
          kind: "AXIOM",
          objectType: a.domain,
          propertyCount: 0,
          detail: a,
        })),
      );
    const edges: Array<{ id: string; source: string; target: string; label: string; direction: string; cardinality: string }> = snapshot.relations
      .filter((r) => r.enabled)
      .map((r) => ({
        id: r.id,
        source: r.sourceObjectId,
        target: r.targetObjectId,
        label: r.name,
        direction: r.direction,
        cardinality: r.cardinality,
      }));
    if (projection === "metrics")
      edges.push(
        ...snapshot.metrics.map((m) => ({
          id: `metric:${m.id}`,
          source: m.objectId,
          target: m.id,
          label: m.metricType,
          direction: "SOURCE_TO_TARGET",
          cardinality: "ONE_TO_MANY",
        })),
      );
    if (projection === "axioms")
      edges.push(
        ...snapshot.axiomAssertions.map((a) => ({
          id: `axiom:${a.id}`,
          source: a.subjectId,
          target: a.id,
          label: a.enforcement,
          direction: "SOURCE_TO_TARGET",
          cardinality: "ONE_TO_MANY",
        })),
      );
    return {
      ontologyVersion: snapshot.version,
      nodes,
      edges,
      contentDigest: snapshot.contentDigest,
    };
  }

  createDraft(
    namespace: string,
    baseVersion: number | "latest" = "latest",
    sourceVersion?: number,
  ) {
    return this.store.transaction(() => {
      if (baseVersion !== "latest" || this.store.latestVersion(namespace) != null) this.resolveVersion(namespace, baseVersion);
      const draft = this.store.createDraft(namespace, baseVersion);
      if (sourceVersion == null) return draft;
      const source = this.getSnapshot(namespace, sourceVersion);
      const restored = structuredClone(source);
      restored.status = "DRAFT";
      restored.version = draft.snapshot.version;
      restored.baseVersion = draft.baseVersion;
      restored.publishedAt = undefined;
      restored.objects.forEach((item) => (item.status = "DRAFT"));
      restored.metrics.forEach((item) => (item.status = "DRAFT"));
      restored.relations.forEach((item) => (item.status = "DRAFT"));
      restored.dimensionHierarchies.forEach((item) => (item.status = "DRAFT"));
      return this.store.saveDraft({ ...draft, snapshot: restored }, draft.revision);
    });
  }
  applyDraftPatch(
    namespace: string,
    draftId: string,
    expectedRevision: number,
    operations: DraftPatchOperation[],
  ) {
    const draft = this.store.getDraft(namespace, draftId);
    if (!draft)
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "草稿不存在",
          stage: "draft",
          retryable: false,
        },
        404,
      );
    let next = structuredClone(draft.snapshot);
    for (const inputOperation of operations) {
      const operation = DraftPatchOperationSchema.parse(inputOperation);
      if (operation.op === "UPSERT_OBJECT") {
        const previous = next.objects.find(o => o.id === operation.value.id);
        const table = this.store.listPhysicalTables().find(t => t.id === operation.value.sourceTableId);
        const mappingChanged = !previous || previous.sourceTableId !== operation.value.sourceTableId || operation.value.properties.some(p => {
          const original = previous.properties.find(old => old.id === p.id);
          return !original || original.sourceColumn !== p.sourceColumn || original.dataType !== p.dataType;
        });
        if (mappingChanged && (!table || operation.value.properties.some(p => !table.columns.some(c => c.name === p.sourceColumn && c.dataType === p.dataType)))) throw new PlatformException({ code: "ONTOLOGY_VALIDATION_FAILED", message: "物理字段映射必须来自已扫描 Schema，字段名称与数据类型必须一致", stage: "draft", retryable: false }, 422);
        next.objects = upsert(next.objects, operation.value);
      }
      else if (operation.op === "REMOVE_OBJECT")
        next.objects = next.objects.filter((item) => item.id !== operation.id);
      else if (operation.op === "UPSERT_METRIC")
        next.metrics = upsert(next.metrics, operation.value);
      else if (operation.op === "REMOVE_METRIC")
        next.metrics = next.metrics.filter((item) => item.id !== operation.id);
      else if (operation.op === "UPSERT_RELATION")
        next.relations = upsert(next.relations, operation.value);
      else if (operation.op === "REMOVE_RELATION")
        next.relations = next.relations.filter(
          (item) => item.id !== operation.id,
        );
      else if (operation.op === "UPSERT_HIERARCHY")
        next.dimensionHierarchies = upsert(
          next.dimensionHierarchies,
          operation.value,
        );
      else
        next.dimensionHierarchies = next.dimensionHierarchies.filter(
          (item) => item.id !== operation.id,
        );
    }
    const changedObjects = new Set(operations.filter(op => op.op === "UPSERT_OBJECT").map(op => op.value.id));
    next.relations = next.relations.map(relation => changedObjects.has(relation.sourceObjectId) || changedObjects.has(relation.targetObjectId) ? { ...relation, joinExpression: relationJoinExpression(next, relation) || relation.joinExpression } : relation);
    const kernel = runKernel(next);
    next = {
      ...next,
      axiomAssertions: kernel.axioms,
      inferredAssertions: kernel.inferences,
      inferenceDigest: kernel.inferenceDigest,
      contentDigest: digest({
        ...next,
        axiomAssertions: undefined,
        inferredAssertions: undefined,
      }),
    };
    const saved = this.store.saveDraft(
      { ...draft, snapshot: next },
      expectedRevision,
    );
    return {
      ...saved,
      validation: { valid: kernel.valid, issues: kernel.issues },
    };
  }
  validateDraft(namespace: string, draftId: string, cases?: GoldenCase[]) {
    const draft = this.store.getDraft(namespace, draftId);
    if (!draft)
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "草稿不存在",
          stage: "publish",
          retryable: false,
        },
        404,
      );
    const kernel = runKernel(draft.snapshot);
    const goldenCases = this.runGoldenCases(draft, cases ?? this.store.getGoldenReport(namespace, draftId)?.cases ?? []);
    this.store.saveGoldenReport(namespace, goldenCases);
    return {
      draftId,
      revision: draft.revision,
      valid: kernel.valid && goldenCases.status !== "FAILED",
      goldenCases,
      issues: kernel.issues,
      axiomAssertions: kernel.axioms,
      inferencePreview: kernel.inferences,
      digests: {
        content: digest(draft.snapshot),
        inference: kernel.inferenceDigest,
      },
    };
  }
  private runGoldenCases(draft: DraftRecord, cases: GoldenCase[]): GoldenReport {
    const tables = this.store.listPhysicalTables();
    const snapshot = visibleSnapshot({ ...draft.snapshot, status: "PUBLISHED", objects: draft.snapshot.objects.map(item => ({ ...item, status: "PUBLISHED" })), metrics: draft.snapshot.metrics.map(item => ({ ...item, status: "PUBLISHED" })), relations: draft.snapshot.relations.map(item => ({ ...item, status: "PUBLISHED" })), dimensionHierarchies: draft.snapshot.dimensionHierarchies.map(item => ({ ...item, status: "PUBLISHED" })) });
    const results = cases.map(test => {
      const issues: string[] = [];
      try {
        const shape = bindShape(test.queryShape, test.parameters ?? {});
        const compiled = this.compiler.compile(shapeToIntent(shape, snapshot), snapshot as unknown as LegacySnapshot, tables as unknown as LegacyTable[]);
        guardReadOnlySql(compiled.sql, shape.limit);
        if (test.expected.rootObjectId && test.expected.rootObjectId !== compiled.ir.rootObjectId) issues.push("主对象与预期不一致");
        for (const key of ["measureIds", "dimensionPropertyIds", "relationIds"] as const)
          if (test.expected[key] && digest([...test.expected[key]!].sort()) !== digest([...compiled.ir[key]].sort())) issues.push(`${key} 与预期不一致`);
        for (const text of test.expected.sqlContains ?? []) if (!compiled.sql.includes(text)) issues.push(`SQL 缺少预期片段：${text}`);
        return { id: test.id, label: test.label, passed: issues.length === 0, issues, sqlDigest: digest(compiled.sql) };
      } catch (error) {
        return { id: test.id, label: test.label, passed: false, issues: [error instanceof Error ? error.message : String(error)] };
      }
    });
    return { reportId: `golden_${randomUUID()}`, draftId: draft.draftId, revision: draft.revision, checkedAt: this.now().toISOString(), snapshotDigest: digest(draft.snapshot), schemaDigest: digest(tables), mode: "COMPILATION", status: !cases.length ? "NOT_CONFIGURED" : results.every(result => result.passed) ? "PASSED" : "FAILED", cases, results };
  }
  publishDraft(
    namespace: string,
    draftId: string,
    expectedBaseVersion: number,
    changeSummary = "",
    publishedBy = "system",
  ) {
    return this.store.transaction(() => {
    const draft = this.store.getDraft(namespace, draftId);
    if (!draft)
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "草稿不存在",
          stage: "publish",
          retryable: false,
        },
        404,
      );
    const latest = this.store.latestVersion(namespace);
    if (
      (latest ?? 0) !== expectedBaseVersion ||
      (draft.baseVersion === 0 && draft.snapshot.baseVersion == null && latest != null) ||
      draft.baseVersion !== expectedBaseVersion
    )
      throw new PlatformException(
        {
          code: "ONTOLOGY_VERSION_CONFLICT",
          message: "本体基线版本已变化",
          stage: "publish",
          retryable: false,
          action: "基于最新版本重新创建草稿",
          details: { expectedBaseVersion, currentLatestVersion: latest },
        },
        409,
      );
    const validation = this.validateDraft(namespace, draftId);
    if (!validation.valid)
      throw new PlatformException(
        {
          code: "ONTOLOGY_VALIDATION_FAILED",
          message: "本体未通过发布校验",
          stage: "publish",
          retryable: false,
          action: "修复全部 ERROR 后重新发布",
          details: { issues: validation.issues, goldenCases: validation.goldenCases },
        },
        422,
      );
    const published = finalizeSnapshot({
      ...draft.snapshot,
      version: expectedBaseVersion + 1,
      baseVersion: expectedBaseVersion,
      status: "PUBLISHED",
      publishedAt: new Date().toISOString(),
      objects: draft.snapshot.objects.map((item) => ({
        ...item,
        status: "PUBLISHED",
      })),
      metrics: draft.snapshot.metrics.map((item) => ({
        ...item,
        status: "PUBLISHED",
      })),
      relations: draft.snapshot.relations.map((item) => ({
        ...item,
        status: "PUBLISHED",
      })),
      dimensionHierarchies: draft.snapshot.dimensionHierarchies.map((item) => ({
        ...item,
        status: "PUBLISHED",
      })),
    });
    this.store.savePublished(published);
    this.store.saveVersionMetadata(
      namespace,
      published.version,
      publishedBy,
      changeSummary,
    );
    this.store.deleteDraft(namespace, draftId);
    this.store.appendAudit(`audit_${randomUUID()}`, `req_${randomUUID()}`, "OntologyPublished", {
      namespace, ontologyVersion: published.version, publishedBy, changeSummary,
      contentDigest: published.contentDigest, inferenceDigest: published.inferenceDigest,
      goldenReportId: validation.goldenCases.reportId, goldenStatus: validation.goldenCases.status,
    });
    return { ...published, changeSummary };
    });
  }
  diff(namespace: string, version: number, baseVersion?: number) {
    const current = this.getSnapshot(namespace, version);
    const base = this.getSnapshot(
      namespace,
      baseVersion ?? current.baseVersion ?? Math.max(0, version - 1),
    );
    return {
      version,
      baseVersion: base.version,
      objects: diffById(base.objects, current.objects),
      relations: diffById(base.relations, current.relations),
      metrics: diffById(base.metrics, current.metrics),
      hierarchies: diffById(
        base.dimensionHierarchies,
        current.dimensionHierarchies,
      ),
      axioms: diffById(base.axiomAssertions, current.axiomAssertions),
      inferences: diffById(base.inferredAssertions, current.inferredAssertions),
    };
  }

  resolveOntologyContext(input: ResolveSemanticContextInput) {
    const version = this.resolveVersion(input.namespace, input.ontologyVersion);
    if (!input.question?.trim() && !input.terms?.length && !Object.values(input.concepts ?? {}).some(terms => terms?.length))
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "question、terms 与 concepts 至少提供一项非空内容",
          stage: "binding",
          retryable: false,
        },
        400,
      );
    const snapshot = visibleSnapshot(this.store.getSnapshot(input.namespace, version)!);
    const sessionId = `ses_${randomUUID()}`;
    const query = [input.question ?? "", ...(input.terms ?? []), ...Object.values(input.concepts ?? {}).flat()].join(" ").trim();
    const { objects, metrics, relations, candidates, ambiguities: contextAmbiguities, retrieval } = retrieveContext(snapshot, input);
    const objectIds = new Set(objects.map(object => object.id));
    const propertyIds = new Set(
      objects.flatMap((object) =>
        object.properties.map((property) => property.id),
      ),
    );
    const values = input.include?.values
      ? this.store.matchValues(input.namespace, version, query).filter(value => propertyIds.has(value.propertyId)) : [];
    const refs: Record<string, string> = {};
    objects.forEach((item, index) => (refs[`O${index + 1}`] = item.id));
    metrics.forEach((item, index) => (refs[`M${index + 1}`] = item.id));
    objects
      .flatMap((o) => o.properties)
      .filter((p) => propertyIds.has(p.id))
      .forEach((item, index) => (refs[`D${index + 1}`] = item.id));
    relations.forEach((item, index) => (refs[`R${index + 1}`] = item.id));
    values.forEach(
      (item, index) =>
        (refs[`B${index + 1}`] = `${item.propertyId}:${item.displayValue}`),
    );
    const definitionIds = new Set([...objectIds, ...propertyIds, ...metrics.map(m => m.id), ...relations.map(r => r.id)]);
    const hierarchies = snapshot.dimensionHierarchies.filter(h => h.levels.every(l => objectIds.has(l.objectId) && propertyIds.has(l.propertyId)));
    hierarchies.forEach(h => definitionIds.add(h.id));
    const relevantAxioms = snapshot.axiomAssertions.filter(item => definitionIds.has(item.subjectId) && item.sourceDefinitionIds.every(id => definitionIds.has(id)));
    const axioms = input.include?.axioms === false ? [] : relevantAxioms;
    axioms.forEach((item, index) => (refs[`A${index + 1}`] = item.id));
    const axiomIds = new Set(relevantAxioms.map(a => a.id));
    const premiseExists = (id: string) => definitionIds.has(id) || axiomIds.has(id) || (id.includes(":") && id.split(":").every(part => definitionIds.has(part)));
    const inferences = input.include?.inferences === false ? [] : snapshot.inferredAssertions.filter(item =>
      definitionIds.has(item.subjectId) && (!item.objectId || definitionIds.has(item.objectId)) &&
      item.axiomAssertionIds.every(id => axiomIds.has(id)) && item.premiseAssertionIds.every(premiseExists));
    inferences.forEach((item, index) => (refs[`I${index + 1}`] = item.id));
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    this.store.saveSession({
      sessionId,
      namespace: input.namespace,
      ontologyVersion: version,
      refs,
      expiresAt,
    });
    const semanticContext = {
      namespace: input.namespace,
      ontologyVersion: version,
      purpose: input.purpose,
      projection: input.projection ?? "compact",
      objects: projectObjects(objects, input.projection ?? "compact"),
      metrics,
      relations,
      hierarchies,
      values,
      axioms,
      inferences:
        input.include?.evidence === false
          ? inferences.map(({ proof, ...rest }) => rest)
          : inferences,
      relationPaths: relationPaths(relations),
      grainSummary: objects.map((o) => ({
        objectId: o.id,
        grain: o.grain,
        grainPropertyIds: o.grainPropertyIds,
      })),
      additivitySummary: numericSummary(objects),
      refs,
      candidates,
      ambiguities: contextAmbiguities,
      retrieval,
    };
    return {
      sessionId,
      ...semanticContext,
      expiresAt,
      contextDigest: digest(semanticContext),
      tokenEstimate: Math.ceil(JSON.stringify(semanticContext).length / 3.2),
    };
  }

  async executeSemanticQuery(input: ExecuteSemanticQueryInput) {
    const requestId = `req_${randomUUID()}`,
      auditId = `audit_${randomUUID()}`;
    try {
      const pinnedSession = input.sessionId ? this.store.getSession(input.sessionId) : undefined;
      const version = this.resolveVersion(
        input.namespace,
        pinnedSession && (input.ontologyVersion == null || input.ontologyVersion === "latest")
          ? pinnedSession.ontologyVersion : input.ontologyVersion,
      );
      if (input.sessionId) {
        const session = this.store.getSession(input.sessionId);
        if (
          !session ||
          session.namespace !== input.namespace ||
          session.ontologyVersion !== version
        )
          throw new PlatformException(
            {
              code: "SESSION_VERSION_MISMATCH",
              message: "会话固定版本与请求版本不一致",
              stage: "session",
              retryable: false,
              action: "创建新语义会话",
            },
            409,
          );
      }
      const snapshot = visibleSnapshot(this.store.getSnapshot(input.namespace, version)!);
      if (input.queryMode === "ANALYSIS") {
        const context = this.resolveOntologyContext({
          namespace: input.namespace,
          ontologyVersion: version,
          question: input.question,
          purpose: "PLAN",
          include: {
            values: true,
            axioms: true,
            inferences: true,
            evidence: true,
          },
        });
        return this.envelope(
          requestId,
          auditId,
          input.namespace,
          version,
          "ANALYSIS_READY",
          {
            status: "ANALYSIS_READY",
            context,
            acceptanceContract: {
              status: "OPEN",
              criteria: ["DATABASE_EVIDENCE", "RESULT_COMPLETENESS"],
              maxQueries: 12,
            },
          },
        );
      }
      let shape: FixedQueryShape;
      let resolution: unknown;
      if (input.queryMode === "FIXED_SHAPE") {
        if (!input.queryShape)
          throw new PlatformException(
            {
              code: "INVALID_REQUEST",
              message: "FIXED_SHAPE 必须提供 queryShape",
              stage: "planning",
              retryable: false,
            },
            400,
          );
        const resolveRef = (id: string) => {
          if (!/^[OMDRBAI]\d+$/.test(id)) return id;
          const ref = pinnedSession?.refs[id];
          if (!ref) throw new PlatformException({ code: "SESSION_VERSION_MISMATCH", message: `短引用 ${id} 不属于当前会话`, stage: "session", retryable: false }, 409);
          return ref;
        };
        shape = bindShape(resolveShapeReferences(input.queryShape, resolveRef), input.parameters ?? {});
      } else {
        if (!input.question?.trim())
          throw new PlatformException(
            {
              code: "INVALID_REQUEST",
              message: "AUTO 模式必须提供 question",
              stage: "binding",
              retryable: false,
            },
            400,
          );
        const allowedProperties = new Set(snapshot.objects.flatMap(object => object.properties.map(property => property.id)));
        const indexedValues = this.store.matchValues(input.namespace, version, input.question).filter(value => allowedProperties.has(value.propertyId));
        const resolved = autoShape(snapshot, input.question, {}, indexedValues);
        if (resolved.ambiguities.length) {
          const clarificationId = `clar_${randomUUID()}`;
          const choices = Object.fromEntries(
            resolved.ambiguities.map((item) => [
              item.id,
              item.candidates.map((candidate) => candidate.id),
            ]),
          );
          this.store.saveClarification({
            clarificationId,
            indexedValues,
            expiresAt: new Date(this.now().getTime() + 30 * 60_000).toISOString(),
            input: { ...input, ontologyVersion: version },
            version,
            choices,
          });
          return this.envelope(
            requestId,
            auditId,
            input.namespace,
            version,
            "NEEDS_CLARIFICATION",
            {
              status: "NEEDS_CLARIFICATION",
              clarificationId,
              clarifications: resolved.ambiguities,
            },
          );
        }
        shape = resolved.shape;
        resolution = resolved.resolution;
      }
      const intent = shapeToIntent(shape, snapshot);
      if (input.question) {
        const time = input.question.match(/(?:今年|本年|去年)\d{1,2}月|\d{4}年(?:\d{1,2}月)?|(?:近|最近)\d{1,3}个?(?:天|月|年)|今天|昨天|本周|上周|本月|这个月|上月|本季度|上季度|今年|本年|去年/);
        if (time && !intent.timeRange) intent.timeRange = { expression: time[0] };
        const grain = input.question.match(/(?:按|每|分)(天|日|周|月|季度|年)/);
        if (grain && !intent.timeGrain) intent.timeGrain = { unit: ({ 天: "DAY", 日: "DAY", 周: "WEEK", 月: "MONTH", 季度: "QUARTER", 年: "YEAR" } as const)[grain[1] as "天"] };
        const comparison = input.question.includes("同比") ? "YEAR_OVER_YEAR" : input.question.includes("环比") ? "PREVIOUS_PERIOD" : undefined;
        if (comparison && !intent.timeComparisons?.length) {
          if (!intent.timeRange) throw new PlatformException({ code: "VALUE_NOT_FOUND", message: "时间比较需要明确的时间范围", stage: "binding", retryable: false, action: "提供今年、本月或明确年月" }, 422);
          intent.timeComparisons = shape.measureIds.map(measureId => ({ id: `comparison_${measureId}`, label: `${snapshot.metrics.find(m => m.id === measureId)?.label ?? measureId}${comparison === "YEAR_OVER_YEAR" ? "同比" : "环比"}`, measureId, comparison, output: "GROWTH_RATE" }));
        }
      }
      const tables = this.store.listPhysicalTables();
      let compiled;
      try {
        compiled = this.compileQuery(intent, snapshot, tables, input.queryMode === "FIXED_SHAPE");
      } catch (error) {
        throw mapPlanningError(error);
      }
      const pageSize = Math.min(
        input.pagination?.pageSize ?? compiled.ir.limit,
        10_000,
      );
      const guarded = guardReadOnlySql(compiled.sql, pageSize);
      const fingerprint = digest({
        shape: queryStructure(shape),
        ontologyVersion: version,
        timeRange: compiled.ir.timeRange,
        timeGrain: compiled.ir.timeGrain,
        timeComparisons: compiled.ir.timeComparisons,
      });
      const parameterDigest = digest(compiled.parameters);
      let offset = 0;
      if (input.pagination?.cursor) {
        const cursor = decodeCursor(input.pagination.cursor);
        if (
          cursor.namespace !== input.namespace ||
          cursor.ontologyVersion !== version ||
          cursor.fingerprint !== fingerprint ||
          cursor.parameterDigest !== parameterDigest ||
          cursor.pageSize !== pageSize
        )
          throw new PlatformException(
            {
              code: "CURSOR_CONTEXT_MISMATCH",
              message: "分页游标与当前 IR、参数、排序或本体版本不一致",
              stage: "pagination",
              retryable: false,
              action: "使用当前查询重新获取第一页",
            },
            409,
          );
        offset = cursor.offset;
      }
      this.store.putShape(
        input.namespace,
        version,
        fingerprint,
        compiled.ir as unknown as QueryIR,
        { parameters: Object.keys(input.parameters ?? {}).sort() },
      );
      if (!this.executor)
        throw new PlatformException(
          {
            code: "DATA_SOURCE_NOT_CONFIGURED",
            message: "SelectDB 查询执行器未配置",
            stage: "execution",
            retryable: false,
            action: "在数据源页面配置连接并测试",
          },
          503,
        );
      const pagedSql = offset
        ? guarded.sql.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${offset}, ${pageSize}`)
        : guarded.sql;
      const result = await this.executor.execute(
        pagedSql,
        compiled.parameters,
        pageSize,
        30_000,
      );
      const ontologyContext = input.options?.includeOntologyContext || input.options?.includeAxioms || input.options?.includeInferenceEvidence
        ? this.resolveOntologyContext({ namespace: input.namespace, ontologyVersion: version, question: input.question ?? shape.measureIds.join(" "), purpose: "ANSWER", include: { axioms: true, inferences: true, evidence: true, values: true } }) : undefined;
      const usedRelationIds = new Set(compiled.ir.relationIds);
      const queryAxioms = [...new Map([...(ontologyContext?.axioms ?? []), ...snapshot.axiomAssertions.filter(a => usedRelationIds.has(a.subjectId))].map(a => [a.id, a])).values()];
      const queryInferences = [...new Map([...(ontologyContext?.inferences ?? []), ...snapshot.inferredAssertions.filter(i => i.premiseAssertionIds.some(id => usedRelationIds.has(id)))].map(i => [i.id, i])).values()];
      const data = {
        status: "SUCCEEDED",
        ...(input.options?.includeOntologyContext ? { ontologyContext } : {}),
        ...(input.options?.includeAxioms ? { axioms: queryAxioms } : {}),
        ...(input.options?.includeInferenceEvidence ? { inferenceEvidence: queryInferences } : {}),
        resolutionMode: input.queryMode,
        ontologyVersion: version,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        planId: `plan_${digest(compiled.ir).slice(0, 16)}`,
        ...(input.options?.includeResolution ? { resolution } : {}),
        ...(input.options?.includeQueryIr ? { queryIr: compiled.ir } : {}),
        ...(input.options?.includeSqlPreview
          ? {
              sqlPreview: {
                sql: pagedSql,
                parameters: compiled.parameters.map(() => "?"),
              },
            }
          : {}),
      };
      const nextCursor = result.truncated
        ? encodeCursor({
            namespace: input.namespace,
            ontologyVersion: version,
            fingerprint,
            parameterDigest,
            pageSize,
            offset: offset + pageSize,
          })
        : null;
      return this.envelope(
        requestId,
        auditId,
        input.namespace,
        version,
        "SUCCEEDED",
        data,
        {
          complete: !result.truncated,
          truncated: result.truncated,
          nextCursor,
        },
      );
    } catch (error) {
      const platform =
        error instanceof PlatformException
          ? error
          : new PlatformException(
              {
                code: "INVALID_REQUEST",
                message: error instanceof Error ? error.message : "未知错误",
                stage: "application",
                retryable: false,
              },
              500,
            );
      this.store.appendAudit(
        auditId,
        requestId,
        "RequestFailed",
        platform.error,
      );
      return {
        requestId,
        namespace: input.namespace,
        status: ["planning", "binding", "compilation", "session"].includes(platform.error.stage) ? "REJECTED" : "FAILED",
        error: platform.error,
        auditId,
        completeness: { complete: false, truncated: false, nextCursor: null },
      };
    }
  }
  private compileQuery(intent: AnalysisIntent, snapshot: OntologySnapshotV3, tables: PhysicalTable[], cache: boolean): CompiledTemplate & { parameters: unknown[] } {
    const compile = () => this.compiler.compile(intent, snapshot as unknown as LegacySnapshot, tables as unknown as LegacyTable[]);
    // Time expressions and advanced parameter layouts require full resolution.
    // Only the validated DIRECT filter layout is rebound from this template format.
    if (!cache || intent.timeRange || intent.timeGrain || intent.timeComparisons?.length || intent.windowCalculations?.length || intent.derivedMeasures?.length || intent.groupSelections?.length || intent.periodConditions?.length || intent.hierarchyFilters?.length || intent.filterExpression || intent.aggregateFilters?.length || intent.aggregateFilterExpression || intent.filters.some(filter => filter.kind !== "DIRECT")) return compile();
    const key = digest({
      format: "selectdb-direct-template-v1",
      snapshot: snapshot.contentDigest,
      tables,
      intent: { ...intent, filters: intent.filters.map(filter => ({ ...filter, value: Array.isArray(filter.value) ? filter.value.map(value => typeof value) : typeof filter.value })) },
    });
    const template = this.store.getCompiledTemplate(snapshot.namespace, snapshot.version, key);
    const parameters: unknown[] = [];
    for (const filter of intent.filters) {
      if (["IS_NULL", "NOT_NULL"].includes(filter.operator)) continue;
      if (filter.operator === "IN") {
        const values = Array.isArray(filter.value) ? filter.value : filter.value == null ? [] : [filter.value];
        if (!values.length) throw new Error("IN 筛选条件不能为空");
        parameters.push(...values);
      } else {
        if (filter.value == null || Array.isArray(filter.value)) throw new Error(`${filter.operator} 筛选条件缺少单值`);
        parameters.push(filter.value);
      }
    }
    if (template) return { ...template, ir: { ...template.ir, filters: template.ir.filters.map((filter, index) => ({ kind: "DIRECT", propertyId: filter.propertyId, operator: filter.operator, value: intent.filters[index]?.value })) }, parameters };
    const compiled = compile();
    // Persist structure only; current business values stay in the execution input.
    this.store.putCompiledTemplate(snapshot.namespace, snapshot.version, key, {
      sql: compiled.sql,
      ir: { ...compiled.ir, filters: compiled.ir.filters.map(filter => ({ kind: "DIRECT", propertyId: filter.propertyId, operator: filter.operator })) },
    });
    return compiled;
  }

  async continueSemanticQuery(
    clarificationId: string,
    selections: Record<string, string>,
  ) {
    const pending = this.store.getClarification(clarificationId);
    if (!pending || pending.expiresAt <= this.now().toISOString())
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "澄清请求不存在或已过期",
          stage: "binding",
          retryable: false,
        },
        404,
      );
    for (const [id, ids] of Object.entries(pending.choices))
      if (!selections[id] || !ids.includes(selections[id]!))
        throw new PlatformException(
          {
            code: "INVALID_REQUEST",
            message: `缺少或无效的澄清选择：${id}`,
            stage: "binding",
            retryable: false,
          },
          400,
        );
    const resolved = autoShape(
      visibleSnapshot(this.getSnapshot(pending.input.namespace, pending.version)),
      pending.input.question ?? "",
      selections,
      pending.indexedValues,
    );
    const result = await this.executeSemanticQuery({
      ...pending.input,
      queryMode: "FIXED_SHAPE",
      question: pending.input.question,
      queryShape: resolved.shape,
    });
    if (result.status === "SUCCEEDED") this.store.deleteClarification(clarificationId);
    return result;
  }
  private envelope(
    requestId: string,
    auditId: string,
    namespace: string,
    ontologyVersion: number,
    status: string,
    data: unknown,
    completeness = {
      complete: true,
      truncated: false,
      nextCursor: null as string | null,
    },
  ) {
    const envelope = {
      requestId,
      namespace,
      ontologyVersion,
      status,
      data,
      warnings: [],
      auditId,
      completeness,
    };
    this.store.appendAudit(auditId, requestId, "RequestCompleted", envelope);
    return envelope;
  }
}

interface PaginationCursor {
  namespace: string;
  ontologyVersion: number;
  fingerprint: string;
  parameterDigest: string;
  pageSize: number;
  offset: number;
}

function encodeCursor(cursor: PaginationCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): PaginationCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PaginationCursor>;
    if (
      typeof parsed.namespace !== "string" ||
      !Number.isInteger(parsed.ontologyVersion) ||
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.parameterDigest !== "string" ||
      !Number.isInteger(parsed.pageSize) ||
      !Number.isInteger(parsed.offset) ||
      Number(parsed.offset) < 0
    )
      throw new Error("invalid cursor");
    return parsed as PaginationCursor;
  } catch {
    throw new PlatformException(
      {
        code: "CURSOR_CONTEXT_MISMATCH",
        message: "分页游标无效或已损坏",
        stage: "pagination",
        retryable: false,
      },
      409,
    );
  }
}

function upsert<T extends { id: string }>(items: T[], value: T): T[] {
  return [...items.filter((item) => item.id !== value.id), value].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}
function diffById<T extends { id: string }>(before: T[], after: T[]) {
  const a = new Map(before.map((item) => [item.id, item])),
    b = new Map(after.map((item) => [item.id, item]));
  return {
    added: [...b.keys()].filter((id) => !a.has(id)),
    removed: [...a.keys()].filter((id) => !b.has(id)),
    changed: [...b.keys()].filter(
      (id) => a.has(id) && digest(a.get(id)) !== digest(b.get(id)),
    ),
  };
}
function normalize(text: string) {
  return text.toLocaleLowerCase("zh-CN").normalize("NFKC").replace(/\s+/g, "");
}
function matches(
  item: { name: string; label: string; synonyms?: string[] },
  query: string,
) {
  const q = normalize(query);
  return [item.name, item.label, ...(item.synonyms ?? [])].some((term) =>
    q.includes(normalize(term)),
  );
}
function rankSemantic(snapshot: OntologySnapshotV3, query: string) {
  const index = new SemanticIndex(snapshot as unknown as LegacySnapshot);
  const chunks = uniqueTerms(query);
  const map = new Map<
    string,
    {
      kind: string;
      id: string;
      objectId?: string;
      label: string;
      score: number;
      matchedBy: string;
    }
  >();
  for (const chunk of chunks) {
    for (const match of index.search(chunk, 12)) {
      const key = `${match.kind}:${match.id}`;
      const existing = map.get(key);
      if (!existing || match.score > existing.score) map.set(key, match);
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.label.localeCompare(b.label, "zh-CN") ||
      a.id.localeCompare(b.id),
  );
}
function uniqueTerms(query: string) {
  return [
    ...new Set(
      [
        query,
        ...query.split(/[\s,，。；;、]+/),
        ...Array.from(query).filter((char) => /\p{Script=Han}/u.test(char)),
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}
function ambiguities(
  candidates: Array<{ kind: string; id: string; label: string; score: number }>,
) {
  const groups = new Map<string, typeof candidates>();
  for (const item of candidates.filter((c) => c.score >= 0.9)) {
    const key = `${item.kind}:${item.label}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([id, items]) => ({ id, candidates: items }));
}
function projectObjects(objects: OntologyObject[], projection: string) {
  if (projection === "full") return objects;
  if (projection === "standard")
    return objects.map((o) => ({
      ...o,
      properties: o.properties.filter(
        (p) => !p.sensitive && p.visibility !== "HIDDEN",
      ),
    }));
  return objects.map((o) => ({
    id: o.id,
    name: o.name,
    label: o.label,
    description: o.description,
    objectType: o.objectType,
    grain: o.grain,
    grainPropertyIds: o.grainPropertyIds,
    defaultTimePropertyId: o.defaultTimePropertyId,
    properties: o.properties
      .filter((p) => !p.sensitive && p.visibility === "ANALYTICAL")
      .map((p) => ({
        id: p.id,
        name: p.name,
        label: p.label,
        meaning: p.meaning,
        dataType: p.dataType,
        numericSpec: p.numericSpec,
      })),
  }));
}
function relationPaths(relations: OntologySnapshotV3["relations"]) {
  return relations.flatMap(r => relationTraversals(r).map(edge => ({ ...edge, relationIds: [r.id], type: r.type, required: r.required, ...(r.composition ? { composition: r.composition } : {}) })));
}
function numericSummary(objects: OntologyObject[]) {
  return objects.flatMap((o) =>
    o.properties
      .filter((p) => p.numericSpec)
      .map((p) => ({
        objectId: o.id,
        propertyId: p.id,
        label: p.label,
        ...p.numericSpec,
      })),
  );
}
function autoShape(
  snapshot: OntologySnapshotV3,
  question: string,
  selections: Record<string, string> = {},
  indexedValues: Array<{ objectId: string; propertyId: string; displayValue: string; frequency: number }> = [],
) {
  snapshot = { ...snapshot, metrics: effectiveMetrics(snapshot) };
  const eligible = new Set(snapshot.objects.flatMap(o => o.properties.filter(p => p.visibility === "ANALYTICAL" && !p.sensitive).map(p => p.id)));
  const values = indexedValues.filter(v => eligible.has(v.propertyId));
  const candidates = rankSemantic(snapshot, question);
  for (const value of values) candidates.push({ kind: "VALUE", id: JSON.stringify([value.propertyId, value.displayValue]), label: value.displayValue, score: 1, objectId: value.objectId, matchedBy: "value-index" });
  const allAmbiguities = ambiguities(candidates);
  const unresolved = allAmbiguities.filter((item) => !selections[item.id]);
  const selectedIds = new Set(Object.values(selections));
  const matchedMetrics = snapshot.metrics.filter(
    (m) =>
      matches(m, question) &&
      !(m.id === m.sourcePropertyId && snapshot.metrics.some(registered => registered.id !== m.id && registered.sourcePropertyId === m.id && matches(registered, question))) &&
      (selectedIds.size === 0 ||
        selectedIds.has(m.id) ||
        !allAmbiguities.some((a) => a.candidates.some((c) => c.id === m.id))),
  );
  const matchedProperties = snapshot.objects
    .flatMap((o) => o.properties.map((p) => ({ object: o, property: p })))
    .filter(
      ({ property }) =>
        property.visibility === "ANALYTICAL" &&
        !property.sensitive &&
        matches(property, question),
    );
  const metric = matchedMetrics[0];
  if (!metric)
    throw new PlatformException(
      {
        code: "VALUE_NOT_FOUND",
        message: "未能从问题中确定指标",
        stage: "binding",
        retryable: false,
        action: "使用本体中的指标名称或同义词",
        details: {
          availableMetrics: snapshot.metrics.map((m) => ({
            id: m.id,
            label: m.label,
          })),
        },
      },
      422,
    );
  const dimensions = matchedProperties
    .filter(({ property }) => !["NUMBER", "TIME"].includes(property.meaning) && (selectedIds.size === 0 || selectedIds.has(property.id) || !allAmbiguities.some(a => a.candidates.some(c => c.id === property.id))))
    .map(({ property }) => property.id);
  const shape: FixedQueryShape = {
    rootObjectId: metric.objectId,
    measureIds: matchedMetrics.map((m) => m.id),
    dimensionPropertyIds: [...new Set(dimensions)],
    filters: values.filter(v => {
      const bindingId = JSON.stringify([v.propertyId, v.displayValue]);
      return selectedIds.has(bindingId) || !allAmbiguities.some(a => a.candidates.some(c => c.id === bindingId));
    }).map(v => ({ propertyId: v.propertyId, operator: "EQ" as const, value: v.displayValue })),
    sort: [],
    limit: 200,
  };
  return {
    shape,
    ambiguities: unresolved,
    resolution: {
      metrics: matchedMetrics.map((m) => m.id),
      dimensions: shape.dimensionPropertyIds,
      candidates,
    },
  };
}
function queryStructure(value: unknown, key = ""): unknown {
  if (["value", "anchorValue"].includes(key)) return Array.isArray(value) ? value.map(item => typeof item) : typeof value;
  if (Array.isArray(value)) return value.map(item => queryStructure(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, queryStructure(item, name)]));
  return value;
}
function resolveShapeReferences(shape: FixedQueryShape, resolve: (id: string) => string): FixedQueryShape {
  const referenceKeys = new Set(["rootObjectId", "measureIds", "dimensionPropertyIds", "propertyId", "entityId", "hierarchyId", "measureId", "leftMeasureId", "rightMeasureId", "partitionByPropertyIds", "orderByEntityId", "groupByPropertyIds"]);
  const visit = (value: unknown, key = ""): unknown => {
    if (typeof value === "string" && referenceKeys.has(key)) return resolve(value);
    if (Array.isArray(value)) return value.map(item => visit(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    return value;
  };
  return visit(shape) as FixedQueryShape;
}
function bindShape(shape: FixedQueryShape, parameters: Record<string, unknown>): FixedQueryShape {
  const bind = (filter: FixedQueryShape["filters"][number]) => {
    if (typeof filter.value !== "string" || !filter.value.startsWith("$")) return filter;
    const name = filter.value.slice(1);
    const value = parameters[name];
    if (!(name in parameters) || !(typeof value === "string" || typeof value === "number" || (Array.isArray(value) && value.every(item => typeof item === "string" || typeof item === "number"))))
      throw new PlatformException({ code: "INVALID_REQUEST", message: `缺少或无效的查询参数 ${name}`, stage: "planning", retryable: false }, 400);
    return { ...filter, value: value as string | number | (string | number)[] };
  };
  const expression = (item: NonNullable<FixedQueryShape["filterExpression"]>): NonNullable<FixedQueryShape["filterExpression"]> => item.type === "CONDITION" ? { ...item, filter: bind(item.filter) } : item.type === "GROUP" ? { ...item, children: item.children.map(expression) } : { ...item, child: expression(item.child) };
  return { ...shape, filters: shape.filters.map(bind), ...(shape.filterExpression ? { filterExpression: expression(shape.filterExpression) } : {}) };
}
function shapeToIntent(
  shape: FixedQueryShape,
  snapshot: OntologySnapshotV3,
): AnalysisIntent {
  const root = snapshot.objects.find((o) => o.id === shape.rootObjectId);
  if (!root)
    throw new PlatformException(
      {
        code: "VALUE_NOT_FOUND",
        message: `主对象不存在：${shape.rootObjectId}`,
        stage: "planning",
        retryable: false,
      },
      422,
    );
  const filterToIntent = (filter: FixedQueryShape["filters"][number]) => ({
    kind: "DIRECT" as const, propertyId: filter.propertyId, operator: filter.operator,
    value: filter.value == null ? undefined : Array.isArray(filter.value) ? filter.value.map(String) : String(filter.value),
  });
  const expressionToIntent = (item: NonNullable<FixedQueryShape["filterExpression"]>): NonNullable<AnalysisIntent["filterExpression"]> => item.type === "CONDITION" ? { ...item, filter: filterToIntent(item.filter) } : item.type === "GROUP" ? { ...item, children: item.children.map(expressionToIntent) } : { ...item, child: expressionToIntent(item.child) };
  return {
    ...shape,
    filters: shape.filters.map(filterToIntent),
    filterExpression: shape.filterExpression ? expressionToIntent(shape.filterExpression) : undefined,
    resultKind: shape.resultKind ?? "aggregate",
    title: "Semantic query",
  };
}
function mapPlanningError(error: unknown): PlatformException {
  const message = error instanceof Error ? error.message : String(error);
  let code = "RELATION_PATH_NOT_FOUND";
  if (/扇出|MANY_TO_MANY|扩行/.test(message)) code = "RELATION_FANOUT_UNSAFE";
  else if (/多个事实对象|混合/.test(message)) code = "CROSS_FACT_MEASURE";
  else if (/循环/.test(message)) code = "DERIVED_METRIC_CYCLE";
  else if (/半可加/.test(message)) code = "SEMI_ADDITIVE_TIME_SUM";
  else if (/比例|不可加/.test(message)) code = "NON_ADDITIVE_SUM";
  return new PlatformException(
    { code, message, stage: "planning", retryable: false, evidenceRefs: [] },
    422,
  );
}
