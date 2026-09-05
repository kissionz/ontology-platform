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
  await page.getByRole("button", { name: /事业部.*ENTITY/ }).click();
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
  await expect(page.getByText(/databaseVersion.*SelectDB 3.x/)).toBeVisible();
  await page.getByRole("button", { name: /重建索引/ }).click();
  await expect(page.getByText(/valuesCount/)).toBeVisible();

  await page.getByRole("button", { name: "系统", exact: true }).click();
  await expect(page.getByText("接口元数据实时读取 OpenAPI")).toBeVisible();
  await page.getByRole("button", { name: /发送请求/ }).click();
  await expect(page.locator(".status-code")).toContainText("200 OK");
  await expect(page.locator(".response-json")).toContainText("contextDigest");
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
  await expect(page.getByLabel("指标或层级定义")).toContainText('"metricType"');
  const metric = JSON.parse(await page.getByLabel("指标或层级定义").inputValue());
  metric.description = "浏览器保存的指标口径";
  await page.getByLabel("指标或层级定义").fill(JSON.stringify(metric, null, 2));
  await page.getByRole("button", { name: "保存定义", exact: true }).click();
  await expect(page.getByText("定义已保存，公理校验通过")).toBeVisible();
  await page.getByRole("button", { name: "层级", exact: true }).click();
  await expect(page.getByLabel("指标或层级定义")).toContainText('"FIXED_LEVELS"');
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

test("graph inspection, version filters and rollback drafts remain usable across navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /订单.*EVENT/ }).click();
  await page.getByRole("tab", { name: "指标", exact: true }).click();
  await expect(page.locator(".inspector").getByText("SUM(orders.sales)", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "关系", exact: true }).click();
  await expect(page.locator(".inspector").getByText("订单关联店铺")).toBeVisible();
  await page.getByRole("button", { name: "含指标", exact: true }).click();
  await page.getByRole("button", { name: /销售额.*METRIC/ }).click();
  await expect(page.locator(".inspector h2")).toHaveText("订单");
  await expect(page.getByRole("tab", { name: "指标", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "公理", exact: true }).click();
  await page.getByLabel("公理本体版本").selectOption("1");
  await expect(page.locator(".logic-grid")).not.toContainText(/PROPERTY|ENTITY|SEMANTIC_PLANNING|PUBLISH_VALIDATION/);
  await page.getByLabel("公理适用对象").selectOption("o_order");
  await page.getByLabel("公理域筛选").selectOption("METRIC_ALGEBRA");
  await page.getByRole("button", { name: /比例不能直接累加.*指标/ }).click();
  await page.getByRole("button", { name: /查看定义 · 毛利率/ }).first().click();
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
