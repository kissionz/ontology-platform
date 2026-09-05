import type { OntologySnapshotV3 } from "../../contracts/src/index.js";

/** Apply the same export boundary to HTTP, MCP and semantic context. */
export function visibleSnapshot(input: OntologySnapshotV3): OntologySnapshotV3 {
  const snapshot = structuredClone(input);
  const hidden = new Set(input.objects.flatMap(o => o.properties.filter(p => p.sensitive || p.visibility === "HIDDEN").map(p => p.id)));
  const hiddenColumns = input.objects.flatMap(o => o.properties.filter(p => hidden.has(p.id)).flatMap(p => [p.sourceColumn, p.name]));
  const refersToHidden = (expression?: string) => Boolean(expression && hiddenColumns.some(column => expression.split(/[^\p{L}\p{N}_]+/u).includes(column)));
  snapshot.objects = snapshot.objects.map(o => ({ ...o,
    properties: o.properties.filter(p => !hidden.has(p.id)),
    grainPropertyIds: o.grainPropertyIds.filter(id => !hidden.has(id)),
    ...(o.defaultTimePropertyId && hidden.has(o.defaultTimePropertyId) ? { defaultTimePropertyId: undefined } : {}),
    ...(refersToHidden(o.defaultFilter) ? { defaultFilter: undefined } : {}),
  }));
  for (const metric of snapshot.metrics) if ((metric.sourcePropertyId && hidden.has(metric.sourcePropertyId)) || refersToHidden(metric.expression) || refersToHidden(metric.filterExpression)) hidden.add(metric.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const metric of snapshot.metrics) if (!hidden.has(metric.id) && [metric.leftMetricId, metric.rightMetricId].some(id => id && hidden.has(id))) { hidden.add(metric.id); changed = true; }
  }
  snapshot.metrics = snapshot.metrics.filter(m => !hidden.has(m.id));
  snapshot.relations = snapshot.relations.filter(r => {
    const blocked = [r.sourcePropertyId, r.targetPropertyId].some(id => id && hidden.has(id)) || refersToHidden(r.joinExpression);
    if (blocked) hidden.add(r.id);
    return !blocked;
  });
  snapshot.dimensionHierarchies = snapshot.dimensionHierarchies.filter(h => {
    const blocked = h.levels.some(l => hidden.has(l.propertyId)) || (h.adjacency && [h.adjacency.nodeIdPropertyId, h.adjacency.parentIdPropertyId, h.adjacency.labelPropertyId].some(id => hidden.has(id)));
    if (blocked) hidden.add(h.id);
    return !blocked;
  });
  snapshot.axiomAssertions = snapshot.axiomAssertions.filter(a => {
    const blocked = hidden.has(a.subjectId) || a.sourceDefinitionIds.some(id => hidden.has(id));
    if (blocked) hidden.add(a.id);
    return !blocked;
  });
  snapshot.inferredAssertions = snapshot.inferredAssertions.filter(i => !hidden.has(i.subjectId) && !hidden.has(i.objectId ?? "") && [...i.axiomAssertionIds, ...i.premiseAssertionIds, ...i.proof.map(p => p.refId)].every(id => !hidden.has(id)));
  return snapshot;
}
