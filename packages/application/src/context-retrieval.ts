import { effectiveMetrics } from "../../domain/src/property-metrics.js";
import { bindingPriority, nameProperties } from "../../domain/src/semantic-identity.js";
import { relationTraversals } from "../../domain/src/relations.js";
import type { OntologyObject, OntologyProperty, OntologySnapshotV3, ResolveSemanticContextInput } from "../../contracts/src/index.js";

export const normalizeTerm = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
export type Role = "metrics" | "dimensions" | "filters" | "time" | "terms" | "values";
export interface SearchRequest { term: string; role: Role; object?: string; property?: string; natural?: boolean }
export interface ContextValueMatch { objectId: string; propertyId: string; displayValue: string; frequency: number }
export interface ValueScope { objectIds?: string[]; propertyIds?: string[]; exact?: boolean }
export type ValueLookup = (term: string, scope: ValueScope) => ContextValueMatch[];
export interface ContextCandidate {
  kind: "object" | "property" | "metric" | "value"; id: string; label: string; objectId: string; objectLabel: string;
  propertyId?: string; propertyLabel?: string; identityPropertyIds?: string[]; displayValue?: string;
  score: number; priority: number; matchedBy: string; matchedSources: string[]; term: string; role: Role; reason: string;
  usableAs: string[]; aggregation?: string; unit?: string;
}
export function contextRequests(input: ResolveSemanticContextInput): SearchRequest[] {
  if (input.terms?.length) return input.terms.map(t => typeof t === "string" ? { term: t, role: "terms" } : { ...t, role: t.role ?? "terms" });
  if (input.concepts) return Object.entries(input.concepts).flatMap(([role, terms]) => (terms ?? []).map(t =>
    typeof t === "string" ? { term: t, role: role as Role } : { term: t.value, object: t.object, property: t.property, role: "values" as Role }));
  return input.question?.trim() ? [{ term: input.question, role: "terms", natural: true }] : [];
}

