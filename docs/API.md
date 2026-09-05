# REST API 使用说明

本文由 `node --import tsx scripts/export-integration-docs.ts` 根据接口说明与契约生成。服务根地址默认 `http://127.0.0.1:4300`。除健康检查和 OpenAPI 文档外，调用需携带 `Authorization: Bearer <api-key>`。

成功信封的数据位于 `data`，`requestId` 和 `auditId` 用于追踪。语义查询即使 HTTP 200 也必须检查业务 `status`；分页和完整性查看 `completeness`。所有请求结构见 [OpenAPI](../openapi/ontology-platform.v1.yaml)。

## 检查服务状态

`GET /v1/health`

查看服务版本、组件配置状态和服务器时间；组件显示已配置不代表数据库连接测试通过。

所需权限：无需认证

无参数，无请求体。

返回：直接返回状态对象，包含 status、version、kernelVersion、components、time。

## 读取 API 契约

`GET /v1/system/openapi.json`

获取当前服务提供的 OpenAPI 3.1 文档，包含接口、参数、请求结构和中文说明。

所需权限：无需认证

无参数，无请求体。

返回：直接返回 OpenAPI 文档，主要字段为 paths、components.schemas、info。

## 读取本体概览

`GET /v1/namespaces/{ns}/summary`

查看指定发布版本的对象、关系、指标、层级数量和版本摘要。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 包含版本信息、counts 和 contentDigest；响应头提供 ETag。

## 读取本体快照

`GET /v1/namespaces/{ns}/ontology`

导出指定发布版本的本体、公理和推论，遵循敏感字段导出边界。If-None-Match 可用于缓存校验。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |
| If-None-Match | header | 否 | 上次响应的 ETag，相同则返回 304。 |

返回：data 为完整可导出快照；ETag 匹配时返回 HTTP 304，响应体为空。

## 读取本体图谱

`GET /v1/namespaces/{ns}/graph`

按关系、指标或公理视图获取图谱节点和连线。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |
| projection | query | 否 | 图谱视图：relations 关系、metrics 指标、axioms 公理。 |

返回：data 包含 ontologyVersion、nodes 和 edges。

## 列出发布版本

`GET /v1/namespaces/{ns}/versions`

查看命名空间的发布历史，用于选择查询版本或创建回滚草稿。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |

返回：data 为版本列表，包含发布时间、变更说明及定义数量。

## 比较本体版本

`GET /v1/namespaces/{ns}/versions/{version}/diff`

比较目标版本与基线，查看对象、关系、指标、公理及推论的增删改。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | path | 是 | 目标发布版本号，从版本列表取得，不能填写 latest。 |
| baseVersion | query | 否 | 基线版本号；省略时使用目标版本的记录基线或前一版本。 |

返回：data 包含 baseVersion 及各类定义的 added、changed、removed。

## 创建本体草稿

`POST /v1/namespaces/{ns}/drafts`

基于发布版本创建可编辑草稿；空命名空间可从 latest 创建首个草稿。sourceVersion 用于将历史版本复制为回滚草稿。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| baseVersion | body | 否 | 基线版本号或 latest，默认 latest。 |
| sourceVersion | body | 否 | 可选历史内容版本；用于创建回滚草稿，发布仍以 baseVersion 检查并发。 |

返回：data 包含 draftId、revision、snapshot、physicalTables 和已有回归报告。

```json
{
  "baseVersion": "latest"
}
```


## 读取本体草稿

`GET /v1/namespaces/{ns}/drafts/{draftId}`

读取草稿及其当前修订号，后续修改需要提交该 revision。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |

返回：data 包含草稿快照、revision、已扫描表和回归报告；草稿不存在时返回 404。

## 修改本体草稿

`PATCH /v1/namespaces/{ns}/drafts/{draftId}`

以一组原子操作新增、更新或移除对象、关系、指标和层级，同时生成公理校验结果。保存成功不等于可发布。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |
| If-Match | header | 否 | 可替代请求体 revision，值为草稿当前修订号。 |
| revision | body | 否 | 当前草稿修订号，需使用最近一次响应中的值；也可用 If-Match 请求头提供。 |
| operations | body | 是 | 非空操作数组。UPSERT_OBJECT / UPSERT_RELATION / UPSERT_METRIC / UPSERT_HIERARCHY 携带完整 value；REMOVE_* 携带 id。操作原子保存，公理问题通过 validation 返回。 |

返回：data 返回新 revision、snapshot 和 validation；并发修订冲突返回 409。

```json
{
  "revision": 1,
  "operations": [
    {
      "op": "REMOVE_RELATION",
      "id": "待移除关系ID"
    }
  ]
}
```


## 校验草稿

`POST /v1/namespaces/{ns}/drafts/{draftId}/validate`

执行公理校验和可选的查询编译回归，预览推论；回归只编译查询，不执行正式业务查询。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |
| goldenCases | body | 否 | 可选、最多 100 条查询编译回归；每条包含 id、label、queryShape 和 expected（可检查 SQL 片段及所用定义 ID）。 |

