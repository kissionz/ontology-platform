/*
  Static hi-fi review prototype.
  Context: independent ontology control plane, visually aligned with InsightFlow.
  Signature interaction represented in stills: directed graph plus semantic inspector.
*/

const objects = [
  { id: "sales", label: "拆套销售", name: "dws_btn_group_prod_merge_final_split_chatbi", type: "AGGREGATE", properties: 30, grain: "业务日期 + 店铺 + 商品 + 达人", owner: "数据产品组", description: "按业务日期、组织和商品粒度沉淀的拆套销售聚合事实。" },
  { id: "store", label: "店铺", name: "chatbi_store", type: "ENTITY", properties: 5, grain: "店铺 ID", owner: "电商数据组", description: "公司经营渠道中的标准店铺实体。" },
  { id: "department", label: "部门", name: "chatbi_shop_belong", type: "ENTITY", properties: 3, grain: "部门 ID", owner: "组织数据组", description: "店铺所属的经营部门。" },
  { id: "bu", label: "事业部", name: "chatbi_bu", type: "ENTITY", properties: 3, grain: "事业部 ID", owner: "组织数据组", description: "组织体系中的事业部实体。" },
  { id: "org", label: "组织", name: "chatbi_org", type: "ENTITY", properties: 2, grain: "组织 ID", owner: "组织数据组", description: "业务分析使用的最高层组织实体。" },
  { id: "product", label: "拆套商品", name: "chatbi_good", type: "ENTITY", properties: 22, grain: "商品 SKU ID", owner: "商品数据组", description: "拆套口径下的标准商品实体。" },
  { id: "influencer", label: "端口明细", name: "chatbi_influencer", type: "ENTITY", properties: 9, grain: "达人 ID", owner: "渠道数据组", description: "直播、达人和其他销售端口的标准明细。" }
];

const relations = [
  { source: "bu", target: "org", label: "事业部关联组织", cardinality: "MANY_TO_ONE" },
  { source: "store", target: "department", label: "店铺关联部门", cardinality: "MANY_TO_ONE" },
  { source: "department", target: "bu", label: "部门关联事业部", cardinality: "MANY_TO_ONE" },
  { source: "sales", target: "store", label: "拆套销售关联店铺", cardinality: "MANY_TO_ONE" },
  { source: "sales", target: "influencer", label: "拆套销售关联端口明细", cardinality: "MANY_TO_ONE" },
  { source: "sales", target: "product", label: "拆套销售关联拆套商品", cardinality: "MANY_TO_ONE" }
];

const properties = {
  sales: [["业务日期", "tdate", "TIME", "DATE"], ["店铺 ID", "store_id", "ENTITY_REFERENCE", "VARCHAR"], ["商品 SKU ID", "sku_id", "ENTITY_REFERENCE", "VARCHAR"], ["达人 ID", "influencer_id", "ENTITY_REFERENCE", "VARCHAR"], ["渠道性质", "shop_type", "CATEGORY", "VARCHAR"], ["是否派样", "paiyang_flag", "BOOLEAN", "VARCHAR"], ["套内属性", "amt_type_lv2", "CATEGORY", "VARCHAR"], ["场景", "author_type", "CATEGORY", "VARCHAR"], ["销售金额", "sales_amount", "NUMBER", "DECIMAL"], ["成本金额", "cost_amount", "NUMBER", "DECIMAL"]],
  store: [["店铺 ID", "store_id", "ID", "VARCHAR"], ["店铺名称", "store_name", "NAME", "VARCHAR"], ["部门 ID", "shop_belong_id", "ENTITY_REFERENCE", "VARCHAR"], ["渠道性质", "shop_type", "CATEGORY", "VARCHAR"], ["启用状态", "is_active", "BOOLEAN", "TINYINT"]],
  department: [["部门 ID", "shop_belong_id", "ID", "VARCHAR"], ["部门名称", "shop_belong_name", "NAME", "VARCHAR"], ["事业部 ID", "bu_id", "ENTITY_REFERENCE", "VARCHAR"]],
  bu: [["事业部 ID", "bu_id", "ID", "VARCHAR"], ["事业部名称", "bu_name", "NAME", "VARCHAR"], ["组织 ID", "org_id", "ENTITY_REFERENCE", "VARCHAR"]],
  org: [["组织 ID", "org_id", "ID", "VARCHAR"], ["组织名称", "org_name", "NAME", "VARCHAR"]],
  product: [["商品 SKU ID", "sku_id", "ID", "VARCHAR"], ["商品名称", "sku_name", "NAME", "VARCHAR"], ["品牌", "brand_name", "CATEGORY", "VARCHAR"], ["一级品类", "category_lv1", "CATEGORY", "VARCHAR"], ["标准成本", "standard_cost", "NUMBER", "DECIMAL"]],
  influencer: [["达人 ID", "influencer_id", "ID", "VARCHAR"], ["达人名称", "influencer_name", "NAME", "VARCHAR"], ["二级端口", "author_type_grp2", "CATEGORY", "VARCHAR"], ["场景", "author_type", "CATEGORY", "VARCHAR"]]
};

