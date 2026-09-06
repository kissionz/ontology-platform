# REST API 使用说明

本文由 `node --import tsx scripts/export-integration-docs.ts` 根据接口说明与契约生成。服务根地址默认 `http://127.0.0.1:4300`。除健康检查和 OpenAPI 文档外，调用需携带 `Authorization: Bearer <api-key>`。

成功信封的数据位于 `data`，`requestId` 和 `auditId` 用于追踪。语义查询即使 HTTP 200 也必须检查业务 `status`；分页和完整性查看 `completeness`。所有请求结构见 [OpenAPI](../openapi/ontology-platform.v1.yaml)。

## 检查服务状态

`GET /v1/health`

查看服务版本、组件配置状态和服务器时间；组件显示已配置不代表数据库连接测试通过。

所需权限：无需认证

无参数，无请求体。

返回：直接返回状态对象，包含 status、version、kernelVersion、components、time。

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| status | string | 服务状态。 |
| version / kernelVersion | string | 服务与公理内核版本。 |
| components | object | 组件配置状态，不代表数据库可连接。 |
| time | string | 服务器时间。 |

## 读取 API 契约

`GET /v1/system/openapi.json`

获取当前服务提供的 OpenAPI 3.1 文档，包含接口、参数、请求结构和中文说明。

所需权限：无需认证

无参数，无请求体。

返回：直接返回 OpenAPI 文档，主要字段为 paths、components.schemas、info。

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| openapi | string | OpenAPI 版本。 |
| info | object | 服务标题与版本。 |
| servers[] | object[] | API 根地址。 |
| paths | object | 各接口操作、参数、示例和响应说明。 |
| components.schemas | object | 请求及领域结构的 JSON Schema。 |

## 读取本体概览

`GET /v1/namespaces/{ns}/summary`

查看指定发布版本的对象、关系、指标、层级数量和版本摘要。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 包含版本信息、counts 和 contentDigest；响应头提供 ETag。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| ontologyVersion / status | number / string | 实际版本和发布状态。 |
| counts | object | 对象、关系、指标、公理等数量。 |
| contentDigest | string | 定义摘要。 |
| valueIndex | object | 值索引状态。 |
| defaultObject | object / null | 默认对象。 |
| graph | object | 概览图谱。 |

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

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| schemaVersion | number | 快照格式版本，当前为 3。 |
| namespace / version / status | string / number / string | 命名空间、发布版本与状态。 |
| objects[] | object[] | 对象定义；含 id、label、objectType、properties、grainPropertyIds、primaryNamePropertyId。 |
| objects[].properties[] | object[] | 属性定义：id、label、meaning、sourceColumn、visibility、numericSpec、valueSearchable。 |
| relations[] | object[] | 对象及属性连接、方向、基数、启用状态和关系策略。 |
| metrics[] | object[] | 指标定义及聚合、公式、源属性或依赖指标。 |
| dimensionHierarchies[] | object[] | 层级定义、层次和字段映射。 |
| axiomAssertions[] / inferredAssertions[] | object[] | 固化公理和推论。 |
| contentDigest / inferenceDigest | string | 定义与推论摘要。 |
| publishedAt | string（可选） | 发布时间。 |

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

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| ontologyVersion | number | 版本。 |
| nodes[] | object[] | 图节点：标识、标签和类型。 |
| edges[] | object[] | 图连线：源、目标及关系信息。 |

## 列出发布版本

`GET /v1/namespaces/{ns}/versions`

查看命名空间的发布历史，用于选择查询版本或创建回滚草稿。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |

