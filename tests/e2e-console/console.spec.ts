import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("ontology-api-key", "e2e-key"),
  );
});

test("U01-U12 console workflow uses the real HTTP contracts", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("本体图谱", { exact: true })).toBeVisible();
  await expect(page.getByText("当前本体版本")).toBeVisible();
  await page.getByRole("button", { name: /事业部.*业务实体/ }).click();
  await expect(page.locator(".inspector h2")).toHaveText("事业部");

  await page.getByRole("button", { name: "本体", exact: true }).click();
  await page.getByRole("button", { name: /在草稿中编辑/ }).click();
  await expect(page.getByText("草稿已创建")).toBeVisible();
  await page.locator(".description-editor").fill("浏览器验收更新的业务定义");
  await page.getByRole("button", { name: /保存对象/ }).click();
  await expect(page.getByText(/草稿已保存/)).toBeVisible();

  await page.getByRole("button", { name: "公理", exact: true }).click();
  await page.getByRole("button", { name: /比例不能直接累加.*指标/ }).click();
  await expect(page.getByText("重算语义")).toBeVisible();
  await expect(page.getByText(/NULLIF/).first()).toBeVisible();
  await expect(page.getByText("推论依据")).toBeVisible();

  await page.getByRole("button", { name: "版本", exact: true }).click();
  await expect(page.getByText("相对基线的变化")).toBeVisible();
  await expect(page.getByText("不可变快照", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "数据源", exact: true }).click();
  await page.getByRole("button", { name: /测试连接/ }).click();
  await expect(page.getByText("连接成功 · SelectDB 3.x", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /重建索引/ }).click();
  await expect(page.getByText(/索引重建完成：/)).toBeVisible();

  await page.getByRole("button", { name: "系统", exact: true }).click();
  await expect(page.getByText("接口元数据实时读取 OpenAPI")).toBeVisible();
  await page.getByRole("button", { name: /发送请求/ }).click();
  await expect(page.locator(".status-code")).toContainText("200 OK");
  await expect(page.getByRole("region", { name: "语义候选摘要" })).toBeVisible();
  await page.getByRole("button", { name: "响应体", exact: true }).click();
  await expect(page.locator(".response-json")).toContainText("contextDigest");
  await expect(page.locator(".response-json")).toContainText('"axioms": []');
  await expect(page.locator(".response-json")).toContainText('"inferences": []');
  await expect(page.locator(".response-json")).not.toContainText("e2e-key");
  expect(browserErrors).toEqual([]);

  await page.getByLabel("API Key").fill("");
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连接本体平台" })).toBeVisible();
});