const metrics = [
  { label: "销售额", type: "基础指标", object: "拆套销售", aggregation: "SUM", formula: "SUM(sales_amount)" },
  { label: "成本额", type: "基础指标", object: "拆套销售", aggregation: "SUM", formula: "SUM(cost_amount)" },
  { label: "毛利额", type: "派生指标", object: "拆套销售", aggregation: "CUSTOM", formula: "销售额 - 成本额" },
  { label: "毛利率", type: "派生指标", object: "拆套销售", aggregation: "CUSTOM", formula: "毛利额 / 销售额 × 100" }
];

const logicEntries = [
  { id: "IDENTITY-01", kind: "身份公理", name: "实体必须具有唯一 ID", status: "本体内建", scope: "ENTITY", summary: "每个实体类型必须声明非空、稳定且唯一的身份属性。" },
  { id: "GRAIN-01", kind: "粒度公理", name: "事实粒度唯一", status: "本体内建", scope: "FACT · AGGREGATE", summary: "粒度属性组合唯一确定一条事实记录。" },
  { id: "METRIC-03", kind: "度量公理", name: "比例度量不可加", status: "本体内建", scope: "RATIO", summary: "比例值跨分组聚合时必须由分子与分母重新计算。", expression: '{\n  "axiom": "RATIO_NON_ADDITIVE",\n  "appliesTo": "Metric[semantic=RATIO]",\n  "invariant": {\n    "aggregate": "DIVIDE(SUM(numerator), SUM(denominator))",\n    "forbidden": "SUM(ratio_value)"\n  },\n  "derivedFor": ["毛利率"]\n}' },
  { id: "METRIC-04", kind: "度量公理", name: "金额度量可加", status: "本体内建", scope: "AMOUNT", summary: "金额在兼容粒度与维度范围内满足可加性。" },
  { id: "RELATION-02", kind: "关系公理", name: "层级关系具有传递性", status: "本体内建", scope: "HIERARCHY", summary: "可沿层级父子关系推导祖先关系与可达路径。" },
  { id: "INFERENCE-18", kind: "推论", name: "店铺归属于事业部", status: "系统推导", scope: "v4", summary: "由店铺归属部门、部门归属事业部传递得到。" }
];

const versions = [
  { version: 4, status: "当前版本", published: "2026-09-01 15:25", author: "数据产品组", objects: 7, relations: 6, metrics: 4, change: "调整组织关系，更新销售对象口径" },
  { version: 3, status: "历史版本", published: "2026-07-27 17:46", author: "数据产品组", objects: 7, relations: 9, metrics: 4, change: "新增毛利额、毛利率派生指标" },
  { version: 2, status: "历史版本", published: "2026-07-27 14:38", author: "数据产品组", objects: 7, relations: 9, metrics: 0, change: "完善关系方向与基数" },
  { version: 1, status: "历史版本", published: "2026-07-27 10:40", author: "数据产品组", objects: 7, relations: 9, metrics: 0, change: "首次发布业务对象与属性" }
];

const paths = {
  overview: ["概览", "查看版本、核心统计和本体关系图谱。"],
  ontology: ["本体建模", "维护对象、属性、指标、关系与维度层级。"],
  logic: ["公理与推论", "查看本体内建事实、语义规范及其确定性推论。"],
  versions: ["版本管理", "查看不可变快照、版本差异与发布记录。"],
  data: ["数据源", "管理 SelectDB 连接、Schema 扫描和属性值索引。"],
  system: ["系统管理", "调试公共 API，管理访问密钥和调用审计。"]
};

