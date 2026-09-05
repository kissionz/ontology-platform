# Ontology Platform

独立本体管理与语义执行平台。

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

## 验证

```bash
npm run build
npm test -- --run
npm run test:e2e
```

运维、备份、恢复、指标与密钥轮换见[运维手册](./docs/OPERATIONS.md)，外部调用见[Agent 接入](./docs/AGENT_INTEGRATION.md)。

当前交付范围、验证证据与待关闭项见[阶段交付状态](./docs/DELIVERY_STATUS.md)。
