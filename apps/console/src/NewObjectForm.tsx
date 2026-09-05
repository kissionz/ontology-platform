import { useState } from "react";
import type { OntologyObject, PhysicalTable } from "../../../packages/contracts/src/index.js";

export function NewObjectForm({ tables, busy, onCreate, onRefresh, onCancel }: {
  tables: PhysicalTable[];
  busy: boolean;
  onCreate: (object: OntologyObject) => Promise<void>;
  onRefresh: () => void;
  onCancel?: () => void;
}) {
  const [tableId, setTableId] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [identity, setIdentity] = useState("");
  const table = tables.find(item => item.id === tableId);
  return <form className="detail-content new-object-form" onSubmit={async event => {
    event.preventDefault();
    if (!table || !identity || busy) return;
    const properties: OntologyObject["properties"] = table.columns.map(column => {
      const isIdentity = column.name === identity;
      const meaning = isIdentity ? "ID" : /^(tinyint|smallint|int|bigint|largeint|float|double|decimal|numeric)/i.test(column.dataType) ? "NUMBER" : /^(date|datetime|timestamp)/i.test(column.dataType) ? "TIME" : /^(bool|boolean)/i.test(column.dataType) ? "BOOLEAN" : "TEXT";
      return {
        id: `p_${crypto.randomUUID()}`, name: column.name, label: column.comment || column.name, description: "",
        dataType: column.dataType, sourceColumn: column.name, sensitive: column.sensitive, meaning,
        unique: isIdentity, valueSearchable: false, visibility: column.sensitive ? "HIDDEN" as const : "ANALYTICAL" as const,
        synonyms: [], defaultDisplay: !column.sensitive, exportable: !column.sensitive, bindingPriority: 50,
        ...(meaning === "NUMBER" ? { numericSpec: { kind: "GENERAL" as const, defaultAggregation: "NONE" as const, aggregationBehavior: "NON_ADDITIVE" as const } } : {}),
      };
    });
    await onCreate({ id: `o_${crypto.randomUUID()}`, name: name.trim(), label: label.trim(), description: "", sourceTableId: table.id,
      status: "DRAFT", objectType: "ENTITY", grainPropertyIds: [properties.find(property => property.sourceColumn === identity)!.id],
      grain: `每个 ${identity} 一条记录`, properties, synonyms: [], exampleQuestions: [], bindingPriority: 50 });
  }}>
    <h2>从物理表添加对象</h2>
    <p>选择已扫描的表，确认业务名称和唯一标识。字段会成为对象属性，可继续编辑语义。</p>
    {!tables.length ? <p>请先在<a href="?page=data">数据源</a>中保存连接并扫描表字段，再刷新列表。</p> : null}
    <div className="definition-grid">
      <label className="definition-field editable-field"><span>来源表</span><select aria-label="新对象来源表" required value={tableId} disabled={busy} onChange={event => { setTableId(event.target.value); setIdentity(""); const selected = tables.find(item => item.id === event.target.value); setName(selected?.name ?? ""); setLabel(selected?.name ?? ""); }}><option value="">请选择已扫描的表</option>{tables.map(item => <option key={item.id} value={item.id}>{item.database}.{item.name}</option>)}</select></label>
      <label className="definition-field editable-field"><span>机器标识</span><input aria-label="新对象机器标识" required value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <label className="definition-field editable-field"><span>业务名称</span><input aria-label="新对象业务名称" required value={label} disabled={busy} onChange={event => setLabel(event.target.value)} /></label>
      <label className="definition-field editable-field"><span>唯一标识字段（需确认值唯一）</span><select aria-label="新对象唯一标识字段" required value={identity} disabled={busy} onChange={event => setIdentity(event.target.value)}><option value="">请选择唯一标识</option>{table?.columns.filter(column => !column.sensitive).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
    </div>
    <div className="source-actions">
      <button className="primary-button" disabled={busy || !table || !identity || !name.trim() || !label.trim()} type="submit">创建对象</button>
      <button className="secondary-button" disabled={busy} type="button" onClick={onRefresh}>刷新已扫描表</button>
      {onCancel && <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>取消添加</button>}
    </div>
  </form>;
}
