export interface ApiDoc { summary: string; description: string; scopes: string; returns: string }
const doc = (summary: string, description: string, scopes: string, returns: string): ApiDoc => ({ summary, description, scopes, returns });
export const API_DOCS = {
  GetHealth: doc("检查服务状态", "查看服务版本、组件配置状态和服务器时间；组件显示已配置不代表数据库连接测试通过。", "无需认证", "直接返回状态对象，包含 status、version、kernelVersion、components、time。"),
  GetOpenApiDocument: doc("读取 API 契约", "获取当前服务提供的 OpenAPI 3.1 文档，包含接口、参数、请求结构和中文说明。", "无需认证", "直接返回 OpenAPI 文档，主要字段为 paths、components.schemas、info。"),
  GetOntologySummary: doc("读取本体概览", "查看指定发布版本的对象、关系、指标、层级数量和版本摘要。", "ontology:read", "data 包含版本信息、counts 和 contentDigest；响应头提供 ETag。"),
  GetOntologySnapshot: doc("读取本体快照", "导出指定发布版本的本体、公理和推论，遵循敏感字段导出边界。If-None-Match 可用于缓存校验。", "ontology:read", "data 为完整可导出快照；ETag 匹配时返回 HTTP 304，响应体为空。"),
  GetOntologyGraph: doc("读取本体图谱", "按关系、指标或公理视图获取图谱节点和连线。", "ontology:read", "data 包含 ontologyVersion、nodes 和 edges。"),
  ListOntologyVersions: doc("列出发布版本", "查看命名空间的发布历史，用于选择查询版本或创建回滚草稿。", "ontology:read", "data 为版本列表，包含发布时间、变更说明及定义数量。"),
  DiffOntologyVersions: doc("比较本体版本", "比较目标版本与基线，查看对象、关系、指标、公理及推论的增删改。", "ontology:read", "data 包含 baseVersion 及各类定义的 added、changed、removed。"),
  CreateOntologyDraft: doc("创建本体草稿", "基于发布版本创建可编辑草稿；空命名空间可从 latest 创建首个草稿。sourceVersion 用于将历史版本复制为回滚草稿。", "ontology:draft", "data 包含 draftId、revision、snapshot、physicalTables 和已有回归报告。"),
  GetOntologyDraft: doc("读取本体草稿", "读取草稿及其当前修订号，后续修改需要提交该 revision。", "ontology:draft", "data 包含草稿快照、revision、已扫描表和回归报告；草稿不存在时返回 404。"),
  PatchOntologyDraft: doc("修改本体草稿", "以一组原子操作新增、更新或移除对象、关系、指标和层级，同时生成公理校验结果。保存成功不等于可发布。", "ontology:draft", "data 返回新 revision、snapshot 和 validation；并发修订冲突返回 409。"),
  ValidateOntologyDraft: doc("校验草稿", "执行公理校验和可选的查询编译回归，预览推论；回归只编译查询，不执行正式业务查询。", "ontology:draft", "data 包含 valid、issues、公理与推论及回归结果；valid 为 false 时应修复后再发布。"),
  PublishOntologyDraft: doc("发布本体版本", "校验草稿及基线一致性后生成不可变发布版本，并启动值索引重建。", "ontology:publish", "data 为已发布快照；校验不通过或基线版本过期时拒绝发布。索引进度通过值索引状态接口查看。"),
  ListAxiomAssertions: doc("列出公理实例", "读取指定版本根据对象、属性、关系和指标定义固化的规则。", "ontology:read", "data 为公理数组，包含 axiomCode、parameters、enforcement 和 sourceDefinitionIds。"),
  ListInferredAssertions: doc("列出推论", "读取指定版本的关系可达性、查询策略、血缘及指标重算等确定性推论。", "ontology:read", "data 为推论数组，包含 predicate、axiomAssertionIds、premiseAssertionIds 和 proof。"),
  ExplainInference: doc("解释推论依据", "按版本与推论 ID 查看完整证明路径；推论 ID 可从推论列表或语义上下文取得。", "ontology:read", "data 为推论及其 FACT、AXIOM、DERIVATION 证明步骤；不存在时返回 404。"),
  ResolveOntologyContext: doc("解析语义上下文", "检索业务定义候选。推荐 Agent 提取 concepts（指标、维度、筛选字段、时间字段）；平台按完整名称、编码或同义词匹配，并补充连接路径及公理。question 单独使用时仅做词典匹配。接口不调用模型、不执行数据查询。", "semantic:read", "data 包含 sessionId、ontologyVersion、objects、metrics、relations、values、axioms、inferences、refs、ambiguities 和 contextDigest。retrieval.status 为 MATCHED、PARTIAL_MATCH、NO_MATCH 或 AMBIGUOUS；未命中项位于 unmatchedTerms，candidates 包含匹配原因，ambiguities 由调用方确认。会话固定版本，有效期 30 分钟。"),
  ExecuteSemanticQuery: doc("执行语义查询", "AUTO 解析自然语言问题；FIXED_SHAPE 按明确的对象与指标 ID 编译查询；ANALYSIS 返回分析上下文和任务信息。执行前应用本体公理和 SQL 安全约束。", "semantic:read + semantic:plan；AUTO / FIXED_SHAPE 还需 data:execute", "返回执行信封。status 可为 SUCCEEDED、NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED；成功时 data 含 columns、rows、rowCount，可选返回 SQL、查询计划和推理依据。HTTP 200 仍需检查 status 与 completeness。"),
  ContinueSemanticQuery: doc("提交澄清并继续查询", "当语义查询返回 NEEDS_CLARIFICATION 时，提交该次澄清所需的全部选择，继续原版本查询。", "semantic:read + semantic:plan + data:execute", "返回与语义查询一致的执行信封；无效、过期或不完整的选择会返回错误状态。"),
  GetDataSource: doc("读取数据源配置", "读取已保存的连接信息及扫描到的物理表，密码不会明文返回。数据源配置不要求已有本体。", "system:admin", "data 包含配置状态、payload、updatedAt 和 tables；未配置时 configured 为 false。"),
  PutDataSource: doc("保存数据源连接", "保存 SelectDB 连接并更新凭据缓存。首次配置提供密码；修改时省略 password 保留原密码。", "system:admin", "data 为已保存的连接元数据，密码加密存储且不在响应中明文返回。"),
  TestDataSource: doc("测试数据源连接", "使用已保存的连接配置测试数据库可用性。", "system:admin", "data 为连接测试结果；连接或认证失败时返回错误详情。"),
  ScanDataSourceSchema: doc("扫描表结构", "读取数据库表名、注释和字段元数据并保存，供后续本体建模使用。", "system:admin", "data 包含 sourceId 和 tables，各表包含字段、注释、结构指纹及扫描时间。"),
  GetValueIndexStatus: doc("读取值索引状态", "查看某个发布版本的属性值索引状态及失败情况。", "semantic:read", "data 包含索引状态、属性数、值数和失败属性数。"),
  RebuildValueIndex: doc("重建属性值索引", "针对指定发布版本重建允许值检索的属性索引；此操作会读取数据库中的属性值。", "system:admin", "data 返回本轮索引状态与统计，包含 properties、valuesCount 和 failedProperties。"),
  ListApiClients: doc("列出 API 客户端", "查看已创建客户端的权限范围、状态和调用限额。", "system:admin", "data 为客户端列表，不包含可恢复的明文 API Key。"),
  CreateApiClient: doc("创建 API 客户端", "创建带指定权限和调用限额的客户端，系统自动生成密钥。", "system:admin", "data 包含 clientId 和 apiKey。明文密钥仅在创建响应中提供一次，请当次保存。"),
  RevokeApiClient: doc("撤销 API 客户端", "撤销指定客户端，使其密钥不能继续调用平台。", "system:admin", "data.deleted 为 true。"),
  ListAuditEvents: doc("读取调用审计", "查看最近的请求及业务审计事件，可根据返回的 auditId 关联调用过程。", "system:admin", "data 为审计事件数组，包含 auditId、eventType、createdAt 和脱敏 payload。"),
  GetSystemMetrics: doc("读取服务指标", "查看当前进程运行时间、内存，以及各路由调用量、错误量和延迟。", "system:admin", "data 包含 uptimeSeconds、memory 和 routes；路由指标含 count、errors、p95Ms、maxMs。"),
} as const;

