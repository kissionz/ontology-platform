import { useEffect, useState } from "react";
import { auditEventLabel } from "./system-copy.js";

type Filters = { start: string; end: string; clientId: string; event: string };
type AuditResult = { events: Array<{ auditId: string; sequence: number; createdAt: string; event: string; clientName: string; requestId: string; payload: any }>; total: number; overview: { calls: number; failures: number; successRate: number | null; averageDurationMs: number | null }; filters: { clients: Array<{ clientId: string; name: string }>; events: string[] } };
const emptyFilters: Filters = { start: "", end: "", clientId: "", event: "" };
const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
export function AuditPanel({ apiKey, document }: { apiKey: string; document: any }) {
  const [input, setInput] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(0); const [revision, refresh] = useState(0);
  const [data, setData] = useState<AuditResult>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const query = new URLSearchParams({ includeSummary: "true", limit: "50", offset: String(page * 50) });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, key === "start" || key === "end" ? new Date(value).toISOString() : value);
    fetch(`/v1/system/audit-events?${query}`, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "读取审计失败");
      if (!controller.signal.aborted) setData(payload.data);
    }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setData(undefined); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiKey, filters, page, revision]);
  const apply = (next: Filters) => {
    if (next.start && next.end && next.start > next.end) { setError("开始时间不能晚于结束时间"); return; }
    setInput(next); setPage(0); setFilters({ ...next });
  };
  const overview = data?.overview;
  return <section className="panel admin-panel audit-panel" aria-label="调用审计">
    <div className="panel-header"><div><h2>调用审计</h2><p>按时间、密钥和调用事件查看使用情况</p></div><button className="secondary-button" disabled={loading} onClick={() => refresh(value => value + 1)}>刷新记录</button></div>
    <form className="audit-filters" onSubmit={event => { event.preventDefault(); apply(input); }}>
      <label>开始时间<input aria-label="审计开始时间" type="datetime-local" value={input.start} onChange={event => setInput({ ...input, start: event.target.value })} /></label>
      <label>结束时间<input aria-label="审计结束时间" type="datetime-local" value={input.end} onChange={event => setInput({ ...input, end: event.target.value })} /></label>
      <label>密钥名称<select aria-label="审计密钥名称" value={input.clientId} onChange={event => setInput({ ...input, clientId: event.target.value })}><option value="">全部密钥</option>{data?.filters.clients.map(client => <option key={client.clientId} value={client.clientId}>{client.name}</option>)}</select></label>
      <label>调用事件<select aria-label="审计调用事件" value={input.event} onChange={event => setInput({ ...input, event: event.target.value })}><option value="">全部事件</option>{data?.filters.events.map(event => <option key={event} value={event}>{auditEventLabel(event, document)}</option>)}</select></label>
      <button className="primary-button" type="submit" disabled={loading}>查询</button>
      <div className="audit-quick"><span>时间按本地时区显示</span><button type="button" className="text-button" onClick={() => apply({ ...input, start: localTime(new Date(Date.now() - 86_400_000)), end: "" })}>最近24小时</button><button type="button" className="text-button" onClick={() => apply({ ...input, start: localTime(new Date(Date.now() - 7 * 86_400_000)), end: "" })}>最近7天</button><button type="button" className="text-button" onClick={() => apply(emptyFilters)}>重置筛选</button></div>
    </form>
    {error && <p className="model-notice" role="alert">{error}</p>}
    <div aria-busy={loading}>
      <section className="audit-overview" aria-label="调用概览">
        {[['调用次数', overview?.calls ?? '—'], ['HTTP 成功率', overview?.successRate == null ? '—' : `${(overview.successRate * 100).toFixed(1)}%`], ['失败请求', overview?.failures ?? '—'], ['平均耗时', overview?.averageDurationMs == null ? '—' : `${overview.averageDurationMs.toFixed(1)} ms`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <p className="audit-note">{loading ? "正在读取…" : "概览统计筛选范围内全部 HTTP 请求；业务事件不重复计入调用次数。"}</p>
      <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>时间</th><th>密钥名称</th><th>调用事件</th><th>HTTP 状态</th><th>耗时</th><th>详情</th></tr></thead><tbody>{data?.events.map(event => <tr key={`${event.auditId}:${event.sequence}`}><td>{new Date(event.createdAt).toLocaleString("zh-CN", { hour12: false })}</td><td>{event.clientName}</td><td><strong>{auditEventLabel(event.event, document)}</strong><small>{event.payload.method} {event.payload.route}</small></td><td>{event.payload.statusCode ?? "—"}</td><td>{typeof event.payload.durationMs === "number" ? `${event.payload.durationMs.toFixed(1)} ms` : "—"}</td><td><details><summary>查看</summary><p>请求标识：{event.requestId}</p><pre>{JSON.stringify(event.payload, null, 2)}</pre></details></td></tr>)}</tbody></table>{!loading && !error && !data?.events.length && <p className="model-empty-copy">当前条件下没有调用记录</p>}</div>
      <div className="audit-pagination"><span>共 {data?.total ?? 0} 条 · 第 {page + 1} 页</span><button className="secondary-button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>上一页</button><button className="secondary-button" disabled={loading || (page + 1) * 50 >= (data?.total ?? 0)} onClick={() => setPage(value => value + 1)}>下一页</button></div>
    </div>
  </section>;
}
