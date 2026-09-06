export function schemaFor(document: any, schema: any): any {
  if (!schema?.$ref) return schema;
  return schema.$ref.slice(2).split("/").reduce((value: any, key: string) => value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], document);
}

export function ApiReference({ document, operation, onExample }: { document: any; operation: any; onExample: (value: unknown) => void }) {
  if (!operation) return <p className="model-help">接口说明加载中…</p>;
  const content = operation.requestBody?.content?.["application/json"];
  const schema = schemaFor(document, content?.schema);
  const nestedFields = (node: any, prefix = "", depth = 0): any[] => {
    if (depth > 4) return [];
    const resolved = schemaFor(document, node);
    return Object.entries(resolved?.properties ?? {}).flatMap(([key, raw]) => {
      const value = schemaFor(document, raw);
      const name = prefix ? `${prefix}.${key}` : key;
      return [{name,location:"请求体",required:resolved.required?.includes(key),schema:value,description:value?.description}, ...nestedFields(value?.items ?? value,name + (value?.items ? "[]" : ""),depth+1)];
    });
  };
  const responseFields = (title: string, values: any[]) => <details open={title === "业务响应字段"}><summary>{title}</summary><div className="model-table-wrap"><table className="model-table"><thead><tr><th>字段路径</th><th>类型 / 出现条件</th><th>含义与使用方式</th></tr></thead><tbody>{values.map((f:any)=><tr key={f.path}><td><code>{f.path}</code></td><td>{f.type}</td><td>{f.description}</td></tr>)}</tbody></table></div></details>;
  const fields = [
    ...(operation.parameters ?? []).map((p: any) => ({ ...p, location: ({ path: "路径", query: "查询", header: "请求头" } as Record<string, string>)[p.in] ?? p.in })),
    ...nestedFields(schema),
  ];
  const typeName = (schema: any): string => schema?.type ?? (schema?.anyOf ? schema.anyOf.map((item: any) => item.const ?? item.type ?? "对象").join(" / ") : schema?.$ref ? "对象" : "见结构定义");
  return <section className="api-reference" aria-label="当前 API 说明">
    <h3>{operation.summary}</h3><p>{operation.description}</p>
    <p className="api-permissions">所需权限：{operation["x-required-scopes"]}</p>
    <details open><summary>参数说明</summary>
      {fields.length ? <div className="model-table-wrap"><table className="model-table"><thead><tr><th>参数</th><th>位置 / 必填</th><th>说明</th></tr></thead><tbody>{fields.map((field: any) => <tr key={`${field.location}:${field.name}`}><td><code>{field.name}</code><small>{typeName(field.schema)}</small></td><td>{field.location}<small>{field.required ? "必填" : "可选"}</small></td><td>{field.description ?? "取值及约束见下方。"}{field.schema?.enum && <small>可选值：{field.schema.enum.join("、")}</small>}{field.schema?.minimum !== undefined && <small>最小值：{field.schema.minimum}</small>}{field.schema?.maximum !== undefined && <small>最大值：{field.schema.maximum}</small>}{field.schema?.default !== undefined && <small>默认值：{String(field.schema.default)}</small>}</td></tr>)}</tbody></table></div> : <p>无需路径参数、查询参数或请求体。</p>}
      {!content && <p>此接口不需要请求体。</p>}
    </details>
    <details><summary>返回内容与状态</summary>{Object.entries(operation.responses ?? {}).map(([code, response]) => <p key={code}><strong>{code === "default" ? "其他状态" : `HTTP ${code}`}：</strong>{(response as any).description}</p>)}<p>除健康检查和 OpenAPI 文档外，成功数据位于 data；requestId 和 auditId 用于追踪，completeness 表示完整性与分页。语义查询还需检查业务 status。</p></details>
    {operation["x-envelope-fields"]?.length > 0 && responseFields("公共响应信封",operation["x-envelope-fields"])}
    <p>{operation["x-envelope-fields"]?.length ? "下表路径均相对于 data；数组响应使用 [] 表示每个元素。" : "此接口直接返回以下结构，不包裹 data。"}</p>
    {responseFields("业务响应字段",operation["x-response-fields"] ?? [])}
    {operation["x-response-examples"] && <details><summary>响应示例</summary><p>示例数据仅用于说明结构。成功示例为完整信封，其余展示关键状态字段。</p>{Object.entries(operation["x-response-examples"]).map(([name,value])=><div key={name}><h4>{({success:"查询成功",missing:"需要补充信息",clarification:"需要澄清",error:"请求失败"} as Record<string,string>)[name]}</h4><pre>{JSON.stringify(value,null,2)}</pre></div>)}</details>}
    {content && <details><summary>请求示例与完整结构</summary><p>示例中的命名空间、版本和定义 ID 请替换为实际值。</p>{content.example !== undefined && <><button type="button" className="secondary-button" onClick={() => onExample(content.example)}>填入请求示例</button><pre>{JSON.stringify(content.example, null, 2)}</pre></>}<h4>请求结构</h4><pre>{JSON.stringify(schema, null, 2)}</pre></details>}
    {operation["x-request-examples"] && <details><summary>明细查询示例</summary>{Object.entries(operation["x-request-examples"]).map(([title, example]) => <div key={title}><h4>{title}</h4><button className="secondary-button" onClick={() => onExample(example)}>填入：{title}</button><pre>{JSON.stringify(example, null, 2)}</pre></div>)}</details>}
  </section>;
}
