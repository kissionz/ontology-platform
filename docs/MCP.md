# MCP 接入说明

Agent 先提取完整业务概念传入 concepts。解析上下文只返回词典候选；优先级 concepts > terms > question。filters、time 数组填写属性名称，筛选值和时间范围由 Agent 确认后放入查询结构。检查 retrieval.status、unmatchedTerms、ambiguities；未命中返回空上下文，不会退回全部本体。

先在项目根目录安装依赖并启动 API 服务：npm install、npm run build、npm start。运行环境为 Node.js 24 或更高版本。

使用支持 stdio 的 MCP 客户端，配置中的项目路径须替换为本机绝对路径。通过标准输入输出交换逐行 JSON-RPC；当前启动器不提供独立的远程 MCP HTTP 入口。

ONTOLOGY_API_URL 是 REST 服务根地址，不含 /v1。本机连接默认读取同一数据文件旁自动生成的密钥；自定义数据文件时设置 ONTOLOGY_DB_PATH，或用 ONTOLOGY_KEYS_PATH 指定密钥文件。

连接远程 REST 服务时，在 MCP 进程环境中配置目标平台生成的 ONTOLOGY_API_KEY。密钥的 scopes、调用限额和审计与 REST 完全相同。

推荐先调用 ResolveOntologyContext，使用返回的版本、对象 ID 和会话，再调用 ExecuteSemanticQuery；遇到 NEEDS_CLARIFICATION 时用 ContinueSemanticQuery 提交全部选择。

草稿创建通过 REST 的 CreateOntologyDraft 完成，当前 MCP 工具集包含草稿修改、校验和发布。发布权限为 ontology:publish。

工具结果同时提供 content 文本和 structuredContent。查询和继续查询返回完整执行信封，其他工具返回 REST 响应的 data。调用错误可能设置 isError；语义执行失败也可能在 structuredContent.status 中表达，需同时检查。

## 客户端配置

```json
{
  "mcpServers": {
    "ontology-platform": {
      "command": "npm",
      "args": [
        "--prefix",
        "/绝对路径/ontology-platform",
        "run",
        "--silent",
        "start:mcp"
      ],
      "env": {
        "ONTOLOGY_API_URL": "http://127.0.0.1:4300"
      }
    }
  }
}
```


## ResolveOntologyContext · 解析语义上下文

检索业务定义候选。推荐 Agent 提取 concepts（指标、维度、筛选字段、时间字段）；平台按完整名称、编码或同义词匹配，并补充连接路径及公理。question 单独使用时仅做词典匹配。接口不调用模型、不执行数据查询。 所需权限：semantic:read。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| ontologyVersion | 否 | 发布版本号或 latest；省略时选择最新发布版本。 |
| question | 否 | 保留用户原问题。未传 concepts 或非空 terms 时才用于完整词典词的包含匹配，不进行自然语言意图或时间解析。 |
| terms | 否 | 完整业务术语数组，最多 32 项；按名称、编码或同义词精确匹配。优先级 concepts > terms > question。 |
| concepts | 否 | Agent 提取的业务概念：metrics 指标名称、dimensions 维度属性名称、filters 筛选属性名称、time 时间属性名称，均为字符串数组，每类最多 16 项。不要把今年等时间表达式或筛选值放入字段名数组。concepts、terms、question 至少一项非空；提供 concepts 时只按 concepts 检索。 |
| purpose | 是 | 用途：ANSWER 回答、PLAN 规划、EXPLAIN 解释、MODEL 建模。 |
| projection | 否 | 已选对象字段详细程度：compact（默认）、standard、full；均只包含相关属性，不会扩展检索范围。敏感字段边界始终生效。 |
| include | 否 | 开关：values 值匹配、axioms 公理、inferences 推论、evidence 证明过程；values 需显式开启，其他默认包含。 |

返回说明：工具结果 包含 sessionId、ontologyVersion、objects、metrics、relations、values、axioms、inferences、refs、ambiguities 和 contextDigest。retrieval.status 为 MATCHED、PARTIAL_MATCH、NO_MATCH 或 AMBIGUOUS；未命中项位于 unmatchedTerms，candidates 包含匹配原因，ambiguities 由调用方确认。会话固定版本，有效期 30 分钟。

调用参数示例：

```json
{
  "namespace": "retail",
  "ontologyVersion": "latest",
  "question": "按店铺查看销售额",
  "concepts": {
    "metrics": [
      "销售额"
    ],
    "dimensions": [
      "店铺"
    ]
  },
  "purpose": "PLAN",
  "include": {
    "axioms": true,
    "inferences": true,
    "evidence": true
  }
}
```


## ExecuteSemanticQuery · 执行语义查询