test("first visit guides key setup, rejects invalid keys and retains a valid session", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "连接本体平台" })).toBeVisible();
  await expect(page.getByText("npm run keys:show", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "连接平台", exact: true })).toBeDisabled();
  await page.getByLabel("API Key").fill("wrong-key");
  await page.getByRole("button", { name: "连接平台", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("密钥无效或已停用");
  expect(await page.evaluate(() => sessionStorage.getItem("ontology-api-key"))).toBeNull();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${tmpdir()}/ontology-platform-connect-1280.png`, fullPage: true });
  await page.getByLabel("API Key").fill("  e2e-key  ");
  await page.getByRole("button", { name: "连接平台", exact: true }).click();
  await expect(page.getByText("本体图谱", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("ontology-api-key"))).toBe("e2e-key");
  await page.reload();
  await expect(page.getByText("本体图谱", { exact: true })).toBeVisible();
  await page.close();
});

test("an empty installation can configure its source and publish its first ontology", async ({ page }) => {
  await page.goto("http://127.0.0.1:4332/");
  await expect(page.getByRole("heading", { name: "尚无已发布本体" })).toBeVisible();
  await page.getByRole("link", { name: "配置数据源", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存连接", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "重建索引", exact: true })).toBeDisabled();
  await page.getByLabel("host", { exact: true }).fill("fixture.internal");
  await page.getByLabel("username", { exact: true }).fill("fixture");
  await page.getByLabel("database", { exact: true }).fill("retail");
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await expect(page.locator(".source-card").getByText("已配置", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(page.locator(".action-result")).toContainText("SelectDB 3.x");
  await page.getByRole("button", { name: "扫描 Schema", exact: true }).first().click();
  await expect(page.locator(".schema-table")).toHaveCount(4);
  await expect(page.locator(".schema-table").filter({ hasText: "orders" })).toHaveText("orders订单明细");
  await expect(page.locator(".action-result")).toHaveText("扫描完成，共发现 4 张表。");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${tmpdir()}/ontology-platform-empty-source-1280.png`, fullPage: true });
  await page.getByRole("button", { name: "本体", exact: true }).click();
  await page.getByRole("button", { name: "创建空白草稿", exact: true }).click();
  await expect(page.getByRole("heading", { name: "从物理表添加对象" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "从物理表添加对象" })).toBeVisible();
  await page.getByLabel("新对象来源表").selectOption("selectdb:bu");
  await page.getByLabel("新对象业务名称").fill("事业部");
  await page.getByLabel("新对象唯一标识字段").selectOption("bu_id");
  await page.screenshot({ path: `${tmpdir()}/ontology-platform-first-object-1280.png`, fullPage: true });
  await page.getByRole("button", { name: "创建对象", exact: true }).click();
  await expect(page.getByText("对象已创建，请检查属性语义后校验草稿", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "校验草稿", exact: true }).click();
  await expect(page.getByText(/revision \d+ · 校验通过/)).toBeVisible();
  await page.getByRole("button", { name: "发布版本", exact: true }).click();
  await expect(page.getByText("v1 已发布", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "数据源", exact: true }).click();
  await expect(page.getByRole("button", { name: "重建索引", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await expect(page.getByText("本体图谱", { exact: true })).toBeVisible();
});

test("confirmed desktop widths do not clip the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("本体图谱", { exact: true })).toBeVisible();
  for (const [width, height] of [[1600, 1000], [1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `${tmpdir()}/ontology-platform-${width}.png`,
      fullPage: true,
    });
  }
});

test("draft catalogs, publication and parameterized API debugging are interactive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本体", exact: true }).click();
  await page.getByRole("button", { name: /在草稿中编辑/ }).click();
  await page.getByRole("button", { name: "指标", exact: true }).click();
  await page.getByText("高级定义 JSON", { exact: true }).click();
  await expect(page.getByLabel("指标或层级定义")).toContainText('"metricType"');
  const metric = JSON.parse(await page.getByLabel("指标或层级定义").inputValue());
  metric.description = "浏览器保存的指标口径";
  await page.getByLabel("指标或层级定义").fill(JSON.stringify(metric, null, 2));
  await page.getByRole("button", { name: "保存定义", exact: true }).click();
  await expect(page.getByText("定义已保存，公理校验通过")).toBeVisible();
  await page.getByRole("button", { name: "层级", exact: true }).click();
  await page.getByText("高级定义 JSON", { exact: true }).click();
  await expect(page.getByLabel("指标或层级定义")).toContainText('"FIXED_LEVELS"');
  await page.getByText("发布检查与回归用例", { exact: true }).click();
  await page.getByText("Golden Cases · 编译回归用例", { exact: true }).click();
  await page.getByLabel("Golden Cases 定义").fill(JSON.stringify([{ id: "sales", label: "销售指标回归", queryShape: { rootObjectId: "o_order", measureIds: ["m_sales"], dimensionPropertyIds: [], filters: [], sort: [], limit: 20 }, expected: { measureIds: ["m_sales"] } }]));
  await page.getByRole("button", { name: "校验草稿", exact: true }).click();
  await expect(page.getByText("Golden Cases：全部通过 · 1 条用例")).toBeVisible();
  await page.screenshot({ path: `${tmpdir()}/ontology-platform-golden-report.png`, fullPage: true });
  await page.getByRole("button", { name: "发布版本", exact: true }).click();
  await expect(page.getByText(/v\d+ 已发布/)).toBeVisible();
  await page.getByRole("button", { name: "系统", exact: true }).click();
  await page.locator("select.path-box").selectOption("GET /v1/namespaces/{ns}/summary");
  await page.getByLabel("路径参数 ns").fill("retail");
  await page.getByRole("button", { name: /发送请求/ }).click();
  await expect(page.locator(".status-code")).toContainText("200 OK");
  await expect(page.locator(".response-json")).toContainText('"counts"');
  await page.getByRole("button", { name: "审计", exact: true }).click();
  await expect(page.locator(".response-json")).toContainText("HttpRequestCompleted");
});

