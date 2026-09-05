import type { OntologyRelation, OntologySnapshotV3 } from "../../contracts/src/index.js";

export const RELATION_RULES: Record<OntologyRelation["type"], string> = {
  REFERENCE: "RELATION_REFERENCE", ASSOCIATION: "RELATION_ASSOCIATION", COMPOSITION: "RELATION_COMPOSITION",
  HIERARCHY: "RELATION_HIERARCHY", EVENT_PARTICIPATION: "RELATION_EVENT", IDENTITY: "RELATION_IDENTITY", DERIVED: "RELATION_DERIVED",
};

export function relationTraversals(relation: OntologyRelation) {
  if (!relation.enabled || relation.type === "DERIVED") return [];
  const directions = [
    ...(relation.direction !== "TARGET_TO_SOURCE" ? [{ from: relation.sourceObjectId, to: relation.targetObjectId, cardinality: relation.cardinality }] : []),
    ...(relation.direction !== "SOURCE_TO_TARGET" ? [{ from: relation.targetObjectId, to: relation.sourceObjectId, cardinality: ({ ONE_TO_ONE: "ONE_TO_ONE", ONE_TO_MANY: "MANY_TO_ONE", MANY_TO_ONE: "ONE_TO_MANY", MANY_TO_MANY: "MANY_TO_MANY" } as const)[relation.cardinality] }] : []),
  ];
  return directions.map(edge => ({ ...edge, safe: ["ONE_TO_ONE", "MANY_TO_ONE"].includes(edge.cardinality) && relation.fanoutRisk !== "HIGH" && !(relation.type === "COMPOSITION" && relation.composition?.aggregationPolicy === "EXISTS_ONLY") }));
}

export function relationJoinExpression(snapshot: Pick<OntologySnapshotV3, "objects">, relation: OntologyRelation): string {
  const source = snapshot.objects.find(o => o.id === relation.sourceObjectId);
  const target = snapshot.objects.find(o => o.id === relation.targetObjectId);
  const sourceProperty = source?.properties.find(p => p.id === relation.sourcePropertyId);
  const targetProperty = target?.properties.find(p => p.id === relation.targetPropertyId);
  return source && target && sourceProperty && targetProperty ? `${source.name}.${sourceProperty.sourceColumn} = ${target.name}.${targetProperty.sourceColumn}` : "";
}
