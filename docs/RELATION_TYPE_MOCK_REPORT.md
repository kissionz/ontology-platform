# 关系类型 Mock 验证报告

日期：2026-09-06。测试对象为当前开发代码（运行时基线 fa340bd）。本次只新增测试与报告，没有修改运行时规则，也没有访问正式 SelectDB。

## 方法与数据

使用内存 SQLite 保存 Mock 业务表与本体版本。查询经过平台绑定、现有 SQL 编译器和执行接口，实际执行兼容 SQLite 的 SQL，并断言行内容、金额和阻止执行次数。非法定义通过草稿修改及发布流程验证。

订单表：

| 订单 ID | 店铺引用 | 销售额 |
|---|---|---:|
| a | a | 100 |
| b | a | 200 |
| c | missing | 50 |

店铺 a 为“一店”，店铺 b 为“二店”，二者归属“一部”，再归属“线上事业部”。销售原始合计为 350，其中 50 没有匹配的店铺。

## 类型结果

| 关系类型 | 公理与配置检查 | Mock 执行结果 | 结论 |
|---|---|---|---|
| 引用 REFERENCE | 生成 RELATION_REFERENCE；目标非唯一标识时不能发布 | 可选关系 LEFT JOIN：一店 300，未匹配 50；改成必选并发布后 INNER JOIN：仅一店 300；旧版保持原结果 | 本次场景通过 |
| 关联 ASSOCIATION | 生成 RELATION_ASSOCIATION；错误一对一声明不能发布 | 多对一合计保持 350；多对多、停用和禁止方向下，查询被拒绝，执行器调用次数为 0 | 本次场景通过 |
| 组成 COMPOSITION | 生成 RELATION_COMPOSITION；父子对象错误不能发布；OWNED 多父归属被拦截 | PRE_AGGREGATE_CHILD 以子对象事实为根，按父对象维度汇总，一店 300、未匹配 50；编译器 EXISTS_ONLY 筛选一店返回 300，展开维度被拒绝 | 核心编译通过，INTENT 接入存在缺口 |
| 层级 HIERARCHY | 生成 RELATION_HIERARCHY；非法自关联不能发布；已有回归覆盖循环 | 销售→店铺→部门→事业部三跳查询返回“线上事业部 300”，IR 含 3 条关系 | 本次场景通过 |
| 事件参与 EVENT_PARTICIPATION | 生成 RELATION_EVENT；用事件 ID 代替实体引用字段不能发布 | 正确事件引用连接返回一店 300、未匹配 50，合计 350 | 本次场景通过 |
| 同一性 IDENTITY | 生成 RELATION_IDENTITY；非一对一声明不能发布 | 订单 ID→店铺 ID：一店 100、二店 200、未匹配 50，合计 350 | 合法数据场景通过；实际唯一性未经运行时检查 |
| 派生 DERIVED | 生成 RELATION_DERIVED 与 RELATION_LINEAGE；非法自关联不能发布，已有回归覆盖循环 | 尝试作为物理连接查询时 REJECTED，执行器调用次数为 0 | 符合仅用于血缘的设计 |

引用、关联、层级、事件参与等类型在合法多对一场景下可以生成相同的 JOIN；类型差异主要体现在定义合法性、公理和可用路径约束，并不要求 SQL 字符串各不相同。

组成的 PRE_AGGREGATE_CHILD 当前是切换到子对象事实粒度后汇总，本次验证的是子度量按父维度汇总，不代表支持任意多事实或父子度量混合聚合。

## 发现的问题与边界

### 1. EXISTS_ONLY 尚未贯通 INTENT 入口

请求：

```json
{
  "namespace": "retail",
  "queryMode": "INTENT",
  "intent": {
    "metrics": ["销售额"],
    "filters": [{ "object": "店铺", "value": "一店" }]
  }
}
```

组成关系配置为 EXISTS_ONLY 后，编译器通过 BOUND_VALUE 能生成参数化 EXISTS，实际结果为 300；但上述业务入口返回 NEEDS_INPUT，原因是“与指标对象之间没有可安全使用的关联路径”。没有执行数据查询。

原因：统一检索复用适用于 JOIN 展开的 safe 路径判断，把 EXISTS_ONLY 排除；INTENT 构造筛选时也未将这类绑定转为存在性筛选。应区分“允许展开”和“允许存在性筛选”，再打通筛选规划。这次记录现状，未修复。

### 2. 一对一／唯一性是配置约束，未自动核验业务数据

在合法同一性定义下，额外向 Mock 店铺表插入相同 ID a 的另一条记录。原始销售合计为 350，连接后实际返回合计 450，状态仍为 SUCCEEDED。

这说明配置层会拒绝“未声明唯一”或“不是一对一”的关系，但不会在每次执行时检查数据库是否违反声明。若需要防止脏数据造成重复计数，需要补充数据质量验证或执行前基数校验。本次没有自动去重，也没有修改数据库数据约束。

## 验证证据与复现

新增 `tests/semantic-runtime/relation-types-mock.test.ts`，共 24 项检查；结合既有 `relations.test.ts` 共 35 项关系专项检查。全量 38 个测试文件、207 项断言测试通过，生产构建通过。

```sh
npm test -- --run tests/semantic-runtime/relation-types-mock.test.ts tests/semantic-runtime/relations.test.ts
npm run build
npm test -- --run
```

“测试通过”包括对当前缺口和数据质量边界的现状断言，不等于所有业务能力均完整实现。本轮没有改界面，未重新运行浏览器 E2E，也未验证 SelectDB 专属执行差异。
