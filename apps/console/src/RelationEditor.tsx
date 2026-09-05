import { useState } from "react";
import type { OntologyRelation, OntologySnapshotV3 } from "../../../packages/contracts/src/index.js";
import { validateRelations } from "../../../packages/domain/src/relation-validation.js";
import { relationJoinExpression, RELATION_RULES } from "../../../packages/domain/src/relations.js";
import { axiomTitle, term } from "./axiom-copy.js";

export const RELATION_LABELS: Record<OntologyRelation["type"], string> = { REFERENCE: "实体引用", ASSOCIATION: "业务关联", COMPOSITION: "组成关系", HIERARCHY: "层级关系", EVENT_PARTICIPATION: "事件参与", IDENTITY: "身份对应", DERIVED: "派生血缘" };
const guidance: Record<OntologyRelation["type"], string> = {
  REFERENCE: "引用方指向目标的唯一标识；通常为多对一。",
  ASSOCIATION: "用两端字段建立业务连接；查询仍受方向、数量关系与扩行风险约束。",
  COMPOSITION: "明确整体与组成部分。子对象指标按整体维度汇总；仅存在性筛选策略禁止展开子对象。",
  HIERARCHY: "来源为下级实体，目标为上级实体；下级到上级为多对一或一对一，层级不能成环。",
  EVENT_PARTICIPATION: "从业务事件的实体引用字段连接参与该事件的实体。",
  IDENTITY: "两端唯一标识一对一对应，用于连接同一业务身份的不同对象定义。",
  DERIVED: "来源对象派生自目标对象；输出可追溯的血缘依据，不参与物理查询连接，依赖不能成环。",
};

