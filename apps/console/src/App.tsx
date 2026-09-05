import { axiomTitle, axiomDescription, chineseParameters, term } from "./axiom-copy.js";
import { CONTRACT_SCHEMAS } from "../../../packages/contracts/src/index.js";
import { NewObjectForm } from "./NewObjectForm.js";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowsOutIcon as ArrowsOut,
  ArrowClockwiseIcon as ArrowClockwise,
  BracketsCurlyIcon as BracketsCurly,
  CaretRightIcon as CaretRight,
  CheckIcon as Check,
  CirclesThreePlusIcon as CirclesThreePlus,
  CodeIcon as Code,
  DatabaseIcon as Database,
  FloppyDiskIcon as FloppyDisk,
  GitBranchIcon as GitBranch,
  KeyIcon as Key,
  ListChecksIcon as ListChecks,
  MagnifyingGlassIcon as MagnifyingGlass,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  PlusIcon as Plus,
  ShieldWarningIcon as ShieldWarning,
  SquaresFourIcon as SquaresFour,
  TreeStructureIcon as TreeStructure,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";

type Page = "overview" | "ontology" | "logic" | "versions" | "data" | "system";
type Envelope<T> = {
  status: string;
  data: T;
  ontologyVersion?: number;
  error?: {
    code: string;
    message: string;
    action?: string;
    details?: Record<string, unknown>;
  };
};
type Property = {
  id: string;
  name: string;
  label: string;
  description: string;
  meaning: string;
  dataType: string;
  visibility: string;
  numericSpec?: { defaultAggregation: string; aggregationBehavior: string };
  sensitive: boolean;
  sourceColumn: string;
  valueSearchable: boolean;
};
type ObjectDef = {
  id: string;
  name: string;
  label: string;
  description: string;
  objectType: string;
  grain: string;
  grainPropertyIds: string[];
  defaultTimePropertyId?: string;
  sourceTableId: string;
  properties: Property[];
  owner?: string;
};
type Snapshot = {
  namespace: string;
  version: number;
  status: string;
  contentDigest: string;
  objects: ObjectDef[];
  relations: Array<{
    id: string;
    name: string;
    sourceObjectId: string;
    targetObjectId: string;
    cardinality: string;
    direction: string;
    required: boolean;
  }>;
  metrics: Array<{
    id: string;
    name: string;
    label: string;
    description: string;
    metricType: string;
    objectId: string;
    expression: string;
    aggregation: string;
    format: string;
  }>;
  dimensionHierarchies: Array<{
    id: string;
    label: string;
    kind: string;
    levels: Array<{ objectId: string; propertyId: string }>;
  }>;
  axiomAssertions: Array<Axiom>;
  inferredAssertions: Array<Inference>;
};
type Axiom = {
  id: string;
  axiomCode: string;
  domain: string;
  subjectType: string;
  subjectId: string;
  parameters: Record<string, unknown>;
  kernelVersion: string;
  enforcement: string;
  severity: string;
  sourceDefinitionIds: string[];
};
type Inference = {
  id: string;
  predicate: string;
  subjectId: string;
  objectId?: string;
  value?: unknown;
  axiomAssertionIds: string[];
  premiseAssertionIds: string[];
  proof: Array<{
    sequence: number;
    kind: string;
    refId: string;
    statement: string;
  }>;
};
type Graph = {
  nodes: Array<{
    id: string;
    label: string;
    kind: string;
    objectType: string;
    propertyCount: number;
    detail: unknown;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    cardinality: string;
  }>;
  ontologyVersion: number;
};

const icons: Record<
  string,
  ComponentType<{ size?: number; weight?: "regular" | "bold" }>
> = {
  overview: SquaresFour,
  ontology: CirclesThreePlus,
  logic: ListChecks,
  versions: GitBranch,
  data: Database,
  system: BracketsCurly,
};
const pageLabels: Record<Page, string> = {
  overview: "概览",
  ontology: "本体",
  logic: "公理",
  versions: "版本",
  data: "数据源",
  system: "系统",
};
const pageMeta: Record<Page, [string, string]> = {
  overview: ["概览", "查看版本、核心统计和本体关系图谱。"],
  ontology: ["本体建模", "维护对象、属性、指标、关系与维度层级。"],
  logic: ["公理与推论", "查看本体内建事实、语义规范及其确定性推论。"],
  versions: ["版本管理", "查看不可变快照、版本差异与发布记录。"],
  data: ["数据源", "管理 SelectDB 连接、Schema 扫描和属性值索引。"],
  system: ["系统管理", "调试公共 API，管理访问密钥和调用审计。"],
};

export function App() {
  const [page, setPage] = useState<Page>(
    () =>
      (new URLSearchParams(location.search).get("page") as Page) || "overview",
  );
  const [apiKey, setApiKeyState] = useState(
    () =>
      sessionStorage.getItem("ontology-api-key") ??
      import.meta.env.VITE_API_KEY ??
      "",
  );
  const navigate = (next: Page, params: Record<string, string> = {}) => {
    history.pushState(null, "", `?${new URLSearchParams({ page: next, ...params })}`);
    setPage(next);
  };
  useEffect(() => {
    const restorePage = () => setPage((new URLSearchParams(location.search).get("page") as Page) || "overview");
    window.addEventListener("popstate", restorePage);
    return () => window.removeEventListener("popstate", restorePage);
  }, []);
  const setApiKey = (value: string) => {
    value = value.trim();
    setApiKeyState(value);
    if (value) sessionStorage.setItem("ontology-api-key", value);
    else sessionStorage.removeItem("ontology-api-key");
  };
  return (
    <div className="shell">
      <Nav page={page} onNavigate={navigate} />
      <section className="workspace">
        <Topbar page={page} />
        {!apiKey ? (
          <ConnectPlatform onConnect={setApiKey} />
        ) : page === "overview" ? (
          <Overview apiKey={apiKey} />
        ) : page === "ontology" ? (
          <Ontology apiKey={apiKey} />
        ) : page === "logic" ? (
          <Logic apiKey={apiKey} onOpenDefinition={(entity, version) => navigate("ontology", { entity, version: String(version) })} />
        ) : page === "versions" ? (
          <Versions apiKey={apiKey} onOpenDraft={draft => navigate("ontology", { draft })} />
        ) : page === "data" ? (
          <DataPage apiKey={apiKey} />
        ) : (
          <SystemPage apiKey={apiKey} setApiKey={setApiKey} />
        )}
      </section>
    </div>
  );
}
function ConnectPlatform({ onConnect }: { onConnect: (key: string) => void }) {
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="content">
      <form className="state-panel connect-platform" onSubmit={async event => {
        event.preventDefault();
        if (!key.trim() || pending) return;
        setPending(true);
        setError("");
        try {
          await api("/v1/namespaces/retail/versions", key.trim());
          onConnect(key.trim());
        } catch (failure) {
          const status = (failure as { status?: number }).status;
          setError(status === 401 ? "密钥无效或已停用，请使用当前服务生成的密钥。" : status === 403 ? "此密钥没有当前命名空间的访问权限，请联系管理员。" : "暂时无法连接服务，请确认服务已启动后重试。");
        } finally { setPending(false); }
      }}>
        <Key size={28} />
        <h2>连接本体平台</h2>
        <p>在正在运行服务的项目目录中执行以下命令，查看自动生成的管理员密钥。</p>
        <code>npm run keys:show</code>
        <p>将输出的密钥填入下方。每份独立部署使用各自的密钥。</p>
        <label className="api-key-field">
          <span>API Key</span>
          <input aria-label="API Key" type="password" autoComplete="off" required value={key} disabled={pending} placeholder="粘贴自动生成的密钥" onChange={event => { setKey(event.target.value); setError(""); }} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={pending || !key.trim()}>{pending ? "正在验证密钥…" : "连接平台"}</button>
        <small>密钥仅保存在当前浏览器会话中。</small>
      </form>
    </main>
  );
}
function Nav({
  page,
  onNavigate,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
}) {
  return (
    <nav className="global-nav" aria-label="全局导航">
      <button
        className="brand-mark"
        aria-label="本体管理平台"
        onClick={() => onNavigate("overview")}
      >
        <TreeStructure size={22} />
      </button>
      {(["overview", "ontology", "logic", "versions", "data"] as Page[]).map(
        (id) => {
          const Icon = icons[id]!;
          return (
            <button
              key={id}
              className={`nav-link ${page === id ? "active" : ""}`}
              onClick={() => onNavigate(id)}
            >
              <Icon size={21} />
              <span>{pageLabels[id]}</span>
            </button>
          );
        },
      )}
      <button
        className={`nav-link system ${page === "system" ? "active" : ""}`}
        onClick={() => onNavigate("system")}
      >
        <BracketsCurly size={21} />
        <span>系统</span>
      </button>
    </nav>
  );
}
function Topbar({ page }: { page: Page }) {
  const [version, setVersion] = useState<number>();
  useEffect(() => { const update = (event: Event) => setVersion((event as CustomEvent<number>).detail); window.addEventListener("ontology-version", update); return () => window.removeEventListener("ontology-version", update); }, []);
  const [title, subtitle] = pageMeta[page];
  return (
    <header className="topbar">
      <div className="title-group">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className="namespace-select">
          命名空间 <strong>retail</strong>
          <CaretRight size={12} />
        </span>
        <span className="version-select">{version == null ? "版本待加载" : `已发布 v${version}`}</span>
      </div>
    </header>
  );
}

