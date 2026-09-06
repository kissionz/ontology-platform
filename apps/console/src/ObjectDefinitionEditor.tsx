import { RelationEditor, RELATION_LABELS } from "./RelationEditor.js";
import { useState, type ReactNode } from "react";
import type { OntologyObject, OntologyProperty, OntologySnapshotV3, PhysicalTable } from "../../../packages/contracts/src/index.js";
import { instantiateAxioms } from "../../../packages/domain/src/kernel.js";
import { axiomDescription, axiomTitle, term } from "./axiom-copy.js";
import { MEANINGS, OBJECT_TYPES, TYPE_HELP, numericDefaults, splitTerms } from "./modeling.js";

function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`model-field${wide ? " wide" : ""}`}><span>{label}</span>{children}</label>;
}
function Choices({ label, value, values, onChange, disabled = false }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{values.map(item => <option key={item} value={item}>{term(item)}</option>)}</select>;
}

export function ObjectDefinitionEditor({ value, snapshot, tables, editing, busy, dirty, onChange, onSave, onReference, onRelationChange, onRelationRemove, advancedRelations }: {
  value: OntologyObject; snapshot: OntologySnapshotV3; tables: PhysicalTable[]; editing: boolean; busy: boolean; dirty: boolean;
  onChange: (object: OntologyObject) => void; onSave: () => void;
  onReference: (property: OntologyProperty, targetId: string) => void;
  onRelationChange: (relation: OntologySnapshotV3["relations"][number]) => void;
  onRelationRemove: (id: string) => void;
  advancedRelations?: ReactNode;
}) {
  const [tab, setTab] = useState("basic");
  const [propertyId, setPropertyId] = useState(value.properties[0]?.id ?? "");
  const property = value.properties.find(item => item.id === propertyId) ?? value.properties[0];
  const source = tables.find(table => table.id === value.sourceTableId);
  const relations = snapshot.relations.filter(relation => relation.sourceObjectId === value.id || relation.targetObjectId === value.id);
  const metrics = snapshot.metrics.filter(metric => metric.objectId === value.id);
  const grain = value.grainPropertyIds.map(id => value.properties.find(item => item.id === id)?.label ?? id).join(" × ") || "尚未指定";
  const change = (patch: Partial<OntologyObject>) => onChange({ ...value, ...patch });
  const changeProperty = (patch: Partial<OntologyProperty>) => property && change({ properties: value.properties.map(item => item.id === property.id ? { ...item, ...patch } : item) });
  const axioms = instantiateAxioms({ ...snapshot, objects: [value] }).filter(axiom => axiom.subjectId === value.id || value.properties.some(item => item.id === axiom.subjectId) || relations.some(item => item.id === axiom.subjectId) || metrics.some(item => item.id === axiom.subjectId));
  const objectName = (id: string) => snapshot.objects.find(object => object.id === id)?.label ?? id;
  const ref = property && relations.find(relation => relation.type === "REFERENCE" && relation.sourceObjectId === value.id && relation.sourcePropertyId === property.id);
  return <div className="object-workbench">
    {editing ? <>
      <div className="model-editor-toolbar">
        <div className="model-tabs" role="tablist" aria-label="对象编辑分区">
          {[["basic", "基本信息"], ["properties", `属性 ${value.properties.length}`], ["relations", `关系 ${relations.length}`], ["rules", "规则"]].map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id!)}>{label}</button>)}
        </div>
        <div className="model-save-state"><span>{dirty ? "有未保存修改" : "已保存"}</span><button className="primary-button" disabled={busy || !dirty} onClick={onSave}>保存对象</button></div>
      </div>
      <div className="model-editor-body">
        {tab === "basic" && <div className="model-form-grid">
          <FormField label="业务名称"><input aria-label="对象业务名称" value={value.label} onChange={event => change({ label: event.target.value })} /></FormField>
          <FormField label="来源表"><select aria-label="对象来源表" value={value.sourceTableId} onChange={event => change({ sourceTableId: event.target.value })}>{!source && <option value={value.sourceTableId}>{value.sourceTableId}（未扫描）</option>}{tables.map(table => <option key={table.id} value={table.id}>{table.database}.{table.name}</option>)}</select></FormField>
          <FormField label="对象类型"><Choices label="对象类型" value={value.objectType} values={OBJECT_TYPES} onChange={objectType => change({ objectType: objectType as OntologyObject["objectType"] })} /></FormField>
          <p className="model-help wide">{TYPE_HELP[value.objectType]}</p>
          <FormField label="业务分类"><input aria-label="业务分类" value={value.category ?? ""} placeholder="例如：交易域" onChange={event => change({ category: event.target.value })} /></FormField>
          <FormField label="负责人"><input aria-label="负责人" value={value.owner ?? ""} placeholder="维护此业务定义的负责人" onChange={event => change({ owner: event.target.value })} /></FormField>
          <FormField label="当前行级粒度" wide><input aria-label="当前行级粒度" value={grain} readOnly /></FormField>
          <fieldset className="model-checks wide"><legend>粒度属性（共同确定一行）</legend>{value.properties.filter(item => item.visibility === "ANALYTICAL").map(item => <label key={item.id}><input type="checkbox" aria-label={`${item.label}构成粒度`} checked={value.grainPropertyIds.includes(item.id)} onChange={event => change({ grainPropertyIds: event.target.checked ? [...value.grainPropertyIds, item.id] : value.grainPropertyIds.filter(id => id !== item.id) })} />{item.label}</label>)}</fieldset>
          <FormField label="粒度补充说明" wide><input aria-label="粒度补充说明" value={value.grain} placeholder="例如：每日闭店后的库存状态" onChange={event => change({ grain: event.target.value })} /></FormField>
          <FormField label="主名称属性"><select aria-label="主名称属性" value={value.primaryNamePropertyId ?? ""} onChange={event => change({ primaryNamePropertyId: event.target.value || undefined })}><option value="">自动选择唯一名称属性</option>{value.properties.filter(p => p.meaning === "NAME" && p.visibility === "ANALYTICAL" && !p.sensitive).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></FormField>
          <FormField label="默认时间字段"><select aria-label="默认时间字段" value={value.defaultTimePropertyId ?? ""} onChange={event => change({ defaultTimePropertyId: event.target.value || undefined })}><option value="">未配置</option>{value.properties.filter(item => item.meaning === "TIME").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></FormField>
          <FormField label="对象同义词"><input aria-label="对象同义词" value={value.synonyms.join("、")} placeholder="用逗号或顿号分隔" onChange={event => change({ synonyms: splitTerms(event.target.value) })} /></FormField>
          <FormField label="业务描述" wide><textarea className="description-editor" aria-label="业务描述" rows={3} value={value.description} placeholder="说明该对象代表什么、适用范围及业务口径" onChange={event => change({ description: event.target.value })} /></FormField>
          <details className="model-advanced wide"><summary>高级语义设置</summary><div className="model-form-grid">
            <FormField label="对象编码"><input aria-label="对象编码" value={value.name} readOnly /></FormField>
            <FormField label="语义匹配优先级"><input aria-label="对象匹配优先级" type="number" min={0} max={100} value={value.bindingPriority} onChange={event => change({ bindingPriority: Number(event.target.value) })} /></FormField>
            <FormField label="默认筛选表达式"><input aria-label="默认筛选表达式" value={value.defaultFilter ?? ""} onChange={event => change({ defaultFilter: event.target.value || undefined })} /></FormField>
          </div></details>
        </div>}
        {tab === "properties" && <>
          <p className="model-help">选择属性配置业务含义、字段映射、可见性和聚合口径。</p>
          <div className="model-table-wrap property-list-wrap"><table className="model-table property-catalog"><thead><tr><th>业务名称</th><th>物理字段</th><th>语义类型</th><th>可见性</th><th>聚合语义</th></tr></thead><tbody>{value.properties.map(item => <tr key={item.id} className={property?.id === item.id ? "selected" : ""}><td><button className="text-button" onClick={() => setPropertyId(item.id)} aria-label={`配置属性 ${item.label}`}>{item.label}</button></td><td><code>{item.sourceColumn}</code></td><td>{term(item.meaning)}</td><td>{term(item.visibility)}</td><td>{item.numericSpec ? `${term(item.numericSpec.defaultAggregation)} · ${term(item.numericSpec.aggregationBehavior)}` : "不适用"}</td></tr>)}</tbody></table></div>
          {property && <section className="property-settings" aria-label="属性配置"><h3>{property.label}</h3><div className="model-form-grid">
            <FormField label="属性业务名称"><input aria-label="属性业务名称" value={property.label} onChange={event => changeProperty({ label: event.target.value })} /></FormField>
            <FormField label="属性编码"><input aria-label="属性编码" value={property.name} onChange={event => changeProperty({ name: event.target.value })} /></FormField>
            <FormField label="物理字段"><select aria-label={`${property.label}物理字段`} value={property.sourceColumn} onChange={event => { const column = source?.columns.find(column => column.name === event.target.value); if (column) changeProperty({ sourceColumn: column.name, dataType: column.dataType }); }}>{!source?.columns.some(column => column.name === property.sourceColumn) && <option value={property.sourceColumn}>{property.sourceColumn}（未匹配）</option>}{source?.columns.map(column => <option key={column.name} value={column.name}>{column.name} · {column.dataType}</option>)}</select></FormField>
            <FormField label="语义类型"><Choices label={`${property.label}语义`} value={property.meaning} values={MEANINGS} onChange={meaning => changeProperty({ meaning: meaning as OntologyProperty["meaning"], valueSearchable: !property.sensitive && property.visibility === "ANALYTICAL" && ["CODE", "NAME", "CATEGORY", "GEOGRAPHY"].includes(meaning), numericSpec: meaning === "NUMBER" ? property.numericSpec ?? { ...numericDefaults } : undefined })} /></FormField>
            <FormField label="可见性"><Choices label={`${property.label}可见性`} value={property.visibility} values={["ANALYTICAL", "DETAIL_ONLY", "HIDDEN"]} onChange={visibility => changeProperty({ visibility: visibility as OntologyProperty["visibility"] })} /></FormField>
            <FormField label="属性同义词"><input aria-label="属性同义词" value={property.synonyms.join("、")} placeholder="用逗号或顿号分隔" onChange={event => changeProperty({ synonyms: splitTerms(event.target.value) })} /></FormField>
            {property.meaning === "ENTITY_REFERENCE" && <FormField label="关联目标对象"><select aria-label={`${property.label}关联目标`} value={ref?.targetObjectId ?? ""} onChange={event => onReference(property, event.target.value)}><option value="">未关联</option>{snapshot.objects.filter(item => item.id !== value.id && item.properties.some(p => p.meaning === "ID")).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></FormField>}
            <fieldset className="model-checks wide"><legend>约束</legend>
              <label><input type="checkbox" aria-label={`${property.label}唯一`} checked={property.unique} onChange={event => changeProperty({ unique: event.target.checked })} />值唯一</label>
              <label><input type="checkbox" aria-label={`${property.label}敏感`} checked={property.sensitive} onChange={event => changeProperty(event.target.checked ? { sensitive: true, visibility: "HIDDEN", valueSearchable: false, exportable: false, defaultDisplay: false } : { sensitive: false })} />敏感属性</label>
            </fieldset>
            {property.meaning === "NUMBER" && property.numericSpec && <fieldset className="numeric-settings wide"><legend>聚合语义</legend><div className="model-form-grid">
              <FormField label="数字类型"><Choices label={`${property.label}数字类型`} value={property.numericSpec.kind} values={["GENERAL", "CURRENCY", "RATIO"]} onChange={kind => changeProperty({ numericSpec: { ...property.numericSpec!, kind: kind as "GENERAL" | "CURRENCY" | "RATIO", ...(kind === "CURRENCY" ? { currency: property.numericSpec!.currency || "CNY", aggregationBehavior: "ADDITIVE", defaultAggregation: "SUM" } : kind === "RATIO" ? { aggregationBehavior: "NON_ADDITIVE", defaultAggregation: "NONE" } : {}) } })} /></FormField>
              <FormField label="聚合性质"><Choices label={`${property.label}聚合性质`} value={property.numericSpec.aggregationBehavior} values={property.numericSpec.kind === "RATIO" ? ["NON_ADDITIVE"] : ["ADDITIVE", "SEMI_ADDITIVE", "NON_ADDITIVE"]} onChange={behavior => changeProperty({ numericSpec: { ...property.numericSpec!, aggregationBehavior: behavior as "ADDITIVE" | "SEMI_ADDITIVE" | "NON_ADDITIVE", ...(behavior === "NON_ADDITIVE" && property.numericSpec!.defaultAggregation === "SUM" ? { defaultAggregation: "NONE" } : {}) } })} /></FormField>
              <FormField label="默认聚合"><Choices label={`${property.label}默认聚合`} value={property.numericSpec.defaultAggregation} values={property.numericSpec.kind === "RATIO" || property.numericSpec.aggregationBehavior === "NON_ADDITIVE" ? ["NONE", "AVG", "MIN", "MAX"] : ["NONE", "SUM", "AVG", "MIN", "MAX"]} onChange={aggregation => changeProperty({ numericSpec: { ...property.numericSpec!, defaultAggregation: aggregation as "NONE" | "SUM" | "AVG" | "MIN" | "MAX" } })} /></FormField>
              <FormField label="单位或币种"><input aria-label={`${property.label}单位或币种`} value={property.numericSpec.kind === "CURRENCY" ? property.numericSpec.currency ?? "" : property.numericSpec.unit ?? ""} placeholder={property.numericSpec.kind === "CURRENCY" ? "例如：CNY" : "例如：件、千克"} onChange={event => changeProperty({ numericSpec: { ...property.numericSpec!, ...(property.numericSpec!.kind === "CURRENCY" ? { currency: event.target.value } : { unit: event.target.value }) } })} /></FormField>
            </div><p className="model-help">比例默认不聚合；跨粒度重算应通过分子、分母指标定义。半可加数值需明确时间口径。</p></fieldset>}
            <FormField label="属性口径说明" wide><textarea aria-label="属性口径说明" rows={2} value={property.description} onChange={event => changeProperty({ description: event.target.value })} /></FormField>
            <details className="model-advanced wide"><summary>高级语义与访问设置</summary><div className="model-form-grid">
              <label className="model-field"><span>匹配优先级来源</span><select aria-label="属性优先级来源" value={(property.inheritBindingPriority ?? property.bindingPriority === 50) ? "inherit" : "override"} onChange={event => changeProperty({ inheritBindingPriority: event.target.value === "inherit" })}><option value="inherit">继承对象优先级</option><option value="override">单独配置</option></select></label>
              <FormField label="语义匹配优先级"><input disabled={property.inheritBindingPriority ?? property.bindingPriority === 50} aria-label="属性匹配优先级" type="number" min={0} max={100} value={property.bindingPriority} onChange={event => changeProperty({ bindingPriority: Number(event.target.value) })} /></FormField>
              <div className="model-checks"><label><input aria-label="允许值检索" type="checkbox" disabled={property.sensitive || property.visibility !== "ANALYTICAL"} checked={property.valueSearchable} onChange={event => changeProperty({ valueSearchable: event.target.checked })} />允许值检索</label><label><input aria-label="允许导出" type="checkbox" disabled={property.sensitive} checked={property.exportable} onChange={event => changeProperty({ exportable: event.target.checked })} />允许导出</label></div>
            </div></details>
          </div></section>}
        </>}
        {tab === "relations" && <><RelationEditor snapshot={snapshot} objectId={value.id} busy={busy} onChange={onRelationChange} onRemove={onRelationRemove} />{advancedRelations}</>}
        {tab === "rules" && <><p className="model-help">公理由对象类型和属性定义自动生成；以下内容随当前编辑即时变化。</p><div className="model-rule-list">{axioms.map(axiom => <div key={axiom.id}><strong>{axiomTitle(axiom.axiomCode)}</strong><p>{axiomDescription(axiom.axiomCode)}</p><small>{value.properties.find(item => item.id === axiom.subjectId)?.label ?? value.label} · {term(axiom.enforcement)}</small></div>)}</div></>}
      </div>
    </> : <div className="model-editor-body">
      <dl className="object-summary-strip"><div><dt>对象类型</dt><dd>{term(value.objectType)}</dd></div><div><dt>业务分类</dt><dd>{value.category || "未设置"}</dd></div><div><dt>来源表</dt><dd title={source ? `${source.database}.${source.name}` : value.sourceTableId}>{source ? `${source.database}.${source.name}` : value.sourceTableId}</dd></div><div><dt>行级粒度</dt><dd title={grain}>{grain}</dd></div></dl>
      <details className="model-advanced"><summary>高级信息</summary><FormField label="对象编码"><input aria-label="对象编码" readOnly value={value.name} /></FormField></details>
      {value.description && <p className="object-description">{value.description}</p>}
      <h3>属性 <span>{value.properties.length}</span></h3><div className="model-table-wrap"><table className="model-table"><thead><tr><th>业务名称</th><th>物理字段</th><th>字段含义</th><th>约束与聚合</th><th>可见性</th></tr></thead><tbody>{value.properties.map(item => <tr key={item.id}><td><strong>{item.label}</strong><small>{item.name}</small></td><td>{item.sourceColumn}</td><td>{term(item.meaning)}<small>{item.dataType}</small></td><td>{value.grainPropertyIds.includes(item.id) ? <span className="model-chip">构成行级粒度</span> : null}{item.numericSpec ? <small>{term(item.numericSpec.defaultAggregation)} · {term(item.numericSpec.aggregationBehavior)}</small> : !value.grainPropertyIds.includes(item.id) ? "无额外约束" : null}</td><td>{term(item.visibility)}</td></tr>)}</tbody></table></div>
      <div className="object-summary-related"><section><h3>指标 <span>{metrics.length}</span></h3>{metrics.map(metric => <p key={metric.id}>{metric.label} <small>{term(metric.aggregation)}</small></p>)}</section><section><h3>关系 <span>{relations.length}</span></h3>{relations.map(relation => <p key={relation.id}>{relation.name} <small>{RELATION_LABELS[relation.type]} · {term(relation.cardinality)} · {term(relation.direction)}{!relation.enabled ? " · 已停用" : ""}</small></p>)}</section></div>
    </div>}
  </div>;
}