返回：data 为版本列表，包含发布时间、变更说明及定义数量。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| [].version / [].status | number / string | 版本及发布状态，按版本倒序。 |
| [].publishedAt / [].publishedBy | string | 发布时间与发布人。 |
| [].changeSummary | string | 变更说明。 |
| [].objectCount / [].relationCount / [].metricCount | number | 定义数量。 |
| [].contentDigest / [].inferenceDigest | string | 版本摘要。 |

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

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| baseVersion | number | 实际比较基线。 |
| objects / relations / metrics / hierarchies / axioms / inferences | object | 每类包含 added、changed、removed，用于展示增删改。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| draftId | string | 后续草稿操作使用的 ID。 |
| baseVersion | number | 草稿基线，用于发布并发校验。 |
| revision | number | 每次修改递增；修改请求提交最新值。 |
| snapshot | object | 当前草稿，结构同本体快照。 |
| physicalTables[] | object[] | 已扫描的物理表及字段。 |
| validation | object（修改后） | valid 和 issues；保存成功仍需关注校验问题。 |
| goldenReport | object（可选） | 编译回归结果、运行时间和关联 revision。 |

## 放弃本体草稿

`DELETE /v1/namespaces/{ns}/drafts/{draftId}`

永久丢弃指定草稿。If-Match 必须填写当前 revision；不改变已发布版本、数据源或值索引。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |
| If-Match | header | 是 | 必填，填写草稿当前 revision，防止丢弃他人更新。 |

返回：data 包含 draftId 与 discarded=true；草稿不存在返回 404，修订号冲突返回 409。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| draftId | string | 已放弃的草稿标识 |
| discarded | boolean | 成功时为 true |

## 读取本体草稿

`GET /v1/namespaces/{ns}/drafts/{draftId}`

读取草稿及其当前修订号，后续修改需要提交该 revision。

所需权限：ontology:draft

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| draftId | path | 是 | 创建或读取草稿返回的 draftId。 |

返回：data 包含草稿快照、revision、已扫描表和回归报告；草稿不存在时返回 404。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| draftId | string | 后续草稿操作使用的 ID。 |
| baseVersion | number | 草稿基线，用于发布并发校验。 |
| revision | number | 每次修改递增；修改请求提交最新值。 |
| snapshot | object | 当前草稿，结构同本体快照。 |
| physicalTables[] | object[] | 已扫描的物理表及字段。 |
| validation | object（修改后） | valid 和 issues；保存成功仍需关注校验问题。 |
| goldenReport | object（可选） | 编译回归结果、运行时间和关联 revision。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| draftId | string | 后续草稿操作使用的 ID。 |
| baseVersion | number | 草稿基线，用于发布并发校验。 |
| revision | number | 每次修改递增；修改请求提交最新值。 |
| snapshot | object | 当前草稿，结构同本体快照。 |
| physicalTables[] | object[] | 已扫描的物理表及字段。 |
| validation | object（修改后） | valid 和 issues；保存成功仍需关注校验问题。 |
| goldenReport | object（可选） | 编译回归结果、运行时间和关联 revision。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| valid | boolean | 是否通过公理校验。 |
| issues[] | object[] | 校验问题：规则、位置及说明。 |
| axiomAssertions[] / inferencePreview[] | object[] | 公理和推论预览。 |
| goldenCases | object | 查询编译回归报告；只编译，不执行业务数据查询。 |
| draftId / revision | string / number | 被校验的草稿及修订号。 |
| digests | object | content 和 inference 摘要。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| schemaVersion | number | 快照格式版本，当前为 3。 |
| namespace / version / status | string / number / string | 命名空间、发布版本与状态。 |
| objects[] | object[] | 对象定义；含 id、label、objectType、properties、grainPropertyIds、primaryNamePropertyId。 |
| objects[].properties[] | object[] | 属性定义：id、label、meaning、sourceColumn、visibility、numericSpec、valueSearchable。 |
| relations[] | object[] | 对象及属性连接、方向、基数、启用状态和关系策略。 |
| metrics[] | object[] | 指标定义及聚合、公式、源属性或依赖指标。 |
| dimensionHierarchies[] | object[] | 层级定义、层次和字段映射。 |
| axiomAssertions[] / inferredAssertions[] | object[] | 固化公理和推论。 |
| contentDigest / inferenceDigest | string | 定义与推论摘要。 |
| publishedAt | string（可选） | 发布时间。 |

## 列出公理实例

`GET /v1/namespaces/{ns}/axioms`

