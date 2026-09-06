import type { Metric, OntologyObject, PhysicalTable } from "../../../packages/contracts/src/index.js";
import { effectiveMetrics, propertyMetric } from "../../../packages/domain/src/property-metrics.js";
import { term } from "./axiom-copy.js";

export function newMetric(object: OntologyObject, propertyId?: string): Metric {
  const property = object.properties.find(p => (!propertyId || p.id === propertyId) && propertyMetric(object, p));
  const defaults = property && propertyMetric(object, property);
  const id = `metric_${crypto.randomUUID()}`;
  return defaults ? { ...defaults, description: "", id, name: id.replaceAll("-", ""), label: `${property!.label}指标`, status: "DRAFT" } : {
    id, name: id.replaceAll("-", ""), label: `${object.label}数量`, description: "对象记录数", metricType: "BASE", objectId: object.id,
    definitionMode: "VISUAL", expression: "COUNT(*)", aggregation: "COUNT", format: "number", synonyms: [], status: "DRAFT",
  };
}

export function metricExpression(metric: Metric, object?: OntologyObject) {
  if (metric.metricType === "DERIVED") {
    const right = metric.rightMetricId ?? "";
    const denominator = ["DIVIDE", "RATIO"].includes(metric.calculationOperator ?? "") ? `NULLIF(${right}, 0)` : right;
    return `(${metric.leftMetricId ?? ""} ${{ ADD: "+", SUBTRACT: "-", MULTIPLY: "*", DIVIDE: "/", RATIO: "/" }[metric.calculationOperator ?? "ADD"]} ${denominator})${metric.scale && metric.scale !== 1 ? ` × ${metric.scale}` : ""}`;
  }
  if (metric.aggregation === "COUNT") return "COUNT(*)";
  const property = object?.properties.find(p => p.id === metric.sourcePropertyId);
  const column = property ? `${object!.name}.${property.name}` : "";
  return column ? metric.aggregation === "COUNT_DISTINCT" ? `COUNT(DISTINCT ${column})` : `${metric.aggregation}(${column})` : "";
}

