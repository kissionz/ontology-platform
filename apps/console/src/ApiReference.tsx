export function schemaFor(document: any, schema: any): any {
  if (!schema?.$ref) return schema;
  return schema.$ref.slice(2).split("/").reduce((value: any, key: string) => value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], document);
}

export function ApiReference({ document, operation, onExample }: { document: any; operation: any; onExample: (value: unknown) => void }) {
  if (!operation) return <p className="model-help">接口说明加载中…</p>;
  const content = operation.requestBody?.content?.["application/json"];
  const schema = schemaFor(document, content?.schema);
  const fields = [
    ...(operation.parameters ?? []).map((p: any) => ({ ...p, location: ({ path: "路径", query: "查询", header: "请求头" } as Record<string, string>)[p.in] ?? p.in })),
    ...Object.entries(schema?.properties ?? {}).map(([name, value]) => ({ name, location: "请求体", required: schema.required?.includes(name), schema: value, description: (value as any).description })),
  ];
  const typeName = (schema: any): string => schema?.type ?? (schema?.anyOf ? schema.anyOf.map((item: any) => item.const ?? item.type ?? "对象").join(" / ") : schema?.$ref ? "对象" : "见结构定义");
  return <section className="api-reference" aria-label="当前 API 说明">
    <h3>{operation.summary}</h3><p>{operation.description}</p>
    <p className="api-permissions">所需权限：{operation["x-required-scopes"]}</p>
    <details><summary>参数说明{fields.length ? `（${fields.length}）` : ""}</summary>
      {fields.length ? <div className="model-table-wrap"><table className="model-table"><thead><tr><th>参数</th><th>位置 / 必填</th><th>说明</th></tr></thead><tbody>{fields.map((field: any) => <tr key={`${field.location}:${field.name}`}><td><code>{field.name}</code><small>{typeName(field.schema)}</small></td><td>{field.location}<small>{field.required ? "必填" : "可选"}</small></td><td>{field.description ?? "结构详见下方请求定义。"}{field.schema?.default !== undefined && <small>默认值：{String(field.schema.default)}</small>}</td></tr>)}</tbody></table></div> : <p>无需路径参数、查询参数或请求体。</p>}
      {!content && <p>此接口不需要请求体。</p>}
    </details>
    <details><summary>返回内容与状态</summary>{Object.entries(operation.responses ?? {}).map(([code, response]) => <p key={code}><strong>{code === "default" ? "其他状态" : `HTTP ${code}`}：</strong>{(response as any).description}</p>)}<p>除健康检查和 OpenAPI 文档外，成功数据位于 data；requestId 和 auditId 用于追踪，completeness 表示完整性与分页。语义查询还需检查业务 status。</p></details>
    {content && <details><summary>请求示例与完整结构</summary><p>示例中的命名空间、版本和定义 ID 请替换为实际值。</p>{content.example !== undefined && <><button type="button" className="secondary-button" onClick={() => onExample(content.example)}>填入请求示例</button><pre>{JSON.stringify(content.example, null, 2)}</pre></>}<h4>请求结构</h4><pre>{JSON.stringify(schema, null, 2)}</pre></details>}
  </section>;
}