AUTO 解析自然语言问题；FIXED_SHAPE 按明确的对象与指标 ID 编译查询；ANALYSIS 返回分析上下文和任务信息。执行前应用本体公理和 SQL 安全约束。 所需权限：semantic:read + semantic:plan；AUTO / FIXED_SHAPE 还需 data:execute。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| queryMode | 是 | AUTO 自然语言查询；FIXED_SHAPE 明确查询结构；ANALYSIS 仅返回分析任务与上下文。 |
| namespace | 是 | 本体命名空间。 |
| ontologyVersion | 否 | 发布版本号或 latest；有 sessionId 时须与会话版本一致。 |
| question | 否 | AUTO 与 ANALYSIS 使用的自然语言问题。 |
| queryShape | 否 | FIXED_SHAPE 必填。包含 rootObjectId、measureIds、dimensionPropertyIds、filters、sort 等；具体 ID 从本体或语义上下文取得。 |
| parameters | 否 | 查询结构中参数占位符的名称与取值。 |
| sessionId | 否 | 语义上下文返回的会话 ID，用于固定版本和解析短引用。 |
| pagination | 否 | pageSize 每页 1–10000 行；下一页使用 completeness.nextCursor，保持查询和参数一致。 |
| options | 否 | 可开启 includeResolution、includeOntologyContext、includeAxioms、includeInferenceEvidence、includeQueryIr、includeSqlPreview。 |

返回说明：返回执行信封。status 可为 SUCCEEDED、NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED；成功时 data 含 columns、rows、rowCount，可选返回 SQL、查询计划和推理依据。HTTP 200 仍需检查 status 与 completeness。

调用参数示例：

```json
{
  "namespace": "retail",
  "queryMode": "ANALYSIS",
  "question": "按店铺查看销售额"
}
```


## ContinueSemanticQuery · 提交澄清并继续查询

当语义查询返回 NEEDS_CLARIFICATION 时，提交该次澄清所需的全部选择，继续原版本查询。 所需权限：semantic:read + semantic:plan + data:execute。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| clarificationId | 是 | 查询响应中的澄清 ID。 |
| selections | 是 | 澄清响应中的项目 ID 到所选候选项 ID 的映射，需一次提交全部选择。 |

返回说明：返回与语义查询一致的执行信封；无效、过期或不完整的选择会返回错误状态。

调用参数示例：

```json
{
  "clarificationId": "响应中的澄清ID",
  "selections": {
    "待选择项目ID": "候选项ID"
  }
}
```


## GetOntologySnapshot · 读取本体快照

读取指定发布版本的可导出本体快照，包含对象、关系、公理和推论，遵循敏感字段边界。 所需权限：ontology:read。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| version | 否 | 发布版本号或 latest，省略时读取最新发布版本。 |

返回说明：返回本体快照对象，包含 version、objects、relations、metrics、axiomAssertions 和 inferredAssertions。

调用参数示例：

```json
{
  "namespace": "retail",
  "version": "latest"
}
```


## ApplyOntologyDraftPatch · 修改本体草稿

以一组原子操作新增、更新或移除对象、关系、指标和层级，同时生成公理校验结果。保存成功不等于可发布。 所需权限：ontology:draft。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| draftId | 是 | REST 创建草稿返回的 draftId。 |
| revision | 是 | 草稿当前修订号，必填，使用最近一次草稿响应中的值。 |
| operations | 是 | 非空操作数组。UPSERT_OBJECT / UPSERT_RELATION / UPSERT_METRIC / UPSERT_HIERARCHY 携带完整 value；REMOVE_* 携带 id。操作原子保存，公理问题通过 validation 返回。 |

返回说明：工具结果 返回新 revision、snapshot 和 validation；并发修订冲突返回 409。

调用参数示例：

```json
{
  "namespace": "retail",
  "draftId": "创建草稿返回的ID",
  "revision": 1,
  "operations": [
    {
      "op": "REMOVE_RELATION",
      "id": "待移除关系ID"
    }
  ]
}
```


## ValidateOntologyDraft · 校验草稿

执行公理校验和可选的查询编译回归，预览推论；回归只编译查询，不执行正式业务查询。 所需权限：ontology:draft。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| goldenCases | 否 | 可选、最多 100 条查询编译回归；每条包含 id、label、queryShape 和 expected（可检查 SQL 片段及所用定义 ID）。 |
| namespace | 是 | 本体命名空间，例如 retail。 |
| draftId | 是 | REST 创建草稿返回的 draftId。 |

返回说明：工具结果 包含 valid、issues、公理与推论及回归结果；valid 为 false 时应修复后再发布。

调用参数示例：

```json
{
  "namespace": "retail",
  "draftId": "创建草稿返回的ID"
}
```


## PublishOntologyDraft · 发布本体版本

校验草稿及基线一致性后生成不可变发布版本，并启动值索引重建。 所需权限：ontology:publish。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| draftId | 是 | REST 创建草稿返回的 draftId。 |
| baseVersion | 是 | 创建草稿时的基线发布版本。首次发布为 0，必须与最新发布版本一致。 |
| changeSummary | 否 | 本次发布变更说明。 |

返回说明：工具结果 为已发布快照；校验不通过或基线版本过期时拒绝发布。索引进度通过值索引状态接口查看。

调用参数示例：

```json
{
  "namespace": "retail",
  "draftId": "创建草稿返回的ID",
  "baseVersion": 0,
  "changeSummary": "首次发布"
}
```


## ExplainInference · 解释推论依据

按版本与推论 ID 查看完整证明路径；推论 ID 可从推论列表或语义上下文取得。 所需权限：ontology:read。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| version | 是 | 推论所属的数字发布版本，必须明确指定。 |
| id | 是 | 指定版本的推论 ID。 |

返回说明：工具结果 为推论及其 FACT、AXIOM、DERIVATION 证明步骤；不存在时返回 404。

调用参数示例：

```json
{
  "namespace": "retail",
  "version": 1,
  "id": "推论列表返回的ID"
}
```

