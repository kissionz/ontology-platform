# 运维手册

## 运行与健康

Node.js 24+。配置 `ONTOLOGY_API_KEY` 后运行 `npm start`；默认数据库为 `.data/ontology-platform.sqlite`，可用 `ONTOLOGY_DB_PATH` 覆盖。`GET /v1/health` 无需认证，返回 SQLite、SelectDB 配置状态与内核版本。

结构化日志使用 Fastify JSON 日志，包含 `requestId`、`traceId`、路由、状态码和耗时，不记录认证头或请求体。`GET /v1/system/metrics` 需要 `system:admin`，返回最近 1,000 次各路由请求的计数、错误数、P95、最大耗时，以及进程运行时间和内存。

## SelectDB

设置：`SELECTDB_HOST`、`SELECTDB_PORT`、`SELECTDB_USER`、`SELECTDB_PASSWORD`、`SELECTDB_CATALOG`、`SELECTDB_DATABASE`、`SELECTDB_TLS`。配置缺失时，语义执行明确返回 `DATA_SOURCE_NOT_CONFIGURED`；平台不会生成替代数据。

## 密钥轮换

1. 使用现有 `system:admin` 凭据调用 `POST /v1/system/api-clients` 创建新客户端密钥。
2. 密钥只在创建响应中显示一次；完成调用方切换。
3. 调用 `DELETE /v1/system/api-clients/{clientId}` 撤销旧密钥。
4. 启动密钥通过进程环境轮换，重启服务后生效。

存储中仅保存密钥 SHA-256 摘要。数据源密码使用 AES-256-GCM 加密，绑定 sourceId，公开配置与审计只展示配置状态。控制台保存密码前，必须设置 `ONTOLOGY_ENCRYPTION_KEY` 为 32 字节随机密钥的 64 位十六进制编码，并将该密钥保存在部署密钥管理器中。备份数据库时另行保管此密钥；密钥缺失或不匹配会明确拒绝解密。默认 `selectdb` 数据源也支持环境变量配置。

## 备份与恢复

在线一致性备份：

```bash
npm run backup -- --destination /secure/ontology-2026-09-04.sqlite
```

恢复前停止服务。工具先执行 `PRAGMA integrity_check`，复制到临时文件后原子替换；已有目标必须显式指定 `--force`：

```bash
npm run restore -- --source /secure/ontology-2026-09-04.sqlite --force
```

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
