import type { OntologyObject, OntologySnapshotV3 } from "../../../packages/contracts/src/index.js";
import type { DraftPatchOperation } from "../../../packages/application/src/index.js";

export const OBJECT_TYPES = ["ENTITY", "EVENT", "SNAPSHOT", "AGGREGATE", "RELATIONSHIP"] as const;
export const MEANINGS = ["ID", "CODE", "NAME", "ENTITY_REFERENCE", "CATEGORY", "TIME", "NUMBER", "BOOLEAN", "GEOGRAPHY", "TEXT"] as const;
export const TYPE_HELP: Record<OntologyObject["objectType"], string> = {
  ENTITY: "表示客户、商品等稳定实体，必须有且只有一个唯一标识。",
  EVENT: "表示订单、支付等业务发生记录，最多一个唯一标识，必须明确每行的业务粒度。",
  SNAPSHOT: "表示某个时点的状态，例如每日库存；用时间与业务维度共同确定一行。",
  AGGREGATE: "表示按维度汇总的结果；需明确分组粒度，并为数值定义可加性。",
  RELATIONSHIP: "表示实体之间的关联，至少包含两个实体引用属性，并明确行级粒度。",
};
export const splitTerms = (value: string) => value.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean);
export const numericDefaults = { kind: "GENERAL", defaultAggregation: "NONE", aggregationBehavior: "NON_ADDITIVE" } as const;

export function objectRemovalOperations(snapshot: OntologySnapshotV3, objectId: string): DraftPatchOperation[] {
  const removedMetrics = new Set(snapshot.metrics.filter(metric => metric.objectId === objectId).map(metric => metric.id));
  let previousSize = -1;
  while (previousSize !== removedMetrics.size) {
    previousSize = removedMetrics.size;
    snapshot.metrics.forEach(metric => { if (removedMetrics.has(metric.leftMetricId ?? "") || removedMetrics.has(metric.rightMetricId ?? "")) removedMetrics.add(metric.id); });
  }
  return [
    ...snapshot.relations.filter(relation => relation.sourceObjectId === objectId || relation.targetObjectId === objectId || relation.composition?.parentObjectId === objectId || relation.composition?.childObjectId === objectId).map(relation => ({ op: "REMOVE_RELATION" as const, id: relation.id })),
    ...[...removedMetrics].map(id => ({ op: "REMOVE_METRIC" as const, id })),
    ...snapshot.dimensionHierarchies.filter(hierarchy => hierarchy.levels.some(level => level.objectId === objectId) || hierarchy.adjacency?.objectId === objectId || hierarchy.adjacency?.closure?.objectId === objectId).map(hierarchy => ({ op: "REMOVE_HIERARCHY" as const, id: hierarchy.id })),
    { op: "REMOVE_OBJECT", id: objectId },
  ];
}