export const REQUEST_DOCS: Record<string, { fields: Record<string, string>; example: unknown }> = {
  ResolveSemanticContextInput: { fields: { namespace: "本体命名空间，例如 retail。", ontologyVersion: "发布版本号或 latest；省略时选择最新发布版本。", question: "保留用户原问题。未传 concepts 或非空 terms 时才用于完整词典词的包含匹配，不进行自然语言意图或时间解析。", terms: "完整业务术语数组，最多 32 项；按名称、编码或同义词精确匹配。优先级 concepts > terms > question。", concepts: "Agent 提取的业务概念：metrics 命名指标或对象度量字段的名称/编码、dimensions 维度属性名称、filters 筛选属性名称、time 时间属性名称，均为字符串数组，每类最多 16 项。不要把今年等时间表达式或筛选值放入字段名数组。concepts、terms、question 至少一项非空；提供 concepts 时只按 concepts 检索。", purpose: "用途：ANSWER 回答、PLAN 规划、EXPLAIN 解释、MODEL 建模。", projection: "已选对象字段详细程度：compact（默认）、standard、full；均只包含相关属性，不会扩展检索范围。敏感字段边界始终生效。", include: "开关：values 值匹配、axioms 公理、inferences 推论、evidence 证明过程；全部默认关闭，需显式设为 true；evidence 仅在 inferences 同时开启时返回证明。仅影响响应，平台仍执行公理校验和查询约束。" }, example: { namespace: "retail", ontologyVersion: "latest", question: "按店铺查看销售额", concepts: { metrics: ["销售额"], dimensions: ["店铺"] }, purpose: "PLAN", include: { values: true, axioms: false, inferences: false, evidence: false } } },
  ExecuteSemanticQueryInput: { fields: { queryMode: "AUTO 自然语言查询；FIXED_SHAPE 明确查询结构；ANALYSIS 仅返回分析任务与上下文。", namespace: "本体命名空间。", ontologyVersion: "发布版本号或 latest；有 sessionId 时须与会话版本一致。", question: "AUTO 与 ANALYSIS 使用的自然语言问题。", queryShape: "FIXED_SHAPE 必填。包含 rootObjectId、measureIds、dimensionPropertyIds、filters、sort 等；measureIds 可直接传可分析 NUMBER 属性 ID，按其默认聚合执行，与已命名指标保持独立口径；具体 ID 从本体或语义上下文取得。", parameters: "查询结构中参数占位符的名称与取值。", sessionId: "语义上下文返回的会话 ID，用于固定版本和解析短引用。", pagination: "pageSize 每页 1–10000 行；下一页使用 completeness.nextCursor，保持查询和参数一致。", options: "可开启 includeResolution、includeOntologyContext、includeAxioms、includeInferenceEvidence、includeQueryIr、includeSqlPreview。" }, example: { namespace: "retail", ontologyVersion: "latest", queryMode: "ANALYSIS", question: "按店铺查看销售额", options: { includeAxioms: false, includeInferenceEvidence: false } } },
  ContinueSemanticQueryInput: { fields: { selections: "澄清响应中的项目 ID 到所选候选项 ID 的映射，需一次提交全部选择。" }, example: { selections: { "待选择项目ID": "候选项ID" } } },
  CreateDraftInput: { fields: { baseVersion: "基线版本号或 latest，默认 latest。", sourceVersion: "可选历史内容版本；用于创建回滚草稿，发布仍以 baseVersion 检查并发。" }, example: { baseVersion: "latest" } },
  DraftPatchInput: { fields: { revision: "当前草稿修订号，需使用最近一次响应中的值；也可用 If-Match 请求头提供。", operations: "非空操作数组。UPSERT_OBJECT / UPSERT_RELATION / UPSERT_METRIC / UPSERT_HIERARCHY 携带完整 value；REMOVE_* 携带 id。操作原子保存，公理问题通过 validation 返回。" }, example: { revision: 1, operations: [{ op: "REMOVE_RELATION", id: "待移除关系ID" }] } },
  ValidateDraftInput: { fields: { goldenCases: "可选、最多 100 条查询编译回归；每条包含 id、label、queryShape 和 expected（可检查 SQL 片段及所用定义 ID）。" }, example: {} },
  PublishDraftInput: { fields: { baseVersion: "创建草稿时的基线发布版本。首次发布为 0，必须与最新发布版本一致。", changeSummary: "本次发布变更说明。" }, example: { baseVersion: 0, changeSummary: "首次发布业务本体" } },
  DataSourceInput: { fields: { host: "SelectDB 主机名或 IP。", port: "数据库 MySQL 协议端口，例如 9030。", username: "数据库用户名。", password: "首次连接密码；后续省略此字段保留已保存密码。", catalog: "数据目录，例如 internal。", database: "需要扫描的数据库名称。", tls: "是否启用 TLS；应与服务端支持情况一致。" }, example: { host: "selectdb.example.com", port: 9030, username: "readonly_user", password: "请填写数据库密码", catalog: "internal", database: "retail", tls: false } },
};

export const PATH_DESCRIPTIONS: Record<string, string> = { ns: "本体命名空间，例如 retail。", sourceId: "数据源标识，控制台默认使用 selectdb。", version: "目标发布版本号，从版本列表取得，不能填写 latest。", draftId: "创建或读取草稿返回的 draftId。", id: "该版本推论列表中的推论 ID。", clarificationId: "NEEDS_CLARIFICATION 响应中的澄清 ID。", clientId: "客户端列表或创建响应中的 clientId。" };
