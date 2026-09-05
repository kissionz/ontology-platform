# 外部 Agent 接入

HTTP、TypeScript SDK、Python SDK 与 MCP 复用同一 Application/Domain 内核。首选两个粗粒度操作：

1. `ResolveOntologyContext`：规划或解释任务时一次获取相关对象、属性、指标、关系、值、公理、推论、证据和短引用。
2. `ExecuteSemanticQuery`：明确问数用 `AUTO` 一次完成；稳定流程用 `FIXED_SHAPE`；开放分析用 `ANALYSIS`。

HTTP 示例：

```bash
curl -s http://localhost:4300/v1/semantic-context:resolve \
  -H "Authorization: Bearer $ONTOLOGY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace":"retail","ontologyVersion":"latest","question":"各事业部销售额","purpose":"ANSWER","include":{"values":true,"axioms":true,"inferences":true,"evidence":true}}'
```

必须保存响应中的具体 `ontologyVersion` 和 `sessionId`。同一会话不要切换版本；短引用只在该会话和版本有效。结果含 `completeness.nextCursor` 时，继续请求必须保持 Query IR、动态参数、排序、页大小与版本不变。

MCP server 导出八个工具：`ResolveOntologyContext`、`ExecuteSemanticQuery`、`ContinueSemanticQuery`、`GetOntologySnapshot`、`ApplyOntologyDraftPatch`、`ValidateOntologyDraft`、`PublishOntologyDraft`、`ExplainInference`。工具输入 schema 与 OpenAPI 使用相同的 contracts registry。

错误应按稳定 `error.code` 分支处理，不依赖中文消息。可重试性读取 `retryable`；版本、权限、规划安全类错误需要修改请求或人工处理。


先运行 HTTP 服务，再启动 MCP stdio 入口：

```bash
export ONTOLOGY_API_URL=http://127.0.0.1:4300
export ONTOLOGY_API_KEY='<已授权客户端密钥>'
npm run start:mcp
```

MCP 通过 HTTP SDK 调用同一个平台，沿用客户端 Scope、限流和请求审计。标准输出仅用于 MCP JSON-RPC 消息。

## FIXED_SHAPE 高级计算

`queryShape` 支持 `timeRange`、`timeGrain`、`derivedMeasures`、`timeComparisons`、`windowCalculations`、`groupSelections`、`periodConditions`、`hierarchyFilters`、`filterExpression` 与聚合筛选。语义 ID 来自本体或当前会话；计算结果使用调用方指定的 ID。时间桶排序使用 `__time__`。以下示例中的 ID 需要替换为实际本体 ID：

```json
{
  "queryMode": "FIXED_SHAPE",
  "namespace": "retail",
  "queryShape": {
    "rootObjectId": "o_order",
    "measureIds": ["m_sales"],
    "dimensionPropertyIds": [],
    "filters": [],
    "timeRange": {"expression": "2025年", "kind": "ABSOLUTE_YEAR", "year": 2025},
    "timeGrain": {"unit": "MONTH"},
    "windowCalculations": [{
      "id": "running_sales", "label": "累计销售额", "measureId": "m_sales",
      "operator": "RUNNING_SUM", "partitionByPropertyIds": [],
      "orderBy": {"entityId": "__time__", "direction": "ASC"}
    }],
    "sort": [{"entityId": "__time__", "direction": "ASC"}],
    "limit": 100
  },
  "options": {"includeQueryIr": true}
}
```

`filterExpression` 支持 CONDITION、AND/OR GROUP 和 NOT；条件值可使用 `$参数名`，从 `parameters` 绑定。显式结构化时间条件优先于问题文本。逐期条件、组内排名和占比分母均由 SelectDB SQL 计算，结果截断状态仍通过 completeness 返回。
