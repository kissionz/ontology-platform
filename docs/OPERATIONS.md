# 运维手册

## 运行与健康

Node.js 24+。直接运行 `npm start`，首次启动自动生成所需平台密钥；默认数据库为 `.data/ontology-platform.sqlite`，可用 `ONTOLOGY_DB_PATH` 覆盖。`GET /v1/health` 无需认证，返回 SQLite、SelectDB 配置状态与内核版本。

结构化日志使用 Fastify JSON 日志，包含 `requestId`、`traceId`、路由、状态码和耗时，不记录认证头或请求体。`GET /v1/system/metrics` 需要 `system:admin`，返回最近 1,000 次各路由请求的计数、错误数、P95、最大耗时，以及进程运行时间和内存。

## SelectDB

设置：`SELECTDB_HOST`、`SELECTDB_PORT`、`SELECTDB_USER`、`SELECTDB_PASSWORD`、`SELECTDB_CATALOG`、`SELECTDB_DATABASE`、`SELECTDB_TLS`。配置缺失时，语义执行明确返回 `DATA_SOURCE_NOT_CONFIGURED`；平台不会生成替代数据。

## 密钥生成与保存

管理员 API Key 与数据源凭据加密密钥均使用系统安全随机源生成，默认保存在数据库旁的 `<数据库文件>.keys.json`。文件在 macOS/Linux 上仅当前用户可读写（0600），重启复用，多进程同时启动时共用原子创建的同一份文件。可用 `ONTOLOGY_KEYS_PATH` 指定文件位置。密钥文件损坏时启动明确报错，不会覆盖旧密钥。

`npm run keys:show` 在本地终端显示管理员 API Key。启动日志只打印密钥文件位置，不打印密钥值；控制台认证仍需填写生成的 API Key。客户端 API Key 在创建客户端时自动生成。

已有部署显式提供的 `ONTOLOGY_API_KEY` 和 `ONTOLOGY_ENCRYPTION_KEY` 优先于自动生成值，便于继续使用已有凭据；自动生成文件只保存系统生成的值。内存测试数据库使用临时密钥。

## 密钥轮换

1. 使用现有 `system:admin` 凭据调用 `POST /v1/system/api-clients` 创建新客户端密钥。
2. 密钥只在创建响应中显示一次；完成调用方切换。
3. 调用 `DELETE /v1/system/api-clients/{clientId}` 撤销旧密钥。
4. 启动密钥通过进程环境轮换，重启服务后生效。

客户端表仅保存 API Key 的 SHA-256 摘要。平台自动生成的管理员和加密密钥保存在本地密钥文件中。数据源密码使用 AES-256-GCM 加密，绑定 sourceId，公开配置与审计只展示配置状态，保存密码时自动使用平台加密密钥。默认 `selectdb` 数据源也支持环境变量配置。

## 备份与恢复

在线一致性备份：

```bash
npm run backup -- --destination /secure/ontology-2026-09-04.sqlite
```

恢复前停止服务。工具先执行 `PRAGMA integrity_check`，复制到临时文件后原子替换；已有目标必须显式指定 `--force`：

```bash
npm run restore -- --source /secure/ontology-2026-09-04.sqlite --force
```

备份数据库时需另行保存对应的 `.keys.json` 文件，恢复时将原密钥文件放回数据库旁，或通过 `ONTOLOGY_KEYS_PATH` 指向原文件。数据库备份命令不将密钥混入 SQLite 备份。使用显式环境密钥的部署保留原配置；凭据解密需要原加密密钥。

恢复后先运行健康检查，再抽查 namespace 最新版本、内容摘要和推论摘要。

## 故障处理

- `ONTOLOGY_VERSION_NOT_FOUND`：确认 namespace 和具体版本。
- `SESSION_VERSION_MISMATCH`：重新解析上下文并创建新会话。
- `DATA_SOURCE_UNAVAILABLE`：检查网络、账号只读权限和 catalog/database。
- `ONTOLOGY_VERSION_CONFLICT`：基于最新版本重新创建草稿。
- `CURSOR_CONTEXT_MISMATCH`：查询结构、参数、排序或版本已改变，从第一页重新执行。

## 写入重试与索引

写接口支持 `Idempotency-Key`，同一客户端和 key 的并发重复请求复用首次结果，变更载荷返回 `IDEMPOTENCY_CONFLICT`。重试窗口为当前进程内 10 分钟，最多保留 1,000 条；服务重启后客户端应先查询写入结果再决定是否重试。

发布快照、发布元数据、草稿删除与发布审计原子提交。值索引随后异步构建，状态包括 `building`、`ready`、`partial`、`empty`、`failed`。索引错误不影响已发布版本，可修复连接或 Schema 后重新构建。

## 查询澄清恢复

待澄清问题、固定本体版本和原始候选值持久化在 SQLite 的 `semantic_clarifications` 表，有效期为 30 分钟。重启服务后，调用方可用原 `clarificationId` 继续查询；版本发布或索引重建不会改变候选项。无效选择和执行失败保留待办，成功执行后消费。过期记录在下一次创建待办时清理。数据库备份包含这些待办，应按业务查询数据保护。

## 持续验证

GitHub Actions 在 main 推送和 Pull Request 时使用 Node.js 24、Python 3.12 执行 build、单元/契约/集成测试及 Chromium E2E，失败时保存浏览器证据 7 天。CI 使用测试夹具；需要本机参考 SQLite 的测试会在文件不存在时跳过，SelectDB 实际连接和业务结果仍需环境验收。

## 编译模板缓存

普通 FIXED_SHAPE 的 DIRECT 筛选查询将 SQL 结构保存到 `compiled_query_templates`。缓存键包含本体摘要、版本、物理表 Schema 和参数形状；动态参数值只在执行时绑定。服务重启后可以复用模板。时间表达式与高级计算仍重新编译，以重新解析时间边界和参数顺序。该表可以在维护窗口清空，后续请求会自动重建。

## 发布前 Golden Cases

控制台草稿页面可以填写 Golden Cases，在“校验草稿”后查看当前 revision 的运行报告、内容摘要和逐项结果。用例定义与历史报告保存于 `draft_golden_reports`；GET 草稿接口返回最近一次 goldenReport，调用方应比较报告 revision 与当前草稿 revision。校验请求省略 goldenCases 时复用该草稿最近的用例，显式传入空数组会清空本草稿的用例集。

Golden Cases 当前检查 Query IR 的对象/指标/维度/关系集合和 SQL 片段，并执行 SQL Guard，不请求数据库结果。未配置用例时标记 NOT_CONFIGURED。发布会重新执行当前草稿的校验；用例失败阻止事务提交。发布审计关联 goldenReportId，便于回溯。业务数值正确性应另行通过真实 SelectDB 验收。
