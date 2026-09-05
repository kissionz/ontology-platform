# Ontology Platform

独立本体管理与语义执行平台。

接入文档：[REST API](./docs/API.md) · [MCP](./docs/MCP.md) · [TypeScript / Python SDK](./docs/SDK.md)。控制台“系统管理”中也可查看接口说明、MCP 与 SDK 接入指南。接口说明和示例与 OpenAPI 共用元数据；更新后运行 `node --import tsx scripts/export-openapi.ts` 和 `node --import tsx scripts/export-integration-docs.ts` 同步文档。

实施前先阅读：[功能实施规格](./docs/IMPLEMENTATION_SPEC.md)。该文档是当前需求、领域模型、API/MCP 契约、确认版原型、实施阶段和验收标准的事实源。

视觉参考：

- [实施架构](./docs/architecture.html)
- [确认版静态原型](./docs/prototype/index.html)

## 启动

要求 Node.js 24+：

```bash
npm install
npm run build
npm start
```

首次启动自动生成管理员 API Key 和凭据加密密钥，保存在 `.data/ontology-platform.sqlite.keys.json`，后续启动复用。在另一个终端进入同一份项目目录，运行以下命令查看管理员 API Key，再填入控制台首次打开时的“连接本体平台”页面。验证通过后进入工作台，也可在“系统”中更新密钥：

```bash
npm run keys:show
```

客户端密钥在“系统 → 客户端”创建时自动生成。

服务默认监听 `127.0.0.1:4300`，SQLite 位于 `.data/ontology-platform.sqlite`。新库会自动执行 migration；已有 InsightFlow 库按[迁移说明](./docs/MIGRATION.md)导入。SelectDB 环境变量未配置时，管理与语义解析仍可使用，数据查询会返回明确配置错误。

## 从零搭建

1. 在“数据源”保存连接、测试连接并扫描 Schema，获取物理表和字段。
2. 在“本体”点击“创建空白草稿”，从已扫描的表添加对象，填写业务名称并确认唯一标识字段。
3. 检查对象与属性语义，运行“校验草稿”，通过后发布第一个版本 v1。草稿会保存，离开页面后可继续编辑。
4. 发布后可构建属性值索引、查看图谱并接入语义查询。

已有本体可从右侧“待建模表”继续添加对象，新建时选择业务实体、业务事件、状态快照、汇总结果或关联关系。编辑区按“基本信息 / 属性 / 关系 / 规则”组织；在属性列表选择字段后可修改聚合语义。删除按钮位于草稿对象目录中，确认框展示需要同时移除的相关定义。

在“关系”页新增、编辑或删除关系，配置类型、两端字段、数量关系、方向、匹配要求及组成策略，随“保存对象”保存。公理校验会检查字段映射、唯一性声明、类型约束及循环；发布后，配置实际控制可达路径、SQL 连接和聚合策略。七类关系的具体行为见[关系语义说明](./docs/RELATIONS.md)。

数据源配置与扫描独立于本体版本。初始安装不需要导入旧本体。

## 验证

```bash
npm run build
npm test -- --run
npm run test:e2e
```

运维、备份、恢复、指标与密钥轮换见[运维手册](./docs/OPERATIONS.md)，外部调用见[Agent 接入](./docs/AGENT_INTEGRATION.md)。

当前交付范围、验证证据与待关闭项见[阶段交付状态](./docs/DELIVERY_STATUS.md)。