test("all six pages fit both confirmed desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: width === 1600 ? 1000 : 900 });
    for (const [label, name] of [["概览", "overview"], ["本体", "ontology"], ["公理", "logic"], ["版本", "versions"], ["数据源", "data"], ["系统", "system"]]) {
      await page.getByRole("button", { name: label!, exact: true }).click();
      await expect(page.locator("main.content")).toBeVisible();
      await expect(page.locator(".skeleton-state")).toHaveCount(0);
      await expect(page.getByText("内容加载失败", { exact: true })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `${tmpdir()}/ontology-platform-${name}-${width}.png`, fullPage: true });
    }
  }
});

test("API reference covers every endpoint and provides MCP and SDK guides", async ({ page }) => {
  await page.goto("/?page=system");
  const selector = page.getByLabel("选择 API 接口");
  await expect(selector.locator("option")).toHaveCount(29);
  const values = await selector.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  for (const value of values) {
    await selector.selectOption(value);
    await expect(page.getByLabel("当前 API 说明").locator("h3")).not.toBeEmpty();
    await expect(page.getByLabel("当前 API 说明")).toContainText("所需权限");
  }
  await selector.selectOption("POST /v1/semantic-query");
  await page.getByText("参数说明（10）", { exact: true }).click();
  await expect(page.getByLabel("当前 API 说明")).toContainText("FIXED_SHAPE");
  await page.getByText("请求示例与完整结构", { exact: true }).click();
  await page.getByRole("button", { name: "填入请求示例", exact: true }).click();
  await expect(page.getByLabel("请求体", { exact: true })).toHaveValue(/"INTENT"/);
  await selector.selectOption("GET /v1/namespaces/{ns}/summary");
  await page.getByLabel("查询参数 version").fill("1");
  const request = page.waitForResponse(r => r.url().includes("/summary?version=1"));
  await page.getByRole("button", { name: "发送请求", exact: true }).click();
  expect((await request).status()).toBe(200);
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${tmpdir()}/ontology-platform-api-reference-${width}.png`, fullPage: true });
    for (const kind of ["MCP", "SDK"]) {
      await page.getByRole("button", { name: `${kind} 接入说明`, exact: true }).click();
      await expect(page.getByRole("heading", { name: `${kind} 接入说明`, exact: true })).toBeVisible();
      if (kind === "MCP") {
        await expect(page.locator(".tool-reference")).toHaveCount(8);
        await page.locator(".tool-reference").first().locator("summary").first().click();
        await expect(page.locator(".tool-reference").first()).toContainText("ontologyVersion");
      } else {
        await expect(page.getByRole("heading", { name: "TypeScript 调用示例", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Python 调用示例", exact: true })).toBeVisible();
      }
      await page.screenshot({ path: `${tmpdir()}/ontology-platform-${kind.toLowerCase()}-guide-${width}.png`, fullPage: true });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: "API 调试台", exact: true }).click();
  }
});

test("graph inspection, version filters and rollback drafts remain usable across navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /订单.*业务事件/ }).click();
  await page.getByRole("tab", { name: "指标", exact: true }).click();
  await expect(page.locator(".inspector").getByText("SUM(orders.sales)", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "关系", exact: true }).click();
  await expect(page.locator(".inspector").getByText("订单关联店铺")).toBeVisible();
  await page.getByRole("button", { name: "含指标", exact: true }).click();
  await page.getByRole("button", { name: /销售额.*指标/ }).click();
  await expect(page.locator(".inspector h2")).toHaveText("订单");
  await expect(page.getByRole("tab", { name: "指标", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "公理", exact: true }).click();
  await page.getByLabel("公理本体版本").selectOption("1");
  await expect(page.locator(".logic-grid")).not.toContainText(/PROPERTY|ENTITY|SEMANTIC_PLANNING|PUBLISH_VALIDATION/);
  await page.getByLabel("公理适用对象").selectOption("o_order");
  await page.getByLabel("公理域筛选").selectOption("METRIC_ALGEBRA");
  await page.getByRole("button", { name: /比例不能直接累加.*指标/ }).click();
  await page.getByRole("button", { name: /查看定义 · 毛利率/ }).first().click();
  await page.getByText("高级定义 JSON", { exact: true }).click();
  await expect(page.getByLabel("指标或层级定义")).toContainText('"id": "m_margin"');
  await expect(page).toHaveURL(/version=1/);
  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.getByRole("button", { name: /v1\b/ }).click();
  await page.getByRole("button", { name: "创建回滚草稿", exact: true }).click();
  await expect(page).toHaveURL(/draft=/);
  await expect(page.getByRole("button", { name: "保存对象", exact: true })).toBeVisible();
  await expect(page.getByLabel("默认时间字段")).toHaveValue("p_order_date");
  await page.getByRole("button", { name: "数据源", exact: true }).click();
  await page.getByLabel("索引本体版本").selectOption("1");
  const rebuilt = page.waitForResponse(response => response.url().includes("value-index:rebuild?version=1") && response.request().method() === "POST");
  await page.getByRole("button", { name: /重建索引/ }).click();
  expect((await rebuilt).status()).toBe(200);
  await page.getByRole("button", { name: "本体", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存对象", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("object tabs save Chinese semantic and aggregation settings and expose type-specific rules", async ({ page }) => {
  await page.goto("/?page=ontology");
  await expect(page.locator(".object-summary-strip")).toBeVisible();
  await page.getByRole("button", { name: "在草稿中编辑", exact: true }).click();
  await expect(page.getByLabel("业务描述", { exact: true })).toBeVisible();
  await expect(page.getByLabel("搜索本体目录")).toHaveCSS("font-size", "12px");
  await page.getByLabel("业务分类", { exact: true }).fill("交易域");
  await page.getByLabel("负责人", { exact: true }).fill("数据团队");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await expect(page.getByLabel("业务分类", { exact: true })).toHaveValue("交易域");
  await page.getByRole("tab", { name: /^属性 / }).click();
  await page.getByRole("button", { name: "配置属性 销售金额", exact: true }).click();
  await page.getByText("高级语义与访问设置", { exact: true }).click();
  for (const meaning of ["CODE", "NAME", "CATEGORY", "GEOGRAPHY"]) {
    await page.getByLabel("销售金额语义", { exact: true }).selectOption(meaning);
    await expect(page.getByLabel("允许值检索", { exact: true })).toBeChecked();
    await page.getByLabel("允许值检索", { exact: true }).uncheck();
  }
  await page.getByLabel("销售金额可见性", { exact: true }).selectOption("DETAIL_ONLY");
  await page.getByLabel("销售金额语义", { exact: true }).selectOption("CODE");
  await expect(page.getByLabel("允许值检索", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("允许值检索", { exact: true })).toBeDisabled();
  await page.getByLabel("销售金额可见性", { exact: true }).selectOption("ANALYTICAL");
  await page.getByLabel("销售金额语义", { exact: true }).selectOption("NUMBER");
  await page.getByLabel("销售金额数字类型", { exact: true }).selectOption("CURRENCY");
  await expect(page.getByLabel("销售金额单位或币种", { exact: true })).toHaveValue("CNY");
  await expect(page.getByLabel("销售金额默认聚合", { exact: true })).toHaveValue("SUM");
  await expect(page.getByLabel("销售金额聚合性质", { exact: true })).toHaveValue("ADDITIVE");
  await page.getByLabel("销售金额默认聚合", { exact: true }).selectOption("AVG");
  await page.getByLabel("销售金额聚合性质", { exact: true }).selectOption("SEMI_ADDITIVE");
  await page.getByLabel("销售金额单位或币种", { exact: true }).fill("CNY");
  await page.getByRole("tab", { name: "规则", exact: true }).click();
  await expect(page.getByText("半可加值的时间约束", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存对象", exact: true }).click();
  await expect(page.getByText("草稿已保存，公理校验通过", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("业务分类", { exact: true })).toHaveValue("交易域");
  await expect(page.getByLabel("负责人", { exact: true })).toHaveValue("数据团队");
  await page.getByRole("tab", { name: /^属性 / }).click();
  await page.getByRole("button", { name: "配置属性 销售金额", exact: true }).click();
  await expect(page.getByLabel("销售金额默认聚合", { exact: true })).toHaveValue("AVG");
  await expect(page.getByLabel("销售金额聚合性质", { exact: true })).toHaveValue("SEMI_ADDITIVE");
  await expect(page.getByLabel("销售金额单位或币种", { exact: true })).toHaveValue("CNY");
  await page.getByLabel("销售金额数字类型", { exact: true }).selectOption("RATIO");
  await expect(page.getByLabel("销售金额默认聚合", { exact: true })).toHaveValue("NONE");
  await expect(page.getByLabel("销售金额聚合性质", { exact: true })).toHaveValue("NON_ADDITIVE");
  await page.getByRole("button", { name: "保存对象", exact: true }).click();
  await expect(page.getByText("草稿已保存，1 项需修复", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "配置属性 店铺引用", exact: true }).click();
  await page.getByLabel("店铺引用关联目标", { exact: true }).selectOption("o_bu");
  await page.getByRole("button", { name: "保存对象", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存对象", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("tab", { name: /^属性 / }).click();
  await page.getByRole("button", { name: "配置属性 店铺引用", exact: true }).click();
  await expect(page.getByLabel("店铺引用关联目标", { exact: true })).toHaveValue("o_bu");
  await page.getByRole("button", { name: "配置属性 销售金额", exact: true }).click();
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${tmpdir()}/ontology-platform-property-editor-${width}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByRole("tab", { name: "基本信息", exact: true }).click();
  await page.screenshot({ path: `${tmpdir()}/ontology-platform-basic-editor-1280.png`, fullPage: true });
});

test("relations expose seven types, validate semantics, persist configuration and delete in drafts", async ({ page }) => {
  await page.goto("/?page=ontology");
  await page.getByRole("button", { name: "在草稿中编辑", exact: true }).click();
  await page.getByRole("tab", { name: /^关系 / }).click();
  await page.getByRole("button", { name: "新增关系", exact: true }).click();
  await page.getByLabel("关系名称", { exact: true }).fill("事件参与测试");
  await expect(page.getByLabel("关系类型", { exact: true }).locator("option")).toHaveText(["实体引用", "业务关联", "组成关系", "层级关系", "事件参与", "身份对应", "派生血缘"]);
  await page.getByLabel("关系类型", { exact: true }).selectOption("IDENTITY");
  await expect(page.getByLabel("关系公理校验")).toContainText("身份对应必须");
  await page.getByLabel("关系类型", { exact: true }).selectOption("EVENT_PARTICIPATION");
  await page.getByLabel("必须存在关联记录", { exact: true }).check();
  await page.getByLabel("遍历方向", { exact: true }).selectOption("BIDIRECTIONAL");
  const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/drafts/"));
  await page.getByRole("button", { name: "保存对象", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const result = (await response.json()).data;
  const relationship = result.snapshot.relations.find((r: any) => r.name === "事件参与测试");
  expect(result.validation.valid).toBe(true);
  expect(result.snapshot.axiomAssertions.some((a: any) => a.subjectId === relationship.id && a.axiomCode === "RELATION_EVENT" && a.parameters.required && a.parameters.direction === "BIDIRECTIONAL")).toBe(true);
  await page.reload();
  await page.getByRole("tab", { name: /^关系 / }).click();
  await page.getByRole("button", { name: "编辑关系 事件参与测试", exact: true }).click();
  await expect(page.getByLabel("关系类型", { exact: true })).toHaveValue("EVENT_PARTICIPATION");
  await expect(page.getByLabel("必须存在关联记录", { exact: true })).toBeChecked();
  await page.getByLabel("关系类型", { exact: true }).selectOption("COMPOSITION");
  await page.getByLabel("组成部分汇总策略", { exact: true }).selectOption("EXISTS_ONLY");
  await expect(page.getByLabel("整体对象", { exact: true })).toHaveValue("o_store");
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${tmpdir()}/ontology-platform-relation-editor-${width}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "删除关系 事件参与测试", exact: true }).click();
  await expect(page.getByLabel("关系类型", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除关系 事件参与测试", exact: true }).click();
  await page.getByRole("button", { name: "保存对象", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存对象", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("tab", { name: /^关系 / }).click();
  await expect(page.getByRole("button", { name: "编辑关系 事件参与测试", exact: true })).toHaveCount(0);
});

test("pending tables support typed object creation and draft deletion", async ({ page }) => {
  await page.goto("http://127.0.0.1:4332/?page=ontology");
  await page.getByRole("radio", { name: /orders/ }).check();
  await page.getByRole("button", { name: "从所选表添加对象", exact: true }).click();
  await expect(page.getByLabel("新对象类型").locator("option")).toHaveText(["业务实体", "业务事件", "状态快照", "汇总结果", "关联关系"]);
  await page.getByLabel("新对象类型").selectOption("RELATIONSHIP");
  await expect(page.getByText(/至少包含两个实体引用属性/)).toBeVisible();
  await expect(page.getByRole("button", { name: "创建对象", exact: true })).toBeDisabled();
  await page.getByLabel("新对象类型").selectOption("AGGREGATE");
  await page.getByLabel("新对象业务名称").fill("订单汇总");
  await page.getByLabel("order_date构成新对象粒度").check();
  await page.getByLabel("store_ref构成新对象粒度").check();
  await page.getByRole("button", { name: "创建对象", exact: true }).click();
  await expect(page.getByLabel("对象类型", { exact: true })).toHaveValue("AGGREGATE");
  await page.getByRole("tab", { name: "规则", exact: true }).click();
  await expect(page.getByText("业务粒度必须明确", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除对象 订单汇总", exact: true }).click();
  await page.getByRole("button", { name: "取消删除", exact: true }).click();
  await expect(page.getByRole("button", { name: "删除对象 订单汇总", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除对象 订单汇总", exact: true }).click();
  await page.getByRole("button", { name: "确认删除对象", exact: true }).click();
  await expect(page.getByText("对象已从草稿删除，发布后生效", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "删除对象 订单汇总", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /orders/ })).toBeVisible();
});

test("context retrieval presents candidates and no-match feedback before raw JSON", async ({ page }) => {
  await page.goto("/?page=system");
  await page.getByLabel("请求体", { exact: true }).fill(JSON.stringify({ namespace: "retail", ontologyVersion: 1, purpose: "PLAN", concepts: { metrics: ["销售额"] } }));
  await page.getByRole("button", { name: "发送请求", exact: true }).click();
  const summary = page.getByRole("region", { name: "语义候选摘要" });
  await expect(summary).toContainText("1 个候选");
  await expect(summary).toContainText("业务名称命中");
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${tmpdir()}/ontology-context-summary-${width}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByLabel("请求体", { exact: true }).fill(JSON.stringify({ namespace: "retail", purpose: "PLAN", concepts: { metrics: ["天气预报"] } }));
  await page.getByRole("button", { name: "发送请求", exact: true }).click();
  await expect(summary).toContainText("未找到匹配的业务定义");
  await expect(summary).toContainText("天气预报");
  await expect(summary).toContainText("0 个候选");
  await page.getByRole("button", { name: "响应体", exact: true }).click();
  await expect(page.locator(".response-json")).toContainText('"NO_MATCH"');
});

test("unified context shows object name bindings and keeps SQL construction details opt-in", async ({ page }) => {
  await page.goto("/?page=system");
  const body = { namespace: "retail", ontologyVersion: 1, purpose: "PLAN", terms: ["毛利率", { term: "事业部", role: "dimensions" }] };
  await page.getByLabel("请求体", { exact: true }).fill(JSON.stringify(body));
  await page.getByRole("button", { name: "发送请求", exact: true }).click();
  await expect(page.getByRole("region", { name: "语义候选摘要" })).toContainText("事业部");
  await page.getByRole("button", { name: "响应体", exact: true }).click();
  const raw = page.locator(".response-json");
  await expect(raw).toContainText('"propertyId": "p_bu_name"');
  await expect(raw).toContainText('"status": "BOUND"');
  await expect(raw).toContainText('"relations": []');
  await expect(raw).not.toContainText('"expression"');
  await page.screenshot({ path: `${tmpdir()}/ontology-unified-context.png`, fullPage: true });
  await page.getByLabel("请求体", { exact: true }).fill(JSON.stringify({ ...body, projection: "standard" }));
  const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("resolve"));
  await page.getByRole("button", { name: "发送请求", exact: true }).click();
  await response;
  await page.getByRole("button", { name: "响应体", exact: true }).click();
  await expect(raw).toContainText('"expression"');
  await expect(raw).toContainText('"r_order_store"');
});

test("metric editor builds field metrics, property compositions and SQL templates", async ({ page }) => {
  await page.goto("/?page=ontology");
  await page.getByRole("button", { name: /在草稿中编辑/ }).click();
  await page.getByRole("button", { name: "指标", exact: true }).click();
  await page.getByRole("button", { name: "新建指标", exact: true }).click();
  await expect(page.getByText("指标已创建，可选择对象属性调整口径")).toBeVisible();
  await page.getByLabel("指标所属对象", { exact: true }).selectOption("o_order");
  await page.getByLabel("定义名称", { exact: true }).fill("浏览器成本指标");
  await page.getByLabel("计算字段", { exact: true }).selectOption("p_cost");
  await expect(page.getByLabel("指标聚合方式", { exact: true })).toHaveValue("SUM");
  await expect(page.getByLabel("指标显示格式", { exact: true })).toHaveValue("currency");
  await expect(page.getByLabel("指标计算表达式", { exact: true })).toHaveValue("SUM(orders.cost)");
  await page.getByLabel("指标聚合方式", { exact: true }).selectOption("AVG");
  await page.getByRole("button", { name: "保存定义", exact: true }).click();
  await expect(page.getByText("定义已保存，公理校验通过")).toBeVisible();
  await page.getByLabel("配置方式", { exact: true }).selectOption("DERIVED");
  await page.getByLabel("左侧指标或度量", { exact: true }).selectOption("p_cost");
  await page.getByLabel("右侧指标或度量", { exact: true }).selectOption("p_sales");
  await page.getByLabel("计算模板", { exact: true }).selectOption("RATIO");
  await page.getByRole("button", { name: "保存定义", exact: true }).click();
  await expect(page.getByText("定义已保存，公理校验通过")).toBeVisible();
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${tmpdir()}/ontology-metric-editor-${width}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByLabel("配置方式", { exact: true }).selectOption("SQL");
  await page.getByLabel("计算字段", { exact: true }).selectOption("p_cost");
  await page.getByLabel("SQL 配置模板", { exact: true }).selectOption("positive");
  await expect(page.getByLabel("指标计算表达式", { exact: true })).toHaveValue("SUM(CASE WHEN `orders`.`cost` > 0 THEN `orders`.`cost` ELSE 0 END)");
  await page.getByRole("button", { name: "保存定义", exact: true }).click();
  await expect(page.getByText("定义已保存，公理校验通过")).toBeVisible();
});

test("business intent executes from the API console in one request", async ({ page }) => {
  await page.goto("/?page=system");
  await page.getByLabel("选择 API 接口").selectOption("POST /v1/semantic-query");
  await page.getByLabel("请求体", { exact: true }).fill(JSON.stringify({namespace:"retail",ontologyVersion:1,intent:{metrics:["销售额"],dimensions:["事业部"]}}));
  await page.getByRole("button",{name:"发送请求",exact:true}).click();
  await expect(page.locator(".status-code")).toContainText("200 OK");
  await expect(page.locator(".response-json")).toContainText('"businessSummary"');
  await expect(page.locator(".response-json")).toContainText('"rows"');
  await expect(page.locator(".response-json")).not.toContainText('"sqlPreview"');
});
