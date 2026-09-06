# MCP 接入说明

compact 默认只返回绑定和业务摘要。由平台构造 SQL 时直接使用候选的 objectId、propertyId 或指标 id，以及 values[].filter；无需读取公式、完整关联和层级。需要这些构造细节时显式传 projection: standard 或 full。对象维度候选的 propertyId 为主名称属性，identityPropertyIds 标识实体身份；平台分组时保留身份以避免同名实体合并。

普通调用默认返回业务候选与引用，公理、推论和证明详情需显式开启。响应开关不影响平台内部校验与查询规则。

对象中可分析、非敏感且具有有效默认聚合的 NUMBER 属性可直接作为基础指标。ResolveOntologyContext 的 concepts.metrics 接受属性名称或 ID，ExecuteSemanticQuery 的 queryShape.measureIds 接受属性 ID；组合指标的 leftMetricId/rightMetricId 也可引用同对象度量属性 ID。属性引用始终使用字段默认口径，不会替换为其他已命名指标。

Agent 提取完整业务词放入 terms，平台同时检索对象、属性、指标和值。词条可写成 {term, role, object, property} 明确用途和范围；相同语义归并，优先级相同的不同候选需澄清。先检查 bindings 和 retrieval，再将确定的 ID 和 values[].filter 填入查询结构。

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

统一检索对象、属性、指标和业务值。对象与主名称属性归并，明确指定范围优先，在可用关联范围内按匹配程度和业务优先级绑定；并列候选需要澄清。默认返回业务绑定摘要，由平台构造 SQL。question 单独使用时仅做词典匹配。接口不调用模型、不执行数据查询。 所需权限：semantic:read。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| namespace | 是 | 本体命名空间，例如 retail。 |
| ontologyVersion | 否 | 发布版本号或 latest；省略时选择最新发布版本。 |
| question | 否 | 保留用户原问题。未传 concepts 或非空 terms 时才用于完整词典词的包含匹配，不进行自然语言意图或时间解析。 |
| terms | 否 | 统一词条数组，最多 32 项；每项为字符串，或 {term, role?, object?, property?}。role 可为 metrics/dimensions/filters/time/values/terms，object/property 可使用 ID 或名称，明确指定后只在该范围查找。优先级 terms > concepts > question。 |
| concepts | 否 | 兼容分类入口：metrics 指标/度量、dimensions 对象/属性、filters 属性名或 {object?, property?, value}、values 业务值、time 时间字段，每类最多 16 项。建议使用 terms 统一检索；分组维度不自动限制未指定范围的筛选值。 |
| purpose | 是 | 用途：ANSWER 回答、PLAN 规划、EXPLAIN 解释、MODEL 建模。 |
| projection | 否 | compact（默认）供平台执行 SQL 的调用方使用，返回绑定摘要，省略公式、依赖指标、关系和层级详情。standard/full 供解释或外部构造 SQL 使用；始终受可见性和本次候选范围约束。 |
| include | 否 | values 默认参与统一值匹配，false 可关闭。axioms 公理、inferences 推论、evidence 证明过程默认关闭，需显式设为 true；evidence 仅在 inferences 同时开启时返回证明。公理与证明开关仅影响响应，平台仍执行公理校验和查询约束。 |

返回说明：工具结果 包含 bindings（逐词 BOUND/AMBIGUOUS/UNMATCHED）、candidates（类型、归属、可用用途、简要匹配依据）、values（可用筛选条件）、sessionId、ontologyVersion 和 refs。compact 仅返回对象与直接指标摘要；公式依赖、完整关系和层级仅在 standard/full 返回。retrieval.status 为 MATCHED、PARTIAL_MATCH、NO_MATCH 或 AMBIGUOUS；未命中项位于 unmatchedTerms，candidates 包含匹配原因，ambiguities 由调用方确认。会话固定版本，有效期 30 分钟。

调用参数示例：

```json
{
  "namespace": "retail",
  "ontologyVersion": "latest",
  "question": "今年线上渠道销售额",
  "terms": [
    "线上渠道",
    "销售额"
  ],
  "purpose": "PLAN",
  "include": {
    "axioms": false,
    "inferences": false,
    "evidence": false
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
| queryShape | 否 | FIXED_SHAPE 必填。包含 rootObjectId、measureIds、dimensionPropertyIds、filters、sort 等；measureIds 可直接传可分析 NUMBER 属性 ID，按其默认聚合执行，与已命名指标保持独立口径；具体 ID 从本体或语义上下文取得。 |
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