返回：data 包含 valid、issues、公理与推论及回归结果；valid 为 false 时应修复后再发布。

```json
{}
```


## 发布本体版本

`POST /v1/namespaces/{ns}/drafts/{draftId}/publish`

校验草稿及基线一致性后生成不可变发布版本，并启动值索引重建。

所需权限：ontology:publish

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |
| baseVersion | body | 是 | 创建草稿时的基线发布版本。首次发布为 0，必须与最新发布版本一致。 |
| changeSummary | body | 否 | 本次发布变更说明。 |

返回：data 为已发布快照；校验不通过或基线版本过期时拒绝发布。索引进度通过值索引状态接口查看。

```json
{
  "baseVersion": 0,
  "changeSummary": "首次发布业务本体"
}
```


## 列出公理实例

`GET /v1/namespaces/{ns}/axioms`

读取指定版本根据对象、属性、关系和指标定义固化的规则。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 为公理数组，包含 axiomCode、parameters、enforcement 和 sourceDefinitionIds。

## 列出推论

`GET /v1/namespaces/{ns}/inferences`

读取指定版本的关系可达性、查询策略、血缘及指标重算等确定性推论。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 为推论数组，包含 predicate、axiomAssertionIds、premiseAssertionIds 和 proof。

## 解释推论依据

`GET /v1/namespaces/{ns}/inferences/{id}/explanation`

按版本与推论 ID 查看完整证明路径；推论 ID 可从推论列表或语义上下文取得。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| id | path | 是 | 该版本推论列表中的推论 ID。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 为推论及其 FACT、AXIOM、DERIVATION 证明步骤；不存在时返回 404。

## 解析语义上下文

`POST /v1/semantic-context:resolve`

根据问题或术语一次获取匹配的对象、指标、值、公理和推理证据，供 Agent 理解业务语义。此接口不执行数据查询。

所需权限：semantic:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| namespace | body | 是 | 本体命名空间，例如 retail。 |
| ontologyVersion | body | 否 | 发布版本号或 latest；省略时选择最新发布版本。 |
| question | body | 否 | 需要理解的自然语言问题；question 与 terms 至少提供一项。 |
| terms | body | 否 | 明确的业务术语数组；可与 question 配合，二者至少提供一项。 |
| purpose | body | 是 | 用途：ANSWER 回答、PLAN 规划、EXPLAIN 解释、MODEL 建模。 |
| projection | body | 否 | 对象字段详细程度：compact（默认）、standard、full。敏感字段边界始终生效。 |
| include | body | 否 | 开关：values 值匹配、axioms 公理、inferences 推论、evidence 证明过程；values 需显式开启，其他默认包含。 |

返回：data 包含 sessionId、ontologyVersion、objects、metrics、relations、values、axioms、inferences、refs、ambiguities 和 contextDigest。会话固定版本，有效期 30 分钟。

```json
{
  "namespace": "retail",
  "ontologyVersion": "latest",
  "question": "按店铺查看销售额",
  "purpose": "PLAN",
  "include": {
    "values": true,
    "axioms": true,
    "inferences": true,
    "evidence": true
  }
}
```


## 执行语义查询

`POST /v1/semantic-query`

AUTO 解析自然语言问题；FIXED_SHAPE 按明确的对象与指标 ID 编译查询；ANALYSIS 返回分析上下文和任务信息。执行前应用本体公理和 SQL 安全约束。

所需权限：semantic:read + semantic:plan；AUTO / FIXED_SHAPE 还需 data:execute

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| queryMode | body | 是 | AUTO 自然语言查询；FIXED_SHAPE 明确查询结构；ANALYSIS 仅返回分析任务与上下文。 |
| namespace | body | 是 | 本体命名空间。 |
| ontologyVersion | body | 否 | 发布版本号或 latest；有 sessionId 时须与会话版本一致。 |
| question | body | 否 | AUTO 与 ANALYSIS 使用的自然语言问题。 |
| queryShape | body | 否 | FIXED_SHAPE 必填。包含 rootObjectId、measureIds、dimensionPropertyIds、filters、sort 等；具体 ID 从本体或语义上下文取得。 |
| parameters | body | 否 | 查询结构中参数占位符的名称与取值。 |
| sessionId | body | 否 | 语义上下文返回的会话 ID，用于固定版本和解析短引用。 |
| pagination | body | 否 | pageSize 每页 1–10000 行；下一页使用 completeness.nextCursor，保持查询和参数一致。 |
| options | body | 否 | 可开启 includeResolution、includeOntologyContext、includeAxioms、includeInferenceEvidence、includeQueryIr、includeSqlPreview。 |

返回：返回执行信封。status 可为 SUCCEEDED、NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED；成功时 data 含 columns、rows、rowCount，可选返回 SQL、查询计划和推理依据。HTTP 200 仍需检查 status 与 completeness。

