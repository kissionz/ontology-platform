import { writeFileSync } from "node:fs";
import { createOpenApiDocument } from "../packages/contracts/src/openapi.js";
import { MCP_CONFIG, MCP_EXAMPLES, MCP_NOTES, SDK_METHODS, SDK_NOTES, SDK_PY_EXAMPLE, SDK_TS_EXAMPLE } from "../packages/contracts/src/integration-docs.js";
import { MCP_TOOL_DOCS, MCP_TOOLS } from "../packages/mcp-server/src/index.js";

const document = createOpenApiDocument();
const code = (value: unknown) => `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const table = (rows: string[][]) => rows.map(row => `| ${row.map(cell => cell.replaceAll("|", "／")).join(" | ")} |`).join("\n");
const resolve = (schema: any) => schema?.$ref ? schema.$ref.slice(2).split("/").reduce((node: any, part: string) => node?.[part], document) : schema;
const parameters = (operation: any) => {
  const schema = resolve(operation.requestBody?.content?.["application/json"]?.schema);
  const rows = [
    ...(operation.parameters ?? []).map((p: any) => [p.name, p.in, p.required ? "是" : "否", p.description ?? ""]),
    ...Object.entries(schema?.properties ?? {}).map(([name, field]) => [name, "body", schema.required?.includes(name) ? "是" : "否", (field as any).description ?? "见 OpenAPI 完整结构"]),
  ];
  return rows.length ? table([["参数", "位置", "必填", "说明"], ["---", "---", "---", "---"], ...rows]) : "无参数，无请求体。";
};

const api = ["# REST API 使用说明", "本文由 `node --import tsx scripts/export-integration-docs.ts` 根据接口说明与契约生成。服务根地址默认 `http://127.0.0.1:4300`。除健康检查和 OpenAPI 文档外，调用需携带 `Authorization: Bearer <api-key>`。", "成功信封的数据位于 `data`，`requestId` 和 `auditId` 用于追踪。语义查询即使 HTTP 200 也必须检查业务 `status`；分页和完整性查看 `completeness`。所有请求结构见 [OpenAPI](../openapi/ontology-platform.v1.yaml)。"];
for (const [path, methods] of Object.entries(document.paths)) for (const [method, raw] of Object.entries(methods)) {
  const operation = raw as any;
  const example = operation.requestBody?.content?.["application/json"]?.example;
  api.push(`## ${operation.summary}\n\n\`${method.toUpperCase()} /v1${path}\`\n\n${operation.description}\n\n所需权限：${operation["x-required-scopes"]}\n\n${parameters(operation)}\n\n返回：${operation.responses["200"].description}${example === undefined ? "" : code(example)}`);
}
writeFileSync(new URL("../docs/API.md", import.meta.url), api.join("\n\n") + "\n");


const mcp = ["# MCP 接入说明", ...MCP_NOTES, "## 客户端配置" + code(MCP_CONFIG)];
for (const tool of MCP_TOOLS) {
  const schema = tool.inputSchema as any;
  const docs = MCP_TOOL_DOCS[tool.name]!;
  mcp.push(`## ${tool.name} · ${docs.summary}\n\n${tool.description}\n\n${table([["参数", "必填", "说明"], ["---", "---", "---"], ...Object.keys(schema.properties ?? {}).map(name => [name, schema.required?.includes(name) ? "是" : "否", docs.fields[name] ?? "见 tools/list 返回的完整结构"])])}\n\n返回说明：${docs.returns}\n\n调用参数示例：${code(MCP_EXAMPLES[tool.name])}`);
}
writeFileSync(new URL("../docs/MCP.md", import.meta.url), mcp.join("\n\n") + "\n");
writeFileSync(new URL("../docs/SDK.md", import.meta.url), ["# SDK 接入说明", ...SDK_NOTES, "## 公共方法", table([["TypeScript", "Python", "用途与参数"], ["---", "---", "---"], ...SDK_METHODS]), "## TypeScript 示例", `\`\`\`typescript\n${SDK_TS_EXAMPLE}\n\`\`\``, "## Python 示例", `\`\`\`python\n${SDK_PY_EXAMPLE}\n\`\`\``, "完整参数与返回说明见 [REST API 文档](./API.md)。"].join("\n\n") + "\n");
