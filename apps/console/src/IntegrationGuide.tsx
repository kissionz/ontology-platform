import { QUERY_REQUEST_EXAMPLES } from "../../../packages/contracts/src/api-docs.js";
import { useState } from "react";
import { MCP_CONFIG, MCP_EXAMPLES, MCP_NOTES, SDK_METHODS, SDK_NOTES, SDK_PY_EXAMPLE, SDK_TS_EXAMPLE } from "../../../packages/contracts/src/integration-docs.js";
import { MCP_TOOLS, MCP_TOOL_DOCS } from "../../../packages/mcp-server/src/index.js";

function Example({ title, value }: { title: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <section className="guide-example"><div className="source-actions"><h3>{title}</h3><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); } }}>{copied ? "已复制" : "复制示例"}</button></div><pre>{value}</pre></section>;
}

export function IntegrationGuide({ kind }: { kind: "mcp" | "sdk" }) {

  return <section className="panel integration-guide" aria-label={kind === "mcp" ? "MCP 接入文档" : "SDK 接入文档"}>
    <header className="guide-header"><h2>{kind === "mcp" ? "MCP 接入说明" : "SDK 接入说明"}</h2><p>{kind === "mcp" ? "通过 stdio 将本体、语义查询和公理证据提供给 Agent。" : "通过 TypeScript 或 Python 接入平台，共用 REST 契约与权限。"}</p></header>
    <div className="guide-body">
      <h3>接入步骤与约定</h3><ol>{(kind === "mcp" ? MCP_NOTES : SDK_NOTES).map(note => <li key={note}>{note}</li>)}</ol>
      <details><summary>明细查询参数示例</summary><Example title="按业务名称请求跨对象明细" value={JSON.stringify(QUERY_REQUEST_EXAMPLES["明细：跨对象全部字段"], null, 2)} /></details>
      {kind === "mcp" ? <>
        <Example title="MCP 客户端配置" value={JSON.stringify(MCP_CONFIG, null, 2)} />
        <h3>工具说明（{MCP_TOOLS.length} 个）</h3>
        {MCP_TOOLS.map(tool => {
          const docs = MCP_TOOL_DOCS[tool.name]!;
          const schema = tool.inputSchema as any;
          return <details className="tool-reference" key={tool.name}><summary><code>{tool.name}</code><span>{docs.summary}</span></summary><p>{tool.description}</p><div className="model-table-wrap"><table className="model-table"><thead><tr><th>参数</th><th>必填</th><th>说明</th></tr></thead><tbody>{Object.keys(schema.properties ?? {}).map(name => <tr key={name}><td><code>{name}</code></td><td>{schema.required?.includes(name) ? "是" : "否"}</td><td>{docs.fields[name] ?? "详见输入结构。"}</td></tr>)}</tbody></table></div><p><strong>返回：</strong>{tool.name === "ExecuteSemanticQuery" || tool.name === "ContinueSemanticQuery" ? docs.returns : docs.returns.replace(/^data /, "工具结果 ")}</p><Example title="工具调用参数" value={JSON.stringify(MCP_EXAMPLES[tool.name], null, 2)} /><details><summary>完整输入结构</summary><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details></details>;
        })}
      </> : <>
        <h3>公共方法</h3><div className="model-table-wrap"><table className="model-table"><thead><tr><th>TypeScript</th><th>Python</th><th>用途与参数</th></tr></thead><tbody>{SDK_METHODS.map(([ts, py, description]) => <tr key={ts}><td><code>{ts}</code></td><td><code>{py}</code></td><td>{description}</td></tr>)}</tbody></table></div>
        <Example title="TypeScript 调用示例" value={SDK_TS_EXAMPLE} /><Example title="Python 调用示例" value={SDK_PY_EXAMPLE} />
      </>}
    </div>
  </section>;
}
