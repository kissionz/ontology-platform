# SDK 接入说明

对象中可分析、非敏感且具有有效默认聚合的 NUMBER 属性可直接作为基础指标。ResolveOntologyContext 的 concepts.metrics 接受属性名称或 ID，ExecuteSemanticQuery 的 queryShape.measureIds 接受属性 ID；组合指标的 leftMetricId/rightMetricId 也可引用同对象度量属性 ID。属性引用始终使用字段默认口径，不会替换为其他已命名指标。

resolveOntologyContext 返回候选检索结果。先检查 data.retrieval.status：NO_MATCH 时补充术语或同义词，PARTIAL_MATCH 时处理 unmatchedTerms，AMBIGUOUS 时确认候选；MATCHED 也不代表已完成业务意图解析。时间范围、筛选值和最终查询结构由调用方确定。

当前 SDK 随仓库源码交付。TypeScript 入口为 packages/sdk-typescript/src/index.ts；Python 模块为 packages/sdk-python/ontology_platform.py，Python 客户端仅使用标准库。

下面示例保存到项目根目录运行。TypeScript 使用 npx tsx example.ts；Python 使用 python3 example.py。提前在进程环境中配置 ONTOLOGY_API_KEY；ONTOLOGY_API_URL 可覆盖默认服务根地址。SDK 不会自动读取本机密钥文件。

TypeScript 构造参数为 baseUrl、apiKey 和可选 fetch；Python 为 base_url、api_key。根地址不包含 /v1。可从系统管理创建有合适权限的客户端并保存自动生成的密钥。

SDK 返回完整响应信封，业务数据位于 data。HTTP 成功仍可能是 NEEDS_CLARIFICATION、ANALYSIS_READY、REJECTED 或 FAILED，不能只判断有没有抛异常。

需要 SQL 或公理证据时，在查询 options 中开启 includeSqlPreview、includeQueryIr、includeAxioms、includeInferenceEvidence。分页读取 completeness.nextCursor，下一次传入 pagination.cursor 并保持版本、查询和参数一致。

TypeScript 在 HTTP 非成功时抛出带 status、code、response 的 Error；手动调用 request 使用 ETag 得到 304 时返回 undefined。Python 抛出 OntologyPlatformError，可读取 status 和 payload，网络错误由 urllib 抛出。

TypeScript 还提供 request(path, init) 调用其他 REST 接口，path 以 /v1 开头。Python 公共方法目前为表中四项，其他管理操作可直接调用 REST。

## 公共方法

| TypeScript | Python | 用途与参数 |
| --- | --- | --- |
| resolveOntologyContext(input) | resolve_ontology_context(payload) | 解析语义上下文；参数与 POST /v1/semantic-context:resolve 相同。 |
| executeSemanticQuery(input) | execute_semantic_query(payload) | 执行语义查询或获取分析上下文；参数与 POST /v1/semantic-query 相同。 |
| continueSemanticQuery(id, selections) | continue_semantic_query(clarification_id, selections) | 传入澄清 ID 和全部选择映射，继续查询。 |
| getOntology(namespace, version?) | get_ontology(namespace, version='latest') | 获取发布快照，版本省略时为 latest。 |

## TypeScript 示例

```typescript
import { OntologyPlatformClient } from "./packages/sdk-typescript/src/index.ts";

const apiKey = process.env.ONTOLOGY_API_KEY;
if (!apiKey) throw new Error("请配置 ONTOLOGY_API_KEY");
const client = new OntologyPlatformClient({
  baseUrl: process.env.ONTOLOGY_API_URL ?? "http://127.0.0.1:4300",
  apiKey,
});

try {
  const response = await client.resolveOntologyContext({
    namespace: "retail",
    ontologyVersion: "latest",
    purpose: "PLAN",
    question: "按店铺查看销售额",
    concepts: { metrics: ["销售额"], dimensions: ["店铺"] },
    include: { axioms: true, inferences: true, evidence: true },
  });
  if (response?.status === "SUCCEEDED") console.log(response.data);
  else console.log(response?.status, response?.error);
} catch (error) {
  console.error(error); // HTTP 错误可读取 status、code、response
}
```

## Python 示例

```python
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path("packages/sdk-python").resolve()))
from ontology_platform import OntologyPlatformClient, OntologyPlatformError

client = OntologyPlatformClient(
    os.getenv("ONTOLOGY_API_URL", "http://127.0.0.1:4300"),
    os.environ["ONTOLOGY_API_KEY"],
)
try:
    response = client.resolve_ontology_context({
        "namespace": "retail",
        "ontologyVersion": "latest",
        "purpose": "PLAN",
        "question": "按店铺查看销售额",
        "concepts": {"metrics": ["销售额"], "dimensions": ["店铺"]},
        "include": {"axioms": True, "inferences": True, "evidence": True},
    })
    if response.get("status") == "SUCCEEDED":
        print(response.get("data"))
    else:
        print(response.get("status"), response.get("error"))
except OntologyPlatformError as error:
    print(error.status, error.payload)

```

完整参数与返回说明见 [REST API 文档](./API.md)。