export function MetricEditor({ json, objects, metrics, tables, editing, busy, onChange, onSave }: {
  json: string; objects: OntologyObject[]; metrics: Metric[]; tables: PhysicalTable[]; editing: boolean; busy: boolean; onChange: (json: string) => void; onSave: () => void;
}) {
  let metric: Metric | undefined;
  try { const parsed = JSON.parse(json); if (parsed.id) metric = parsed; } catch { /* 保留临时 JSON 编辑内容。 */ }
  if (!metric) return <p className="model-empty-copy">选择已有指标，或从右侧度量字段构建业务指标。</p>;
  const value = metric;
  const object = objects.find(o => o.id === value.objectId);
  const fields = object?.properties.filter(p => !p.sensitive && p.visibility === "ANALYTICAL") ?? [];
  const operands = effectiveMetrics({ objects, metrics }).filter(m => m.objectId === value.objectId && m.id !== value.id);
  const change = (patch: Partial<Metric>) => {
    const next = { ...value, ...patch };
    if (next.definitionMode === "VISUAL") next.expression = metricExpression(next, objects.find(o => o.id === next.objectId));
    onChange(JSON.stringify(next, null, 2));
  };
  const sqlColumn = (id: string) => {
    const property = fields.find(p => p.id === id);
    const table = tables.find(t => t.id === object?.sourceTableId);
    const quote = (name: string) => "`" + name.replaceAll("`", "``") + "`";
    return property && table ? `${quote(table.name)}.${quote(property.sourceColumn)}` : "";
  };
  const source = (id: string) => {
    const p = fields.find(p => p.id === id);
    const defaults = object && p && propertyMetric(object, p);
    change({ sourcePropertyId: id || undefined, ...(value.definitionMode === "SQL" ? { expression: sqlColumn(id) ? `SUM(${sqlColumn(id)})` : "" } : {}), ...(defaults ? { aggregation: value.definitionMode === "SQL" ? "CUSTOM" : defaults.aggregation, format: defaults.format, unit: defaults.unit } : {}) });
  };
  const mode = value.metricType === "DERIVED" ? "DERIVED" : value.definitionMode;
  const select = (label: string, current: string, options: Array<[string, string]>, update: (value: string) => void) => <label className="model-field"><span>{label}</span><select aria-label={label} disabled={!editing} value={current} onChange={e => update(e.target.value)}><option value="">请选择</option>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>;
  return <div className="model-editor-body">
    <p className="model-help">选择对象属性即可构建基础指标。度量字段也可直接使用属性编码查询，默认聚合与单位随属性定义生效。</p>
    <div className="model-form-grid">
      <label className="model-field"><span>定义名称</span><input aria-label="定义名称" readOnly={!editing} value={value.label} onChange={e => change({ label: e.target.value })} /></label>
      {select("指标所属对象", value.objectId, objects.map(o => [o.id, o.label]), id => {
        const nextObject = objects.find(o => o.id === id);
        if (nextObject) { const defaults = newMetric(nextObject); change({ objectId: id, metricType: "BASE", definitionMode: "VISUAL", sourcePropertyId: defaults.sourcePropertyId, aggregation: defaults.aggregation, format: defaults.format, unit: defaults.unit, timePropertyId: nextObject.defaultTimePropertyId, leftMetricId: undefined, rightMetricId: undefined, calculationOperator: undefined, scale: undefined, filterExpression: undefined }); }
      })}
      {select("配置方式", mode, [["VISUAL", "引用对象属性"], ["DERIVED", "组合指标 / 度量字段"], ["SQL", "高级 SQL 模板"]], next => change(next === "DERIVED" ? { metricType: "DERIVED", definitionMode: "VISUAL", aggregation: "CUSTOM", leftMetricId: operands[0]?.id, rightMetricId: operands[1]?.id ?? operands[0]?.id, calculationOperator: "SUBTRACT", sourcePropertyId: undefined, filterExpression: undefined } : { metricType: "BASE", definitionMode: next as "SQL" | "VISUAL", aggregation: next === "SQL" ? "CUSTOM" : "SUM", leftMetricId: undefined, rightMetricId: undefined, calculationOperator: undefined, scale: undefined, sourcePropertyId: fields.find(p => p.meaning === "NUMBER")?.id, filterExpression: undefined, ...(next === "SQL" ? { expression: sqlColumn(fields.find(p => p.meaning === "NUMBER")?.id ?? "") ? `SUM(${sqlColumn(fields.find(p => p.meaning === "NUMBER")!.id)})` : "" } : {}) }))}
      {mode !== "DERIVED" && select("计算字段", value.sourcePropertyId ?? "", fields.map(p => [p.id, `${p.label} · ${term(p.meaning)}`]), source)}
      {mode === "VISUAL" && select("指标聚合方式", value.aggregation, ["SUM", "AVG", "MIN", "MAX", "COUNT", "COUNT_DISTINCT"].map(a => [a, term(a)]), aggregation => change({ aggregation: aggregation as Metric["aggregation"] }))}
      {mode === "DERIVED" && <>
        {select("左侧指标或度量", value.leftMetricId ?? "", operands.map(m => [m.id, `${m.label}${m.id === m.sourcePropertyId ? "（对象度量）" : "（指标）"}`]), id => change({ leftMetricId: id }))}
        {select("计算模板", value.calculationOperator ?? "", [["SUBTRACT", "差额：左侧 − 右侧"], ["ADD", "合计：左侧 + 右侧"], ["MULTIPLY", "乘积：左侧 × 右侧"], ["DIVIDE", "比值：左侧 ÷ 右侧"], ["RATIO", "占比：左侧 ÷ 右侧 × 100"]], operator => change({ calculationOperator: operator as Metric["calculationOperator"], scale: operator === "RATIO" ? 100 : 1, format: operator === "RATIO" ? "percent" : "number" }))}
        {select("右侧指标或度量", value.rightMetricId ?? "", operands.map(m => [m.id, `${m.label}${m.id === m.sourcePropertyId ? "（对象度量）" : "（指标）"}`]), id => change({ rightMetricId: id }))}
        <p className="model-help wide">先按各自口径聚合，再进行组合运算；除法由执行器处理零分母。依赖须来自同一对象。</p>
      </>}
      {select("指标显示格式", value.format, [["number", "数值"], ["currency", "金额"], ["percent", "百分比"]], format => change({ format: format as Metric["format"] }))}
      {mode === "SQL" && <label className="model-field wide"><span>SQL 配置模板</span><select aria-label="SQL 配置模板" disabled={!editing || !sqlColumn(value.sourcePropertyId ?? "")} value="" onChange={e => {
        const p = fields.find(p => p.id === value.sourcePropertyId); if (!p || !object) return;
        const column = sqlColumn(p.id); if (!column) return;
        const templates: Record<string, string> = { sum: `SUM(${column})`, average: `AVG(${column})`, distinct: `COUNT(DISTINCT ${column})`, positive: `SUM(CASE WHEN ${column} > 0 THEN ${column} ELSE 0 END)` };
        change({ expression: templates[e.target.value], aggregation: "CUSTOM" });
      }}><option value="">选择模板自动填入表达式</option><option value="sum">字段求和</option><option value="average">字段平均值</option><option value="distinct">字段去重计数</option><option value="positive">仅汇总正数</option></select><p className="model-help">先选择计算字段，模板会填入对应字段。复杂业务口径可在模板基础上编辑。</p></label>}
      <label className="model-field wide"><span>{mode === "SQL" ? "计算表达式" : "生成表达式"}</span><textarea aria-label="指标计算表达式" readOnly={!editing || mode !== "SQL"} value={value.expression} onChange={e => change({ expression: e.target.value })} /></label>
      <label className="model-field wide"><span>业务说明</span><textarea aria-label="定义业务说明" readOnly={!editing} value={value.description} onChange={e => change({ description: e.target.value })} /></label>
    </div>
    <details className="model-advanced"><summary>高级信息</summary><label className="model-field"><span>定义编码</span><input aria-label="定义编码" readOnly value={value.name} /></label></details>
    <details className="model-advanced"><summary>高级定义 JSON</summary><p className="model-help">完整指标定义，可配置固定过滤条件、时间属性、同义词与缩放倍数。</p><textarea className="definition-editor" aria-label="指标或层级定义" readOnly={!editing} value={json} onChange={e => onChange(e.target.value)} /></details>
    {editing && <button className="primary-button" disabled={busy} onClick={onSave}>保存定义</button>}
  </div>;
}