读取指定版本根据对象、属性、关系和指标定义固化的规则。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 为公理数组，包含 axiomCode、parameters、enforcement 和 sourceDefinitionIds。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| [].id / [].axiomCode | string | 公理实例 ID 和规则编码。 |
| [].subjectId / [].subjectType | string | 约束对象及类型。 |
| [].parameters | object | 规则参数。 |
| [].enforcement / [].severity | string | 生效阶段与严重性。 |
| [].sourceDefinitionIds[] | string[] | 生成此公理的定义 ID。 |

## 列出推论

`GET /v1/namespaces/{ns}/inferences`

读取指定版本的关系可达性、查询策略、血缘及指标重算等确定性推论。

所需权限：ontology:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 为推论数组，包含 predicate、axiomAssertionIds、premiseAssertionIds 和 proof。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| [].id / predicate | string | 推论标识和推论类型。 |
| [].subjectId / objectId | string | 关联定义标识，objectId 可选。 |
| [].value | any | 推论结论。 |
| [].axiomAssertionIds[] / premiseAssertionIds[] | string[] | 公理与前提引用。 |
| [].proof[] | object[] | 证明步骤，包含事实、公理、推导。 |
| [].ontologyVersion | number | 推论所属版本。 |

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

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| id / predicate | string | 推论标识和推论类型。 |
| subjectId / objectId | string | 关联定义标识，objectId 可选。 |
| value | any | 推论结论。 |
| axiomAssertionIds[] / premiseAssertionIds[] | string[] | 公理与前提引用。 |
| proof[] | object[] | 证明步骤，包含事实、公理、推导。 |
| ontologyVersion | number | 推论所属版本。 |

## 解析语义上下文

`POST /v1/semantic-context:resolve`

统一检索对象、属性、指标和业务值。对象与主名称属性归并，明确指定范围优先，在可用关联范围内按匹配程度和业务优先级绑定；并列候选需要澄清。默认返回业务绑定摘要，由平台构造 SQL。question 单独使用时仅做词典匹配。接口不调用模型、不执行数据查询。

所需权限：semantic:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| namespace | body | 是 | 本体命名空间，例如 retail。 |
| ontologyVersion | body | 否 | 发布版本号或 latest；省略时选择最新发布版本。 |
| question | body | 否 | 保留用户原问题。未传 concepts 或非空 terms 时才用于完整词典词的包含匹配，不进行自然语言意图或时间解析。 |
| terms | body | 否 | 统一词条数组，最多 32 项；每项为字符串，或 {term, role?, object?, property?}。role 可为 metrics/dimensions/filters/time/values/terms，object/property 可使用 ID 或名称，明确指定后只在该范围查找。优先级 terms > concepts > question。 |
| concepts | body | 否 | 兼容分类入口：metrics 指标/度量、dimensions 对象/属性、filters 属性名或 {object?, property?, value}、values 业务值、time 时间字段，每类最多 16 项。建议使用 terms 统一检索；分组维度不自动限制未指定范围的筛选值。 |
| purpose | body | 是 | 用途：ANSWER 回答、PLAN 规划、EXPLAIN 解释、MODEL 建模。 |
| projection | body | 否 | compact（默认）供平台执行 SQL 的调用方使用，返回绑定摘要，省略公式、依赖指标、关系和层级详情。standard/full 供解释或外部构造 SQL 使用；始终受可见性和本次候选范围约束。 |
| include | body | 否 | values 默认参与统一值匹配，false 可关闭。axioms 公理、inferences 推论、evidence 证明过程默认关闭，需显式设为 true；evidence 仅在 inferences 同时开启时返回证明。公理与证明开关仅影响响应，平台仍执行公理校验和查询约束。 |