function icon(name, size = 20) {
  const p = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>',
    ontology: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 10.9 7.4-3.7M8.3 13.1l7.4 3.7"/>',
    logic: '<path d="M4 5h16M4 12h10M4 19h16"/><circle cx="17" cy="12" r="3"/>',
    versions: '<path d="M6 3v12a4 4 0 0 0 4 4h8"/><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M10 8h5a3 3 0 0 1 3 3v2"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    system: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3A1.7 1.7 0 0 0 14 21v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14h-.2v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    filter: '<path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
    send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 8a7 7 0 0 1 11.4-2L20 8M4 16l2.5 2a7 7 0 0 0 11.4-2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    audit: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 8l2 2M17 6l2 2"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.overview}</svg>`;
}

function status(text, tone = "") { return `<span class="status-pill ${tone}">${text}</span>`; }
function button(label, glyph, primary = false) { return `<button class="${primary ? "primary-button" : "secondary-button"}">${glyph ? icon(glyph, 15) : ""}${label}</button>`; }

function nav(page) {
  const items = [["overview", "概览"], ["ontology", "本体"], ["logic", "公理"], ["versions", "版本"], ["data", "数据源"]];
  return `<nav class="global-nav" aria-label="全局导航">
    <a class="brand-mark" href="?page=overview" aria-label="本体管理平台">${icon("ontology", 22)}</a>
    ${items.map(([id, label]) => `<a class="nav-link ${page === id ? "active" : ""}" href="?page=${id}">${icon(id, 21)}<span>${label}</span></a>`).join("")}
    <a class="nav-link system ${page === "system" ? "active" : ""}" href="?page=system">${icon("system", 21)}<span>系统</span></a>
  </nav>`;
}

function topbar(page) {
  const [title, subtitle] = paths[page];
  return `<header class="topbar">
    <div class="title-group"><h1>${title}</h1><p>${subtitle}</p></div>
    <div class="topbar-actions">
      <div class="namespace-select"><span>命名空间</span><strong>retail</strong>${icon("chevron", 12)}</div>
      <div class="version-select">已发布 v4</div>
      ${page === "overview" ? button("创建草稿", "plus", true) : page === "ontology" ? button("编辑草稿", "plus", true) : ""}
    </div>
  </header>`;
}

function stat(label, value, glyph, meta) {
  return `<div class="stat"><span class="stat-icon">${icon(glyph, 20)}</span><span class="stat-copy"><span>${label}</span><strong>${value}</strong></span>${meta ? `<span class="stat-meta">${meta}</span>` : ""}</div>`;
}

function graphSvg() {
  const pos = { sales:[280,285], store:[510,165], department:[675,165], bu:[795,165], org:[795,65], product:[520,405], influencer:[280,470] };
  const node = (obj) => {
    const [x,y] = pos[obj.id];
    return `<a href="?page=overview&object=${obj.id}"><g class="graph-node ${obj.type === "ENTITY" ? "entity" : "selected"}" transform="translate(${x - 66} ${y - 27})">
      <rect width="132" height="54" rx="8"></rect><circle class="node-dot" cx="17" cy="18" r="4"></circle>
      <text class="node-title" x="29" y="22">${obj.label}</text><text class="node-type" x="17" y="39">${obj.type} · ${obj.properties} 属性</text>
    </g></a>`;
  };
  const lines = relations.map((rel) => {
    const [x1,y1] = pos[rel.source], [x2,y2] = pos[rel.target];
    const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy), sx=x1+dx/len*68, sy=y1+dy/len*29, tx=x2-dx/len*72, ty=y2-dy/len*30;
    return `<path class="graph-edge" d="M${sx} ${sy} L${tx} ${ty}" marker-end="url(#arrow)"></path>`;
  }).join("");
  return `<svg viewBox="0 0 920 560" role="img" aria-label="v4 本体有向图"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#aebbd0"></path></marker></defs>${lines}${objects.map(node).join("")}</svg>`;
}

