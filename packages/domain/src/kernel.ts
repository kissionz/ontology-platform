import type { AxiomAssertion, DimensionHierarchy, InferredAssertion, Metric, OntologyObject, OntologyRelation, OntologySnapshotV3, ProofStep } from "../../contracts/src/index.js";

export const KERNEL_VERSION = "1.1.0";
export interface ValidationIssue { level: "ERROR" | "WARNING"; code: string; message: string; subjectId?: string; references: string[] }
export interface KernelResult { valid: boolean; issues: ValidationIssue[]; axioms: AxiomAssertion[]; inferences: InferredAssertion[]; inferenceDigest: string }

export const AXIOM_CATALOG = [
  ["IDENTITY_ENTITY_SINGLE", "IDENTITY"], ["IDENTITY_ID_UNIQUE", "IDENTITY"], ["GRAIN_REQUIRED", "GRAIN"],
  ["IDENTITY_EVENT_MAX_ONE", "IDENTITY"], ["RELATIONSHIP_REFERENCES_REQUIRED", "RELATION"],
  ["GRAIN_PROPERTIES_VALID", "GRAIN"], ["NUMBER_SPEC_REQUIRED", "TYPE"], ["RATIO_NON_ADDITIVE", "METRIC_ALGEBRA"],
  ["SEMI_ADDITIVE_TIME", "METRIC_ALGEBRA"], ["METRIC_SINGLE_FACT", "METRIC_ALGEBRA"], ["METRIC_DEPENDENCY_ACYCLIC", "METRIC_ALGEBRA"],
  ["RELATION_TARGET_ID", "RELATION"], ["RELATION_DIRECTIONAL_PATH", "RELATION"], ["RELATION_CARDINALITY_FANOUT", "RELATION"],
  ["HIERARCHY_TRANSITIVE", "HIERARCHY"], ["VISIBILITY_SENSITIVE", "VISIBILITY"]
] as const;

function assertion(code: string, domain: AxiomAssertion["domain"], subjectType: AxiomAssertion["subjectType"], subjectId: string, sourceDefinitionIds: string[], parameters: Record<string, unknown> = {}, severity: AxiomAssertion["severity"] = "INVARIANT", enforcement: AxiomAssertion["enforcement"] = "PUBLISH_VALIDATION"): AxiomAssertion {
  return { id: `axiom_${digest([code, subjectType, subjectId, parameters]).slice(0, 20)}`, axiomCode: code, kernelVersion: KERNEL_VERSION, domain, subjectType, subjectId, parameters, sourceDefinitionIds: [...sourceDefinitionIds].sort(), enforcement, severity };
}