返回：data 包含 bindings（逐词 BOUND/AMBIGUOUS/UNMATCHED）、candidates（类型、归属、可用用途、简要匹配依据）、values（可用筛选条件）、sessionId、ontologyVersion 和 refs。compact 仅返回对象与直接指标摘要；公式依赖、完整关系和层级仅在 standard/full 返回。retrieval.status 为 MATCHED、PARTIAL_MATCH、NO_MATCH 或 AMBIGUOUS；未命中项位于 unmatchedTerms，candidates 包含匹配原因，ambiguities 由调用方确认。会话固定版本，有效期 30 分钟。

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
    "values": true,
    "axioms": false,
    "inferences": false,
    "evidence": false
  }
}
```


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| sessionId / expiresAt | string | 固定版本会话及过期时间。 |
| ontologyVersion / projection | number / string | 实际版本与投影模式。 |
| bindings[] | object[] | term、role、status；BOUND 返回 selected，值绑定还返回 filter；AMBIGUOUS 返回 candidateReferences。 |
| bindings[].selected | object | kind、id、objectId、propertyId；对象维度使用主名称属性。 |
| candidates[] | object[] | 候选类型、业务标签、所属对象及属性、匹配原因、优先级和可用用途。 |
| values[] | object[] | 匹配值及归属，filter 可用于 EQ 筛选。 |
| retrieval | object | status、unmatchedTerms、notice；MATCHED、PARTIAL_MATCH、NO_MATCH、AMBIGUOUS。 |
| ambiguities[] | object[] | 待澄清词条、原因与候选。 |
| objects[] / metrics[] | object[] | compact 为直接命中对象和指标摘要，standard/full 返回详细定义。 |
| relations[] / hierarchies[] / relationPaths[] | object[] | standard/full 中返回相关构造信息；compact 为空数组。 |
| axioms[] / inferences[] | object[] | include 对应开关显式开启时返回。 |
| refs | object | 兼容会话短引用映射；新调用可直接使用稳定 ID。 |
| contextDigest / tokenEstimate | string / number | 上下文摘要与估计 token 数。 |

## 执行语义查询

`POST /v1/semantic-query`

INTENT（默认）按业务名称一次完成检索、绑定、SQL 编译与执行；AUTO 解析自然语言问题；FIXED_SHAPE 按明确的对象与指标 ID 编译查询；ANALYSIS 返回分析上下文和任务信息。执行前应用本体公理和 SQL 安全约束。

所需权限：semantic:read + semantic:plan；INTENT / AUTO / FIXED_SHAPE 还需 data:execute

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| queryMode | body | 是 | INTENT 默认按 intent 一次绑定并执行；AUTO 自然语言查询；FIXED_SHAPE 明确查询结构；ANALYSIS 仅返回分析任务与上下文。 |
| intent | body | 否 | 业务查询结构：metrics 指标或度量名称（必填）；dimensions 对象或属性名称；filters 为 {value, object?, property?}，使用值索引绑定；time 为 {field, period}，period 支持 CURRENT_YEAR/PREVIOUS_YEAR/CURRENT_MONTH/PREVIOUS_MONTH/TODAY/YESTERDAY；sort 为 {field, direction}，field 必须对应已选指标或维度；limit 限制返回行数。 |
| namespace | body | 是 | 本体命名空间。 |
| ontologyVersion | body | 否 | 发布版本号或 latest；有 sessionId 时须与会话版本一致。 |
| question | body | 否 | AUTO 与 ANALYSIS 使用的自然语言问题。 |
| queryShape | body | 否 | FIXED_SHAPE 必填。包含 rootObjectId、measureIds、dimensionPropertyIds、filters、sort 等；measureIds 可直接传可分析 NUMBER 属性 ID，按其默认聚合执行，与已命名指标保持独立口径；具体 ID 从本体或语义上下文取得。 |
| parameters | body | 否 | 查询结构中参数占位符的名称与取值。 |
| sessionId | body | 否 | 语义上下文返回的会话 ID，用于固定版本和解析短引用。 |
| pagination | body | 否 | pageSize 每页 1–10000 行；下一页使用 completeness.nextCursor，保持查询和参数一致。 |
| options | body | 否 | 可开启 includeResolution、includeOntologyContext、includeAxioms、includeInferenceEvidence、includeQueryIr、includeSqlPreview。 |

返回：返回执行信封。status 可为 SUCCEEDED、NEEDS_INPUT、NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED；NEEDS_INPUT 时按 data.missing 补充请求，NEEDS_CLARIFICATION 时提交候选选择。成功时 data 含 columns、rows、rowCount，INTENT 另含 businessSummary 业务口径摘要，可选返回 SQL、查询计划和推理依据。HTTP 200 仍需检查 status 与 completeness。

```json
{
  "namespace": "retail",
  "queryMode": "INTENT",
  "intent": {
    "metrics": [
      "销售额"
    ],
    "dimensions": [
      "店铺"
    ]
  }
}
```


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| columns[] | string[]（成功时） | 返回列名，按结果顺序排列。 |
| rows[] | object[]（成功时） | 结果行；对象键与 columns 对应。无匹配数据可为空数组。 |
| rowCount / truncated | number / boolean | 本次返回行数与截断状态。 |
| ontologyVersion / resolutionMode | number / string | 实际本体版本及查询模式。 |
| businessSummary | object（INTENT 成功时） | 业务口径摘要：metrics、dimensions、filters 和 time。 |
| businessSummary.filters[] | object[] | 每项含 object、property、value，说明实际筛选归属。 |
| planId | string（成功时） | 本次编译查询计划标识。 |
| queryIr | object（可选） | options.includeQueryIr=true 返回：rootObjectId、measureIds、dimensionPropertyIds、filters、relationIds、timeRange、sort、limit。 |
| sqlPreview | object（可选） | options.includeSqlPreview=true 返回 sql 与 parameters；参数值脱敏为问号。此开关仍会执行查询，不是仅预览。 |
| resolution / ontologyContext | object（可选） | includeResolution / includeOntologyContext 控制绑定和上下文详情。 |
| axioms / inferenceEvidence | array（可选） | includeAxioms / includeInferenceEvidence 控制规则和推论证据。 |
| missing[] | object[]（NEEDS_INPUT） | field、term、reason；补充业务信息或修复定义后重新查询，不执行 SQL。 |
| clarificationId | string（NEEDS_CLARIFICATION） | 用于继续接口的路径参数，有效期 30 分钟。 |
| clarifications[] | object[]（NEEDS_CLARIFICATION） | id、term、reason、candidates；每个候选含 id、label、object、property。selections 使用原样返回的候选 ID。 |
| context / acceptanceContract | object（ANALYSIS_READY） | 分析上下文与验收约束；该模式不执行数据查询。 |

### 响应示例（成功为完整信封，其余为关键字段）

```json
{
  "success": {
    "requestId": "req_example",
    "namespace": "retail",
    "ontologyVersion": 1,
    "status": "SUCCEEDED",
    "data": {
      "columns": [
        "标准店名",
        "销售金额"
      ],
      "rows": [
        {
          "标准店名": "示例店铺",
          "销售金额": 1200
        }
      ],
      "rowCount": 1,
      "truncated": false,
      "ontologyVersion": 1,
      "resolutionMode": "INTENT",
      "businessSummary": {
        "metrics": [
          "销售金额"
        ],
        "dimensions": [
          "标准店名"
        ],
        "filters": [],
        "time": "今年"
      },
      "planId": "plan_example"
    },
    "warnings": [],
    "auditId": "audit_example",
    "completeness": {
      "complete": true,
      "truncated": false,
      "nextCursor": null
    }
  },
  "missing": {
    "status": "NEEDS_INPUT",
    "data": {
      "status": "NEEDS_INPUT",
      "missing": [
        {
          "field": "filter_0",
          "term": "线上渠道",
          "reason": "与指标对象之间没有可安全使用的关联路径"
        }
      ]
    }
  },
  "clarification": {
    "status": "NEEDS_CLARIFICATION",
    "data": {
      "status": "NEEDS_CLARIFICATION",
      "clarificationId": "clar_example",
      "clarifications": [
        {
          "id": "filter_0",
          "term": "线上",
          "reason": "请确认业务含义",
          "candidates": [
            {
              "id": "[\"value\",\"value_example\",\"p_channel\"]",
              "label": "线上",
              "object": "组织单元",
              "property": "组织单元名称"
            }
          ]
        }
      ]
    }
  },
  "error": {
    "status": "FAILED",
    "error": {
      "code": "INVALID_REQUEST",
      "message": "请求参数不符合契约",
      "stage": "binding",
      "retryable": false
    }
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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| columns[] | string[]（成功时） | 返回列名，按结果顺序排列。 |
| rows[] | object[]（成功时） | 结果行；对象键与 columns 对应。无匹配数据可为空数组。 |
| rowCount / truncated | number / boolean | 本次返回行数与截断状态。 |
| ontologyVersion / resolutionMode | number / string | 实际本体版本及查询模式。 |
| businessSummary | object（INTENT 成功时） | 业务口径摘要：metrics、dimensions、filters 和 time。 |
| businessSummary.filters[] | object[] | 每项含 object、property、value，说明实际筛选归属。 |
| planId | string（成功时） | 本次编译查询计划标识。 |
| queryIr | object（可选） | options.includeQueryIr=true 返回：rootObjectId、measureIds、dimensionPropertyIds、filters、relationIds、timeRange、sort、limit。 |
| sqlPreview | object（可选） | options.includeSqlPreview=true 返回 sql 与 parameters；参数值脱敏为问号。此开关仍会执行查询，不是仅预览。 |
| resolution / ontologyContext | object（可选） | includeResolution / includeOntologyContext 控制绑定和上下文详情。 |
| axioms / inferenceEvidence | array（可选） | includeAxioms / includeInferenceEvidence 控制规则和推论证据。 |
| missing[] | object[]（NEEDS_INPUT） | field、term、reason；补充业务信息或修复定义后重新查询，不执行 SQL。 |
| clarificationId | string（NEEDS_CLARIFICATION） | 用于继续接口的路径参数，有效期 30 分钟。 |
| clarifications[] | object[]（NEEDS_CLARIFICATION） | id、term、reason、candidates；每个候选含 id、label、object、property。selections 使用原样返回的候选 ID。 |
| context / acceptanceContract | object（ANALYSIS_READY） | 分析上下文与验收约束；该模式不执行数据查询。 |

### 响应示例（成功为完整信封，其余为关键字段）

```json
{
  "success": {
    "requestId": "req_example",
    "namespace": "retail",
    "ontologyVersion": 1,
    "status": "SUCCEEDED",
    "data": {
      "columns": [
        "标准店名",
        "销售金额"
      ],
      "rows": [
        {
          "标准店名": "示例店铺",
          "销售金额": 1200
        }
      ],
      "rowCount": 1,
      "truncated": false,
      "ontologyVersion": 1,
      "resolutionMode": "INTENT",
      "businessSummary": {
        "metrics": [
          "销售金额"
        ],
        "dimensions": [
          "标准店名"
        ],
        "filters": [],
        "time": "今年"
      },
      "planId": "plan_example"
    },
    "warnings": [],
    "auditId": "audit_example",
    "completeness": {
      "complete": true,
      "truncated": false,
      "nextCursor": null
    }
  },
  "missing": {
    "status": "NEEDS_INPUT",
    "data": {
      "status": "NEEDS_INPUT",
      "missing": [
        {
          "field": "filter_0",
          "term": "线上渠道",
          "reason": "与指标对象之间没有可安全使用的关联路径"
        }
      ]
    }
  },
  "clarification": {
    "status": "NEEDS_CLARIFICATION",
    "data": {
      "status": "NEEDS_CLARIFICATION",
      "clarificationId": "clar_example",
      "clarifications": [
        {
          "id": "filter_0",
          "term": "线上",
          "reason": "请确认业务含义",
          "candidates": [
            {
              "id": "[\"value\",\"value_example\",\"p_channel\"]",
              "label": "线上",
              "object": "组织单元",
              "property": "组织单元名称"
            }
          ]
        }
      ]
    }
  },
  "error": {
    "status": "FAILED",
    "error": {
      "code": "INVALID_REQUEST",
      "message": "请求参数不符合契约",
      "stage": "binding",
      "retryable": false
    }
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

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| sourceId | string | 数据源标识。 |
| configured | boolean（未配置时） | 未配置时返回 false；已配置时返回 payload。 |
| credentialConfigured | boolean（已配置时） | 是否已保存密码，不代表连接测试通过。 |
| payload | object（已配置时） | host、port、username、catalog、database、tls；不返回明文密码。 |
| updatedAt | string（可选） | 配置更新时间。 |
| tables[] | object[] | 已扫描表；含 name、comment、columns、fingerprint、scannedAt。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| sourceId | string | 数据源标识。 |
| configured | boolean（未配置时） | 未配置时返回 false；已配置时返回 payload。 |
| credentialConfigured | boolean（已配置时） | 是否已保存密码，不代表连接测试通过。 |
| payload | object（已配置时） | host、port、username、catalog、database、tls；不返回明文密码。 |
| updatedAt | string（可选） | 配置更新时间。 |

## 测试数据源连接

`POST /v1/data-sources/{sourceId}:test`

使用已保存的连接配置测试数据库可用性。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |

返回：data 为连接测试结果；连接或认证失败时返回错误详情。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| status | string | 连接测试结果。 |
| databaseVersion | string | 数据库返回的版本。 |
| elapsedMs | number | 测试耗时，毫秒。 |

## 扫描表结构

`POST /v1/data-sources/{sourceId}/schema:scan`

读取数据库表名、注释和字段元数据并保存，供后续本体建模使用。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | path | 是 | 数据源标识，控制台默认使用 selectdb。 |

返回：data 包含 sourceId 和 tables，各表包含字段、注释、结构指纹及扫描时间。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| sourceId | string | 扫描的数据源。 |
| tables[] | object[] | 表 ID、catalog、database、name、type、comment、status、fingerprint、scannedAt。 |
| tables[].columns[] | object[] | name、dataType、nullable、comment、sensitive 等字段元数据。 |

## 读取值索引状态

`GET /v1/namespaces/{ns}/value-index/status`

查看某个发布版本的属性值索引状态及失败情况。

所需权限：semantic:read

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 包含索引状态、属性数、值数和失败属性数。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| status | string | empty / building / ready / partial / failed。 |
| properties | number | 参与索引的属性数。 |
| valuesCount | number | 已索引值数量。 |
| coveredRows | number | 覆盖行数。 |
| failedProperties | number / null | 失败属性数；空索引可能为 null。 |
| updatedAt | string / null | 最近更新时间。 |

## 重建属性值索引

`POST /v1/namespaces/{ns}/value-index:rebuild`

针对指定发布版本重建允许值检索的属性索引；此操作会读取数据库中的属性值。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| ns | path | 是 | 本体命名空间，例如 retail。 |
| version | query | 否 | 发布版本号或 latest；省略时读取最新发布版本。 |

返回：data 返回本轮索引状态与统计，包含 properties、valuesCount 和 failedProperties。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| status | string | empty / building / ready / partial / failed。 |
| properties | number | 参与索引的属性数。 |
| valuesCount | number | 已索引值数量。 |
| coveredRows | number | 覆盖行数。 |
| failedProperties | number / null | 失败属性数；空索引可能为 null。 |
| updatedAt | string / null | 最近更新时间。 |

## 列出 API 客户端

`GET /v1/system/api-clients`

查看已创建客户端的权限范围、状态和调用限额。

所需权限：system:admin

无参数，无请求体。

返回：data 为客户端列表，不包含可恢复的明文 API Key。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| [].clientId / [].name | string | 客户端 ID 和名称。 |
| [].scopes[] | string[] | 已授权权限。 |
| [].status | string | ACTIVE / DISABLED。 |
| [].rateLimit | number | 每分钟调用限额。 |
| [].rotatedAt | string | 密钥更新时间；列表不返回明文密钥。 |

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


### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| clientId | string | 新客户端 ID。 |
| apiKey | string | 新密钥，仅本次响应提供，立即安全保存。 |
| warning | string | 密钥保存提示。 |

## 撤销 API 客户端

`DELETE /v1/system/api-clients/{clientId}`

撤销指定客户端，使其密钥不能继续调用平台。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| clientId | path | 是 | 客户端列表或创建响应中的 clientId。 |

返回：data.deleted 为 true。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| deleted | boolean | 成功撤销为 true。 |

## 读取调用审计

`GET /v1/system/audit-events`

按时间范围、密钥名称或客户端 ID、调用事件筛选 API 请求及业务审计事件，支持分页及范围内完整调用统计。

所需权限：system:admin

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| start | query | 否 | 开始时间（含），ISO 8601，须带时区。 |
| end | query | 否 | 结束时间（含），ISO 8601，须带时区。 |
| clientId | query | 否 | 精确匹配密钥所属客户端 ID；bootstrap 为管理员，anonymous 为未认证请求。 |
| clientName | query | 否 | 按密钥名称包含匹配，大小写不敏感。 |
| event | query | 否 | 精确匹配调用事件，例如 GET /v1/namespaces/:ns/summary 或 ValueIndexFailed。 |
| includeSummary | query | 否 | true 返回 events、total、overview 和筛选选项；默认 false 保持事件数组。 |
| limit | query | 否 | 每页条数，1–200，默认 100。 |
| offset | query | 否 | 分页偏移量，从 0 开始。 |

返回：默认 data 为事件数组；includeSummary=true 时返回 events、total、overview、filters、limit、offset。overview 仅统计匹配的 HTTP 请求，HTTP 状态码小于 400 为成功；不会将业务事件重复计数。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| [].auditId / [].requestId | string | 审计与请求标识。 |
| [].eventType / [].event | string | 原始类型及调用事件（方法＋路由或业务事件名）。 |
| [].clientId / [].clientName | string | 密钥所属客户端和显示名称。 |
| [].createdAt | string | 发生时间。 |
| [].payload | object | 脱敏后的事件数据。 |
| events[] | object[]（includeSummary=true） | 当前分页内事件，字段同默认数组。 |
| total | number（includeSummary=true） | 全部匹配事件数，不受分页限制。 |
| overview.calls / overview.failures | number | 匹配的 HTTP 请求数及 HTTP 状态码大于等于 400 的请求数。 |
| overview.successRate | number / null | HTTP 成功比例 0–1，无请求时为 null。 |
| overview.averageDurationMs | number / null | 所有匹配 HTTP 请求平均耗时（毫秒）。 |
| filters.clients[] / filters.events[] | array | 可筛选的客户端 ID、名称与调用事件；选项不受分页限制。 |
| limit / offset | number | 本次分页条数及偏移。 |

## 读取服务指标

`GET /v1/system/metrics`

查看当前进程运行时间、内存，以及各路由调用量、错误量和延迟。

所需权限：system:admin

无参数，无请求体。

返回：data 包含 uptimeSeconds、memory 和 routes；路由指标含 count、errors、p95Ms、maxMs。

### 公共响应信封

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| requestId | string | 本次请求标识。 |
| namespace | string | 本体命名空间；系统操作为 system。 |
| ontologyVersion | number（可选） | 本次实际使用的发布版本；系统操作可能省略。 |
| status | string | 业务状态；HTTP 200 不代表查询已完成。 |
| data | object / array | 本接口业务数据，结构见下方。 |
| auditId | string | 用于关联调用审计。 |
| warnings | array | 警告列表。 |
| completeness.complete | boolean | 是否完整；结合 truncated 和 nextCursor 判断。 |
| completeness.truncated | boolean | 是否有未返回数据。 |
| completeness.nextCursor | string / null | 下一页游标；查询分页保持版本、条件和参数一致。 |
| error.code | string（失败时） | 稳定错误码，用于程序分支。 |
| error.message | string（失败时） | 可读错误说明。 |
| error.stage | string（失败时） | 失败阶段，例如 binding、planning、session。 |
| error.retryable | boolean（失败时） | 是否适合重试。 |
| error.action / error.details | string / object（可选） | 修复建议及错误详情；失败时 data 可能不存在。 |

### 业务响应字段（相对于 data）

| 字段路径 | 类型与条件 | 说明 |
| --- | --- | --- |
| uptimeSeconds | number | 进程已运行秒数。 |
| memory | object | Node 进程内存统计，单位字节。 |
| routes | object | 按路由分组；count 调用数、errors 错误数、p95Ms 和 maxMs 延迟。 |
