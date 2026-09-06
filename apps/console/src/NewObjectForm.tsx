import { useState } from "react";
import type { OntologyObject, PhysicalTable } from "../../../packages/contracts/src/index.js";
import { term } from "./axiom-copy.js";
import { OBJECT_TYPES, TYPE_HELP } from "./modeling.js";

export function NewObjectForm({ tables, busy, onCreate, onRefresh, onCancel, initialTableId = "" }: {
  tables: PhysicalTable[];
  busy: boolean;
  onCreate: (object: OntologyObject) => Promise<void>;
  onRefresh: () => void;
  onCancel?: () => void;
  initialTableId?: string;
}) {
  const initial = tables.find(table => table.id === initialTableId);
  const [tableId, setTableId] = useState(initialTableId);
  const [name] = useState(() => `object_${crypto.randomUUID().replaceAll("-", "")}`);
  const [label, setLabel] = useState(initial?.description || initial?.name || "");
  const [identity, setIdentity] = useState("");
  const [objectType, setObjectType] = useState<OntologyObject["objectType"]>("ENTITY");
  const [grain, setGrain] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const table = tables.find(item => item.id === tableId);
  const grainColumns = identity ? [...new Set([identity, ...grain])] : grain;
  const valid = Boolean(table && name.trim() && label.trim() && (objectType === "ENTITY" ? identity : grainColumns.length) && (objectType !== "RELATIONSHIP" || references.filter(column => column !== identity).length >= 2));
  return <form className="detail-content new-object-form" onSubmit={async event => {
    event.preventDefault();
    if (!table || !valid || busy) return;
    const properties: OntologyObject["properties"] = table.columns.map(column => {
      const isIdentity = column.name === identity;
      const meaning = isIdentity ? "ID" : references.includes(column.name) ? "ENTITY_REFERENCE" : /^(tinyint|smallint|int|bigint|largeint|float|double|decimal|numeric)/i.test(column.dataType) ? "NUMBER" : /^(date|datetime|timestamp)/i.test(column.dataType) ? "TIME" : /^(bool|boolean)/i.test(column.dataType) ? "BOOLEAN" : "TEXT";
      return {
        id: `p_${crypto.randomUUID()}`, name: column.name, label: column.comment || column.name, description: "",
        dataType: column.dataType, sourceColumn: column.name, sensitive: column.sensitive, meaning,
        unique: isIdentity, valueSearchable: false, visibility: column.sensitive ? "HIDDEN" as const : "ANALYTICAL" as const,
        synonyms: [], defaultDisplay: !column.sensitive, exportable: !column.sensitive, bindingPriority: 50,
        ...(meaning === "NUMBER" ? { numericSpec: { kind: "GENERAL" as const, defaultAggregation: "NONE" as const, aggregationBehavior: "NON_ADDITIVE" as const } } : {}),
      };
    });
    await onCreate({ id: `o_${crypto.randomUUID()}`, name: name.trim(), label: label.trim(), description: table.description ?? "", sourceTableId: table.id,
      status: "DRAFT", objectType, grainPropertyIds: properties.filter(property => grainColumns.includes(property.sourceColumn)).map(property => property.id),
      grain: `一行由 ${grainColumns.join(" × ")} 确定`, properties, synonyms: [], exampleQuestions: [], bindingPriority: 50 });
  }}>
    <h2>从物理表添加对象</h2>
    <p>选择来源表与对象类型，确认业务名称及每行代表的业务含义。</p>
    {!tables.length ? <p>请先在<a href="?page=data">数据源</a>中保存连接并扫描表字段，再刷新列表。</p> : null}
    <div className="definition-grid">
      <label className="definition-field editable-field"><span>来源表</span><select aria-label="新对象来源表" required value={tableId} disabled={busy} onChange={event => { setTableId(event.target.value); setIdentity(""); setGrain([]); setReferences([]); const selected = tables.find(item => item.id === event.target.value); setLabel(selected?.description || selected?.name || ""); }}><option value="">请选择已扫描的表</option>{tables.map(item => <option key={item.id} value={item.id}>{item.database}.{item.name}</option>)}</select></label>
      <label className="definition-field editable-field"><span>对象类型</span><select aria-label="新对象类型" value={objectType} disabled={busy} onChange={event => setObjectType(event.target.value as OntologyObject["objectType"])}>{OBJECT_TYPES.map(type => <option value={type} key={type}>{term(type)}</option>)}</select></label>
      <label className="definition-field editable-field"><span>业务名称</span><input aria-label="新对象业务名称" required value={label} disabled={busy} onChange={event => setLabel(event.target.value)} /></label>
      <label className="definition-field editable-field"><span>唯一标识字段{objectType === "ENTITY" ? "（必选，需确认值唯一）" : "（可选）"}</span><select aria-label="新对象唯一标识字段" required={objectType === "ENTITY"} value={identity} disabled={busy} onChange={event => setIdentity(event.target.value)}><option value="">{objectType === "ENTITY" ? "请选择唯一标识" : "不设置独立标识"}</option>{table?.columns.filter(column => !column.sensitive).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
    </div>
    <p className="type-guidance">{TYPE_HELP[objectType]}</p>
    {objectType !== "ENTITY" && <fieldset className="model-checks"><legend>行级粒度字段（共同确定一行）</legend>{table?.columns.filter(column => !column.sensitive).map(column => <label key={column.name}><input type="checkbox" aria-label={`${column.name}构成新对象粒度`} checked={grainColumns.includes(column.name)} disabled={busy || column.name === identity} onChange={event => setGrain(event.target.checked ? [...grain, column.name] : grain.filter(item => item !== column.name))} />{column.name}</label>)}</fieldset>}
    {objectType === "RELATIONSHIP" && <fieldset className="model-checks"><legend>实体引用字段（至少两个）</legend>{table?.columns.filter(column => !column.sensitive && column.name !== identity).map(column => <label key={column.name}><input type="checkbox" aria-label={`${column.name}作为实体引用`} checked={references.includes(column.name)} disabled={busy} onChange={event => setReferences(event.target.checked ? [...references, column.name] : references.filter(item => item !== column.name))} />{column.name}</label>)}</fieldset>}
    <div className="source-actions">
      <button className="primary-button" disabled={busy || !valid} type="submit">创建对象</button>
      <button className="secondary-button" disabled={busy} type="button" onClick={onRefresh}>刷新已扫描表</button>
      {onCancel && <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>取消添加</button>}
    </div>
  </form>;
}
