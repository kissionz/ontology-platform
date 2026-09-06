export const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  "ontology:read": { label: "读取本体", description: "查看已发布的对象、指标、关系与版本。" },
  "ontology:draft": { label: "管理草稿", description: "创建、修改、校验及放弃本体草稿。" },
  "ontology:publish": { label: "发布本体", description: "将通过校验的草稿发布为新版本。" },
  "semantic:read": { label: "检索业务语义", description: "检索对象、属性、指标及可用属性值。" },
  "semantic:plan": { label: "构建查询计划", description: "根据语义规则生成查询计划与 SQL。" },
  "data:execute": { label: "执行数据查询", description: "执行查询并返回业务数据。" },
  "system:admin": { label: "系统管理", description: "管理数据源和客户端密钥，查看调用审计。" },
};
export const scopeLabel = (scope: string) => SCOPE_LABELS[scope]?.label ?? scope;
export function auditEventLabel(event: string, document?: any): string {
  if (event === "ValueIndexFailed") return "属性值索引构建失败";
  if (event === "HttpRequestCompleted") return "HTTP 请求完成";
  for (const [path, methods] of Object.entries(document?.paths ?? {})) {
    const route = `/v1${path}`.replace(/\{([^}]+)\}/g, ":$1");
    for (const [method, operation] of Object.entries(methods as object)) if (`${method.toUpperCase()} ${route}` === event) return (operation as any).summary ?? event;
  }
  return event;
}