function useApi<T>(path: string, apiKey: string, deps: unknown[] = []) {
  const [state, setState] = useState<{
    loading: boolean;
    data?: T;
    error?: Error & { status?: number; payload?: Envelope<never> };
  }>({ loading: true });
  const reload = () => {
    if (!path) {
      setState({ loading: false });
      return;
    }
    setState({ loading: true });
    void api<T>(path, apiKey)
      .then((data) => setState({ loading: false, data }))
      .catch((error) => setState({ loading: false, error }));
  };
  useEffect(reload, [path, apiKey, ...deps]);
  return { ...state, reload };
}
async function api<T>(path: string, key: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(
      new Error(payload.error?.message ?? `HTTP ${response.status}`),
      { status: response.status, payload },
    );
    throw error;
  }
  if (Number.isInteger(payload.ontologyVersion) && !path.includes("drafts")) window.dispatchEvent(new CustomEvent("ontology-version", { detail: payload.ontologyVersion }));
  return (payload.data ?? payload) as T;
}
function PageState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: Error & { status?: number; payload?: Envelope<never> };
  empty?: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <main className="content">
        <div className="state-panel skeleton-state">
          <div />
          <div />
          <div />
        </div>
      </main>
    );
  const missingOntology = error?.payload?.error?.code === "ONTOLOGY_VERSION_NOT_FOUND" && (error.payload.error.details?.availableVersions as unknown[] | undefined)?.length === 0;
  if (error && !missingOntology)
    return (
      <main className="content">
        <div className="state-panel">
          <ShieldWarning size={28} />
          <h2>
            {error.status === 401 || error.status === 403
              ? "当前凭据无权访问"
              : "内容加载失败"}
          </h2>
          <p>{error.message}</p>
          {error.status === 401 || error.status === 403 ? (
            <a className="secondary-button" href="?page=system">前往系统更新 API Key</a>
          ) : error.payload?.error?.action && (
            <small>{error.payload.error.action}</small>
          )}
          <button className="secondary-button" onClick={onRetry}>
            <ArrowClockwise size={15} />
            重新加载
          </button>
        </div>
      </main>
    );
  if (empty || missingOntology)
    return (
      <main className="content">
        <div className="state-panel">
          <CirclesThreePlus size={28} />
          <h2>尚无已发布本体</h2>
          <p>先配置数据源并扫描表字段，再创建草稿、添加对象并发布第一个版本。</p>
          <a className="primary-button" href="?page=data">配置数据源</a>
          <a className="secondary-button" href="?page=ontology">创建本体</a>
        </div>
      </main>
    );
  return <>{children}</>;
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
function PanelHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="panel-tools">{children}</div>
    </div>
  );
}

