import { defaultDatabasePath, resolveRuntimeKeys } from "../../../adapters/runtime-keys/src/index.js";
import { registerIdempotency } from "./idempotency.js";
import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ContinueSemanticQueryInputSchema,
  CreateDraftInputSchema, DraftPatchInputSchema, PublishDraftInputSchema, DataSourceInputSchema, ValidateDraftInputSchema,
  ExecuteSemanticQueryInputSchema,
  PlatformException,
  ResolveSemanticContextInputSchema,
  type Scope,
} from "../../../packages/contracts/src/index.js";
import { createOpenApiDocument } from "../../../packages/contracts/src/openapi.js";
import {
  OntologyPlatform,
  type DraftPatchOperation,
  type QueryExecutorPort,
} from "../../../packages/application/src/index.js";
import { digest } from "../../../packages/domain/src/index.js";
import {
  SqlitePlatformStore,
  redact,
} from "../../../adapters/ontology-store-sqlite/src/index.js";
import {
  SelectDbGateway,
  selectDbConfigFromEnv,
} from "../../../adapters/query-gateway-selectdb/src/index.js";
import { encryptCredential, decryptCredential } from "../../../adapters/query-gateway-selectdb/src/credentials.js";
import type { SelectDbConfig } from "../../../adapters/query-gateway-selectdb/src/index.js";
import { PropertyValueIndexService } from "../../../adapters/value-index-sqlite/src/index.js";

const ALL_SCOPES: Scope[] = [
  "ontology:read",
  "ontology:draft",
  "ontology:publish",
  "semantic:read",
  "semantic:plan",
  "data:execute",
  "system:admin",
];
declare module "fastify" {
  interface FastifyRequest {
    auth?: { clientId: string; scopes: Scope[]; rateLimit: number };
    metricsStartedAt?: number;
    auditId?: string;
  }
}