export function instantiateAxioms(snapshot: Pick<OntologySnapshotV3, "objects" | "metrics" | "relations" | "dimensionHierarchies">): AxiomAssertion[] {
  const axioms: AxiomAssertion[] = [];
  for (const object of snapshot.objects) {
    if (object.objectType === "ENTITY") axioms.push(assertion("IDENTITY_ENTITY_SINGLE", "IDENTITY", "OBJECT", object.id, [object.id], { objectType: object.objectType }, "ERROR"));
    if (object.objectType === "EVENT") axioms.push(assertion("IDENTITY_EVENT_MAX_ONE", "IDENTITY", "OBJECT", object.id, [object.id], {}, "ERROR"));
    if (object.objectType === "RELATIONSHIP") axioms.push(assertion("RELATIONSHIP_REFERENCES_REQUIRED", "RELATION", "OBJECT", object.id, [object.id], {}, "ERROR"));
    if (["EVENT", "SNAPSHOT", "AGGREGATE", "RELATIONSHIP"].includes(object.objectType)) axioms.push(assertion("GRAIN_REQUIRED", "GRAIN", "OBJECT", object.id, [object.id], { grainPropertyIds: object.grainPropertyIds }, "ERROR"));
    if (object.grainPropertyIds.length) axioms.push(assertion("GRAIN_PROPERTIES_VALID", "GRAIN", "OBJECT", object.id, [object.id, ...object.grainPropertyIds], { grainPropertyIds: object.grainPropertyIds }, "ERROR"));
    for (const property of object.properties) {
      if (property.meaning === "ID") axioms.push(assertion("IDENTITY_ID_UNIQUE", "IDENTITY", "PROPERTY", property.id, [object.id, property.id], { unique: property.unique, visibility: property.visibility }, "ERROR"));
      if (property.meaning === "NUMBER") axioms.push(assertion("NUMBER_SPEC_REQUIRED", "TYPE", "PROPERTY", property.id, [object.id, property.id], { numericSpec: property.numericSpec ?? null }, "ERROR"));
      if (property.numericSpec?.kind === "RATIO") axioms.push(assertion("RATIO_NON_ADDITIVE", "METRIC_ALGEBRA", "PROPERTY", property.id, [property.id], { aggregationBehavior: property.numericSpec.aggregationBehavior, defaultAggregation: property.numericSpec.defaultAggregation }, "ERROR", "QUERY_COMPILATION"));
      if (property.numericSpec?.aggregationBehavior === "SEMI_ADDITIVE") axioms.push(assertion("SEMI_ADDITIVE_TIME", "METRIC_ALGEBRA", "PROPERTY", property.id, [property.id], {}, "ERROR", "SEMANTIC_PLANNING"));
      if (property.sensitive) axioms.push(assertion("VISIBILITY_SENSITIVE", "VISIBILITY", "PROPERTY", property.id, [property.id], { visibility: property.visibility, valueSearchable: property.valueSearchable, exportable: property.exportable }, "ERROR"));
    }
  }
  for (const metric of snapshot.metrics) {
    if (metric.metricType === "DERIVED") {
      axioms.push(assertion("METRIC_SINGLE_FACT", "METRIC_ALGEBRA", "METRIC", metric.id, [metric.id, metric.leftMetricId ?? "", metric.rightMetricId ?? ""].filter(Boolean), {}, "ERROR"));
      axioms.push(assertion("METRIC_DEPENDENCY_ACYCLIC", "METRIC_ALGEBRA", "METRIC", metric.id, [metric.id], {}, "ERROR"));
    }
    if (metric.calculationOperator === "RATIO" || metric.format === "percent") axioms.push(assertion("RATIO_NON_ADDITIVE", "METRIC_ALGEBRA", "METRIC", metric.id, [metric.id], { numerator: metric.leftMetricId, denominator: metric.rightMetricId }, "ERROR", "QUERY_COMPILATION"));
  }
  for (const relation of snapshot.relations) {
    axioms.push(assertion("RELATION_DIRECTIONAL_PATH", "RELATION", "RELATION", relation.id, [relation.id], { direction: relation.direction }, "INVARIANT", "SEMANTIC_PLANNING"));
    axioms.push(assertion("RELATION_CARDINALITY_FANOUT", "RELATION", "RELATION", relation.id, [relation.id], { cardinality: relation.cardinality, fanoutRisk: relation.fanoutRisk }, relation.cardinality === "MANY_TO_MANY" ? "ERROR" : "INVARIANT", "SEMANTIC_PLANNING"));
    if (relation.targetPropertyId) axioms.push(assertion("RELATION_TARGET_ID", "RELATION", "RELATION", relation.id, [relation.id, relation.targetPropertyId], {}, "ERROR"));
  }
  for (const hierarchy of snapshot.dimensionHierarchies) axioms.push(assertion("HIERARCHY_TRANSITIVE", "HIERARCHY", "HIERARCHY", hierarchy.id, [hierarchy.id, ...hierarchy.levels.flatMap(level => [level.objectId, level.propertyId])], { kind: hierarchy.kind }, "ERROR", "SEMANTIC_PLANNING"));
  return axioms.sort(byStableId);
}

