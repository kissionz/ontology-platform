const statuses: Record<string, string> = { MATCHED: "已找到语义候选", PARTIAL_MATCH: "部分术语未命中", NO_MATCH: "未找到匹配的业务定义", AMBIGUOUS: "存在同名候选，需要确认" };
const roles: Record<string, string> = { metrics: "指标", dimensions: "维度", filters: "筛选字段", time: "时间字段", terms: "业务术语" };
const kinds: Record<string, string> = { object: "对象", property: "属性", metric: "指标" };
export function ContextSummary({ context }: { context: any }) {
  return <section className="context-summary" aria-label="语义候选摘要">
    <h3>{statuses[context.retrieval.status] ?? "语义候选"}</h3>
    <p>{context.retrieval.notice}</p>
    <p>版本 {context.ontologyVersion} · {context.candidates.length} 个候选 · {context.objects.length} 个相关对象 · {context.relations.length} 条连接关系</p>
    {context.retrieval.unmatchedTerms.length > 0 && <div><strong>未命中</strong><ul>{context.retrieval.unmatchedTerms.map((item: any, i: number) => <li key={i}>{roles[item.role]}：{item.term}</li>)}</ul><p>请使用业务名称、编码或已配置的同义词再次检索。</p></div>}
    {context.ambiguities.length > 0 && <div><strong>待确认候选</strong><ul>{context.ambiguities.map((item: any, i: number) => <li key={i}>{item.term}：{item.candidates.map((c: any) => `${c.label}（${c.id}）`).join("、")}</li>)}</ul></div>}
    {context.candidates.length > 0 && <table><thead><tr><th>业务定义</th><th>类型</th><th>匹配依据</th></tr></thead><tbody>{context.candidates.map((item: any) => <tr key={`${item.kind}:${item.id}`}><td>{item.label}<small>{item.id}</small></td><td>{kinds[item.kind]}</td><td>{item.reason}：{item.matchedBy}</td></tr>)}</tbody></table>}
    <p>已附带 {context.axioms.length} 条公理、{context.inferences.length} 条推论。可在“语义上下文”和“推论证据”中查看详情，“响应体”保留完整 JSON。</p>
  </section>;
}
