export const MCP_CONFIG = {
  mcpServers: {
    "ontology-platform": {
      command: "npm",
      args: ["--prefix", "/绝对路径/ontology-platform", "run", "--silent", "start:mcp"],
      env: { ONTOLOGY_API_URL: "http://127.0.0.1:4300" },
    },
  },
};

export const MCP_NOTES = [
  "明细查询继续调用 ExecuteSemanticQuery。INTENT 传 intent.resultKind=detail、object 主对象名称、includeObjects 关联对象名称；fields 可指定属性名称或 {object, property}，省略时输出全部可读取属性。默认禁止扩行，确认后设置 allowFanout=true；名称或路径歧义使用 ContinueSemanticQuery。响应 data.columnBindings 将输出列映射到来源对象和属性。",
  "独立调用 ResolveOntologyContext 时，compact 默认只返回绑定和业务摘要。由平台构造 SQL 时直接使用候选的 objectId、propertyId 或指标 id，以及 values[].filter；无需读取公式、完整关联和层级。需要这些构造细节时显式传 projection: standard 或 full。对象维度候选的 propertyId 为主名称属性，identityPropertyIds 标识实体身份；平台分组时保留身份以避免同名实体合并。",
  "普通调用默认返回业务候选与引用，公理、推论和证明详情需显式开启。响应开关不影响平台内部校验与查询规则。",
  "对象中可分析、非敏感且具有有效默认聚合的 NUMBER 属性可直接作为基础指标。ResolveOntologyContext 的 concepts.metrics 接受属性名称或 ID，ExecuteSemanticQuery 的 queryShape.measureIds 接受属性 ID；组合指标的 leftMetricId/rightMetricId 也可引用同对象度量属性 ID。属性引用始终使用字段默认口径，不会替换为其他已命名指标。",
  "独立检索时，Agent 提取完整业务词放入 terms，平台同时检索对象、属性、指标和值。词条可写成 {term, role, object, property} 明确用途和范围；相同语义归并，优先级相同的不同候选需澄清。先检查 bindings 和 retrieval，再将确定的 ID 和 values[].filter 填入查询结构。",
  "先在项目根目录安装依赖并启动 API 服务：npm install、npm run build、npm start。运行环境为 Node.js 24 或更高版本。",
  "使用支持 stdio 的 MCP 客户端，配置中的项目路径须替换为本机绝对路径。通过标准输入输出交换逐行 JSON-RPC；当前启动器不提供独立的远程 MCP HTTP 入口。",
  "ONTOLOGY_API_URL 是 REST 服务根地址，不含 /v1。本机连接默认读取同一数据文件旁自动生成的密钥；自定义数据文件时设置 ONTOLOGY_DB_PATH，或用 ONTOLOGY_KEYS_PATH 指定密钥文件。",
  "连接远程 REST 服务时，在 MCP 进程环境中配置目标平台生成的 ONTOLOGY_API_KEY。密钥的 scopes、调用限额和审计与 REST 完全相同。",
  "推荐直接调用 ExecuteSemanticQuery，传 queryMode: INTENT 与 intent 中的业务名称，平台统一检索并执行。SUCCEEDED 读取 data.rows、columns、businessSummary；NEEDS_INPUT 按 missing 补充请求；NEEDS_CLARIFICATION 用 ContinueSemanticQuery 提交全部选择，平台固定原版本。ResolveOntologyContext 用于独立检索和调试。",
  "草稿创建通过 REST 的 CreateOntologyDraft 完成，当前 MCP 工具集包含草稿修改、校验和发布。发布权限为 ontology:publish。",
  "工具结果同时提供 content 文本和 structuredContent。查询和继续查询返回完整执行信封，其他工具返回 REST 响应的 data。调用错误可能设置 isError；语义执行失败也可能在 structuredContent.status 中表达，需同时检查。",
];

export const MCP_EXAMPLES: Record<string, unknown> = {
  ResolveOntologyContext: { namespace: "retail", ontologyVersion: "latest", question: "今年线上渠道销售额", terms: ["线上渠道", "销售额"], purpose: "PLAN", include: { axioms: false, inferences: false, evidence: false } },
  ExecuteSemanticQuery: { namespace: "retail", queryMode: "INTENT", intent: { metrics: ["销售额"], dimensions: ["店铺"] } },
  ContinueSemanticQuery: { clarificationId: "响应中的澄清ID", selections: { "待选择项目ID": "候选项ID" } },
  GetOntologySnapshot: { namespace: "retail", version: "latest" },
  ApplyOntologyDraftPatch: { namespace: "retail", draftId: "创建草稿返回的ID", revision: 1, operations: [{ op: "REMOVE_RELATION", id: "待移除关系ID" }] },
  ValidateOntologyDraft: { namespace: "retail", draftId: "创建草稿返回的ID" },
  PublishOntologyDraft: { namespace: "retail", draftId: "创建草稿返回的ID", baseVersion: 0, changeSummary: "首次发布" },
  ExplainInference: { namespace: "retail", version: 1, id: "推论列表返回的ID" },
};

export const SDK_METHODS = [
  ["resolveOntologyContext(input)", "resolve_ontology_context(payload)", "解析语义上下文；参数与 POST /v1/semantic-context:resolve 相同。"],
  ["executeSemanticQuery(input)", "execute_semantic_query(payload)", "执行语义查询或获取分析上下文；参数与 POST /v1/semantic-query 相同。"],
  ["continueSemanticQuery(id, selections)", "continue_semantic_query(clarification_id, selections)", "传入澄清 ID 和全部选择映射，继续查询。"],
  ["getOntology(namespace, version?)", "get_ontology(namespace, version='latest')", "获取发布快照，版本省略时为 latest。"],
];