function inspector(objectId = "sales") {
  const obj = objects.find(item => item.id === objectId) || objects[0];
  const rows = properties[obj.id] || [];
  return `<aside class="panel inspector">
    <div class="inspector-hero">
      <div class="object-heading"><span class="object-glyph">${icon("ontology", 20)}</span><div><h2>${obj.label}</h2><p>${obj.name}</p></div></div>
      <p class="object-description">${obj.description}</p>
      <div class="meta-grid"><div><span>对象类型</span><strong>${obj.type}</strong></div><div><span>状态</span><strong>已发布</strong></div><div><span>业务粒度</span><strong>${obj.grain}</strong></div><div><span>负责人</span><strong>${obj.owner}</strong></div></div>
    </div>
    <div class="tabbar"><button class="active">属性 ${obj.properties}</button><button>指标</button><button>关系</button><button>公理</button></div>
    <div class="inspector-body">${rows.map(p => `<div class="property-row"><div><strong>${p[0]}</strong><small>${p[1]} · ${p[3]}</small></div><span class="property-type">${p[2]}</span></div>`).join("")}</div>
  </aside>`;
}

function overviewPage() {
  const objectId = new URLSearchParams(location.search).get("object") || "sales";
  return `<main class="content no-scroll" data-screen-label="概览">
    <section class="stats-row">${stat("当前本体版本", "v4", "versions", "已发布")}${stat("业务对象", "7", "ontology")}${stat("对象关系", "6", "logic")}${stat("业务指标", "4", "overview")}</section>
    <section class="overview-grid">
      <div class="panel graph-panel">
        <div class="graph-toolbar"><div class="graph-toolbar-left"><strong style="font-size:13px">本体图谱</strong>${status("7 对象 · 6 关系")}</div><div class="graph-toolbar-right"><div class="segmented"><button class="active">对象关系</button><button>含指标</button><button>含公理</button></div><button class="subtle-button">${icon("filter",13)}筛选</button><button class="subtle-button">${icon("expand",13)}</button></div></div>
        <div class="graph-stage">${graphSvg()}<div class="graph-legend"><span class="legend-item"><i class="legend-dot fact"></i>事实对象</span><span class="legend-item"><i class="legend-dot"></i>实体对象</span><span class="legend-item"><i class="legend-line"></i>关系方向</span></div></div>
      </div>${inspector(objectId)}
    </section>
  </main>`;
}

function objectCatalog() {
  return objects.map((o,i) => `<div class="catalog-item ${i===0 ? "active" : ""}"><span class="catalog-icon">${icon("ontology",17)}</span><span><strong>${o.label}</strong><small>${o.type} · ${o.properties} 个属性</small></span>${icon("chevron",13)}</div>`).join("");
}

function ontologyPage() {
  const propRows = properties.sales.map(p => `<tr><td><strong>${p[0]}</strong><br><code>${p[1]}</code></td><td>${p[2]}</td><td>${p[3]}</td><td>ANALYTICAL</td><td>${p[2] === "NUMBER" ? "SUM · ADDITIVE" : "-"}</td></tr>`).join("");
  return `<main class="content no-scroll" data-screen-label="本体建模"><section class="three-column">
    <aside class="panel catalog-panel"><div class="panel-header"><div><h2>本体目录</h2><p>已发布 v4</p></div>${status("7 对象", "success")}</div><div class="catalog-tabs"><button class="active">对象</button><button>指标</button><button>层级</button></div><div class="catalog-list">${objectCatalog()}</div></aside>
    <section class="panel detail-panel"><div class="panel-header"><div><h2>对象定义</h2><p>查看已发布口径，进入草稿后可编辑</p></div>${button("在草稿中编辑", "plus")}</div><div class="detail-content"><div class="detail-title"><div><h2>拆套销售</h2><p>按业务日期、组织和商品粒度沉淀的拆套销售聚合事实，用于销售、成本和毛利分析。</p></div>${status("AGGREGATE", "purple")}</div><div class="detail-section"><h3>基本定义</h3><div class="definition-grid"><div class="definition-field"><span>机器标识</span><code>dws_btn_group_prod_merge_final_split_chatbi</code></div><div class="definition-field"><span>来源表</span><code>retail.dws_btn_group_prod_merge_final_split_chatbi</code></div><div class="definition-field"><span>业务粒度</span><strong>业务日期 + 店铺 + 商品 + 达人</strong></div><div class="definition-field"><span>默认时间字段</span><strong>业务日期</strong></div></div></div><div class="detail-section"><h3>属性</h3><table class="table"><thead><tr><th>属性</th><th>语义</th><th>数据类型</th><th>可见性</th><th>聚合语义</th></tr></thead><tbody>${propRows}</tbody></table></div></div></section>
    <aside class="panel side-panel"><div class="panel-header"><div><h2>语义关联</h2><p>当前对象的治理内容</p></div></div><div class="side-section"><h3>业务指标 <span>4</span></h3>${metrics.map(m => `<div class="metric-card"><span class="catalog-icon">${icon("overview",15)}</span><div><strong>${m.label}</strong><small>${m.type} · ${m.formula}</small></div></div>`).join("")}</div><div class="side-section"><h3>对象关系 <span>3</span></h3>${relations.filter(r=>r.source==="sales").map(r => `<div class="relation-card"><span class="catalog-icon">${icon("logic",15)}</span><div><strong>${r.label}</strong><small>${r.cardinality} · 双向寻路</small></div></div>`).join("")}</div></aside>
  </section></main>`;
}