export function validateSnapshot(snapshot: Pick<OntologySnapshotV3, "objects" | "metrics" | "relations" | "dimensionHierarchies">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const objectById = new Map(snapshot.objects.map(object => [object.id, object]));
  const metricById = new Map(snapshot.metrics.map(metric => [metric.id, metric]));
  const definitions = [...snapshot.objects, ...snapshot.objects.flatMap(o => o.properties), ...snapshot.metrics, ...snapshot.relations, ...snapshot.dimensionHierarchies];
  const knownIds = new Set<string>();
  for (const definition of definitions) {
    if (knownIds.has(definition.id)) issues.push(issue("DUPLICATE_DEFINITION_ID", "定义 ID 必须在版本内唯一", definition.id, [definition.id]));
    knownIds.add(definition.id);
  }
  for (const object of snapshot.objects) {
    const ids = object.properties.filter(property => property.meaning === "ID");
    if (object.objectType === "ENTITY" && ids.length !== 1) issues.push(issue("IDENTITY_ENTITY_SINGLE", `${object.label} 必须恰好声明一个 ID 属性`, object.id, ids.map(property => property.id)));
    if (object.objectType === "EVENT" && ids.length > 1) issues.push(issue("IDENTITY_EVENT_MAX_ONE", `${object.label} 最多声明一个 ID`, object.id, ids.map(p => p.id)));
    if (object.objectType === "RELATIONSHIP" && object.properties.filter(p => p.meaning === "ENTITY_REFERENCE").length < 2) issues.push(issue("RELATIONSHIP_REFERENCES_REQUIRED", `${object.label} 至少需要两个实体引用`, object.id, [object.id]));
    for (const property of ids) if (!property.unique || property.visibility !== "ANALYTICAL") issues.push(issue("IDENTITY_ID_UNIQUE", `${property.label} 必须唯一且分析可见`, property.id, [object.id, property.id]));
    if (["EVENT", "SNAPSHOT", "AGGREGATE", "RELATIONSHIP"].includes(object.objectType) && object.grainPropertyIds.length === 0) issues.push(issue("GRAIN_REQUIRED", `${object.label} 缺少有效业务粒度`, object.id, [object.id]));
    for (const propertyId of object.grainPropertyIds) {
      const property = object.properties.find(candidate => candidate.id === propertyId);
      if (!property || property.visibility !== "ANALYTICAL") issues.push(issue("GRAIN_PROPERTIES_VALID", `${object.label} 的粒度属性不存在或不可分析`, object.id, [object.id, propertyId]));
    }
    for (const property of object.properties) {
      if (property.meaning === "NUMBER" && !property.numericSpec) issues.push(issue("NUMBER_SPEC_REQUIRED", `${property.label} 缺少数字语义`, property.id, [object.id, property.id]));
      if (property.numericSpec?.kind === "RATIO" && (property.numericSpec.defaultAggregation === "SUM" || property.numericSpec.aggregationBehavior !== "NON_ADDITIVE")) issues.push(issue("RATIO_NON_ADDITIVE", `${property.label} 是比例，不能声明为可加或默认 SUM`, property.id, [property.id]));
      if (property.sensitive && (property.visibility === "ANALYTICAL" || property.valueSearchable || property.exportable)) issues.push(issue("VISIBILITY_SENSITIVE", `${property.label} 为敏感属性，不能进入分析、索引或导出`, property.id, [property.id]));
    }
  }
  for (const relation of snapshot.relations) {
    const source = objectById.get(relation.sourceObjectId);
    if (relation.sourcePropertyId && !source?.properties.some(p => p.id === relation.sourcePropertyId)) issues.push(issue("RELATION_SOURCE_PROPERTY", `${relation.name} 的来源属性不存在`, relation.id, [relation.sourcePropertyId]));
    const target = objectById.get(relation.targetObjectId);
    const targetProperty = target?.properties.find(property => property.id === relation.targetPropertyId);
    if (!objectById.has(relation.sourceObjectId) || !target) issues.push(issue("RELATION_PATH_NOT_FOUND", `${relation.name} 引用了不存在的对象`, relation.id, [relation.sourceObjectId, relation.targetObjectId]));
    if (relation.targetPropertyId && targetProperty?.meaning !== "ID") issues.push(issue("RELATION_TARGET_ID", `${relation.name} 的目标属性必须是目标对象 ID`, relation.id, [relation.targetPropertyId]));
  }
  for (const metric of snapshot.metrics) {
    const object = objectById.get(metric.objectId);
    if (!object) issues.push(issue("METRIC_SINGLE_FACT", `${metric.label} 的事实对象不存在`, metric.id, [metric.objectId]));
    if (metric.metricType === "BASE" && metric.sourcePropertyId && !object?.properties.some(p => p.id === metric.sourcePropertyId)) issues.push(issue("METRIC_SOURCE_PROPERTY", `${metric.label} 的来源属性不存在`, metric.id, [metric.sourcePropertyId]));
    if (metric.metricType === "DERIVED" && (!metric.leftMetricId || !metric.rightMetricId || !metric.calculationOperator)) issues.push(issue("METRIC_SINGLE_FACT", `${metric.label} 缺少派生依赖或计算运算符`, metric.id, [metric.id]));
  }
  const cycle = metricCycle(snapshot.metrics);
  if (cycle.length) issues.push(issue("DERIVED_METRIC_CYCLE", `派生指标依赖成环：${cycle.join(" → ")}`, cycle[0], cycle));
  for (const metric of snapshot.metrics.filter(item => item.metricType === "DERIVED")) {
    const deps = [metric.leftMetricId, metric.rightMetricId].filter(Boolean).map(id => metricById.get(id!));
    if (deps.some(dep => !dep) || deps.some(dep => dep?.objectId !== metric.objectId)) issues.push(issue("METRIC_SINGLE_FACT", `${metric.label} 的依赖必须来自同一事实对象`, metric.id, [metric.id, ...[metric.leftMetricId, metric.rightMetricId].filter(Boolean) as string[]]));
  }
  for (const hierarchy of snapshot.dimensionHierarchies) {
    for (const level of hierarchy.levels) if (!objectById.get(level.objectId)?.properties.some(p => p.id === level.propertyId)) issues.push(issue("HIERARCHY_TRANSITIVE", `${hierarchy.label} 引用了不存在的层级属性`, hierarchy.id, [level.objectId, level.propertyId]));
    if (hierarchy.kind === "ADJACENCY_LIST") {
      const a = hierarchy.adjacency, object = a ? objectById.get(a.objectId) : undefined;
      if (!a || !object || [a.nodeIdPropertyId, a.parentIdPropertyId, a.labelPropertyId].some(id => !object.properties.some(p => p.id === id)) || a.nodeIdPropertyId === a.parentIdPropertyId) issues.push(issue("HIERARCHY_TRANSITIVE", `${hierarchy.label} 的递归层级映射无效`, hierarchy.id, [hierarchy.id]));
    }
    const ids = hierarchy.levels.map(level => `${level.objectId}:${level.propertyId}`);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate) issues.push(issue("HIERARCHY_TRANSITIVE", `${hierarchy.label} 包含层级环：${duplicate}`, hierarchy.id, ids));
    if (hierarchy.kind === "FIXED_LEVELS" && hierarchy.levels.length < 2) issues.push(issue("HIERARCHY_TRANSITIVE", `${hierarchy.label} 至少需要两个层级`, hierarchy.id, [hierarchy.id]));
  }
  return issues.sort((a, b) => a.code.localeCompare(b.code) || (a.subjectId ?? "").localeCompare(b.subjectId ?? ""));
}