export const SDK_NOTES = [
  "明细查询复用 executeSemanticQuery / execute_semantic_query，参数结构与 REST/MCP 相同；传 queryMode=INTENT 和 intent.resultKind=detail 即可按业务名称查询。省略 fields 返回全部可读取属性，includeObjects 指定关联对象，分页沿用 completeness.nextCursor。",
  "默认推荐 executeSemanticQuery 的 INTENT 模式：以业务名称传 metrics、dimensions、filters、time 和 sort，平台绑定后直接执行；有歧义时通过 continueSemanticQuery 选择后继续。",
  "独立调用 ResolveOntologyContext 时，compact 默认只返回绑定和业务摘要。由平台构造 SQL 时直接使用候选的 objectId、propertyId 或指标 id，以及 values[].filter；无需读取公式、完整关联和层级。需要这些构造细节时显式传 projection: standard 或 full。对象维度候选的 propertyId 为主名称属性，identityPropertyIds 标识实体身份；平台分组时保留身份以避免同名实体合并。",
  "公理、推论和证明详情默认关闭。解释或调试时用 include.axioms、include.inferences、include.evidence 按需开启；执行查询使用 options.includeAxioms 和 options.includeInferenceEvidence。规则始终在平台内执行。",
  "对象中可分析、非敏感且具有有效默认聚合的 NUMBER 属性可直接作为基础指标。ResolveOntologyContext 的 concepts.metrics 接受属性名称或 ID，ExecuteSemanticQuery 的 queryShape.measureIds 接受属性 ID；组合指标的 leftMetricId/rightMetricId 也可引用同对象度量属性 ID。属性引用始终使用字段默认口径，不会替换为其他已命名指标。",
  "resolveOntologyContext 返回候选检索结果。先检查 data.retrieval.status：NO_MATCH 时补充术语或同义词，PARTIAL_MATCH 时处理 unmatchedTerms，AMBIGUOUS 时确认候选；MATCHED 也不代表已完成业务意图解析。时间范围、筛选值和最终查询结构由调用方确定。",
  "当前 SDK 随仓库源码交付。TypeScript 入口为 packages/sdk-typescript/src/index.ts；Python 模块为 packages/sdk-python/ontology_platform.py，Python 客户端仅使用标准库。",
  "下面示例保存到项目根目录运行。TypeScript 使用 npx tsx example.ts；Python 使用 python3 example.py。提前在进程环境中配置 ONTOLOGY_API_KEY；ONTOLOGY_API_URL 可覆盖默认服务根地址。SDK 不会自动读取本机密钥文件。",
  "TypeScript 构造参数为 baseUrl、apiKey 和可选 fetch；Python 为 base_url、api_key。根地址不包含 /v1。可从系统管理创建有合适权限的客户端并保存自动生成的密钥。",
  "SDK 返回完整响应信封，业务数据位于 data。HTTP 成功仍可能是 NEEDS_INPUT、NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED，不能只判断有没有抛异常。",
  "需要 SQL 或公理证据时，在查询 options 中开启 includeSqlPreview、includeQueryIr、includeAxioms、includeInferenceEvidence。分页读取 completeness.nextCursor，下一次传入 pagination.cursor 并保持版本、查询和参数一致。",
  "TypeScript 在 HTTP 非成功时抛出带 status、code、response 的 Error；手动调用 request 使用 ETag 得到 304 时返回 undefined。Python 抛出 OntologyPlatformError，可读取 status 和 payload，网络错误由 urllib 抛出。",
  "TypeScript 还提供 request(path, init) 调用其他 REST 接口，path 以 /v1 开头。Python 公共方法目前为表中四项，其他管理操作可直接调用 REST。",
];

export const SDK_TS_EXAMPLE = `import { OntologyPlatformClient } from "./packages/sdk-typescript/src/index.ts";

const apiKey = process.env.ONTOLOGY_API_KEY;
if (!apiKey) throw new Error("请配置 ONTOLOGY_API_KEY");
const client = new OntologyPlatformClient({
  baseUrl: process.env.ONTOLOGY_API_URL ?? "http://127.0.0.1:4300",
  apiKey,
});

try {
  const response = await client.executeSemanticQuery({
    namespace: "retail",
    ontologyVersion: "latest",
    queryMode: "INTENT",
    intent: { metrics: ["销售额"], dimensions: ["店铺"] },
  });
  if (response?.status === "SUCCEEDED") console.log(response.data);
  else console.log(response?.status, response?.data, response?.error);
} catch (error) {
  console.error(error); // HTTP 错误可读取 status、code、response
}`;

export const SDK_PY_EXAMPLE = `import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path("packages/sdk-python").resolve()))
from ontology_platform import OntologyPlatformClient, OntologyPlatformError

client = OntologyPlatformClient(
    os.getenv("ONTOLOGY_API_URL", "http://127.0.0.1:4300"),
    os.environ["ONTOLOGY_API_KEY"],
)
try:
    response = client.execute_semantic_query({
        "namespace": "retail",
        "ontologyVersion": "latest",
        "queryMode": "INTENT",
        "intent": {"metrics": ["销售额"], "dimensions": ["店铺"]},
    })
    if response.get("status") == "SUCCEEDED":
        print(response.get("data"))
    else:
        print(response.get("status"), response.get("data"), response.get("error"))
except OntologyPlatformError as error:
    print(error.status, error.payload)
`;