export interface AppOptions {
  databasePath?: string;
  apiKey?: string;
  keysPath?: string;
  logger?: boolean;
  queryGateway?: QueryExecutorPort & {
    testConnection(): Promise<Record<string, unknown>>;
    scanSchema(): Promise<
      Array<{
        name: string;
        type: "TABLE" | "VIEW";
        columns: Array<{ name: string; dataType: string; nullable: boolean }>;
      }>
    >;
    close(): Promise<void>;
  };
  queryExecutor?: QueryExecutorPort;
}
export function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2_000_000,
  });
  const databasePath = options.databasePath ?? defaultDatabasePath();
  const keys = resolveRuntimeKeys({ databasePath, keysPath: options.keysPath ?? process.env.ONTOLOGY_KEYS_PATH, apiKey: options.apiKey ?? process.env.ONTOLOGY_API_KEY, encryptionKey: process.env.ONTOLOGY_ENCRYPTION_KEY });
  const store = new SqlitePlatformStore(databasePath);
  const gateways = new Map<string, SelectDbGateway>();
  function sourceConfig(sourceId: string): SelectDbConfig | undefined {
    const stored = store.getPhysicalSource(sourceId);
    const env = sourceId === "selectdb" ? selectDbConfigFromEnv() : undefined;
    if (!stored) return env;
    const ciphertext = store.getCredentialCiphertext(sourceId);
    const password = ciphertext ? decryptCredential(ciphertext, sourceId, keys.encryptionKey) : env?.password;
    if (!password) return undefined;
    return { ...stored.payload, password } as unknown as SelectDbConfig;
  }
  function sourceGateway(sourceId = "selectdb") {
    if (options.queryGateway) return options.queryGateway;
    let gateway = gateways.get(sourceId);
    if (!gateway) { gateway = new SelectDbGateway(sourceConfig(sourceId)); gateways.set(sourceId, gateway); }
    return gateway;
  }
  const executor: QueryExecutorPort = options.queryExecutor ?? {
    execute: (sql, parameters, maxRows, timeoutMs) => sourceGateway().execute(sql, parameters, maxRows, timeoutMs),
  };
  const platform = new OntologyPlatform(store, executor);
  const valueIndex = new PropertyValueIndexService(store, executor);
  const backgroundJobs = new Set<Promise<unknown>>();
  const bootstrapKey = keys.apiKey;
  const requests = new Map<string, { minute: number; count: number }>();
  const metrics = new Map<
    string,
    { count: number; errors: number; durationsMs: number[] }
  >();
  app.addHook("onRequest", async (request, reply) => {
    request.metricsStartedAt = performance.now();
    request.auditId = `audit_${randomUUID()}`;
    reply.header("x-request-id", request.id);
    reply.header("x-audit-id", request.auditId);
    if (
      request.url === "/v1/health" ||
      request.url === "/v1/system/openapi.json" ||
      !request.url.startsWith("/v1/")
    )
      return;
    const bearer =
      request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer)
      throw new PlatformException(
        {
          code: "AUTHENTICATION_REQUIRED",
          message: "缺少 Bearer API Key",
          stage: "auth",
          retryable: false,
          action: "设置 Authorization: Bearer <api-key>",
        },
        401,
      );
    let auth;
    if (bootstrapKey && safeEqualHash(bearer, bootstrapKey))
      auth = { clientId: "bootstrap", scopes: ALL_SCOPES, rateLimit: 600 };
    else {
      const client = store.findApiClientByHash(hashKey(bearer));
      if (client?.status === "ACTIVE")
        auth = {
          clientId: client.clientId,
          scopes: client.scopes,
          rateLimit: client.rateLimit,
        };
    }
    if (!auth)
      throw new PlatformException(
        {
          code: "AUTHENTICATION_REQUIRED",
          message: "API Key 无效或已停用",
          stage: "auth",
          retryable: false,
        },
        401,
      );
    const minute = Math.floor(Date.now() / 60_000),
      entry = requests.get(auth.clientId);
    const count = entry?.minute === minute ? entry.count + 1 : 1;
    requests.set(auth.clientId, { minute, count });
    if (count > auth.rateLimit)
      throw new PlatformException(
        {
          code: "RATE_LIMIT_EXCEEDED",
          message: "客户端请求速率超过限制",
          stage: "auth",
          retryable: true,
        },
        429,
      );
    request.auth = auth;
  });
  registerIdempotency(app);
  app.setErrorHandler((error, request, reply) => {
    const platform =
      error instanceof PlatformException
        ? error
        : new PlatformException(
            {
              code: "INVALID_REQUEST",
              message: error instanceof Error ? error.message : String(error),
              stage: "http",
              retryable: false,
            },
            400,
          );
    request.log.warn(
      {
        requestId: request.id,
        code: platform.error.code,
        stage: platform.error.stage,
      },
      "request failed",
    );
    reply
      .code(platform.statusCode)
      .send({
        requestId: request.id,
        status: "FAILED",
        error: platform.error,
        auditId: request.auditId,
        completeness: { complete: false, truncated: false, nextCursor: null },
      });
  });
  const ok = (
    request: FastifyRequest,
    namespace: string,
    ontologyVersion: number | undefined,
    data: unknown,
  ) => ({
    requestId: request.id,
    namespace,
    ...(ontologyVersion == null ? {} : { ontologyVersion }),
    status: "SUCCEEDED",
    data,
    warnings: [],
    auditId: request.auditId,
    completeness: { complete: true, truncated: false, nextCursor: null },
  });
  app.get("/v1/health", async () => ({
    status: "ok",
    version: "1.0.0",
    kernelVersion: "1.0.0",
    components: {
      sqlite: "ready",
      selectdb: selectDbConfigFromEnv() ? "configured" : "not_configured",
    },
    time: new Date().toISOString(),
  }));
  app.get("/v1/system/openapi.json", async () => createOpenApiDocument());
  app.get("/v1/system/metrics", async (request) => {
    requireScopes(request, "system:admin");
    const routes = Object.fromEntries(
      [...metrics.entries()].map(([route, value]) => [
        route,
        {
          count: value.count,
          errors: value.errors,
          p95Ms: percentile(value.durationsMs, 0.95),
          maxMs: Math.max(0, ...value.durationsMs),
        },
      ]),
    );
    return ok(request, "system", undefined, {
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      routes,
    });
  });
  app.get("/v1/namespaces/:ns/summary", async (request, reply) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    const summary = platform.summary(ns, versionParam(request));
    reply.header("ETag", summary.contentDigest);
    return ok(request, ns, summary.ontologyVersion, summary);
  });
  app.get("/v1/namespaces/:ns/ontology", async (request, reply) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    const snapshot = platform.getExportSnapshot(ns, versionParam(request));
    if (request.headers["if-none-match"] === snapshot.contentDigest)
      return reply.code(304).send();
    reply.header("ETag", snapshot.contentDigest);
    return ok(request, ns, snapshot.version, snapshot);
  });
  app.get("/v1/namespaces/:ns/graph", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    const query = request.query as {
      version?: string;
      projection?: "relations" | "metrics" | "axioms";
    };
    const graph = platform.graph(
      ns,
      parseVersion(query.version),
      query.projection,
    );
    return ok(request, ns, graph.ontologyVersion, graph);
  });
  app.get("/v1/namespaces/:ns/versions", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    return ok(request, ns, undefined, store.listVersions(ns));
  });
  app.get("/v1/namespaces/:ns/versions/:version/diff", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns, version } = request.params as { ns: string; version: string };
    const data = platform.diff(
      ns,
      Number(version),
      Number((request.query as { baseVersion?: string }).baseVersion) ||
        undefined,
    );
    return ok(request, ns, Number(version), data);
  });
  app.post("/v1/namespaces/:ns/drafts", async (request) => {
    requireScopes(request, "ontology:draft");
    const { ns } = request.params as { ns: string };
    const body = CreateDraftInputSchema.parse(request.body ?? {});
    const base = body.baseVersion ?? "latest", sourceVersion = body.sourceVersion;
    const data = platform.createDraft(ns, base, sourceVersion);
    return ok(request, ns, data.snapshot.version, { ...data, physicalTables: store.listPhysicalTables(), goldenReport: store.getGoldenReport(ns, data.draftId) });
  });
  app.get("/v1/namespaces/:ns/drafts/:draftId", async (request) => {
    requireScopes(request, "ontology:draft");
    const { ns, draftId } = request.params as { ns: string; draftId: string };
    const data = store.getDraft(ns, draftId);
    if (!data)
      throw new PlatformException(
        {
          code: "INVALID_REQUEST",
          message: "草稿不存在",
          stage: "draft",
          retryable: false,
        },
        404,
      );
    return ok(request, ns, data.snapshot.version, { ...data, physicalTables: store.listPhysicalTables(), goldenReport: store.getGoldenReport(ns, data.draftId) });
  });
  app.patch("/v1/namespaces/:ns/drafts/:draftId", async (request) => {
    requireScopes(request, "ontology:draft");
    const { ns, draftId } = request.params as { ns: string; draftId: string };
    const body = DraftPatchInputSchema.parse(request.body);
    const revision = body.revision ?? Number(String(request.headers["if-match"] ?? "").replaceAll('"', ''));
    if (!Number.isInteger(revision) || revision < 1) throw new PlatformException({ code: "INVALID_REQUEST", message: "revision 或 If-Match 必填", stage: "draft", retryable: false }, 400);
    const data = platform.applyDraftPatch(
      ns,
      draftId,
      revision,
      body.operations,
    );
    return ok(request, ns, data.snapshot.version, { ...data, physicalTables: store.listPhysicalTables(), goldenReport: store.getGoldenReport(ns, data.draftId) });
  });
  app.post("/v1/namespaces/:ns/drafts/:draftId/validate", async (request) => {
    requireScopes(request, "ontology:draft");
    const { ns, draftId } = request.params as { ns: string; draftId: string };
    const body = ValidateDraftInputSchema.parse(request.body ?? {});
    const data = platform.validateDraft(ns, draftId, body.goldenCases);
    return ok(request, ns, undefined, data);
  });
  app.post("/v1/namespaces/:ns/drafts/:draftId/publish", async (request) => {
    requireScopes(request, "ontology:publish");
    const { ns, draftId } = request.params as { ns: string; draftId: string };
    const body = PublishDraftInputSchema.parse(request.body);
    const data = platform.publishDraft(
      ns,
      draftId,
      body.baseVersion,
      body.changeSummary,
      request.auth?.clientId ?? "system",
    );
    const job = valueIndex.rebuild(data).catch(error => store.appendAudit(request.auditId!, request.id, "ValueIndexFailed", { namespace: ns, ontologyVersion: data.version, code: "VALUE_INDEX_BUILD_FAILED" }));
    backgroundJobs.add(job);
    void job.finally(() => backgroundJobs.delete(job));
    return ok(request, ns, data.version, data);
  });
  app.get("/v1/namespaces/:ns/axioms", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    const version = platform.resolveVersion(ns, versionParam(request));
    return ok(request, ns, version, platform.getExportSnapshot(ns, version).axiomAssertions);
  });
  app.get("/v1/namespaces/:ns/inferences", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns } = request.params as { ns: string };
    const version = platform.resolveVersion(ns, versionParam(request));
    return ok(request, ns, version, platform.getExportSnapshot(ns, version).inferredAssertions);
  });
  app.get("/v1/namespaces/:ns/inferences/:id/explanation", async (request) => {
    requireScopes(request, "ontology:read");
    const { ns, id } = request.params as { ns: string; id: string };
    const version = platform.resolveVersion(ns, versionParam(request));
    const data = platform.getExportSnapshot(ns, version).inferredAssertions.find(item => item.id === id);
    if (!data)
      throw new PlatformException(
        {
          code: "VALUE_NOT_FOUND",
          message: "推论不存在",
          stage: "inference",
          retryable: false,
        },
        404,
      );
    return ok(request, ns, version, data);
  });
  app.post("/v1/semantic-context:resolve", async (request) => {
    requireScopes(request, "semantic:read");
    const input = ResolveSemanticContextInputSchema.parse(request.body);
    const data = platform.resolveOntologyContext(input);
    return ok(request, input.namespace, data.ontologyVersion, data);
  });
  app.post("/v1/semantic-query", async (request) => {
    const input = ExecuteSemanticQueryInputSchema.parse(request.body);
    requireScopes(
      request,
      "semantic:read",
      "semantic:plan",
      ...(input.queryMode === "ANALYSIS" ? [] : (["data:execute"] as Scope[])),
    );
    return platform.executeSemanticQuery(input);
  });
  app.post(
    "/v1/semantic-query/clarifications/:clarificationId:continue",
    async (request) => {
      requireScopes(request, "semantic:read", "semantic:plan", "data:execute");
      const { clarificationId } = request.params as { clarificationId: string };
      const body = ContinueSemanticQueryInputSchema.parse(request.body);
      return platform.continueSemanticQuery(clarificationId, body.selections);
    },
  );
  app.get("/v1/data-sources/:sourceId", async (request) => {
    requireScopes(request, "system:admin");
    const { sourceId } = request.params as { sourceId: string };
    return ok(
      request,
      "system",
      undefined,
      { ...(store.getPhysicalSource(sourceId) ?? { sourceId, configured: false }), tables: store.listPhysicalTables(sourceId) },
    );
  });
  app.put("/v1/data-sources/:sourceId", async (request) => {
    requireScopes(request, "system:admin");
    const { sourceId } = request.params as { sourceId: string };
    const body = DataSourceInputSchema.parse(request.body);
    store.putPhysicalSource(
      sourceId,
      { ...body, password: undefined },
      body.password ? encryptCredential(body.password, sourceId, keys.encryptionKey) : undefined,
    );
    await gateways.get(sourceId)?.close();
    gateways.delete(sourceId);
    return ok(request, "system", undefined, store.getPhysicalSource(sourceId));
  });
  app.post("/v1/data-sources/:sourceId:test", async (request) => {
    requireScopes(request, "system:admin");
    const { sourceId } = request.params as { sourceId: string };
    const data = await sourceGateway(sourceId).testConnection();
    return ok(request, "system", undefined, data);
  });
  app.post("/v1/data-sources/:sourceId/schema:scan", async (request) => {
    requireScopes(request, "system:admin");
    const { sourceId } = request.params as { sourceId: string };
    const tables = await sourceGateway(sourceId).scanSchema();
    const config = options.queryGateway ? store.getPhysicalSource(sourceId)?.payload : sourceConfig(sourceId);
    for (const table of tables) {
      const physical = {
        id: `${sourceId}:${table.name}`,
        sourceId,
        catalog: String(config?.catalog ?? "internal"),
        database: String(config?.database ?? ""),
        name: table.name,
        type: table.type,
        status: "UNMODELED" as const,
        columns: table.columns.map((column) => ({
          ...column,
          sensitive: false,
        })),
        fingerprint: digest(table),
        scannedAt: new Date().toISOString(),
      };
      store.putPhysicalTable(sourceId, physical);
    }
    return ok(request, "system", undefined, {
      sourceId,
      tables: store.listPhysicalTables(sourceId),
    });
  });
  app.get("/v1/namespaces/:ns/value-index/status", async (request) => {
    requireScopes(request, "semantic:read");
    const { ns } = request.params as { ns: string };
    const version = platform.resolveVersion(ns, versionParam(request));
    return ok(request, ns, version, store.getIndexStatus(ns, version));
  });
  app.post("/v1/namespaces/:ns/value-index:rebuild", async (request) => {
    requireScopes(request, "system:admin");
    const { ns } = request.params as { ns: string };
    const snapshot = platform.getExportSnapshot(ns, versionParam(request));
    const data = await valueIndex.rebuild(snapshot);
    return ok(request, ns, snapshot.version, data);
  });
  app.get("/v1/system/api-clients", async (request) => {
    requireScopes(request, "system:admin");
    return ok(request, "system", undefined, store.listApiClients());
  });
  app.post("/v1/system/api-clients", async (request) => {
    requireScopes(request, "system:admin");
    const body = z
      .object({
        name: z.string().min(1),
        scopes: z.array(z.enum(ALL_SCOPES as [Scope, ...Scope[]])),
        rateLimit: z.number().int().positive().default(120),
      })
      .parse(request.body);
    const key = `op_${randomBytes(24).toString("base64url")}`,
      clientId = `client_${randomUUID()}`;
    store.createApiClient({
      clientId,
      name: body.name,
      scopes: body.scopes,
      status: "ACTIVE",
      keyHash: hashKey(key),
      rateLimit: body.rateLimit,
      rotatedAt: new Date().toISOString(),
    });
    return ok(request, "system", undefined, {
      clientId,
      apiKey: key,
      warning: "此密钥仅显示一次",
    });
  });
  app.delete("/v1/system/api-clients/:clientId", async (request) => {
    requireScopes(request, "system:admin");
    store.deleteApiClient((request.params as { clientId: string }).clientId);
    return ok(request, "system", undefined, { deleted: true });
  });
  app.get("/v1/system/audit-events", async (request) => {
    requireScopes(request, "system:admin");
    return ok(
      request,
      "system",
      undefined,
      store.listAudit(
        Number((request.query as { limit?: string }).limit ?? 100),
      ),
    );
  });
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?")[0]!;
    const duration = performance.now() - (request.metricsStartedAt ?? 0);
    const current = metrics.get(route) ?? {
      count: 0,
      errors: 0,
      durationsMs: [],
    };
    current.count += 1;
    current.errors += reply.statusCode >= 400 ? 1 : 0;
    current.durationsMs.push(Number(duration.toFixed(3)));
    if (current.durationsMs.length > 1_000) current.durationsMs.shift();
    metrics.set(route, current);
    store.appendAudit(
      request.auditId ?? `audit_${randomUUID()}`,
      request.id,
      "HttpRequestCompleted",
      {
        traceId: request.id,
        method: request.method,
        route,
        clientId: request.auth?.clientId,
        statusCode: reply.statusCode,
        durationMs: Number(duration.toFixed(3)),
      },
    );
    if (request.url.startsWith("/v1/") && request.url !== "/v1/health")
      app.log.info(
        {
          requestId: request.id,
          traceId: request.id,
          method: request.method,
          url: request.url,
          clientId: request.auth?.clientId,
          statusCode: reply.statusCode,
          durationMs: Number(duration.toFixed(3)),
        },
        "request complete",
      );
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled([...backgroundJobs]);
    store.close();
    await Promise.all([...gateways.values()].map(gateway => gateway.close()));
    await options.queryGateway?.close();
  });
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const consoleDist = path.resolve(currentDir, "../../../dist/console");
  if (existsSync(consoleDist)) {
    app.register(fastifyStatic, { root: consoleDist, wildcard: false });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/v1/")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }
  return Object.assign(app, {
    runtimeKeysFile: keys.filePath,
    platformStore: store,
    platformService: platform,
  });
}

function requireScopes(request: FastifyRequest, ...required: Scope[]) {
  const missing = required.filter(
    (scope) => !request.auth?.scopes.includes(scope),
  );
  if (missing.length)
    throw new PlatformException(
      {
        code: "INSUFFICIENT_SCOPE",
        message: "调用方缺少所需权限",
        stage: "auth",
        retryable: false,
        details: { requiredScopes: missing },
      },
      403,
    );
}
function parseVersion(value?: string): number | "latest" {
  return !value || value === "latest" ? "latest" : Number(value);
}
function versionParam(request: FastifyRequest): number | "latest" {
  return parseVersion((request.query as { version?: string })?.version);
}
function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function safeEqualHash(left: string, right: string) {
  return hashKey(left) === hashKey(right);
}
function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 4300);
  await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
  app.log.info({ keysFile: app.runtimeKeysFile }, "平台密钥已就绪；运行 npm run keys:show 查看管理员 API Key");
}