export function inferAssertions(snapshot: Pick<OntologySnapshotV3, "version" | "objects" | "metrics" | "relations" | "dimensionHierarchies">, axioms = instantiateAxioms(snapshot)): InferredAssertion[] {
  const results: InferredAssertion[] = [];
  type Traversal = { from: string; to: string; relation: OntologyRelation };
  const outgoing = new Map<string, Traversal[]>();
  for (const relation of snapshot.relations.filter(r => r.enabled).sort(byStableId)) {
    if (relation.fanoutRisk === "HIGH") continue;
    const forward = relation.direction !== "TARGET_TO_SOURCE" && ["ONE_TO_ONE", "MANY_TO_ONE"].includes(relation.cardinality);
    const reverse = relation.direction !== "SOURCE_TO_TARGET" && ["ONE_TO_ONE", "ONE_TO_MANY"].includes(relation.cardinality);
    for (const edge of [forward ? { from: relation.sourceObjectId, to: relation.targetObjectId, relation } : undefined, reverse ? { from: relation.targetObjectId, to: relation.sourceObjectId, relation } : undefined]) {
      if (edge) { const list = outgoing.get(edge.from) ?? []; list.push(edge); outgoing.set(edge.from, list); }
    }
  }
  const pathAxioms = new Map(axioms.filter(a => a.axiomCode === "RELATION_DIRECTIONAL_PATH").map(a => [a.subjectId, a.id]));
  for (const origin of [...outgoing.keys()].sort()) {
    const seen = new Set([origin]);
    const queue: Array<{ node: string; path: Traversal[] }> = [{ node: origin, path: [] }];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      for (const edge of outgoing.get(current.node) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        const path = [...current.path, edge];
        queue.push({ node: edge.to, path });
        if (path.length < 2) continue;
        const premises = path.map(e => e.relation.id);
        const axiomIds = premises.map(id => pathAxioms.get(id)!).filter(Boolean);
        const proof = path.map((e, i) => fact(i + 1, e.relation.id, `${e.from} 通过 ${e.relation.name} 到达 ${e.to}`));
        proof.push(axiomStep(proof.length + 1, axiomIds[0]!, "声明方向且当前遍历基数安全的关系可以组合"));
        proof.push(derivation(proof.length + 1, `${origin} 可达 ${edge.to}`));
        results.push(inference(snapshot.version, "RELATION_REACHABLE", origin, edge.to, premises, axiomIds, proof));
      }
    }
  }
  for (const hierarchy of snapshot.dimensionHierarchies.filter(item => item.kind === "FIXED_LEVELS")) {
    for (let from = 0; from < hierarchy.levels.length - 2; from++) for (let to = from + 2; to < hierarchy.levels.length; to++) {
      const source = hierarchy.levels[from]!; const target = hierarchy.levels[to]!;
      const axiomId = axioms.find(item => item.axiomCode === "HIERARCHY_TRANSITIVE" && item.subjectId === hierarchy.id)?.id;
      const premises = hierarchy.levels.slice(from, to + 1).map(level => `${level.objectId}:${level.propertyId}`);
      const proof: ProofStep[] = premises.map((refId, index) => fact(index + 1, refId, `层级第 ${from + index + 1} 级：${refId}`));
      proof.push(axiomStep(proof.length + 1, axiomId ?? hierarchy.id, "层级关系具有传递性"), derivation(proof.length + 2, `${source.propertyId} 可上卷到 ${target.propertyId}`));
      results.push(inference(snapshot.version, "HIERARCHY_REACHABLE", source.propertyId, target.propertyId, premises, axiomId ? [axiomId] : [], proof));
    }
  }
  for (const metric of snapshot.metrics.filter(metric => metric.metricType === "DERIVED" && ["DIVIDE", "RATIO"].includes(metric.calculationOperator ?? ""))) {
    const axiomId = axioms.find(item => item.axiomCode === "RATIO_NON_ADDITIVE" && item.subjectId === metric.id)?.id;
    results.push(inference(snapshot.version, "RATIO_REAGGREGATION", metric.id, undefined, [metric.leftMetricId ?? "", metric.rightMetricId ?? ""].filter(Boolean), axiomId ? [axiomId] : [], [
      fact(1, metric.id, `${metric.label} = ${metric.leftMetricId} / ${metric.rightMetricId}`),
      axiomStep(2, axiomId ?? "RATIO_NON_ADDITIVE", "比例指标跨层级不可直接求和"),
      derivation(3, `${metric.label} = SUM(分子) / NULLIF(SUM(分母), 0)`)
    ], { sqlPattern: "SUM(numerator) / NULLIF(SUM(denominator), 0)" }));
  }
  return dedupe(results).sort(byStableId);
}