function logicPage() {
  const selected = logicEntries[2];
  return `<main class="content no-scroll" data-screen-label="公理与推论"><section class="logic-grid">
    <aside class="panel catalog-panel"><div class="panel-header"><div><h2>本体公理库</h2><p>由本体类型自动继承并随版本固化</p></div>${status("12 项", "success")}</div><div class="catalog-tabs"><button class="active">全部</button><button>身份</button><button>度量</button><button>关系</button></div><div class="logic-list">${logicEntries.map(e => `<div class="logic-item ${e.id===selected.id ? "active" : ""}"><div class="logic-item-top"><span class="logic-id">${e.id}</span>${status(e.status, e.kind === "推论" ? "purple" : "success")}</div><strong>${e.name}</strong><p>${e.summary}</p></div>`).join("")}</div></aside>
    <section class="panel detail-panel"><div class="panel-header"><div><h2>${selected.name}</h2><p>${selected.id} · ${selected.scope}</p></div>${status("内建公理", "success")}</div><div class="detail-content"><div class="detail-title"><div><h2>比例度量不可加</h2><p>比例指标跨粒度或层级聚合时，由聚合后的分子与分母重新计算，以保持指标语义一致。</p></div>${status("度量代数", "purple")}</div><div class="definition-grid" style="margin-top:16px"><div class="definition-field"><span>公理域</span><strong>METRIC_ALGEBRA</strong></div><div class="definition-field"><span>适用语义</span><strong>RATIO</strong></div><div class="definition-field"><span>聚合性质</span><strong>NON_ADDITIVE</strong></div><div class="definition-field"><span>生效阶段</span><strong>SEMANTIC_PLANNER</strong></div></div><div class="code-editor"><div class="code-toolbar"><span>规范化公理表示</span><span>v4 · 校验通过</span></div><pre>${selected.expression}</pre></div></div></section>
    <aside class="panel side-panel"><div class="panel-header"><div><h2>推论实例</h2><p>由公理与本体事实确定性生成</p></div>${status("可解释", "success")}</div><div class="side-section"><h3>当前结论 <span>2</span></h3><div class="inference-card"><span class="catalog-icon">${icon("check",15)}</span><div><strong>毛利率按事业部重新计算</strong><small>先汇总毛利额与销售额，再计算事业部毛利率。</small></div></div><div class="inference-card"><span class="catalog-icon">${icon("check",15)}</span><div><strong>店铺归属于事业部</strong><small>由店铺 → 部门 → 事业部的层级关系传递得到。</small></div></div></div><div class="side-section"><h3>推论依据</h3><div class="evidence-flow"><div class="flow-step"><span class="flow-marker">1</span><div class="flow-copy"><strong>指标定义事实</strong><small>毛利率 = 毛利额 ÷ 销售额</small></div></div><div class="flow-step"><span class="flow-marker">2</span><div class="flow-copy"><strong>度量代数公理</strong><small>比例语义为 NON_ADDITIVE</small></div></div><div class="flow-step"><span class="flow-marker">3</span><div class="flow-copy"><strong>层级关系事实</strong><small>店铺 → 部门 → 事业部</small></div></div><div class="flow-step"><span class="flow-marker">4</span><div class="flow-copy"><strong>确定性结论</strong><small>按目标层级重算毛利率</small></div></div></div></div></aside>
  </section></main>`;
}