function Overview({ apiKey }: { apiKey: string }) {
  const ontology = useApi<Snapshot>("/v1/namespaces/retail/ontology", apiKey);
  const summary = useApi<any>("/v1/namespaces/retail/summary", apiKey);
  const [projection, setProjection] = useState("relations");
  const graph = useApi<Graph>(
    projection === "relations"
      ? ""
      : `/v1/namespaces/retail/graph?projection=${projection}`,
    apiKey,
    [projection],
  );
  const [selected, setSelected] = useState<string>();
  const [scale, setScale] = useState(1);
  const [search, setSearch] = useState("");
  const data = summary.data,
    rawGraph: Graph | undefined =
      projection === "relations" ? summary.data?.graph : graph.data,
    g = rawGraph
      ? {
          ...rawGraph,
          nodes: rawGraph.nodes.filter((node) =>
            `${node.label} ${node.id}`.toLocaleLowerCase("zh-CN").includes(search.toLocaleLowerCase("zh-CN")),
          ),
        }
      : undefined;
  useEffect(() => {
    const first = g?.nodes.find((n) => n.kind === "OBJECT")?.id;
    if (first && !selected) setSelected(first);
  }, [g, selected]);
  const selectedNode = g?.nodes.find(node => node.id === selected);
  const selectedDetail = selectedNode?.detail as any;
  const object = ontology.data?.objects.find(item => item.id === (selectedNode?.kind === "OBJECT" ? selected : selectedNode?.kind === "METRIC" ? selectedDetail?.objectId : selectedDetail?.subjectId))
    ?? ontology.data?.objects.find(item => item.properties.some(property => property.id === selectedDetail?.subjectId));
  return (
    <PageState
      loading={!summary.error && !graph.error && (summary.loading || !rawGraph || (projection !== "relations" && graph.loading))}
      error={summary.error ?? graph.error}
      empty={!data?.counts?.objects}
      onRetry={() => {
        summary.reload();
        graph.reload();
      }}
    >
      <main className="content no-scroll">
        <section className="stats-row">
          <Stat
            label="当前本体版本"
            value={`v${data?.ontologyVersion ?? "–"}`}
            icon={GitBranch}
            meta="已发布"
          />
          <Stat
            label="业务对象"
            value={data?.counts.objects ?? 0}
            icon={CirclesThreePlus}
          />
          <Stat
            label="对象关系"
            value={data?.counts.relations ?? 0}
            icon={ListChecks}
          />
          <Stat
            label="业务指标"
            value={data?.counts.metrics ?? 0}
            icon={SquaresFour}
          />
        </section>
        <section className="overview-grid">
          <section className="panel graph-panel">
            <div className="graph-toolbar">
              <div className="graph-toolbar-left">
                <strong>本体图谱</strong>
                <Badge>
                  {g?.nodes.filter((n) => n.kind === "OBJECT").length} 对象 ·{" "}
                  {g?.edges.length} 关系
                </Badge>
              </div>
              <div className="graph-toolbar-right">
                <label className="graph-search">
                  <MagnifyingGlass size={13} />
                  <input
                    aria-label="搜索图谱"
                    value={search}
                    placeholder="搜索对象"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <div className="segmented">
                  {([
                    ["relations", "对象关系"],
                    ["metrics", "含指标"],
                    ["axioms", "含公理"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      className={projection === id ? "active" : ""}
                      onClick={() => setProjection(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="subtle-button"
                  onClick={() => setScale((v) => Math.min(1.5, v + 0.1))}
                >
                  ＋
                </button>
                <button
                  className="subtle-button"
                  onClick={() => setScale((v) => Math.max(0.7, v - 0.1))}
                >
                  −
                </button>
                <button className="subtle-button" title="适应视口" onClick={() => setScale(1)}>
                  <ArrowsOut size={13} />
                </button>
                <button
                  className="subtle-button"
                  title="全屏"
                  onClick={() =>
                    void document.querySelector(".graph-panel")?.requestFullscreen()
                  }
                >
                  全屏
                </button>
              </div>
            </div>
            <GraphView
              graph={g!}
              selected={selected}
              onSelect={setSelected}
              scale={scale}
            />
          </section>
          <Inspector key={`${object?.id}:${selectedNode?.kind}`} object={object} snapshot={ontology.data} initialTab={selectedNode?.kind === "METRIC" ? "metrics" : selectedNode?.kind === "AXIOM" ? "axioms" : "properties"} />
        </section>
      </main>
    </PageState>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  meta,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ size?: number }>;
  meta?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">
        <Icon size={20} />
      </span>
      <span className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
      {meta && <span className="stat-meta">{meta}</span>}
    </div>
  );
}
function GraphView({
  graph,
  selected,
  onSelect,
  scale,
}: {
  graph: Graph;
  selected?: string;
  onSelect: (id: string) => void;
  scale: number;
}) {
  const nodes = graph.nodes.slice(0, 30);
  const positions = new Map(
    nodes.map((node, index) => [
      node.id,
      { x: 120 + (index % 4) * 205, y: 90 + Math.floor(index / 4) * 125 },
    ]),
  );
  return (
    <div className="graph-stage">
      <svg viewBox="0 0 920 560" style={{ transform: `scale(${scale})` }}>
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0L8 4L0 8z" fill="#aebbd0" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const a = positions.get(edge.source),
            b = positions.get(edge.target);
          return a && b ? (
            <g key={edge.id}>
              <line
                className="graph-edge"
                x1={a.x + 65}
                y1={a.y}
                x2={b.x - 70}
                y2={b.y}
                markerEnd="url(#arrow)"
              />
              <title>
                {edge.label} · {edge.cardinality}
              </title>
            </g>
          ) : null;
        })}
        {nodes.map((node) => {
          const p = positions.get(node.id)!;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              className={`graph-node ${node.objectType === "ENTITY" ? "entity" : ""} ${selected === node.id ? "selected" : ""}`}
              transform={`translate(${p.x - 66} ${p.y - 27})`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => event.key === "Enter" && onSelect(node.id)}
            >
              <rect width="132" height="54" rx="8" />
              <circle className="node-dot" cx="17" cy="18" r="4" />
              <text className="node-title" x="29" y="22">
                {node.label}
              </text>
              <text className="node-type" x="17" y="39">
                {node.objectType} · {node.propertyCount} 属性
              </text>
            </g>
          );
        })}
      </svg>
      <div className="graph-legend">
        <span className="legend-item">
          <i className="legend-dot fact" />
          事实对象
        </span>
        <span className="legend-item">
          <i className="legend-dot" />
          实体对象
        </span>
        <span className="legend-item">
          <i className="legend-line" />
          关系方向
        </span>
      </div>
    </div>
  );
}
function Inspector({ object, snapshot, initialTab = "properties" }: { object?: ObjectDef; snapshot?: Snapshot; initialTab?: "properties" | "metrics" | "relations" | "axioms" }) {
  const [tab, setTab] = useState(initialTab);
  if (!object)
    return (
      <aside className="panel inspector">
        <div className="state-inline">选择一个对象查看定义</div>
      </aside>
    );
  return (
    <aside className="panel inspector">
      <div className="inspector-hero">
        <div className="object-heading">
          <span className="object-glyph">
            <CirclesThreePlus size={20} />
          </span>
          <div>
            <h2>{object.label}</h2>
            <p>{object.name}</p>
          </div>
        </div>
        <p className="object-description">{object.description}</p>
        <div className="meta-grid">
          <div>
            <span>对象类型</span>
            <strong>{object.objectType}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>已发布</strong>
          </div>
          <div>
            <span>业务粒度</span>
            <strong>{object.grain}</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>{object.sourceTableId}</strong>
          </div>
        </div>
      </div>
      <div className="tabbar" role="tablist" aria-label="对象详情">
        {([["properties", `属性 ${object.properties.length}`], ["metrics", "指标"], ["relations", "关系"], ["axioms", "公理"]] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="inspector-body" role="tabpanel">
        {tab === "properties" && object.properties.map(p => <div className="property-row" key={p.id}><div><strong>{p.label}</strong><small>{p.name} · {p.dataType}</small></div><span className="property-type">{p.meaning}</span></div>)}
        {tab === "metrics" && snapshot?.metrics.filter(metric => metric.objectId === object.id).map(metric => <div className="inspector-definition" key={metric.id}><strong>{metric.label}</strong><p>{metric.description}</p><code>{metric.expression}</code></div>)}
        {tab === "relations" && snapshot?.relations.filter(relation => relation.sourceObjectId === object.id || relation.targetObjectId === object.id).map(relation => <div className="inspector-definition" key={relation.id}><strong>{relation.name}</strong><p>{relation.sourceObjectId} → {relation.targetObjectId}</p><small>{relation.cardinality} · {relation.direction}</small></div>)}
        {tab === "axioms" && snapshot?.axiomAssertions.filter(axiom => axiom.subjectId === object.id || axiom.sourceDefinitionIds.includes(object.id) || object.properties.some(property => property.id === axiom.subjectId)).map(axiom => <div className="inspector-definition" key={axiom.id}><strong>{axiom.axiomCode}</strong><p>{axiom.subjectId}</p><small>{axiom.enforcement}</small></div>)}
      </div>
    </aside>
  );
}

function Ontology({ apiKey }: { apiKey: string }) {
  const [route, setRoute] = useState(() => new URLSearchParams(location.search));
  const snap = useApi<Snapshot>(`/v1/namespaces/retail/ontology?version=${route.get("version") ?? "latest"}`, apiKey);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<any>();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [catalogTab, setCatalogTab] = useState<"objects" | "metrics" | "dimensionHierarchies">("objects");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [definitionId, setDefinitionId] = useState("");
  const [definitionJson, setDefinitionJson] = useState("");
  const [objectForm, setObjectForm] = useState<any>();
  const [batchPatch, setBatchPatch] = useState("[]");
  const [goldenCaseJson, setGoldenCaseJson] = useState("[]");
  const [objectType, setObjectType] = useState("");
  const [changeSummary, setChangeSummary] = useState("更新本体业务语义");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [addingObject, setAddingObject] = useState(false);
  useEffect(() => {
    const draftId = route.get("draft") ?? (route.has("version") ? null : sessionStorage.getItem("ontology-active-draft"));
    if (!draftId) return;
    let active = true;
    api<any>(`/v1/namespaces/retail/drafts/${encodeURIComponent(draftId)}`, apiKey).then(result => {
      if (!active) return;
      setDraft(result); setEditing(true); setGoldenCaseJson(JSON.stringify(result.goldenReport?.cases ?? [], null, 2));
      sessionStorage.setItem("ontology-active-draft", result.draftId);
    }).catch(error => { if (active) { sessionStorage.removeItem("ontology-active-draft"); setMessage(error instanceof Error ? error.message : String(error)); } });
    return () => { active = false; };
  }, [apiKey, route]);
  const snapshot: Snapshot | undefined = draft?.snapshot ?? snap.data;
  useEffect(() => {
    const first = snapshot?.objects[0]?.id;
    if (first && !selected) setSelected(first);
  }, [snapshot, selected]);
  useEffect(() => {
    const id = route.get("entity");
    if (!id || !snapshot) return;
    const metric = snapshot.metrics.find(item => item.id === id);
    const hierarchy = snapshot.dimensionHierarchies.find(item => item.id === id);
    if (metric) { setCatalogTab("metrics"); setDefinitionId(id); setSelected(metric.objectId); }
    else if (hierarchy) { setCatalogTab("dimensionHierarchies"); setDefinitionId(id); setSelected(hierarchy.levels?.[0]?.objectId); }
    else setSelected(snapshot.objects.find(item => item.id === id || item.properties.some(property => property.id === id))?.id ?? snapshot.relations.find(item => item.id === id)?.sourceObjectId ?? snapshot.objects[0]?.id);
  }, [snap.data?.version, draft?.draftId, route]);
  const object: ObjectDef | undefined = snapshot?.objects.find((o) => o.id === selected);
  useEffect(
    () => {
      setDescription(object?.description ?? "");
      setObjectForm(object ? structuredClone(object) : undefined);
      setObjectType(object?.objectType ?? "");
    },
    [object?.id, object?.description, draft?.revision],
  );
  const createDraft = async () => {
    setBusy(true);
    try {
      const result = await api<any>("/v1/namespaces/retail/drafts", apiKey, {
        method: "POST",
        body: JSON.stringify({ baseVersion: "latest", ...(route.has("version") ? { sourceVersion: Number(route.get("version")) } : {}) }),
      });
      sessionStorage.setItem("ontology-active-draft", result.draftId);
      setDraft(result);
      setEditing(true);
      setMessage("草稿已创建");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft || !object) return;
    setBusy(true);
    try {
      const updated = { ...objectForm, description, objectType };
      const result = await api<any>(
        `/v1/namespaces/retail/drafts/${draft.draftId}`,
        apiKey,
        {
          method: "PATCH",
          body: JSON.stringify({
            revision: draft.revision,
            operations: [{ op: "UPSERT_OBJECT", value: updated }, ...JSON.parse(batchPatch)],
          }),
        },
      );
      setDraft(result);
      setMessage(
        result.validation.valid
          ? "草稿已保存，公理校验通过"
          : `草稿已保存，${result.validation.issues.length} 项需修复`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<any>(
        `/v1/namespaces/retail/drafts/${draft.draftId}/validate`,
        apiKey,
        { method: "POST", body: JSON.stringify({ goldenCases: JSON.parse(goldenCaseJson) }) },
      );
      setDraft((current: any) => ({ ...current, validation: result }));
      setMessage(result.valid ? "发布校验通过" : "发布校验未通过，请查看公理与 Golden Cases 报告");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<any>(
        `/v1/namespaces/retail/drafts/${draft.draftId}/publish`,
        apiKey,
        {
          method: "POST",
          body: JSON.stringify({
            baseVersion: draft.baseVersion,
            changeSummary,
          }),
        },
      );
      sessionStorage.removeItem("ontology-active-draft");
      history.replaceState(null, "", "?page=ontology");
      setRoute(new URLSearchParams({ page: "ontology" }));
      setDraft(undefined);
      setEditing(false);
      setMessage(`v${result.version} 已发布`);
      snap.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const definition = snapshot?.[catalogTab]?.find((item) => item.id === definitionId);
  useEffect(() => { setDefinitionJson(JSON.stringify(definition ?? {}, null, 2)); }, [definition, catalogTab]);
  const saveDefinition = async () => {
    if (!draft || catalogTab === "objects") return;
    setBusy(true);
    try {
      const result = await api<any>(`/v1/namespaces/retail/drafts/${draft.draftId}`, apiKey, { method: "PATCH", body: JSON.stringify({ revision: draft.revision, operations: [{ op: catalogTab === "metrics" ? "UPSERT_METRIC" : "UPSERT_HIERARCHY", value: JSON.parse(definitionJson) }] }) });
      setDraft(result); setMessage(result.validation.valid ? "定义已保存，公理校验通过" : "定义已保存，请处理校验项");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const refreshDraft = async () => {
    if (!draft) return;
    try { const result = await api<any>(`/v1/namespaces/retail/drafts/${draft.draftId}`, apiKey); setDraft(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const addObject = async (value: import("../../../packages/contracts/src/index.js").OntologyObject) => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<any>(`/v1/namespaces/retail/drafts/${draft.draftId}`, apiKey, { method: "PATCH", body: JSON.stringify({ revision: draft.revision, operations: [{ op: "UPSERT_OBJECT", value }] }) });
      setDraft(result); setSelected(value.id); setCatalogTab("objects"); setAddingObject(false); setMessage("对象已创建，请检查属性语义后校验草稿");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  if (!snapshot && snap.error?.payload?.error?.code === "ONTOLOGY_VERSION_NOT_FOUND" && (snap.error.payload.error.details?.availableVersions as unknown[] | undefined)?.length === 0) return (
    <main className="content"><section className="state-panel">
      <CirclesThreePlus size={28} /><h2>创建第一个本体</h2>
      <p>创建空白草稿后，可从已扫描的物理表添加对象，定义业务语义并发布。</p>
      <button className="primary-button" disabled={busy} onClick={createDraft}>创建空白草稿</button>
      <a className="secondary-button" href="?page=data">配置数据源</a>
      {message && <p role="status">{message}</p>}
    </section></main>
  );
  return (
    <PageState
      loading={!draft && snap.loading}
      error={draft ? undefined : snap.error}
      onRetry={snap.reload}
    >
      <main className="content no-scroll">
        <section className="three-column">
          <aside className="panel catalog-panel">
            <PanelHeader
              title="本体目录"
              subtitle={`${draft ? "草稿" : "已发布"} v${snapshot?.version}`}
            >
              <Badge tone="success">{snapshot?.objects.length} 对象</Badge>
            </PanelHeader>
            <div className="catalog-tabs">
              {([["objects", "对象"], ["metrics", "指标"], ["dimensionHierarchies", "层级"]] as const).map(([id, label]) => <button key={id} className={catalogTab === id ? "active" : ""} onClick={() => { setCatalogTab(id); setDefinitionId(snapshot?.[id]?.[0]?.id ?? ""); }}>{label}</button>)}
            </div>
            {editing && <button className="secondary-button" disabled={busy} onClick={() => { setAddingObject(true); setCatalogTab("objects"); }}>添加对象</button>}
            <input className="catalog-search" aria-label="搜索本体目录" placeholder="搜索名称或标识" value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} />
            <div className="catalog-list">
              {catalogTab === "objects" && snapshot?.objects.filter(o => `${o.label} ${o.name}`.includes(catalogSearch)).map((o: ObjectDef) => (
                <button
                  key={o.id}
                  className={`catalog-item ${selected === o.id ? "active" : ""}`}
                  onClick={() => { setSelected(o.id); setAddingObject(false); }}
                >
                  <span className="catalog-icon">
                    <CirclesThreePlus size={17} />
                  </span>
                  <span>
                    <strong>{o.label}</strong>
                    <small>
                      {o.objectType} · {o.properties.length} 个属性
                    </small>
                  </span>
                  <CaretRight size={13} />
                </button>
              ))}
              {catalogTab !== "objects" && snapshot?.[catalogTab]?.filter(item => `${item.label} ${item.id}`.includes(catalogSearch)).map(item => <button className={`catalog-item ${definitionId === item.id ? "active" : ""}`} key={item.id} onClick={() => setDefinitionId(item.id)}><span><strong>{item.label}</strong><small>{item.id}</small></span></button>)}
            </div>
          </aside>
          <section className="panel detail-panel">
            <PanelHeader
              title="对象定义"
              subtitle={
                editing ? "草稿编辑，保存后立即运行公理校验" : "已发布口径只读"
              }
            >
              {editing ? (
                <>
                  <button className="secondary-button" disabled={busy} onClick={validate}>校验草稿</button>
                  <button className="primary-button" disabled={busy || !object || addingObject} onClick={save}>
                    <FloppyDisk size={15} /> 保存对象
                  </button>
                  <button className="primary-button" disabled={busy || !draft?.validation?.valid || draft.validation.revision !== draft.revision} onClick={publish}>发布版本</button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={createDraft}
                >
                  <Plus size={15} />
                  在草稿中编辑
                </button>
              )}
            </PanelHeader>
            {editing && catalogTab === "objects" && (addingObject || !snapshot?.objects.length) && <>
              <NewObjectForm tables={draft.physicalTables ?? []} busy={busy} onCreate={addObject} onRefresh={() => void refreshDraft()} onCancel={snapshot?.objects.length ? () => setAddingObject(false) : undefined} />
              {message && <div className="inline-notice" role="status">{message}</div>}
            </>}
            {editing && <section className="validation-report" aria-label="发布校验报告">
              <details>
                <summary>Golden Cases · 编译回归用例</summary>
                <p>填写查询形状及预期对象、指标、关系或 SQL 片段。校验执行编译与 SQL Guard，业务结果需连接 SelectDB 验收。</p>
                <textarea className="definition-editor" aria-label="Golden Cases 定义" value={goldenCaseJson} onChange={event => { setGoldenCaseJson(event.target.value); setDraft((current: any) => ({ ...current, validation: undefined })); }} />
              </details>
              {draft.validation?.revision === draft.revision ? <div>
                <strong>revision {draft.revision} · {draft.validation.valid ? "校验通过" : "校验未通过"}</strong>
                <p>Golden Cases：{draft.validation.goldenCases?.status === "PASSED" ? "全部通过" : draft.validation.goldenCases?.status === "FAILED" ? "存在失败" : "未配置"} · {draft.validation.goldenCases?.results?.length ?? 0} 条用例</p>
                <small>{draft.validation.goldenCases?.checkedAt} · {draft.validation.goldenCases?.reportId}</small>
                <p className="validation-digest">内容摘要：{draft.validation.digests?.content}</p>
                {draft.validation.issues?.map((issue: any, index: number) => <p key={index}>{issue.code} · {issue.message}</p>)}
                {draft.validation.goldenCases?.results?.map((result: any, index: number) => <p key={index}>{result.passed ? "通过" : "失败"} · {result.label}{result.issues.length ? `：${result.issues.join("；")}` : ""}</p>)}
              </div> : <p>保存变更后运行“校验草稿”，查看当前 revision 的发布报告。</p>}
            </section>}
            {catalogTab !== "objects" && <div className="detail-content"><h2>{definition?.label ?? "选择定义"}</h2><textarea className="definition-editor" aria-label="指标或层级定义" readOnly={!editing} value={definitionJson} onChange={event => setDefinitionJson(event.target.value)} />{editing && <button className="primary-button" disabled={busy} onClick={saveDefinition}>保存定义</button>}{message && <div className="inline-notice">{message}</div>}</div>}
            {catalogTab === "objects" && object && !addingObject && (
              <div className="detail-content">
                <div className="detail-title">
                  <div>
                    <h2>{object.label}</h2>
                    {editing ? (
                      <textarea
                        className="description-editor"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    ) : (
                      <p>{object.description}</p>
                    )}
                  </div>
                  <Badge tone="purple">{object.objectType}</Badge>
                </div>
                {message && <div className="inline-notice">{message}</div>}
                <div className="detail-section">
                  <h3>基本定义</h3>
                  <div className="definition-grid">
                    <Field label="机器标识" value={object.name} code />
                    {editing && objectForm ? <label className="definition-field editable-field"><span>来源表</span><select aria-label="对象来源表" value={objectForm.sourceTableId} onChange={event => setObjectForm({ ...objectForm, sourceTableId: event.target.value })}>{!(draft.physicalTables ?? []).some((table: any) => table.id === objectForm.sourceTableId) && <option value={objectForm.sourceTableId}>{objectForm.sourceTableId}（未扫描）</option>}{draft.physicalTables?.map((table: any) => <option key={table.id} value={table.id}>{table.database}.{table.name}</option>)}</select></label> : <Field label="来源表" value={object.sourceTableId} code />}
                    {editing && objectForm ? <><label className="definition-field editable-field"><span>业务名称</span><input value={objectForm.label} onChange={e => setObjectForm({ ...objectForm, label: e.target.value })} /></label><label className="definition-field editable-field"><span>粒度属性 ID（逗号分隔）</span><input value={objectForm.grainPropertyIds.join(",")} onChange={e => setObjectForm({ ...objectForm, grainPropertyIds: e.target.value.split(",").map(id => id.trim()).filter(Boolean) })} /></label><label className="definition-field editable-field"><span>业务粒度</span><input value={objectForm.grain} onChange={e => setObjectForm({ ...objectForm, grain: e.target.value })} /></label></> : <Field label="业务粒度" value={object.grain} />}
                    {editing && objectForm ? <label className="definition-field editable-field"><span>默认时间字段</span><select aria-label="默认时间字段" value={objectForm.defaultTimePropertyId ?? ""} onChange={event => setObjectForm({ ...objectForm, defaultTimePropertyId: event.target.value || undefined })}><option value="">未配置</option>{objectForm.properties.filter((property: Property) => property.meaning === "TIME").map((property: Property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></label> : <Field label="默认时间字段" value={object.properties.find(property => property.id === object.defaultTimePropertyId)?.label ?? "未配置"} />}
                    {editing && (
                      <label className="definition-field editable-field">
                        <span>对象类型</span>
                        <select value={objectType} onChange={(event) => setObjectType(event.target.value)}>
                          {[
                            "ENTITY",
                            "EVENT",
                            "SNAPSHOT",
                            "AGGREGATE",
                            "RELATIONSHIP",
                          ].map((value) => <option key={value}>{value}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
                {editing && (
                  <label className="publish-summary">
                    <span>发布变更说明</span>
                    <input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} />
                  </label>
                )}
                {editing && objectForm && <details className="batch-editor"><summary>物理字段映射</summary><p>可选字段来自已扫描的来源表，数据类型随字段映射更新。</p><div className="mapping-fields">{objectForm.properties.map((property: Property) => {
                  const columns: Array<{ name: string; dataType: string }> = draft.physicalTables?.find((table: any) => table.id === objectForm.sourceTableId)?.columns ?? [];
                  return <label className="definition-field editable-field" key={property.id}><span>{property.label}</span><select aria-label={`${property.label}物理字段`} value={property.sourceColumn} onChange={event => { const column = columns.find(item => item.name === event.target.value); if (column) setObjectForm({ ...objectForm, properties: objectForm.properties.map((item: Property) => item.id === property.id ? { ...item, sourceColumn: column.name, dataType: column.dataType } : item) }); }}>{!columns.some(column => column.name === property.sourceColumn) && <option value={property.sourceColumn}>{property.sourceColumn}（未匹配）</option>}{columns.map(column => <option key={column.name} value={column.name}>{column.name} · {column.dataType}</option>)}</select></label>;
                })}</div></details>}
                {editing && <details className="batch-editor"><summary>关联指标、关系与层级批量变更</summary><p>输入 Draft Patch operations，与当前对象在同一次保存中提交。</p><textarea className="definition-editor" aria-label="关联定义批量变更" value={batchPatch} onChange={event => setBatchPatch(event.target.value)} /></details>}
                <div className="detail-section">
                  <h3>属性</h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>属性</th>
                        <th>语义</th>
                        <th>数据类型</th>
                        <th>可见性</th>
                        <th>聚合语义</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(editing ? objectForm?.properties ?? object.properties : object.properties).map((p: Property) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.label}</strong>
                            <br />
                            <code>{p.name}</code>
                          </td>
                          <td>{editing ? <select aria-label={`${p.label}语义`} value={p.meaning} onChange={e => setObjectForm({ ...objectForm, properties: objectForm.properties.map((item: Property) => item.id === p.id ? { ...item, meaning: e.target.value } : item) })}>{["ID", "CODE", "NAME", "ENTITY_REFERENCE", "CATEGORY", "TIME", "NUMBER", "BOOLEAN", "GEOGRAPHY", "TEXT"].map(value => <option key={value}>{value}</option>)}</select> : p.meaning}</td>
                          <td>{p.dataType}</td>
                          <td>{editing ? <select aria-label={`${p.label}可见性`} value={p.visibility} onChange={e => setObjectForm({ ...objectForm, properties: objectForm.properties.map((item: Property) => item.id === p.id ? { ...item, visibility: e.target.value } : item) })}>{["ANALYTICAL", "DETAIL_ONLY", "HIDDEN"].map(value => <option key={value}>{value}</option>)}</select> : p.visibility}</td>
                          <td>
                            {p.numericSpec
                              ? `${p.numericSpec.defaultAggregation} · ${p.numericSpec.aggregationBehavior}`
                              : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
          <aside className="panel side-panel">
            <PanelHeader title="语义关联" subtitle="当前对象的治理内容" />
            <div className="side-section">
              <h3>
                业务指标{" "}
                <span>
                  {
                    snapshot?.metrics.filter(
                      (m: any) => m.objectId === object?.id,
                    ).length
                  }
                </span>
              </h3>
              {snapshot?.metrics
                .filter((m: any) => m.objectId === object?.id)
                .map((m: any) => (
                  <div className="metric-card" key={m.id}>
                    <span className="catalog-icon">
                      <SquaresFour size={15} />
                    </span>
                    <div>
                      <strong>{m.label}</strong>
                      <small>
                        {m.metricType} · {m.expression}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
            <div className="side-section">
              <h3>对象关系</h3>
              {snapshot?.relations
                .filter(
                  (r: any) =>
                    r.sourceObjectId === object?.id ||
                    r.targetObjectId === object?.id,
                )
                .map((r: any) => (
                  <div className="relation-card" key={r.id}>
                    <span className="catalog-icon">
                      <ListChecks size={15} />
                    </span>
                    <div>
                      <strong>{r.name}</strong>
                      <small>
                        {r.cardinality} · {r.direction}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
            {draft && (
              <div className="side-section">
                <h3>受影响公理</h3>
                {snapshot?.axiomAssertions
                  .filter((axiom) =>
                    axiom.subjectId === object?.id ||
                    axiom.sourceDefinitionIds.includes(object?.id ?? ""),
                  )
                  .map((axiom) => (
                    <div className="inference-card" key={axiom.id}>
                      <Check size={16} />
                      <div><strong>{axiom.axiomCode}</strong><small>{axiom.enforcement}</small></div>
                    </div>
                  ))}
                {draft.validation?.issues?.map((issue: any) => (
                  <div
                    className="inference-card"
                    key={`${issue.code}:${issue.subjectId}`}
                  >
                    <WarningCircle size={16} />
                    <div>
                      <strong>{issue.code}</strong>
                      <small>{issue.message}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      </main>
    </PageState>
  );
}
function Field({
  label,
  value,
  code,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div className="definition-field">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong>{value}</strong>}
    </div>
  );
}

function Logic({ apiKey, onOpenDefinition }: { apiKey: string; onOpenDefinition: (id: string, version: number) => void }) {
  const versions = useApi<any[]>("/v1/namespaces/retail/versions", apiKey);
  const [version, setVersion] = useState("latest");
  const [objectId, setObjectId] = useState("ALL");
  const snap = useApi<Snapshot>(`/v1/namespaces/retail/ontology?version=${version}`, apiKey, [version]);
  const relatedIds = new Set(snap.data?.objects.filter(object => objectId === "ALL" || object.id === objectId).flatMap(object => [object.id, ...object.properties.map(property => property.id), ...(snap.data?.metrics.filter(metric => metric.objectId === object.id).map(metric => metric.id) ?? [])]));
  const [domain, setDomain] = useState("ALL");
  const filtered =
    snap.data?.axiomAssertions.filter(
      (a) => (domain === "ALL" || a.domain === domain) && (objectId === "ALL" || relatedIds.has(a.subjectId) || a.sourceDefinitionIds.some(id => relatedIds.has(id))),
    ) ?? [];
  const [selectedId, setSelectedId] = useState<string>();
  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0];
  const inferences =
    snap.data?.inferredAssertions.filter((i) =>
      i.axiomAssertionIds.includes(selected?.id ?? ""),
    ) ?? [];
  const definitionName = (id: string): string => snap.data?.objects.find(item => item.id === id)?.label ?? snap.data?.objects.flatMap(item => item.properties).find(item => item.id === id)?.label ?? snap.data?.metrics.find(item => item.id === id)?.label ?? snap.data?.relations.find(item => item.id === id)?.name ?? snap.data?.dimensionHierarchies.find(item => item.id === id)?.label ?? id;
  const proofText = (text: string) => text.replace(/\b[opmrh]_[a-zA-Z0-9_]+\b/g, id => definitionName(id));
  const [inferenceId, setInferenceId] = useState<string>();
  const inference = inferences.find(item => item.id === inferenceId) ?? inferences[0];
  const canLocate = (id: string) => Boolean(snap.data?.objects.some(object => object.id === id || object.properties.some(property => property.id === id)) || snap.data?.metrics.some(item => item.id === id) || snap.data?.relations.some(item => item.id === id) || snap.data?.dimensionHierarchies.some(item => item.id === id));
  return (
    <PageState
      loading={snap.loading}
      error={snap.error}
      empty={!snap.data?.axiomAssertions.length}
      onRetry={snap.reload}
    >
      <main className="content no-scroll">
        <section className="logic-grid">
          <aside className="panel catalog-panel">
            <PanelHeader
              title="本体公理库"
              subtitle="由内核自动实例化并随版本固化"
            >
              <Badge tone="success">{filtered.length} 项</Badge>
            </PanelHeader>
            <div className="logic-filters">
              <label>本体版本<select aria-label="公理本体版本" value={version} onChange={event => { setVersion(event.target.value); setSelectedId(undefined); }}><option value="latest">最新发布</option>{versions.data?.map(item => <option key={item.version} value={item.version}>v{item.version}</option>)}</select></label>
              <label>适用对象<select aria-label="公理适用对象" value={objectId} onChange={event => setObjectId(event.target.value)}><option value="ALL">全部对象</option>{snap.data?.objects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>公理域<select aria-label="公理域筛选" value={domain} onChange={event => setDomain(event.target.value)}>{Object.entries({ ALL: "全部", IDENTITY: "身份", GRAIN: "粒度", TYPE: "类型", METRIC_ALGEBRA: "度量代数", RELATION: "关系", HIERARCHY: "层级", VISIBILITY: "可见性" }).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            </div>
            <div className="logic-list">
              {filtered.map((a) => (
                <button
                  className={`logic-item ${selected?.id === a.id ? "active" : ""}`}
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                >
                  <div className="logic-item-top">
                    <span className="logic-id">{axiomTitle(a.axiomCode)}</span>
                    <Badge tone="success">内建</Badge>
                  </div>
                  <strong>
                    {term(a.subjectType)} · {definitionName(a.subjectId)}
                  </strong>
                  <p>
                    {term(a.domain)} · {term(a.enforcement)}
                  </p>
                </button>
              ))}
            </div>
          </aside>
          <section className="panel detail-panel">
            <PanelHeader
              title={selected ? axiomTitle(selected.axiomCode) : "公理定义"}
              subtitle={
                selected ? `${definitionName(selected.subjectId)} · 内核 ${selected.kernelVersion}` : ""
              }
            >
              <Badge tone="success">内建公理</Badge>
            </PanelHeader>
            {selected && (
              <div className="detail-content">
                <div className="detail-title">
                  <div>
                    <h2>{axiomTitle(selected.axiomCode)}</h2>
                    <p>
                      {axiomDescription(selected.axiomCode)} 该规则在{term(selected.enforcement)}阶段生效。
                    </p>
                  </div>
                  <Badge tone="purple">{term(selected.domain)}</Badge>
                </div>
                <div className="definition-grid logic-fields">
                  <Field label="公理域" value={term(selected.domain)} />
                  <Field
                    label="适用对象"
                    value={`${term(selected.subjectType)} · ${definitionName(selected.subjectId)}`}
                  />
                  <Field label="严重度" value={term(selected.severity)} />
                  <Field label="生效阶段" value={term(selected.enforcement)} />
                  <Field
                    label="公理参数"
                    value={JSON.stringify(chineseParameters(selected.parameters, definitionName))}
                    code
                  />
                  {selected.axiomCode === "RATIO_NON_ADDITIVE" && (
                    <Field
                      label="重算语义"
                      value="SUM(分子) / NULLIF(SUM(分母), 0)"
                      code
                    />
                  )}
                </div>
                <div className="code-editor">
                  <div className="code-toolbar">
                    <span>公理说明与参数</span>
                    <span>v{snap.data?.version} · 已固化</span>
                  </div>
                  <pre>{JSON.stringify({ 规则: axiomTitle(selected.axiomCode), 说明: axiomDescription(selected.axiomCode), 适用类型: term(selected.subjectType), 适用对象: definitionName(selected.subjectId), 参数: chineseParameters(selected.parameters, definitionName), 生效阶段: term(selected.enforcement), 严重程度: term(selected.severity), 来源定义: selected.sourceDefinitionIds.map(definitionName), 内核版本: selected.kernelVersion }, null, 2)}</pre>
                </div>
              </div>
            )}
          </section>
          <aside className="panel side-panel">
            <PanelHeader title="推论实例" subtitle="由公理与本体事实确定性生成">
              <Badge tone="success">可解释</Badge>
            </PanelHeader>
            <div className="side-section">
              <h3>
                当前结论 <span>{inferences.length}</span>
              </h3>
              {inferences.length ? (
                inferences.map((i) => (
                  <button className={`inference-card inference-choice ${inference?.id === i.id ? "active" : ""}`} key={i.id} onClick={() => setInferenceId(i.id)}>
                    <span className="catalog-icon">
                      <Check size={15} />
                    </span>
                    <div>
                      <strong>{term(i.predicate)}</strong>
                      <small>
                        {definitionName(i.subjectId)}
                        {i.objectId ? ` → ${definitionName(i.objectId)}` : ""}
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <p className="muted-copy">当前公理没有物化推论。</p>
              )}
            </div>
            {inference && (
              <div className="side-section">
                <h3>推论依据</h3>
                {[inference.subjectId, inference.objectId].filter((id): id is string => Boolean(id && canLocate(id))).map(id => <button className="text-button" key={id} onClick={() => onOpenDefinition(id, snap.data!.version)}>查看定义 · {definitionName(id)}</button>)}
                <div className="evidence-flow">
                  {inference.proof.map((step) => (
                    <div className="flow-step" key={step.sequence}>
                      <span className="flow-marker">{step.sequence}</span>
                      <div className="flow-copy">
                        <strong>{term(step.kind)}</strong>
                        <small>{proofText(step.statement)}</small>
                        {canLocate(step.refId) && <button className="text-button" onClick={() => onOpenDefinition(step.refId, snap.data!.version)}>查看定义 · {definitionName(step.refId)}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>
      </main>
    </PageState>
  );
}

function Versions({ apiKey, onOpenDraft }: { apiKey: string; onOpenDraft: (draftId: string) => void }) {
  const list = useApi<any[]>("/v1/namespaces/retail/versions", apiKey);
  const [selected, setSelected] = useState<number>();
  const version = selected ?? list.data?.[0]?.version;
  const diff = useApi<any>(
    version != null ? `/v1/namespaces/retail/versions/${version}/diff` : "/v1/health",
    apiKey,
    [version],
  );
  const [action, setAction] = useState("");
  const download = async () => {
    if (version == null) return;
    const snapshot = await api<any>(`/v1/namespaces/retail/ontology?version=${version}`, apiKey);
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `retail-ontology-v${version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const rollbackDraft = async () => {
    if (version == null) return;
    const draft = await api<any>("/v1/namespaces/retail/drafts", apiKey, {
      method: "POST",
      body: JSON.stringify({ baseVersion: "latest", sourceVersion: version }),
    });
    sessionStorage.setItem("ontology-active-draft", draft.draftId);
    onOpenDraft(draft.draftId);
  };
  return (
    <PageState
      loading={list.loading}
      error={list.error}
      empty={!list.data?.length}
      onRetry={list.reload}
    >
      <main className="content">
        <section className="stats-row">
          <Stat
            label="当前发布版本"
            value={`v${list.data?.[0]?.version}`}
            icon={GitBranch}
            meta={list.data?.[0]?.publishedAt?.slice(0, 10)}
          />
          <Stat
            label="历史快照"
            value={list.data?.length ?? 0}
            icon={ListChecks}
          />
          <Stat
            label="内容摘要"
            value={(list.data?.[0]?.contentDigest ?? "").slice(0, 8)}
            icon={Code}
          />
          <Stat
            label="推论摘要"
            value={(list.data?.[0]?.inferenceDigest ?? "").slice(0, 8)}
            icon={Database}
          />
        </section>
        <section className="versions-grid">
          <div className="panel">
            <PanelHeader
              title="本体版本"
              subtitle="发布版本不可修改，回滚会创建新版本"
            />
            <div className="version-table">
              <div className="version-row header">
                <span>版本</span>
                <span>状态</span>
                <span>发布时间</span>
                <span>对象</span>
                <span>关系/指标</span>
                <span />
              </div>
              {list.data?.map((v) => (
                <button
                  className={`version-row ${version === v.version ? "selected" : ""}`}
                  key={v.version}
                  onClick={() => setSelected(v.version)}
                >
                  <span className="version-number">v{v.version}</span>
                  <span>
                    <Badge tone={v === list.data?.[0] ? "success" : ""}>
                      {v === list.data?.[0] ? "当前版本" : "历史版本"}
                    </Badge>
                  </span>
                  <span className="version-change">
                    <strong>{v.publishedAt}</strong>
                    <small>{v.publishedBy} · {v.changeSummary}</small>
                  </span>
                  <span>{v.objectCount}</span>
                  <span>
                    {v.relationCount}/{v.metricCount}
                  </span>
                  <CaretRight size={14} />
                </button>
              ))}
            </div>
          </div>
          <aside className="panel version-side">
            <PanelHeader
              title={`v${version} 版本详情`}
              subtitle={`基于 v${diff.data?.baseVersion ?? "–"}`}
            >
              <Badge tone="success">不可变快照</Badge>
              <button className="secondary-button" onClick={() => void download()}>下载快照</button>
              <button className="secondary-button" onClick={() => void rollbackDraft()}>创建回滚草稿</button>
            </PanelHeader>
            <div className="side-section">
              <h3>相对基线的变化</h3>
              {["objects", "relations", "metrics", "axioms", "inferences"].map(
                (kind) => (
                  <div className="change-item" key={kind}>
                    <span className="change-sign">+</span>
                    <div>
                      <strong>{kind}</strong>
                      <small>
                        新增 {diff.data?.[kind]?.added?.length ?? 0} · 修改{" "}
                        {diff.data?.[kind]?.changed?.length ?? 0} · 移除{" "}
                        {diff.data?.[kind]?.removed?.length ?? 0}
                      </small>
                    </div>
                  </div>
                ),
              )}
            </div>
            {action && <div className="inline-notice">{action}</div>}
          </aside>
        </section>
      </main>
    </PageState>
  );
}

function DataPage({ apiKey }: { apiKey: string }) {
  const versions = useApi<any[]>("/v1/namespaces/retail/versions", apiKey);
  const [indexVersion, setIndexVersion] = useState("latest");
  const source = useApi<any>("/v1/data-sources/selectdb", apiKey);
  const hasPublished = Boolean(versions.data?.length);
  const index = useApi<any>(hasPublished ? `/v1/namespaces/retail/value-index/status?version=${indexVersion}` : "", apiKey, [indexVersion]);
  const [action, setAction] = useState("");
  const [schema, setSchema] = useState<any[]>([]);
  const [config, setConfig] = useState({ host: "", port: 9030, username: "", password: "", catalog: "internal", database: "", tls: true });
  useEffect(() => {
    const value = source.data?.payload;
    if (value) setConfig((current) => ({ ...current, ...value, password: "" }));
    setSchema(source.data?.tables ?? []);
  }, [source.data?.updatedAt]);
  const run = async (path: string) => {
    setAction("执行中…");
    try {
      const data = await api<any>(path, apiKey, { method: "POST", body: "{}" });
      setAction(JSON.stringify(data));
      if (path.includes("schema:scan")) setSchema(data.tables ?? []);
      source.reload();
      index.reload();
    } catch (error) {
      setAction(error instanceof Error ? error.message : String(error));
    }
  };
  const saveConfig = async () => {
    try {
      const data = await api<any>("/v1/data-sources/selectdb", apiKey, {
        method: "PUT",
        body: JSON.stringify({ ...config, password: config.password || undefined }),
      });
      setAction(JSON.stringify(data));
      source.reload();
    } catch (error) {
      setAction(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <PageState
      loading={source.loading}
      error={source.error}
      onRetry={() => {
        source.reload();
        index.reload();
      }}
    >
      <main className="content">
        <section className="data-grid">
          <div>
            <section className="panel source-card">
              <div className="source-heading">
                <div className="source-lockup">
                  <span className="source-icon">
                    <Database size={20} />
                  </span>
                  <div>
                    <h2>SelectDB 连接</h2>
                    <p>
                      {source.data?.updatedAt
                        ? `更新于 ${source.data.updatedAt}`
                        : "尚未保存连接配置"}
                    </p>
                  </div>
                </div>
                <Badge tone={source.data?.credentialConfigured || source.data?.payload?.host ? "success" : "warning"}>
                  {source.data?.credentialConfigured || source.data?.payload?.host ? "已配置" : "待配置"}
                </Badge>
              </div>
              <div className="source-fields editable-source">
                {(["host", "port", "username", "catalog", "database", "password"] as const).map((key) => (
                  <label className="source-field" key={key}>
                    <span>{key}</span>
                    <input
                      type={key === "password" ? "password" : key === "port" ? "number" : "text"}
                      value={config[key] as string | number}
                      placeholder={key === "password" && source.data?.credentialConfigured ? "已安全配置；留空保持不变" : ""}
                      onChange={(event) => setConfig({ ...config, [key]: key === "port" ? Number(event.target.value) : event.target.value })}
                    />
                  </label>
                ))}
                <label className="source-field"><span>TLS</span><input type="checkbox" checked={config.tls} onChange={(event) => setConfig({ ...config, tls: event.target.checked })} /></label>
              </div>
              <div className="source-actions">
                <button className="primary-button" onClick={() => void saveConfig()}><FloppyDisk size={15} />保存连接</button>
                <button
                  className="secondary-button"
                  onClick={() => run("/v1/data-sources/selectdb:test")}
                >
                  <ArrowClockwise size={15} />
                  测试连接
                </button>
                <button
                  className="primary-button"
                  onClick={() => run("/v1/data-sources/selectdb/schema:scan")}
                >
                  <Database size={15} />
                  扫描 Schema
                </button>
              </div>
            </section>
            <section className="panel index-card">
              <div className="source-heading">
                <div className="source-lockup">
                  <span className="source-icon">
                    <MagnifyingGlass size={19} />
                  </span>
                  <div>
                    <h2>属性值索引</h2>
                    <label>本体版本 <select aria-label="索引本体版本" disabled={!hasPublished} value={indexVersion} onChange={event => setIndexVersion(event.target.value)}><option value="latest">最新发布</option>{versions.data?.map(item => <option key={item.version} value={item.version}>v{item.version}</option>)}</select></label>
                  </div>
                </div>
                <Badge tone={index.data?.status === "ready" ? "success" : "warning"}>
                  {hasPublished ? index.data?.status ?? "待构建" : "待发布本体"}
                </Badge>
              </div>
              {!versions.loading && !versions.error && !hasPublished && <p className="muted-copy">连接配置和表字段扫描已可使用。发布第一个本体版本后，再构建属性值索引。<a href="?page=ontology">创建本体</a></p>}
              {(versions.error || index.error) && <p role="alert">索引状态暂不可用：{(versions.error ?? index.error)?.message}<button className="secondary-button" onClick={() => { versions.reload(); index.reload(); }}>重试索引状态</button></p>}
              <div className="index-progress">
                <span
                  style={{ width: index.data?.properties ? "100%" : "0%" }}
                />
              </div>
              <div className="index-meta">
                <span>
                  {String(index.data?.properties ?? 0)} 个属性 ·{" "}
                  {String(index.data?.valuesCount ?? 0)} 个值
                </span>
                <span>{String(index.data?.failedProperties ?? 0)} 失败</span>
              </div>
              <div className="source-actions">
                <button
                  className="secondary-button"
                  disabled={!hasPublished || index.loading || Boolean(versions.error)}
                  onClick={() =>
                    run(`/v1/namespaces/retail/value-index:rebuild?version=${indexVersion}`)
                  }
                >
                  <ArrowClockwise size={15} />
                  重建索引
                </button>
              </div>
            </section>
            {action && (
              <div className="inline-notice action-result">{action}</div>
            )}
          </div>
          <section className="panel schema-panel">
            <PanelHeader
              title="物理 Schema"
              subtitle="已扫描表、字段与版本指纹"
            >
              <button
                className="primary-button"
                onClick={() => run("/v1/data-sources/selectdb/schema:scan")}
              >
                <ArrowClockwise size={15} />
                扫描 Schema
              </button>
            </PanelHeader>
            {schema.length ? (
              <div className="schema-results">{schema.map((table) => <div className="schema-table" key={table.id}><div><strong>{table.database}.{table.name}</strong><Badge>{table.status}</Badge></div><code>{table.fingerprint}</code><small>{table.columns.map((column: any) => `${column.name}:${column.dataType}`).join(" · ")}</small></div>)}</div>
            ) : (
              <div className="state-panel compact-state"><Database size={24} /><h2>扫描后显示表与字段指纹</h2><p>完成扫描后，可以将物理字段绑定到本体属性。</p></div>
            )}
          </section>
        </section>
      </main>
    </PageState>
  );
}

function SystemPage({
  apiKey,
  setApiKey,
}: {
  apiKey: string;
  setApiKey: (value: string) => void;
}) {
  const openapi = useApi<any>("/v1/system/openapi.json", "no-auth");
  const clients = useApi<any[]>("/v1/system/api-clients", apiKey);
  const audits = useApi<any[]>("/v1/system/audit-events?limit=100", apiKey);
  const [section, setSection] = useState<"debug" | "clients" | "audit">("debug");
  const [endpoint, setEndpoint] = useState("/v1/semantic-context:resolve");
  const [method, setMethod] = useState("POST");
  const [body, setBody] = useState(
    JSON.stringify(
      {
        namespace: "retail",
        ontologyVersion: "latest",
        question: "今年各事业部销售额和毛利率",
        purpose: "ANSWER",
        include: {
          values: true,
          axioms: true,
          inferences: true,
          evidence: true,
        },
      },
      null,
      2,
    ),
  );
  const [response, setResponse] = useState<any>();
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [pathValues, setPathValues] = useState<Record<string, string>>({ ns: "retail", sourceId: "selectdb", version: "latest" });
  const [responseTab, setResponseTab] = useState("响应体");
  const pathKeys = [...endpoint.matchAll(/\{([^}]+)\}/g)].map(match => match[1]!);
  const resolvedEndpoint = endpoint.replace(/\{([^}]+)\}/g, (_, key: string) => encodeURIComponent(pathValues[key] ?? ""));
  const responseData = response?.data ?? response;
  const displayedResponse = responseTab === "响应体" ? response : responseTab === "解析摘要" ? responseData?.resolution : responseTab === "Ontology Context" ? responseData?.ontologyContext ?? responseData?.context : responseTab === "Query IR" ? responseData?.queryIr : responseTab === "SQL" ? responseData?.sqlPreview : responseTab === "推论证据" ? responseData?.inferenceEvidence ?? responseData?.inferences : audits.data?.filter(event => event.auditId === response?.auditId);
  const [clientName, setClientName] = useState("外部 Agent");
  const [createdKey, setCreatedKey] = useState("");
  const [clientScopes, setClientScopes] = useState(["ontology:read", "semantic:read", "semantic:plan", "data:execute"]);
  const [clientRateLimit, setClientRateLimit] = useState(120);
  const endpoints = useMemo<Array<{ method: string; path: string }>>(
    () =>
      Object.entries(openapi.data?.paths ?? {}).flatMap(([path, methods]) =>
        Object.keys(methods as object).map((candidate) => ({
          method: candidate.toUpperCase(),
          path: path.startsWith("/v1") ? path : `/v1${path}`,
        })),
      ),
    [openapi.data],
  );
  const send = async () => {
    const started = performance.now();
    try {
      const parsed = body.trim() ? JSON.parse(body) : undefined;
      validateOpenApiRequest(openapi.data, endpoint, method, parsed);
      if (pathKeys.some(key => !pathValues[key]?.trim())) throw new Error("请填写所有路径参数");
      const extraHeaders = headers.trim() ? JSON.parse(headers) : {};
      const raw = await fetch(resolvedEndpoint, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...extraHeaders,
        },
        ...(method === "GET" || method === "DELETE"
          ? {}
          : { body: JSON.stringify(parsed) }),
      });
      const data = await raw.json().catch(() => ({}));
      setResponse(data);
      audits.reload();
      setResponseHeaders(Object.fromEntries(raw.headers.entries()));
      setStatus(`${raw.status} ${raw.statusText} · ${Math.round(performance.now() - started)} ms`);
    } catch (error) {
      setResponse((error as any).payload ?? { error: String(error) });
      setStatus(
        `${(error as any).status ?? "ERR"} · ${Math.round(performance.now() - started)} ms`,
      );
    }
  };
  const createClient = async () => {
    try {
      const result = await api<any>("/v1/system/api-clients", apiKey, {
        method: "POST",
        body: JSON.stringify({
          name: clientName,
          scopes: clientScopes,
          rateLimit: clientRateLimit,
        }),
      });
      setCreatedKey(result.apiKey);
      clients.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  const revokeClient = async (clientId: string) => {
    await api(`/v1/system/api-clients/${encodeURIComponent(clientId)}`, apiKey, { method: "DELETE" });
    clients.reload();
  };
  return (
    <main className="content no-scroll">
      <section className="system-layout">
        <aside className="panel system-menu">
          <h2>系统管理</h2>
          <button className={section === "debug" ? "active" : ""} onClick={() => setSection("debug")}>
            <Code size={16} />
            API 调试台
          </button>
          <button className={section === "clients" ? "active" : ""} onClick={() => setSection("clients")}>
            <Key size={16} />
            API Client 与密钥轮换
          </button>
          <button className={section === "audit" ? "active" : ""} onClick={() => setSection("audit")}>
            <ListChecks size={16} />
            调用审计
          </button>
        </aside>
        {section === "debug" ? <section className="panel console">
          <PanelHeader title="API 调试台" subtitle="接口元数据实时读取 OpenAPI">
            <Badge>{openapi.data?.info?.version ?? "加载中"}</Badge>
          </PanelHeader>
          <div className="console-main">
            <div className="request-pane">
              <div className="pane-label">
                <span>请求</span>
                <span>REST API</span>
              </div>
              <label className="api-key-field">
                <Key size={14} />
                <input
                  aria-label="API Key"
                  type="password"
                  value={apiKey}
                  placeholder="填入自动生成的 API Key"
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
              <p className="muted-copy">管理员密钥已自动生成，可在服务主机运行 <code>npm run keys:show</code> 查看。</p>
              <div className="endpoint-row">
                <div className="method-box">{method}</div>
                <select
                  className="path-box"
                  value={`${method} ${endpoint}`}
                  onChange={(e) => {
                    const [nextMethod, ...parts] = e.target.value.split(" ");
                    setMethod(nextMethod ?? "GET");
                    setEndpoint(parts.join(" "));
                  }}
                >
                  {(endpoints.length
                    ? endpoints
                    : [{ method, path: endpoint }]
                  ).map((value) => (
                    <option
                      key={`${value.method} ${value.path}`}
                      value={`${value.method} ${value.path}`}
                    >
                      {value.method} {value.path}
                    </option>
                  ))}
                </select>
              </div>
              {pathKeys.length > 0 && <div className="request-path-params">{pathKeys.map(key => <label key={key}>{key}<input aria-label={`路径参数 ${key}`} value={pathValues[key] ?? ""} onChange={event => setPathValues({ ...pathValues, [key]: event.target.value })} /></label>)}</div>}
              <div className="console-tabs">
                <span className="active">请求体</span>
                <span>Headers（下方 JSON）</span>
                <span>认证</span>
              </div>
              <textarea
                className="json-editor editable-json"
                aria-label="请求体"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <textarea
                className="header-editor"
                aria-label="请求 Headers"
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
              />
              <div className="request-footer">
                <small>发送前进行 JSON 解析，服务端执行契约校验</small>
                <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(redactUi(JSON.parse(body)), null, 2))}>复制请求</button>
                <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(`curl -X ${method} '${location.origin}${resolvedEndpoint}' -H 'Authorization: Bearer $ONTOLOGY_API_KEY' -H 'Content-Type: application/json' --data '${body.replaceAll("'", "'\\''")}'`)}>复制 curl</button>
                <button className="primary-button" onClick={send}>
                  <PaperPlaneTilt size={15} />
                  发送请求
                </button>
              </div>
            </div>
            <div className="response-pane">
              <div className="pane-label">
                <span>响应</span>
                <span className="response-status">
                  <b className="status-code">{status || "等待请求"}</b>
                </span>
              </div>
              <div className="console-tabs response-tabs">
                {["响应体", "解析摘要", "Ontology Context", "Query IR", "SQL", "推论证据", "审计"].map(label => <button key={label} className={responseTab === label ? "active" : ""} onClick={() => setResponseTab(label)}>{label}</button>)}
              </div>
              <pre className="response-json">{displayedResponse != null ? JSON.stringify(redactUi(displayedResponse), null, 2) : response ? "本次响应未包含此项，可在请求 options 中启用。" : "发送请求后在此显示响应。"}</pre>
              <div className="response-headers">
                <strong>响应 Headers</strong>
                <pre>{JSON.stringify(redactUi(responseHeaders), null, 2)}</pre>
                <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(redactUi(response), null, 2))}>复制响应</button>
              </div>
            </div>
          </div>
        </section> : section === "clients" ? (
          <section className="panel admin-panel">
            <PanelHeader title="API Client 与密钥轮换" subtitle="密钥仅在创建时显示一次；存储中仅保留摘要">
              <button className="primary-button" onClick={createClient}><Plus size={15} />创建客户端</button>
            </PanelHeader>
            <div className="admin-form"><label>客户端名称<input value={clientName} onChange={(event) => setClientName(event.target.value)} /></label><label>每分钟请求上限<input type="number" min={1} value={clientRateLimit} onChange={event => setClientRateLimit(Number(event.target.value))} /></label><fieldset className="scope-options"><legend>Scope</legend>{["ontology:read", "ontology:draft", "ontology:publish", "semantic:read", "semantic:plan", "data:execute", "system:admin"].map(scope => <label key={scope}><input type="checkbox" checked={clientScopes.includes(scope)} onChange={event => setClientScopes(event.target.checked ? [...clientScopes, scope] : clientScopes.filter(value => value !== scope))} />{scope}</label>)}</fieldset></div>
            {createdKey && <div className="one-time-key"><strong>一次性密钥</strong><code>{createdKey}</code><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(createdKey)}>复制并安全保存</button></div>}
            <div className="client-list">
              {clients.data?.map((client) => <div className="client-row" key={client.clientId}><div><strong>{client.name}</strong><small>{client.clientId} · {client.scopes.join(", ")}</small></div><Badge tone={client.status === "ACTIVE" ? "success" : "warning"}>{client.status}</Badge><span>{client.rateLimit}/min</span><button className="secondary-button" onClick={() => void revokeClient(client.clientId)}>撤销</button></div>)}
            </div>
          </section>
        ) : (
          <section className="panel admin-panel">
            <PanelHeader title="调用审计" subtitle="请求级 trace、状态和耗时；载荷已脱敏"><Badge>{audits.data?.length ?? 0} 条</Badge></PanelHeader>
            <div className="audit-list">{audits.data?.map((event) => <div className="audit-row" key={`${event.auditId}:${event.sequence}`}><code>{event.auditId}</code><strong>{event.eventType}</strong><span>{event.createdAt}</span><pre>{JSON.stringify(redactUi(event.payload), null, 2)}</pre></div>)}</div>
          </section>
        )}
      </section>
    </main>
  );
}
function validateOpenApiRequest(document: any, endpoint: string, method: string, body: unknown) {
  const path = endpoint.replace(/^\/v1/, "");
  const operation = document?.paths?.[path]?.[method.toLowerCase()];
  if (!operation) throw new Error("所选 Method 与 Endpoint 不在当前 OpenAPI 中");
  const reference = operation.requestBody?.content?.["application/json"]?.schema?.$ref;
  if (!reference) return;
  const schemaName = reference.split("/").at(-1);
  const schema = document.components?.schemas?.[schemaName];
  const validator = CONTRACT_SCHEMAS[schemaName as keyof typeof CONTRACT_SCHEMAS];
  if (validator) {
    const result = validator.safeParse(body);
    if (!result.success) throw new Error(`OpenAPI 校验失败：${result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("；")}`);
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求体必须是 JSON Object");
  const missing = (schema?.required ?? []).filter((key: string) => !(key in (body as Record<string, unknown>)));
  if (missing.length) throw new Error(`OpenAPI 校验失败，缺少字段：${missing.join(", ")}`);
}
function redactUi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactUi);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        /password|secret|authorization|api[-_]?key/i.test(key) ? key : key,
        /password|secret|authorization|api[-_]?key/i.test(key)
          ? "***REDACTED***"
          : redactUi(item),
      ]),
    );
  return value;
}