export function RelationEditor({ snapshot, objectId, busy, onChange, onRemove }: {
  snapshot: OntologySnapshotV3; objectId: string; busy: boolean;
  onChange: (relation: OntologyRelation) => void; onRemove: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const relations = snapshot.relations.filter(r => r.sourceObjectId === objectId || r.targetObjectId === objectId);
  const relation = snapshot.relations.find(r => r.id === selected);
  const source = snapshot.objects.find(o => o.id === relation?.sourceObjectId);
  const target = snapshot.objects.find(o => o.id === relation?.targetObjectId);
  const name = (id: string) => snapshot.objects.find(o => o.id === id)?.label ?? id;
  const patch = (values: Partial<OntologyRelation>) => {
    if (!relation) return;
    const next = { ...relation, ...values, status: "DRAFT" as const };
    next.joinExpression = relationJoinExpression(snapshot, next) || "待配置关联字段";
    onChange(next);
  };
  const add = () => {
    const from = snapshot.objects.find(o => o.id === objectId)!;
    const to = snapshot.objects.find(o => o.id !== objectId);
    if (!to) return;
    const next: OntologyRelation = { id: `r_${crypto.randomUUID()}`, name: `${from.label}关联${to.label}`, type: "ASSOCIATION", sourceObjectId: from.id, targetObjectId: to.id, sourcePropertyId: from.properties.find(p => p.meaning === "ENTITY_REFERENCE")?.id, targetPropertyId: to.properties.find(p => p.meaning === "ID")?.id, cardinality: "MANY_TO_ONE", direction: "SOURCE_TO_TARGET", required: false, enabled: true, fanoutRisk: "NONE", status: "DRAFT", joinExpression: "待配置关联字段" };
    next.joinExpression = relationJoinExpression(snapshot, next) || next.joinExpression;
    onChange(next); setSelected(next.id);
  };
  const issues = relation ? validateRelations(snapshot).filter(i => i.subjectId === relation.id) : [];
  const choices = (label: string, value: string, options: readonly string[], change: (value: string) => void) => <label className="model-field"><span>{label}</span><select aria-label={label} value={value} onChange={e => change(e.target.value)}>{options.map(v => <option key={v} value={v}>{term(v)}</option>)}</select></label>;
  return <section className="relation-workbench">
    <div className="source-actions"><h3>对象关系</h3><button type="button" className="secondary-button" disabled={busy || snapshot.objects.length < 2} onClick={add}>新增关系</button></div>
    <div className="model-table-wrap"><table className="model-table"><thead><tr><th>关系名称</th><th>类型</th><th>连接对象</th><th>状态</th><th>操作</th></tr></thead><tbody>{relations.map(r => <tr key={r.id}><td><button className="text-button" onClick={() => setSelected(r.id)} aria-label={`编辑关系 ${r.name}`}>{r.name}</button></td><td>{RELATION_LABELS[r.type]}</td><td>{name(r.sourceObjectId)} → {name(r.targetObjectId)}</td><td>{r.enabled ? "已启用" : "已停用"}</td><td><button className="text-button danger" disabled={busy} aria-label={`删除关系 ${r.name}`} onClick={() => { if (window.confirm(`删除“${r.name}”？保存并发布后，该关系将不再用于语义推理和查询路径。`)) { onRemove(r.id); if (selected === r.id) setSelected(""); } }}>删除</button></td></tr>)}</tbody></table></div>
    {!relations.length && <p className="model-help">暂无关系，新增后配置两端对象与字段。</p>}
    {relation && <fieldset className="relation-settings" disabled={busy}><legend>编辑关系</legend><div className="model-form-grid">
      <label className="model-field"><span>关系名称</span><input aria-label="关系名称" value={relation.name} onChange={e => patch({ name: e.target.value })} /></label>
      <label className="model-field"><span>关系类型</span><select aria-label="关系类型" value={relation.type} onChange={e => {
        const type = e.target.value as OntologyRelation["type"];
        patch({ type, composition: type === "COMPOSITION" ? { parentObjectId: relation.targetObjectId, childObjectId: relation.sourceObjectId, ownership: "OWNED", aggregationPolicy: "PRE_AGGREGATE_CHILD" } : undefined, ...(type === "IDENTITY" ? { cardinality: "ONE_TO_ONE" } : ["REFERENCE", "EVENT_PARTICIPATION", "HIERARCHY"].includes(type) ? { cardinality: "MANY_TO_ONE" } : {}) });
      }}>{Object.entries(RELATION_LABELS).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label>
      <p className="model-help wide">{guidance[relation.type]}</p>
      {(["source", "target"] as const).map(side => { const obj = side === "source" ? source : target; const title = side === "source" ? "来源" : "目标"; return <div className="model-form-grid wide" key={side}>
        <label className="model-field"><span>{title}对象</span><select aria-label={`${title}对象`} value={obj?.id ?? ""} onChange={e => patch(side === "source" ? { sourceObjectId: e.target.value, sourcePropertyId: undefined, composition: undefined } : { targetObjectId: e.target.value, targetPropertyId: undefined, composition: undefined })}>{snapshot.objects.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="model-field"><span>{title}字段</span><select aria-label={`${title}字段`} value={(side === "source" ? relation.sourcePropertyId : relation.targetPropertyId) ?? ""} onChange={e => patch(side === "source" ? { sourcePropertyId: e.target.value || undefined } : { targetPropertyId: e.target.value || undefined })}><option value="">请选择关联字段</option>{obj?.properties.filter(p => !p.sensitive && p.visibility === "ANALYTICAL").map(p => <option key={p.id} value={p.id}>{p.label} · {p.sourceColumn}</option>)}</select></label>
      </div>; })}
      {relation.type !== "DERIVED" && <>{choices("数量关系", relation.cardinality, ["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"], v => patch({ cardinality: v as OntologyRelation["cardinality"] }))}
      {choices("遍历方向", relation.direction, ["SOURCE_TO_TARGET", "TARGET_TO_SOURCE", "BIDIRECTIONAL"], v => patch({ direction: v as OntologyRelation["direction"] }))}
      {choices("扩行风险", relation.fanoutRisk, ["NONE", "LOW", "HIGH"], v => patch({ fanoutRisk: v as OntologyRelation["fanoutRisk"] }))}
      <div className="model-checks"><label><input type="checkbox" aria-label="启用关系" checked={relation.enabled} onChange={e => patch({ enabled: e.target.checked })} />启用关系</label><label><input type="checkbox" aria-label="必须存在关联记录" checked={relation.required} onChange={e => patch({ required: e.target.checked })} />必须存在关联记录</label></div></>}
      {relation.type === "DERIVED" && <label className="model-checks"><input type="checkbox" aria-label="启用关系" checked={relation.enabled} onChange={e => patch({ enabled: e.target.checked })} />启用关系</label>}
      {relation.type === "COMPOSITION" && <>
        <label className="model-field"><span>整体对象</span><select aria-label="整体对象" value={relation.composition?.parentObjectId ?? ""} onChange={e => patch({ composition: { parentObjectId: e.target.value, childObjectId: e.target.value === relation.sourceObjectId ? relation.targetObjectId : relation.sourceObjectId, ownership: relation.composition?.ownership ?? "OWNED", aggregationPolicy: relation.composition?.aggregationPolicy ?? "PRE_AGGREGATE_CHILD" } })}><option value="">请选择整体</option>{[source, target].filter(Boolean).map(o => <option key={o!.id} value={o!.id}>{o!.label}</option>)}</select></label>
        {relation.composition && <>{choices("归属方式", relation.composition.ownership, ["OWNED", "SHARED"], v => patch({ composition: { ...relation.composition!, ownership: v as "OWNED" | "SHARED" } }))}{choices("组成部分汇总策略", relation.composition.aggregationPolicy, ["PRE_AGGREGATE_CHILD", "EXISTS_ONLY"], v => patch({ composition: { ...relation.composition!, aggregationPolicy: v as "PRE_AGGREGATE_CHILD" | "EXISTS_ONLY" } }))}</>}
      </>}
      <label className="model-field wide"><span>字段等值映射</span><input aria-label="字段等值映射" value={relation.joinExpression} readOnly /></label>
      <p className="model-help wide">{axiomTitle(RELATION_RULES[relation.type])}。{relation.type === "DERIVED" ? "输出字段派生映射与依赖依据。" : relation.required ? "查询使用内连接，仅保留匹配记录。" : "查询使用左连接，保留未匹配记录。"}修改随“保存对象”保存，通过公理校验并发布后生效。</p>
      {issues.length > 0 && <ul className="relation-issues wide" aria-label="关系公理校验">{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
    </div></fieldset>}
  </section>;
}
