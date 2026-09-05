import type { OntologyRelation, OntologySnapshotV3 } from "../../contracts/src/index.js";
import type { ValidationIssue } from "./kernel.js";
import { relationJoinExpression, RELATION_RULES } from "./relations.js";

export function validateRelations(snapshot: Pick<OntologySnapshotV3, "objects" | "relations">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (relation: OntologyRelation, code: string, message: string) => issues.push({ level: "ERROR", code, message: `${relation.name}：${message}`, subjectId: relation.id, references: [relation.id, relation.sourceObjectId, relation.targetObjectId] });
  for (const relation of snapshot.relations) {
    const source = snapshot.objects.find(o => o.id === relation.sourceObjectId);
    const target = snapshot.objects.find(o => o.id === relation.targetObjectId);
    const from = source?.properties.find(p => p.id === relation.sourcePropertyId);
    const to = target?.properties.find(p => p.id === relation.targetPropertyId);
    if (!source || !target) { fail(relation, "RELATION_PATH_NOT_FOUND", "引用的对象不存在"); continue; }
    if (!relation.enabled) continue;
    if (source.id === target.id) fail(relation, "RELATION_BINDING", "对象自关联请使用父子层级定义，避免连接别名歧义");
    if (!from || !to) fail(relation, "RELATION_BINDING", "必须选择两个对象中有效的关联字段");
    else {
      if ([from, to].some(p => p.sensitive || p.visibility !== "ANALYTICAL")) fail(relation, "RELATION_BINDING", "关联字段必须非敏感且分析可见");
      if (relation.joinExpression.replace(/\s/g, "") !== relationJoinExpression(snapshot, relation).replace(/\s/g, "")) fail(relation, "RELATION_BINDING", "关联表达式必须与所选字段的等值连接一致");
      if (relation.type !== "DERIVED" && ((["ONE_TO_ONE", "MANY_TO_ONE"].includes(relation.cardinality) && !to.unique) || (["ONE_TO_ONE", "ONE_TO_MANY"].includes(relation.cardinality) && !from.unique))) fail(relation, "RELATION_CARDINALITY_FANOUT", "声明为一的一端必须配置唯一字段，才能保证连接基数");
    }
    if (["REFERENCE", "HIERARCHY", "EVENT_PARTICIPATION"].includes(relation.type)) {
      if (to?.meaning !== "ID" || !to.unique) fail(relation, "RELATION_TARGET_ID", "目标字段必须是唯一标识");
      if (!["ONE_TO_ONE", "MANY_TO_ONE"].includes(relation.cardinality)) fail(relation, RELATION_RULES[relation.type], "应从引用方指向唯一目标，使用多对一或一对一");
    }
    if (relation.type === "IDENTITY" && (relation.cardinality !== "ONE_TO_ONE" || from?.meaning !== "ID" || to?.meaning !== "ID" || !from.unique || !to.unique)) fail(relation, "RELATION_IDENTITY", "身份对应必须连接两端唯一标识，且为一对一");
    if (relation.type === "EVENT_PARTICIPATION" && (source.objectType !== "EVENT" || target.objectType !== "ENTITY" || from?.meaning !== "ENTITY_REFERENCE")) fail(relation, "RELATION_EVENT", "来源必须是业务事件的实体引用字段，目标必须是业务实体");
    if (relation.type === "HIERARCHY" && (source.objectType !== "ENTITY" || target.objectType !== "ENTITY")) fail(relation, "RELATION_HIERARCHY", "层级关系连接下级实体与上级实体");
    if (relation.type === "COMPOSITION") {
      const c = relation.composition;
      if (!c || c.parentObjectId === c.childObjectId || ![source.id, target.id].includes(c.parentObjectId) || ![source.id, target.id].includes(c.childObjectId)) fail(relation, "RELATION_COMPOSITION", "必须在关系两端明确整体与组成部分");
      else {
        const parentIsSource = c.parentObjectId === source.id;
        const parentKey = parentIsSource ? from : to;
        if (!parentKey?.unique || !["ONE_TO_ONE", parentIsSource ? "ONE_TO_MANY" : "MANY_TO_ONE"].includes(relation.cardinality)) fail(relation, "RELATION_COMPOSITION", "整体端字段必须唯一，组成部分到整体应为多对一或一对一");
        if (c.ownership === "OWNED" && snapshot.relations.some(other => other.enabled && other.id !== relation.id && other.type === "COMPOSITION" && other.composition?.childObjectId === c.childObjectId && other.composition.parentObjectId !== c.parentObjectId)) fail(relation, "RELATION_COMPOSITION", "独占组成部分不能同时归属其他整体对象");
      }
    } else if (relation.composition) fail(relation, RELATION_RULES[relation.type], "只有组成关系可以配置归属与汇总策略");
  }
  for (const type of ["HIERARCHY", "COMPOSITION", "DERIVED"] as const) {
    const edges = snapshot.relations.filter(r => r.enabled && r.type === type).map(r => ({ relation: r, from: type === "COMPOSITION" ? r.composition?.childObjectId : r.sourceObjectId, to: type === "COMPOSITION" ? r.composition?.parentObjectId : r.targetObjectId }));
    for (const edge of edges) {
      const seen = new Set<string>();
      const reaches = (node: string | undefined): boolean => {
        if (!node) return false;
        if (node === edge.from) return true;
        if (seen.has(node)) return false;
        seen.add(node);
        return edges.some(next => next.from === node && reaches(next.to));
      };
      if (reaches(edge.to)) fail(edge.relation, RELATION_RULES[type], "关系不能直接或间接形成循环");
    }
  }
  return issues;
}