export function retrieveContext(snapshot: OntologySnapshotV3, input: ResolveSemanticContextInput, lookup: ValueLookup) {
  const requests = contextRequests(input);
  const allMetrics = effectiveMetrics(snapshot);
  const metricById = new Map(allMetrics.map(m => [m.id, m]));
  const allProperties = snapshot.objects.flatMap(object => object.properties.filter(p => !p.sensitive && p.visibility === "ANALYTICAL").map(property => ({ object, property })));
  const valuesById = new Map<string, ContextValueMatch>();
  const aliasMatch = (term: string, aliases: string[], natural = false) => {
    const q = normalizeTerm(term);
    for (let i = 0; i < aliases.length; i++) {
      const alias = normalizeTerm(aliases[i]!);
      if (alias && (natural ? q.includes(alias) : q === alias)) return { alias: aliases[i]!, tier: i === 0 ? 3 : i < 3 ? 2 : 1 };
    }
    return undefined;
  };
  const aliases = (d: { id: string; name: string; label: string; synonyms: string[] }) => [d.id, d.name, d.label, ...d.synonyms];
  const make = (o: OntologyObject, p: OntologyProperty | undefined, request: SearchRequest, kind: ContextCandidate["kind"], id: string, label: string, match: { alias: string; tier: number }): ContextCandidate => ({
    kind, id, label, objectId: o.id, objectLabel: o.label, ...(p ? { propertyId: p.id, propertyLabel: p.label } : {}),
    score: match.tier, priority: bindingPriority(o, p), matchedBy: match.alias, matchedSources: [kind], term: request.term, role: request.role,
    reason: match.tier === 3 ? "编码命中" : match.tier === 2 ? "业务名称命中" : "同义词命中", usableAs: [],
  });
  const collect = (request: SearchRequest, valuesOnly = false): ContextCandidate[] => {
    const scopedObjects = request.object ? snapshot.objects.filter(o => aliasMatch(request.object!, aliases(o))) : snapshot.objects;
    const scopedObjectIds = new Set(scopedObjects.map(o => o.id));
    const scopedProperties = allProperties.filter(({object, property}) => scopedObjectIds.has(object.id) && (!request.property || aliasMatch(request.property, aliases(property))));
    const propertyIds = new Set(scopedProperties.map(p => p.property.id));
    const found: ContextCandidate[] = [];
    if (!valuesOnly && request.role !== "values") {
      for (const o of scopedObjects) {
        const match = aliasMatch(request.term, aliases(o), request.natural);
        if (!match || request.property || ["metrics", "time"].includes(request.role)) continue;
        const names = nameProperties(o);
        if (!names.length) { const c = make(o, undefined, request, "object", o.id, o.label, match); c.usableAs = ["OBJECT"]; found.push(c); }
        for (const p of names) {
          const c = make(o, p, request, "object", o.id, o.label, match);
          c.priority = bindingPriority(o); c.usableAs = ["OBJECT", "DIMENSION", "FILTER_FIELD"]; c.identityPropertyIds = o.grainPropertyIds;
          found.push(c);
        }
      }
      for (const {object: o, property: p} of scopedProperties) {
        const match = aliasMatch(request.term, aliases(p), request.natural);
        if (!match || (request.role === "time" && p.meaning !== "TIME")) continue;
        const metric = metricById.get(p.id);
        if (request.role === "metrics" && !metric) continue;
        const name = nameProperties(o);
        const isName = name.some(n => n.id === p.id) && !request.property && match.tier < 3 && !["metrics", "time"].includes(request.role);
        const kind = metric && ["terms", "metrics"].includes(request.role) ? "metric" : isName ? "object" : "property";
        const c = make(o, p, request, kind, isName ? o.id : p.id, isName ? o.label : p.label, match);
        c.matchedSources = ["property"]; c.usableAs = kind === "metric" ? ["MEASURE"] : p.meaning === "TIME" ? ["TIME", "DIMENSION", "FILTER_FIELD"] : ["DIMENSION", "FILTER_FIELD"];
        if (isName) { c.identityPropertyIds = o.grainPropertyIds; c.priority = bindingPriority(o); }
        if (metric) { c.aggregation = metric.aggregation; c.unit = metric.unit; }
        found.push(c);
      }
      for (const m of snapshot.metrics) {
        const o = scopedObjects.find(o => o.id === m.objectId);
        if (!o || (request.property && !propertyIds.has(m.sourcePropertyId ?? "")) || !["metrics", "terms"].includes(request.role)) continue;
        const match = aliasMatch(request.term, aliases(m), request.natural); if (!match) continue;
        const c = make(o, undefined, request, "metric", m.id, m.label, match);
        c.usableAs = ["MEASURE"]; c.aggregation = m.aggregation; c.unit = m.unit;
        found.push(c);
      }
    }
    if (input.include?.values !== false && (valuesOnly || ["values", "terms", "filters"].includes(request.role))) {
      const eligible = scopedProperties.filter(p => p.property.valueSearchable);
      if (eligible.length) {
        const matches = lookup(request.term, { objectIds: [...scopedObjectIds], propertyIds: eligible.map(p => p.property.id), exact: !request.natural });
        for (const value of matches) {
          const owner = eligible.find(p => p.property.id === value.propertyId && p.object.id === value.objectId); if (!owner) continue;
          const id = JSON.stringify([value.propertyId, value.displayValue]); valuesById.set(id, value);
          const c = make(owner.object, owner.property, request, "value", id, value.displayValue, { alias: value.displayValue, tier: 2 });
          c.displayValue = value.displayValue; c.usableAs = ["FILTER_VALUE"]; c.reason = "值索引命中";
          found.push(c);
        }
      }
    }
    const merged = new Map<string, ContextCandidate>();
    for (const c of found) {
      const key = `${c.kind}:${c.id}:${c.propertyId ?? ""}`;
      const old = merged.get(key);
      if (!old) merged.set(key, c);
      else { const best = c.score > old.score ? c : old; merged.set(key, { ...best, matchedSources: [...new Set([...old.matchedSources, ...c.matchedSources])] }); }
    }
    return [...merged.values()];
  };
  const groups = requests.flatMap(request => {
    const matches = collect(request);
    if (!request.natural) return [{ request, matches }];
    const terms = new Map<string, ContextCandidate[]>();
    for (const c of matches) { const key = normalizeTerm(c.matchedBy); terms.set(key, [...(terms.get(key) ?? []), c]); }
    return terms.size ? [...terms].map(([term, matches]) => ({ request: { ...request, term }, matches })) : [{ request, matches }];
  });
  // 保留兼容的原问题值召回，但显式词条或范围绑定不会被原问题扩大。
  if (!input.terms?.length && input.concepts && !input.concepts.values?.length && !input.concepts.filters?.some(t => typeof t !== "string") && input.question && input.include?.values === true) {
    const request: SearchRequest = { term: input.question, role: "values", natural: true };
    const additional = new Map<string, ContextCandidate[]>();
    for (const c of collect(request, true)) if (!groups.some(g => g.matches.some(m => m.id === c.id))) {
      const key = normalizeTerm(c.displayValue!); additional.set(key, [...(additional.get(key) ?? []), c]);
    }
    for (const [term, matches] of additional) groups.push({ request: { term, role: "values" }, matches });
  }
  const adjacent = new Map<string, Array<{ to: string; relationId: string }>>();
  for (const r of snapshot.relations) for (const edge of relationTraversals(r).filter(e => e.safe)) adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), { to: edge.to, relationId: r.id }]);
  const path = (from: string, to: string): string[] | undefined => {
    if (from === to) return [];
    const queue = [{ at: from, path: [] as string[] }], seen = new Set([from]);
    for (const item of queue) for (const edge of adjacent.get(item.at) ?? []) {
      if (seen.has(edge.to)) continue;
      const next = [...item.path, edge.relationId]; if (edge.to === to) return next;
      seen.add(edge.to); queue.push({ at: edge.to, path: next });
    }
    return undefined;
  };
  const rank = (items: ContextCandidate[]) => {
    if (!items.length) return [];
    const exact = Math.max(...items.map(c => c.score)); const strongest = items.filter(c => c.score === exact);
    const priority = Math.max(...strongest.map(c => c.priority)); return strongest.filter(c => c.priority === priority);
  };
  const rootCandidates = groups.flatMap(g => rank(g.matches.filter(c => c.kind === "metric")));
  const roots = [...new Set(rootCandidates.map(c => c.objectId))];
  const selected: ContextCandidate[] = [], ambiguities: Array<{ term: string; role: Role; reason: string; candidates: ContextCandidate[] }> = [];
  const unmatchedTerms: Array<{ role: Role; term: string; reason?: string }> = [];
  const bindings: Array<{ term: string; role: Role; status: string; selected?: ContextCandidate; candidates?: ContextCandidate[] }> = [];
  for (const group of groups) {
    const applicable = group.matches.filter(c => !roots.length || c.kind === "metric" || roots.some(root => path(root, c.objectId) !== undefined));
    const winners = rank(applicable);
    if (!winners.length) {
      unmatchedTerms.push({ term: group.request.term, role: group.request.role, reason: group.matches.length ? "与指标对象之间没有可安全使用的关联路径" : "指定范围内未命中" });
      bindings.push({ term: group.request.term, role: group.request.role, status: "UNMATCHED" }); continue;
    }
    // 对象缺少主名称属性时，也不能悄悄把对象当成维度。
    const needsName = winners.some(c => c.kind === "object" && !c.propertyId && group.request.role === "dimensions");
    const ambiguous = winners.length > 1 || needsName;
    if (ambiguous) ambiguities.push({ term: group.request.term, role: group.request.role, reason: needsName ? "请配置对象的主名称属性" : "匹配程度与优先级相同，请确认业务含义", candidates: winners });
    const final = winners.map(c => ({ ...c, reason: winners.length === 1 && applicable.length > 1 ? `${c.reason}；按匹配程度和配置优先级选择` : c.reason }));
    selected.push(...final);
    bindings.push({ term: group.request.term, role: group.request.role, status: ambiguous ? "AMBIGUOUS" : "BOUND", ...(ambiguous ? { candidates: final } : { selected: final[0]! }) });
  }
  const candidates = [...new Map(selected.map(c => [`${c.kind}:${c.id}:${c.propertyId ?? ""}`, c])).values()];
  const values = candidates.filter(c => c.kind === "value").map(c => ({ ...valuesById.get(c.id)!, objectLabel: c.objectLabel, propertyLabel: c.propertyLabel!, filter: { propertyId: c.propertyId!, operator: "EQ" as const, value: c.displayValue! } }));
  const metricIds = new Set(candidates.filter(c => c.kind === "metric").map(c => c.id));
  const metrics = allMetrics.filter(m => metricIds.has(m.id));
  for (const m of metrics) for (const id of [m.leftMetricId, m.rightMetricId]) { const dep = metricById.get(id ?? ""); if (dep && !metricIds.has(dep.id)) { metrics.push(dep); metricIds.add(dep.id); } }
  const objectIds = new Set([...candidates.map(c => c.objectId), ...metrics.map(m => m.objectId)]);
  const relationIds = new Set<string>(); const seeds = [...objectIds];
  for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) for (const id of path(seeds[i]!, seeds[j]!) ?? path(seeds[j]!, seeds[i]!) ?? []) relationIds.add(id);
  const relations = snapshot.relations.filter(r => relationIds.has(r.id));
  for (const r of relations) { objectIds.add(r.sourceObjectId); objectIds.add(r.targetObjectId); }
  const propertyIds = new Set(candidates.flatMap(c => c.propertyId ? [c.propertyId] : []));
  for (const r of relations) for (const id of [r.sourcePropertyId, r.targetPropertyId]) if (id) propertyIds.add(id);
  const objects = snapshot.objects.filter(o => objectIds.has(o.id)).map(o => {
    for (const id of [...o.grainPropertyIds, o.defaultTimePropertyId]) if (id) propertyIds.add(id);
    for (const p of o.properties) if (metrics.some(m => m.objectId === o.id && (m.sourcePropertyId === p.id || m.timePropertyId === p.id || [m.expression, m.filterExpression ?? ""].some(e => e.includes(p.name))))) propertyIds.add(p.id);
    return { ...o, properties: o.properties.filter(p => propertyIds.has(p.id)) };
  });
  return { objects, metrics, relations, candidates, values, bindings, ambiguities, retrieval: {
    mode: "UNIFIED", status: !candidates.length ? "NO_MATCH" : ambiguities.length ? "AMBIGUOUS" : unmatchedTerms.length ? "PARTIAL_MATCH" : "MATCHED",
    unmatchedTerms, notice: "返回业务绑定候选；存在待确认项时请先澄清，再由语义平台校验并执行查询。",
  } };
}
