import { effectiveMetrics } from "../../domain/src/property-metrics.js";
import type { OntologySnapshotV3, ResolveSemanticContextInput } from "../../contracts/src/index.js";
import type { OntologySnapshot as LegacySnapshot } from "../../contracts/src/legacy.js";
import { SemanticIndex } from "../../domain/src/semantic-index.js";

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
type Role = "metrics" | "dimensions" | "filters" | "time" | "terms";

/** Agent 提供业务概念；这里只进行词典匹配与必要的定义依赖补全。 */
export function retrieveContext(snapshot: OntologySnapshotV3, input: ResolveSemanticContextInput) {
  const registeredMetrics = snapshot.metrics;
  snapshot = { ...snapshot, metrics: effectiveMetrics(snapshot) };
  const structured = input.concepts !== undefined;
  const requests: Array<{ role: Role; term: string }> = structured
    ? Object.entries(input.concepts!).flatMap(([role, terms]) => (terms ?? []).map(term => ({ role: role as Role, term })))
    : input.terms?.length ? input.terms.map(term => ({ role: "terms", term })) : [{ role: "terms", term: input.question ?? "" }];
  const natural = !structured && !input.terms?.length;
  const definitions = snapshot.objects.flatMap(object => [
    { kind: "object", id: object.id, objectId: object.id, label: object.label, name: object.name, synonyms: object.synonyms, meaning: "" },
    ...object.properties.filter(p => p.visibility === "ANALYTICAL").map(p => ({ kind: "property", id: p.id, objectId: object.id, label: p.label, name: p.name, synonyms: p.synonyms, meaning: p.meaning })),
  ]).concat(snapshot.metrics.map(m => ({ kind: "metric", id: m.id, objectId: m.objectId, label: m.label, name: m.name, synonyms: m.synonyms, meaning: "" })));
  const matches = requests.map(request => {
    const term = normalize(request.term);
    const candidates = definitions.flatMap(d => {
      if (request.role === "metrics" && d.kind !== "metric") return [];
      if (["dimensions", "filters", "time"].includes(request.role) && d.kind !== "property") return [];
      if (request.role === "time" && d.meaning !== "TIME") return [];
      const alias = [d.id, d.name, d.label, ...d.synonyms].find(alias => {
        const normalized = normalize(alias);
        return normalized && term && (natural ? term.includes(normalized) : term === normalized);
      });
      return alias ? [{ kind: d.kind, id: d.id, objectId: d.objectId, label: d.label, score: 1, matchedBy: alias, term: request.term, role: request.role, reason: alias === d.label ? "业务名称命中" : alias === d.id || alias === d.name ? "编码命中" : "同义词命中" }] : [];
    });
    // 已定义指标命中时不重复推荐其同义词来源属性；显式属性编码仍可直接检索。
    const filtered = candidates.filter(c => !snapshot.metrics.some(m => m.id === c.id && m.id === m.sourcePropertyId &&
      c.matchedBy !== m.id && c.matchedBy !== m.name && c.matchedBy !== m.label &&
      candidates.some(other => registeredMetrics.some(r => r.id === other.id && r.sourcePropertyId === m.id))));
    return { ...request, candidates: filtered };
  });
  const candidates = [...new Map(matches.flatMap(m => m.candidates).map(c => [`${c.kind}:${c.id}`, c])).values()];
  const ambiguities = matches.flatMap(m => {
    const groups = new Map<string, typeof m.candidates>();
    for (const c of m.candidates) {
      const key = natural ? `${c.kind}:${normalize(c.matchedBy)}` : c.kind;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.values()].filter(group => group.length > 1).map(group => ({ term: m.term, role: m.role, candidates: group }));
  });
  const metricIds = new Set(candidates.filter(c => c.kind === "metric").map(c => c.id));
  const metrics = snapshot.metrics.filter(m => metricIds.has(m.id));
  for (const metric of metrics) for (const id of [metric.leftMetricId, metric.rightMetricId]) {
    const dependency = snapshot.metrics.find(m => m.id === id);
    if (dependency && !metricIds.has(dependency.id)) { metricIds.add(dependency.id); metrics.push(dependency); }
  }
  const objectIds = new Set([...candidates.map(c => c.objectId), ...metrics.map(m => m.objectId)]);
  const seeds = [...objectIds];
  const relationIds = new Set<string>();
  const index = new SemanticIndex(snapshot as unknown as LegacySnapshot);
  // 只连接直接命中的对象，禁止沿连通分量扩散。路径仍遵守关系方向。
  for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) {
    const forward = index.findRelationPath(seeds[i]!, seeds[j]!);
    const path = forward.length ? forward : index.findRelationPath(seeds[j]!, seeds[i]!);
    for (const relation of path) { relationIds.add(relation.id); objectIds.add(relation.sourceObjectId); objectIds.add(relation.targetObjectId); }
  }
  const relations = snapshot.relations.filter(r => relationIds.has(r.id));
  const propertyIds = new Set(candidates.filter(c => c.kind === "property").map(c => c.id));
  for (const r of relations) for (const id of [r.sourcePropertyId, r.targetPropertyId]) if (id) propertyIds.add(id);
  const objects = snapshot.objects.filter(o => objectIds.has(o.id)).map(object => {
    for (const id of [...object.grainPropertyIds, object.defaultTimePropertyId]) if (id) propertyIds.add(id);
    const objectMetrics = metrics.filter(m => m.objectId === object.id);
    for (const p of object.properties) if (objectMetrics.some(m => m.sourcePropertyId === p.id || m.timePropertyId === p.id || [m.expression, m.filterExpression ?? ""].some(expression => expression.includes(p.name)))) propertyIds.add(p.id);
    return { ...object, properties: object.properties.filter(p => propertyIds.has(p.id)) };
  });
  return { objects, metrics, relations, candidates, ambiguities, retrieval: {
    mode: structured ? "CONCEPTS" : natural ? "QUESTION_DICTIONARY" : "TERMS",
    status: candidates.length === 0 ? "NO_MATCH" : ambiguities.length ? "AMBIGUOUS" : matches.some(m => !m.candidates.length) ? "PARTIAL_MATCH" : "MATCHED",
    unmatchedTerms: matches.filter(m => !m.candidates.length).map(({ role, term }) => ({ role, term })),
    notice: "返回词典匹配候选与连接所需定义；业务意图、时间范围及最终选择由调用方确认。",
  } };
}