function versionsPage() {
  return `<main class="content" data-screen-label="版本管理"><section class="stats-row">${stat("当前发布版本", "v4", "versions", "2026-09-01")}${stat("历史快照", "4", "audit")}${stat("草稿", "1", "code", "未发布")}${stat("索引版本", "v4", "data", "已就绪")}</section><section class="versions-grid">
    <div class="panel"><div class="panel-header"><div><h2>本体版本</h2><p>发布版本不可修改，回滚会创建新版本</p></div>${button("比较版本", "versions")}</div><div class="version-table"><div class="version-row header"><span>版本</span><span>状态</span><span>变更说明</span><span>发布人</span><span>规模</span><span></span></div>${versions.map((v,i)=>`<div class="version-row ${i===0 ? "selected" : ""}"><span class="version-number">v${v.version}</span><span>${status(v.status,i===0?"success":"")}</span><span class="version-change"><strong>${v.change}</strong><small>${v.published}</small></span><span>${v.author}</span><span>${v.objects}/${v.relations}/${v.metrics}</span><span>${icon("chevron",14)}</span></div>`).join("")}</div></div>
    <aside class="panel version-side"><div class="panel-header"><div><h2>v4 版本详情</h2><p>基于 v3 发布</p></div>${status("不可变快照", "success")}</div><div class="side-section"><h3>版本规模</h3><div class="diff-summary"><div><strong>7</strong><span>对象</span></div><div><strong>6</strong><span>关系</span></div><div><strong>4</strong><span>指标</span></div></div></div><div class="side-section"><h3>相对 v3 的变化</h3><div class="change-list"><div class="change-item"><span class="change-sign">+</span><div><strong>更新拆套销售默认粒度</strong><small>补充达人维度，更新粒度公理。</small></div></div><div class="change-item"><span class="change-sign remove">−</span><div><strong>移除 3 条冗余组织关系</strong><small>保留单一路径，避免候选冲突。</small></div></div><div class="change-item"><span class="change-sign">+</span><div><strong>重建属性值索引</strong><small>18,572 个值完成版本隔离。</small></div></div></div></div><div class="side-section"><h3>发布检查</h3><div class="inference-card"><span class="catalog-icon">${icon("check",15)}</span><div><strong>33 项 Golden Cases 通过</strong><small>对象、指标、关系、SQL 与版本公理均通过。</small></div></div><div class="inference-card"><span class="catalog-icon">${icon("lock",15)}</span><div><strong>快照校验和已保存</strong><small>sha256: 7cc9…e32a</small></div></div></div></aside>
  </section></main>`;
}

function dataPage() {
  const tables = [["dws_btn_group_prod_merge_final_split_chatbi","TABLE","30","已建模"],["chatbi_good","TABLE","22","已建模"],["chatbi_store","TABLE","5","已建模"],["chatbi_org","TABLE","2","已建模"],["ads_sales_daily","VIEW","18","待建模"],["dim_calendar","TABLE","12","待建模"]];
  return `<main class="content" data-screen-label="数据源"><section class="data-grid"><div><section class="panel source-card"><div class="source-heading"><div class="source-lockup"><span class="source-icon">${icon("data",20)}</span><div><h2>SelectDB 生产连接</h2><p>最近测试：2026-09-04 21:18</p></div></div>${status("连接正常","success")}</div><div class="source-fields"><div class="source-field"><span>主机</span><strong>selectdb.internal</strong></div><div class="source-field"><span>端口</span><strong>9030</strong></div><div class="source-field"><span>Catalog</span><strong>internal</strong></div><div class="source-field"><span>Database</span><strong>retail_dw</strong></div><div class="source-field"><span>TLS</span><strong>已启用</strong></div><div class="source-field"><span>凭据</span><strong>系统钥匙串</strong></div></div><div class="source-actions">${button("测试连接","refresh")}${button("编辑连接","code",true)}</div></section><section class="panel index-card"><div class="source-heading"><div class="source-lockup"><span class="source-icon">${icon("search",19)}</span><div><h2>属性值索引</h2><p>按已发布本体版本隔离</p></div></div>${status("READY","success")}</div><div class="index-progress"><span></span></div><div class="index-meta"><span>26 个属性 · 18,572 个值</span><span>92% 覆盖</span></div><div class="source-actions">${button("查看明细","table")}${button("重建索引","refresh")}</div></section></div><section class="panel schema-panel"><div class="panel-header"><div><h2>物理 Schema</h2><p>29 张表和视图，7 张已建模</p></div>${button("扫描 Schema","refresh",true)}</div><div class="schema-toolbar"><label class="schema-search">${icon("search",14)}<input placeholder="搜索表名或字段"></label><div class="segmented"><button class="active">全部 29</button><button>已建模 7</button><button>待建模 22</button></div></div><div class="schema-table"><table class="table"><thead><tr><th>表或视图</th><th>类型</th><th>字段数</th><th>建模状态</th><th>最近扫描</th><th></th></tr></thead><tbody>${tables.map((t,i)=>`<tr><td><strong>${t[0]}</strong><br><code>retail_dw.${t[0]}</code></td><td>${t[1]}</td><td>${t[2]}</td><td><span class="schema-status"><i class="status-dot ${i>3?"warning":""}"></i>${t[3]}</span></td><td>今天 21:18</td><td>${icon("more",14)}</td></tr>`).join("")}</tbody></table></div></section></section></main>`;
}

