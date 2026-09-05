import { term } from "./axiom-copy.js";

export function CatalogDefinitionEditor({ kind, json, editing, busy, objects, onChange, onSave }: {
  kind: "metrics" | "dimensionHierarchies"; json: string; editing: boolean; busy: boolean;
  objects: Array<{ id: string; label: string }>; onChange: (json: string) => void; onSave: () => void;
}) {
  let value: Record<string, any> | undefined;
  try { const parsed = JSON.parse(json); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed; } catch { /* Advanced JSON may be temporarily incomplete while editing. */ }
  const change = (key: string, next: string) => onChange(JSON.stringify({ ...value, [key]: next }, null, 2));
  const input = (key: string, label: string, options?: string[]) => <label className="model-field"><span>{label}</span>{options ? <select aria-label={label} disabled={!editing} value={value?.[key] ?? ""} onChange={event => change(key, event.target.value)}>{!value?.[key] && <option value="">请选择</option>}{options.map(option => <option key={option} value={option}>{term(option)}</option>)}</select> : <input aria-label={label} readOnly={!editing} value={value?.[key] ?? ""} onChange={event => change(key, event.target.value)} />}</label>;
  return <div className="model-editor-body">
    {value && <div className="model-form-grid">
      {input("label", "定义名称")}{input("name", "定义编码")}
      {kind === "metrics" ? <>
        {input("metricType", "指标类型", ["BASE", "DERIVED"])}
        <label className="model-field"><span>所属对象</span><select aria-label="指标所属对象" value={value.objectId ?? ""} disabled={!editing} onChange={event => change("objectId", event.target.value)}><option value="">请选择对象</option>{objects.map(object => <option key={object.id} value={object.id}>{object.label}</option>)}</select></label>
        {input("aggregation", "指标聚合方式", ["SUM", "COUNT", "COUNT_DISTINCT", "AVG", "MIN", "MAX", "CUSTOM"])}
        <label className="model-field"><span>显示格式</span><select aria-label="指标显示格式" disabled={!editing} value={value.format ?? "number"} onChange={event => change("format", event.target.value)}><option value="number">数值</option><option value="currency">金额</option><option value="percent">百分比</option></select></label>
        <label className="model-field wide"><span>计算表达式</span><textarea aria-label="指标计算表达式" readOnly={!editing} value={value.expression ?? ""} onChange={event => change("expression", event.target.value)} /></label>
      </> : input("kind", "层级类型", ["FIXED_LEVELS", "ADJACENCY_LIST"])}
      <label className="model-field wide"><span>业务说明</span><textarea aria-label="定义业务说明" readOnly={!editing} value={value.description ?? ""} onChange={event => change("description", event.target.value)} /></label>
    </div>}
    <details className="model-advanced"><summary>高级定义 JSON</summary><p className="model-help">配置指标依赖、层级字段等完整定义，接口编码保持原值。</p><textarea className="definition-editor" aria-label="指标或层级定义" readOnly={!editing} value={json} onChange={event => onChange(event.target.value)} /></details>
    {editing && <button className="primary-button" disabled={busy} onClick={onSave}>保存定义</button>}
  </div>;
}
