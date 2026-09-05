const terminology: Record<string, string> = {
  OBJECT: "对象", PROPERTY: "属性", ENTITY: "业务实体", EVENT: "业务事件", SNAPSHOT: "状态快照", AGGREGATE: "汇总结果", RELATIONSHIP: "关联关系", METRIC: "指标", RELATION: "关系", HIERARCHY: "层级",
  GENERAL: "一般数字", REFERENCE: "实体引用", COMPOSITION: "组成关系", ASSOCIATION: "业务关联", EVENT_PARTICIPATION: "事件参与", OWNED: "独占归属", SHARED: "共享归属",
  IDENTITY: "身份", GRAIN: "粒度", TYPE: "类型", METRIC_ALGEBRA: "度量代数", VISIBILITY: "可见性",
  DRAFT_VALIDATION: "草稿校验", PUBLISH_VALIDATION: "发布校验", SEMANTIC_PLANNING: "语义规划", QUERY_COMPILATION: "查询编译",
  ERROR: "错误", WARNING: "警告", INVARIANT: "约束", FACT: "已知事实", AXIOM: "适用公理", DERIVATION: "推导结论",
  ANALYTICAL: "分析可见", DETAIL_ONLY: "仅明细可见", HIDDEN: "隐藏", ENTITY_REFERENCE: "实体引用", ID: "唯一标识", NAME: "名称", CODE: "编码", CATEGORY: "类别", TIME: "时间", NUMBER: "数值", BOOLEAN: "布尔值", GEOGRAPHY: "地理信息", TEXT: "文本",
  ADDITIVE: "可加", SEMI_ADDITIVE: "半可加", NON_ADDITIVE: "不可加", RATIO: "比例", CURRENCY: "金额", COUNT: "计数", QUANTITY: "数量", DURATION: "时长", AMOUNT: "金额", SUM: "求和", AVG: "平均值", MAX: "最大值", MIN: "最小值", NONE: "无", CUSTOM: "自定义", COUNT_DISTINCT: "去重计数",
  SOURCE_TO_TARGET: "来源到目标", TARGET_TO_SOURCE: "目标到来源", BIDIRECTIONAL: "双向", ONE_TO_ONE: "一对一", ONE_TO_MANY: "一对多", MANY_TO_ONE: "多对一", MANY_TO_MANY: "多对多", HIGH: "高风险", LOW: "低风险", POSSIBLE: "可能扩行",
  FIXED_LEVELS: "固定层级", ADJACENCY_LIST: "父子层级", PUBLISHED: "已发布", DRAFT: "草稿", VERIFIED: "已校验", DEPRECATED: "已停用", BASE: "基础指标", DERIVED: "派生指标",
  RELATION_REACHABLE: "关系可达", HIERARCHY_REACHABLE: "层级可上卷", RATIO_REAGGREGATION: "比例重新汇总",
  PRE_AGGREGATE_CHILD: "按整体维度汇总组成部分", EXISTS_ONLY: "仅用于存在性筛选", RELATION_QUERY_POLICY: "关系查询策略", RELATION_LINEAGE: "派生血缘依据",
  sourceObjectId: "来源对象", targetObjectId: "目标对象", sourcePropertyId: "来源字段", targetPropertyId: "目标字段", joinExpression: "字段等值映射", required: "必须匹配", enabled: "启用", composition: "组成语义", parentObjectId: "整体对象", childObjectId: "组成部分", ownership: "归属方式", aggregationPolicy: "汇总策略",
  objectType: "对象类型", grainPropertyIds: "粒度属性", unique: "是否唯一", visibility: "可见性", numericSpec: "数字语义", kind: "类型", currency: "币种", unit: "单位", defaultAggregation: "默认聚合", aggregationBehavior: "聚合行为", numerator: "分子指标", denominator: "分母指标", direction: "方向", cardinality: "对应数量关系", fanoutRisk: "扩行风险", valueSearchable: "允许值检索", exportable: "允许导出", timeAggregation: "时间聚合", timePropertyId: "时间属性", numeratorPropertyId: "分子属性", denominatorPropertyId: "分母属性", scale: "倍数", precision: "精度",
};
const rules: Record<string, [string, string]> = {
  RELATION_BINDING: ["关系字段映射有效", "两端关联字段必须存在、非敏感且分析可见，等值映射必须与实际查询连接一致。"],
  RELATION_REFERENCE: ["实体引用指向唯一目标", "引用方通过一对一或多对一连接目标标识，查询遵循声明的方向和匹配要求。"],
  RELATION_ASSOCIATION: ["业务关联受查询约束", "关联使用明确的字段映射；方向控制可达路径，数量关系和扩行风险限制聚合。"],
  RELATION_COMPOSITION: ["组成关系遵循归属与汇总策略", "整体端必须唯一，归属不能成环或违反独占要求。子对象指标按整体维度汇总；仅存在性策略禁止展开对象。"],
  RELATION_HIERARCHY: ["实体层级有序且无环", "下级指向唯一上级，层级不能成环；查询沿声明方向逐级连接。"],
  RELATION_EVENT: ["事件参与指向业务实体", "业务事件通过实体引用字段连接参与实体的唯一标识。"],
  RELATION_IDENTITY: ["身份对应一对一", "两端都必须是唯一标识，以一对一关系连接同一业务身份的不同定义。"],
  RELATION_DERIVED: ["派生血缘可追溯且无环", "输出来源对象派生自目标对象的字段映射与证据，依赖不能成环，血缘不参与物理查询连接。"],
  IDENTITY_ENTITY_SINGLE: ["实体具有唯一身份", "实体必须恰好声明一个唯一标识属性，用于区分不同的业务实体。"],
  IDENTITY_EVENT_MAX_ONE: ["事件最多有一个唯一标识", "事件允许没有独立标识，但最多只能声明一个唯一标识属性，并需要明确行级粒度。"],
  RELATIONSHIP_REFERENCES_REQUIRED: ["关联对象连接至少两个实体", "关联对象需要至少两个实体引用属性，表达多个业务实体之间的联系。"],
  IDENTITY_ID_UNIQUE: ["标识属性唯一且可分析", "唯一标识属性必须声明唯一性，并允许用于分析关联。"],
  GRAIN_REQUIRED: ["业务粒度必须明确", "事件、快照、汇总和关联对象必须说明每条记录代表什么，并指定粒度属性。"],
  GRAIN_PROPERTIES_VALID: ["粒度属性有效", "所有粒度属性都必须属于当前对象，并且允许参与分析。"],
  NUMBER_SPEC_REQUIRED: ["数值属性具有业务语义", "数值属性需要声明数字类型、默认聚合方式和可加性，以确定正确的汇总口径。"],
  RATIO_NON_ADDITIVE: ["比例不能直接累加", "比例跨记录或层级汇总时，应先分别汇总分子和分母，再重新计算比例。"],
  SEMI_ADDITIVE_TIME: ["半可加值的时间约束", "余额等半可加数值不能沿时间维度直接求和，查询需要遵循定义中的时间聚合口径。"],
  VISIBILITY_SENSITIVE: ["敏感属性的使用边界", "敏感属性不能进入分析、业务值检索或本体导出。"],
  METRIC_SINGLE_FACT: ["派生指标使用同一事实对象", "派生指标的依赖必须存在，并且来自同一个事实对象，避免混合不同业务粒度。"],
  METRIC_DEPENDENCY_ACYCLIC: ["指标依赖不能成环", "指标之间的计算依赖必须能够按顺序展开，不能直接或间接依赖自身。"],
  RELATION_DIRECTIONAL_PATH: ["关系遵循声明方向", "查询沿关系声明的方向寻找关联路径，并检查当前方向是否安全。"],
  RELATION_CARDINALITY_FANOUT: ["关系避免重复扩行", "关联前检查一对一、多对一等数量关系，防止扩行导致指标被重复计算。"],
  RELATION_TARGET_ID: ["关系指向有效标识", "关联的目标属性必须是目标对象的唯一标识，确保连接有明确的业务含义。"],
  HIERARCHY_TRANSITIVE: ["层级关系可以传递", "有效的下级到上级关系可以逐级上卷；层级定义不能成环，引用的属性必须存在。"],
};
export function term(value: string): string { return terminology[value] ?? value; }
export function axiomTitle(code: string): string { return rules[code]?.[0] ?? term(code); }
export function axiomDescription(code: string): string { return rules[code]?.[1] ?? "该规则根据本体定义自动生成，用于保持语义一致。"; }
export function chineseParameters(value: unknown, resolve: (id: string) => string): unknown {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return term(resolve(value));
  if (Array.isArray(value)) return value.map(item => chineseParameters(item, resolve));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [term(key), chineseParameters(item, resolve)]));
  return value == null ? "未配置" : value;
}