function syntaxJson(value) {
  const escaped = value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|\b(-?\d+(?:\.\d+)?)\b/g, m => {
    if (/^".*":$/.test(m)) return `<span class="code-key">${m}</span>`;
    if (/^"/.test(m)) return `<span class="code-string">${m}</span>`;
    if (/^-?\d/.test(m)) return `<span class="code-number">${m}</span>`;
    return `<span class="code-muted">${m}</span>`;
  });
}

function systemPage() {
  const request = '{\n  "queryMode": "AUTO",\n  "namespace": "retail",\n  "ontologyVersion": "latest",\n  "question": "今年各事业部销售额和毛利率",\n  "options": {\n    "includeResolution": true,\n    "includeQueryIr": false\n  }\n}';
  const response = '{\n  "data": {\n    "status": "COMPLETED",\n    "resolutionMode": "AUTO",\n    "ontologyVersion": 4,\n    "columns": ["事业部", "销售额", "毛利率"],\n    "rows": [\n      { "事业部": "品牌电商", "销售额": 128405620.50, "毛利率": 72.84 },\n      { "事业部": "内容电商", "销售额": 93618420.00, "毛利率": 69.17 }\n    ],\n    "rowCount": 2,\n    "truncated": false,\n    "planId": "plan_01JZ8YRKD3"\n  },\n  "meta": {\n    "requestId": "req_01JZ8YRK8A",\n    "ontologyVersion": 4,\n    "auditId": "audit_01JZ8YRM21"\n  }\n}';
  return `<main class="content no-scroll" data-screen-label="系统管理 API 调试台"><section class="system-layout"><aside class="panel system-menu"><h2>系统管理</h2><a class="active" href="#">${icon("code",16)}API 调试台</a><a href="#">${icon("key",16)}访问密钥</a><a href="#">${icon("audit",16)}调用审计</a><a href="#">${icon("search",16)}索引状态</a><a href="#">${icon("system",16)}运行设置</a></aside><section class="panel console"><div class="panel-header"><div><h2>API 调试台</h2><p>按 OpenAPI 契约构造请求，查看原始响应和审计信息</p></div><div class="panel-tools">${status("开发环境")}${button("接口文档","audit")}</div></div><div class="console-main"><div class="request-pane"><div class="pane-label"><span>请求</span><span>REST API</span></div><div class="endpoint-row"><div class="method-box">POST</div><div class="path-box">/v1/semantic-query</div></div><div class="console-tabs"><span>参数</span><span class="active">请求体</span><span>Headers</span><span>认证</span></div><div class="json-editor">${syntaxJson(request)}</div><div class="request-footer"><small>Schema 校验通过 · API Key 已从安全存储加载</small>${button("发送请求","send",true)}</div></div><div class="response-pane"><div class="pane-label"><span>响应</span><span class="response-status"><b class="status-code">200 OK</b><span class="response-meta">428 ms · 1.8 KB</span>${icon("copy",14)}</span></div><div class="console-tabs"><span class="active">响应体</span><span>解析摘要</span><span>Query IR</span><span>SQL</span><span>审计</span></div><div class="response-json">${syntaxJson(response)}</div></div></div></section></section></main>`;
}

const pageRenderers = { overview: overviewPage, ontology: ontologyPage, logic: logicPage, versions: versionsPage, data: dataPage, system: systemPage };
const params = new URLSearchParams(location.search);
const page = pageRenderers[params.get("page")] ? params.get("page") : "overview";
document.getElementById("app").innerHTML = `<div class="shell">${nav(page)}<section class="workspace">${topbar(page)}${pageRenderers[page]()}</section></div>`;