```json
{
  "namespace": "retail",
  "ontologyVersion": "latest",
  "queryMode": "ANALYSIS",
  "question": "按店铺查看销售额",
  "options": {
    "includeAxioms": true,
    "includeInferenceEvidence": true
  }
}
```


## 提交澄清并继续查询

`POST /v1/semantic-query/clarifications/{clarificationId}:continue`

当语义查询返回 NEEDS_CLARIFICATION 时，提交该次澄清所需的全部选择，继续原版本查询。

所需权限：semantic:read + semantic:plan + data:execute

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| clarificationId | path | 是 | NEEDS_CLARIFICATION 响应中的澄清 ID。 |
| selections | body | 是 | 澄清响应中的项目 ID 到所选候选项 ID 的映射，需一次提交全部选择。 |

返回：返回与语义查询一致的执行信封；无效、过期或不完整的选择会返回错误状态。

```json
{
  "selections": {
    "待选择项目ID": "候选项ID"
  }
}
```


## 读取数据源配置

`GET /v1/data-sources/{sourceId}`

读取已保存的连接信息及扫描到的物理表，密码不会明文返回。数据源配置不要求已有本体。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |

返回：data 包含配置状态、payload、updatedAt 和 tables；未配置时 configured 为 false。

## 保存数据源连接

`PUT /v1/data-sources/{sourceId}`

保存 SelectDB 连接并更新凭据缓存。首次配置提供密码；修改时省略 password 保留原密码。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |
| host | body | 是 | SelectDB 主机名或 IP。 |
| port | body | 是 | 数据库 MySQL 协议端口，例如 9030。 |
| username | body | 是 | 数据库用户名。 |
| password | body | 否 | 首次连接密码；后续省略此字段保留已保存密码。 |
| catalog | body | 是 | 数据目录，例如 internal。 |
| database | body | 是 | 需要扫描的数据库名称。 |
| tls | body | 是 | 是否启用 TLS；应与服务端支持情况一致。 |

返回：data 为已保存的连接元数据，密码加密存储且不在响应中明文返回。

```json
{
  "host": "selectdb.example.com",
  "port": 9030,
  "username": "readonly_user",
  "password": "请填写数据库密码",
  "catalog": "internal",
  "database": "retail",
  "tls": false
}
```


## 测试数据源连接

`POST /v1/data-sources/{sourceId}:test`

使用已保存的连接配置测试数据库可用性。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |

返回：data 为连接测试结果；连接或认证失败时返回错误详情。

## 扫描表结构

`POST /v1/data-sources/{sourceId}/schema:scan`

读取数据库表名、注释和字段元数据并保存，供后续本体建模使用。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |

返回：data 包含 sourceId 和 tables，各表包含字段、注释、结构指纹及扫描时间。

## 读取值索引状态

`GET /v1/namespaces/{ns}/value-index/status`

查看某个发布版本的属性值索引状态及失败情况。

所需权限：semantic:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 包含索引状态、属性数、值数和失败属性数。

## 重建属性值索引

`POST /v1/namespaces/{ns}/value-index:rebuild`

针对指定发布版本重建允许值检索的属性索引；此操作会读取数据库中的属性值。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 返回本轮索引状态与统计，包含 properties、valuesCount 和 failedProperties。

## 列出 API 客户端

`GET /v1/system/api-clients`

查看已创建客户端的权限范围、状态和调用限额。

所需权限：system:admin

无参数，无请求体。

返回：data 为客户端列表，不包含可恢复的明文 API Key。

## 创建 API 客户端

`POST /v1/system/api-clients`

创建带指定权限和调用限额的客户端，系统自动生成密钥。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| name | body | 是 | 客户端名称。 |
| scopes | body | 是 | 允许的权限列表；只读语义接入可用 ontology:read、semantic:read。 |
| rateLimit | body | 否 | 每分钟请求上限，默认 120。 |

返回：data 包含 clientId 和 apiKey。明文密钥仅在创建响应中提供一次，请当次保存。

```json
{
  "name": "外部 Agent",
  "scopes": [
    "ontology:read",
    "semantic:read"
  ],
  "rateLimit": 120
}
```


## 撤销 API 客户端

`DELETE /v1/system/api-clients/{clientId}`

撤销指定客户端，使其密钥不能继续调用平台。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| clientId | path | 是 | 客户端列表或创建响应中的 clientId。 |

返回：data.deleted 为 true。

## 读取调用审计

`GET /v1/system/audit-events`

查看最近的请求及业务审计事件，可根据返回的 auditId 关联调用过程。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| limit | query | 否 | 最近审计事件的条数，默认 100。 |

返回：data 为审计事件数组，包含 auditId、eventType、createdAt 和脱敏 payload。

## 读取服务指标

`GET /v1/system/metrics`

查看当前进程运行时间、内存，以及各路由调用量、错误量和延迟。

所需权限：system:admin

无参数，无请求体。

返回：data 包含 uptimeSeconds、memory 和 routes；路由指标含 count、errors、p95Ms、maxMs。
