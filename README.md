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
export ONTOLOGY_API_KEY='replace-with-a-long-random-key'
npm run build
npm start
```

服务默认监听 `127.0.0.1:4300`，SQLite 位于 `.data/ontology-platform.sqlite`。新库会自动执行 migration；已有 InsightFlow 库按[迁移说明](./docs/MIGRATION.md)导入。SelectDB 环境变量未配置时，管理与语义解析仍可使用，数据查询会返回明确配置错误。

## 验证

```bash
npm run build
npm test -- --run
npm run test:e2e
```

运维、备份、恢复、指标与密钥轮换见[运维手册](./docs/OPERATIONS.md)，外部调用见[Agent 接入](./docs/AGENT_INTEGRATION.md)。

当前交付范围、验证证据与待关闭项见[阶段交付状态](./docs/DELIVERY_STATUS.md)。
