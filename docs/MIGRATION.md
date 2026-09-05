# InsightFlow 迁移

迁移器只读打开来源 SQLite，在单个目标事务中生成 OntologySnapshot v3；不修改 InsightFlow 工程或数据库。

```bash
npm run ontology:import -- \
  --source /path/to/insightflow/.montane/data-agent/ontology.sqlite \
  --target /path/to/ontology-platform.sqlite \
  --namespace retail \
  --mode verify-and-import
```

流程会读取全部发布版本、当前草稿、物理表、值索引及其构建状态，保留对象、属性、指标、关系、层级的稳定 ID，补充 namespace、内容摘要、内建公理和确定性推论，再输出机器可读报告。报告中的 `preservedIds` 与 `digestMatches` 必须为 `true`，`issues` 必须为空。

同一 namespace/version 已存在且内容一致时允许重复导入；内容冲突或任一载荷不合法时整批回滚。草稿保存为 `imported_vN`，不会成为 latest 发布版本。导入前建议备份目标数据库；导入后比较报告的对象数量，并通过 `/v1/namespaces/{ns}/versions` 和 `/v1/namespaces/{ns}/ontology?version=N` 抽查。

当前迁移器兼容参考工程实际使用的 `ontology_versions(version,status,created_at,payload)`、`physical_tables` 和 `property_value_index` 表。来源缺表或某版本载荷不合法时会明确记录问题，不会用空内容替代。

迁移报告的数量统计包含来源草稿；`importedVersions` 只包含发布版本，`importedDraftIds` 列出保留的草稿。源数据中不满足敏感性和可见性要求的索引会导致导入失败并回滚。