export function runKernel(snapshot: Pick<OntologySnapshotV3, "version" | "objects" | "metrics" | "relations" | "dimensionHierarchies">): KernelResult {
  const axioms = instantiateAxioms(snapshot); const issues = validateSnapshot(snapshot); const inferences = issues.length ? [] : inferAssertions(snapshot, axioms);
  return { valid: issues.every(item => item.level !== "ERROR"), issues, axioms, inferences, inferenceDigest: digest(inferences) };
}

function inference(version: number, predicate: string, subjectId: string, objectId: string | undefined, premises: string[], axioms: string[], proof: ProofStep[], value?: unknown): InferredAssertion {
  const basis = { version, predicate, subjectId, objectId, premises: [...premises].sort(), axioms: [...axioms].sort(), value };
  return { id: `inf_${digest(basis).slice(0, 20)}`, predicate, subjectId, ...(objectId ? { objectId } : {}), ...(value === undefined ? {} : { value }), ontologyVersion: version, axiomAssertionIds: [...axioms].sort(), premiseAssertionIds: [...premises].sort(), proof, materialization: "PUBLISHED", deterministic: true };
}
function fact(sequence: number, refId: string, statement: string): ProofStep { return { sequence, kind: "FACT", refId, statement }; }
function axiomStep(sequence: number, refId: string, statement: string): ProofStep { return { sequence, kind: "AXIOM", refId, statement }; }
function derivation(sequence: number, statement: string): ProofStep { return { sequence, kind: "DERIVATION", refId: `step_${sequence}`, statement }; }
function issue(code: string, message: string, subjectId: string | undefined, references: string[]): ValidationIssue { return { level: "ERROR", code, message, ...(subjectId ? { subjectId } : {}), references }; }
function metricCycle(metrics: Metric[]): string[] { const byId = new Map(metrics.map(metric => [metric.id, metric])); const visiting: string[] = []; const done = new Set<string>(); let found: string[] = []; const visit = (id: string) => { if (found.length || done.has(id)) return; const at = visiting.indexOf(id); if (at >= 0) { found = [...visiting.slice(at), id]; return; } visiting.push(id); const metric = byId.get(id); for (const dep of [metric?.leftMetricId, metric?.rightMetricId].filter(Boolean) as string[]) visit(dep); visiting.pop(); done.add(id); }; for (const metric of metrics) visit(metric.id); return found; }
function dedupe<T extends { id: string }>(items: T[]): T[] { return [...new Map(items.map(item => [item.id, item])).values()]; }
function byStableId<T extends { id: string }>(a: T, b: T): number { return a.id.localeCompare(b.id); }
export function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`; }
export function digest(value: unknown): string { const text = stableStringify(value); let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35; for (let i = 0; i < text.length; i++) { const n = text.charCodeAt(i); a = Math.imul(a ^ n, 0x01000193); b = Math.imul(b ^ n, 0x27d4eb2d); c = Math.imul(c ^ n, 0x165667b1); d = Math.imul(d ^ n, 0x9e3779b1); } return [a,b,c,d,a^c,b^d,c^b,d^a].map(n => (n >>> 0).toString(16).padStart(8, "0")).join(""); }
