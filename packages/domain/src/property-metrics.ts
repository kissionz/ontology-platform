import type { Metric, OntologyObject, OntologyProperty } from "../../contracts/src/index.js";

/** 属性 ID 是稳定的基础指标引用，聚合语义始终来自属性自身。 */
export function propertyMetric(object: OntologyObject, property: OntologyProperty): Metric | undefined {
  const spec = property.numericSpec;
  if (property.meaning !== "NUMBER" || property.sensitive || property.visibility !== "ANALYTICAL" || !spec || spec.defaultAggregation === "NONE" ||
    (spec.defaultAggregation === "SUM" && (spec.kind === "RATIO" || spec.aggregationBehavior === "NON_ADDITIVE"))) return undefined;
  return {
    id: property.id, metricType: "BASE", name: property.name, label: property.label,
    description: `${property.label}，按属性默认聚合规则计算`, objectId: object.id,
    expression: `${spec.defaultAggregation}(${object.name}.${property.name})`, definitionMode: "VISUAL",
    sourcePropertyId: property.id, timePropertyId: object.defaultTimePropertyId,
    aggregation: spec.defaultAggregation, format: spec.kind === "CURRENCY" ? "currency" : spec.kind === "RATIO" ? "percent" : "number",
    unit: spec.kind === "CURRENCY" ? spec.currency : spec.unit, synonyms: property.synonyms, status: object.status,
  };
}

export function effectiveMetrics(snapshot: { objects: OntologyObject[]; metrics: Metric[] }): Metric[] {
  const ids = new Set(snapshot.metrics.map(m => m.id));
  return [...snapshot.metrics, ...snapshot.objects.flatMap(object => object.properties.flatMap(property => {
    const metric = propertyMetric(object, property);
    return metric && !ids.has(metric.id) ? [metric] : [];
  }))];
}
