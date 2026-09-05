import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AxiomAssertion, InferredAssertion, OntologySnapshotV3, PhysicalTable, QueryIR, Scope } from "../../../packages/contracts/src/index.js";

import type { ClarificationRecord, CompiledTemplate, GoldenReport } from "../../../packages/application/src/index.js";

const MIGRATIONS = [
`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS namespaces (namespace TEXT PRIMARY KEY, latest_version INTEGER, status TEXT NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ontology_drafts (namespace TEXT NOT NULL, draft_id TEXT NOT NULL, base_version INTEGER, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(namespace,draft_id));
CREATE TABLE IF NOT EXISTS ontology_versions (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, status TEXT NOT NULL, content_digest TEXT NOT NULL, inference_digest TEXT NOT NULL, snapshot TEXT NOT NULL, published_at TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version));
CREATE TRIGGER IF NOT EXISTS ontology_versions_immutable BEFORE UPDATE ON ontology_versions BEGIN SELECT RAISE(ABORT, 'published ontology versions are immutable'); END;
CREATE TABLE IF NOT EXISTS axiom_assertions (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,id));
CREATE TABLE IF NOT EXISTS inferred_assertions (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,id));
CREATE TABLE IF NOT EXISTS physical_sources (source_id TEXT PRIMARY KEY, payload TEXT NOT NULL, credential_ciphertext TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS physical_tables (source_id TEXT NOT NULL, table_id TEXT NOT NULL, payload TEXT NOT NULL, fingerprint TEXT NOT NULL, scan_status TEXT NOT NULL, scanned_at TEXT NOT NULL, PRIMARY KEY(source_id,table_id));
CREATE TABLE IF NOT EXISTS property_value_index (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, object_id TEXT NOT NULL, property_id TEXT NOT NULL, normalized_value TEXT NOT NULL, display_value TEXT NOT NULL, frequency INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,property_id,normalized_value));
CREATE INDEX IF NOT EXISTS property_value_index_lookup ON property_value_index(namespace,ontology_version,normalized_value);
CREATE TABLE IF NOT EXISTS property_value_index_status (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, object_id TEXT NOT NULL, property_id TEXT NOT NULL, status TEXT NOT NULL, distinct_values INTEGER NOT NULL DEFAULT 0, covered_rows INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,property_id));
CREATE TABLE IF NOT EXISTS semantic_sessions (session_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, refs TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS query_shape_cache (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, fingerprint TEXT NOT NULL, ir_template TEXT NOT NULL, parameter_schema TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,fingerprint));
CREATE TABLE IF NOT EXISTS audit_events (audit_id TEXT NOT NULL, sequence INTEGER NOT NULL, request_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(audit_id,sequence));
CREATE TABLE IF NOT EXISTS api_clients (client_id TEXT PRIMARY KEY, name TEXT NOT NULL, scopes TEXT NOT NULL, status TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, rate_limit INTEGER NOT NULL, rotated_at TEXT NOT NULL, created_at TEXT NOT NULL);`,
`CREATE INDEX IF NOT EXISTS audit_events_request ON audit_events(request_id,created_at);
CREATE INDEX IF NOT EXISTS semantic_sessions_version ON semantic_sessions(namespace,ontology_version);
CREATE INDEX IF NOT EXISTS ontology_versions_digest ON ontology_versions(namespace,content_digest);`,
`CREATE TABLE IF NOT EXISTS ontology_version_metadata (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, published_by TEXT NOT NULL, change_summary TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version));`,
`CREATE TABLE IF NOT EXISTS semantic_clarifications (clarification_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, payload TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS semantic_clarifications_expiry ON semantic_clarifications(expires_at);`,
`CREATE TABLE IF NOT EXISTS compiled_query_templates (namespace TEXT NOT NULL, ontology_version INTEGER NOT NULL, cache_key TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(namespace,ontology_version,cache_key));`,
`CREATE TABLE IF NOT EXISTS draft_golden_reports (report_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, draft_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS draft_golden_reports_lookup ON draft_golden_reports(namespace,draft_id,created_at);`
] as const;

export interface DraftRecord { namespace: string; draftId: string; baseVersion?: number; revision: number; snapshot: OntologySnapshotV3; updatedAt: string }
export interface ApiClientRecord { clientId: string; name: string; scopes: Scope[]; status: "ACTIVE" | "DISABLED"; keyHash: string; rateLimit: number; rotatedAt: string }

export class SqlitePlatformStore {
  readonly db: DatabaseSync;
  private transactionDepth = 0;
  constructor(readonly filename: string) { if(filename!==":memory:")mkdirSync(path.dirname(path.resolve(filename)),{recursive:true}); this.db = new DatabaseSync(filename); this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;"); this.migrate(); }
  close(): void { this.db.close(); }
  migrate(): void { this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"); const existing = new Set((this.db.prepare("SELECT version FROM schema_migrations").all() as Array<{version:number}>).map(row => row.version)); MIGRATIONS.forEach((sql, index) => { const version = index + 1; if (existing.has(version)) return; this.transaction(() => { this.db.exec(sql); this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)").run(version, new Date().toISOString()); }); }); }
  transaction<T>(work: () => T): T {
    const depth = this.transactionDepth;
    const savepoint = `platform_tx_${depth}`;
    this.db.exec(depth ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const value = work();
      this.db.exec(depth ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return value;
    } catch (error) {
      this.db.exec(depth ? `ROLLBACK TO SAVEPOINT ${savepoint}` : "ROLLBACK");
      if (depth) this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    } finally { this.transactionDepth--; }
  }
  importDraft(record: DraftRecord): void {
    const existing = this.getDraft(record.namespace, record.draftId);
    if (existing) {
      if (JSON.stringify(existing.snapshot) !== JSON.stringify(record.snapshot))
        throw new Error("IMPORT_DRAFT_CONFLICT");
      return;
    }
    this.upsertNamespace(record.namespace);
    this.db.prepare("INSERT INTO ontology_drafts(namespace,draft_id,base_version,revision,payload,updated_at) VALUES(?,?,?,?,?,?)")
      .run(record.namespace, record.draftId, record.baseVersion ?? null, record.revision, JSON.stringify(record.snapshot), record.updatedAt);
  }
  upsertNamespace(namespace: string, displayName = namespace): void { const now = new Date().toISOString(); this.db.prepare("INSERT INTO namespaces(namespace,latest_version,status,display_name,created_at,updated_at) VALUES(?,NULL,'ACTIVE',?,?,?) ON CONFLICT(namespace) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at").run(namespace, displayName, now, now); }
  listNamespaces(): Array<{namespace:string;latestVersion:number|null;status:string;displayName:string}> { return (this.db.prepare("SELECT namespace,latest_version latestVersion,status,display_name displayName FROM namespaces ORDER BY namespace").all() as Array<{namespace:string;latestVersion:number|null;status:string;displayName:string}>); }
  latestVersion(namespace: string): number | undefined { const row = this.db.prepare("SELECT latest_version value FROM namespaces WHERE namespace=?").get(namespace) as {value:number|null}|undefined; return row?.value ?? undefined; }
  savePublished(snapshot: OntologySnapshotV3): void { this.transaction(() => { this.upsertNamespace(snapshot.namespace); const current = this.latestVersion(snapshot.namespace); if (current != null && snapshot.baseVersion != null && current !== snapshot.baseVersion) throw new Error(`ONTOLOGY_VERSION_CONFLICT:${current}`); const now = snapshot.publishedAt ?? new Date().toISOString(); this.db.prepare("INSERT INTO ontology_versions(namespace,ontology_version,status,content_digest,inference_digest,snapshot,published_at) VALUES(?,?,?,?,?,?,?)").run(snapshot.namespace,snapshot.version,snapshot.status,snapshot.contentDigest,snapshot.inferenceDigest,JSON.stringify(snapshot),now); const axiomStmt = this.db.prepare("INSERT INTO axiom_assertions(namespace,ontology_version,id,payload) VALUES(?,?,?,?)"); snapshot.axiomAssertions.forEach(item => axiomStmt.run(snapshot.namespace,snapshot.version,item.id,JSON.stringify(item))); const infStmt = this.db.prepare("INSERT INTO inferred_assertions(namespace,ontology_version,id,payload) VALUES(?,?,?,?)"); snapshot.inferredAssertions.forEach(item => infStmt.run(snapshot.namespace,snapshot.version,item.id,JSON.stringify(item))); this.db.prepare("UPDATE namespaces SET latest_version=?,updated_at=? WHERE namespace=?").run(snapshot.version,now,snapshot.namespace); }); }
  getSnapshot(namespace: string, version: number | "latest" = "latest"): OntologySnapshotV3 | undefined { const resolved = version === "latest" ? this.latestVersion(namespace) : version; if (resolved == null) return undefined; const row = this.db.prepare("SELECT snapshot FROM ontology_versions WHERE namespace=? AND ontology_version=?").get(namespace,resolved) as {snapshot:string}|undefined; return row ? JSON.parse(row.snapshot) as OntologySnapshotV3 : undefined; }
  listVersions(namespace: string): Array<{version:number;status:string;contentDigest:string;inferenceDigest:string;publishedAt:string;publishedBy:string;changeSummary:string;objectCount:number;relationCount:number;metricCount:number}> { return (this.db.prepare("SELECT v.ontology_version version,v.status,v.content_digest contentDigest,v.inference_digest inferenceDigest,v.published_at publishedAt,v.snapshot,COALESCE(m.published_by,'system') publishedBy,COALESCE(m.change_summary,'Imported or initial version') changeSummary FROM ontology_versions v LEFT JOIN ontology_version_metadata m ON m.namespace=v.namespace AND m.ontology_version=v.ontology_version WHERE v.namespace=? ORDER BY v.ontology_version DESC").all(namespace) as Array<Record<string,unknown>>).map(row => { const snapshot = JSON.parse(row.snapshot as string) as OntologySnapshotV3; return { version: row.version as number, status: row.status as string, contentDigest: row.contentDigest as string, inferenceDigest: row.inferenceDigest as string, publishedAt: row.publishedAt as string, publishedBy: row.publishedBy as string, changeSummary: row.changeSummary as string, objectCount: snapshot.objects.length, relationCount: snapshot.relations.length, metricCount: snapshot.metrics.length }; }); }
  saveVersionMetadata(namespace:string,version:number,publishedBy:string,changeSummary:string):void { this.db.prepare("INSERT INTO ontology_version_metadata(namespace,ontology_version,published_by,change_summary) VALUES(?,?,?,?) ON CONFLICT(namespace,ontology_version) DO NOTHING").run(namespace,version,publishedBy,changeSummary); }
  createDraft(namespace: string, baseVersion: number | "latest" = "latest"): DraftRecord { const base = this.getSnapshot(namespace, baseVersion); if (!base) throw new Error("ONTOLOGY_VERSION_NOT_FOUND"); const draftId = `draft_${randomUUID()}`; const snapshot = structuredClone(base); snapshot.status = "DRAFT"; snapshot.baseVersion = base.version; snapshot.version = base.version + 1; snapshot.publishedAt = undefined; snapshot.objects.forEach(item => item.status = "DRAFT"); snapshot.metrics.forEach(item => item.status = "DRAFT"); snapshot.relations.forEach(item => item.status = "DRAFT"); snapshot.dimensionHierarchies.forEach(item => item.status = "DRAFT"); const now = new Date().toISOString(); this.db.prepare("INSERT INTO ontology_drafts(namespace,draft_id,base_version,revision,payload,updated_at) VALUES(?,?,?,?,?,?)").run(namespace,draftId,base.version,1,JSON.stringify(snapshot),now); return { namespace,draftId,baseVersion:base.version,revision:1,snapshot,updatedAt:now }; }
  getDraft(namespace: string, draftId: string): DraftRecord | undefined { const row = this.db.prepare("SELECT namespace,draft_id draftId,base_version baseVersion,revision,payload,updated_at updatedAt FROM ontology_drafts WHERE namespace=? AND draft_id=?").get(namespace,draftId) as Record<string,unknown>|undefined; return row ? { namespace:row.namespace as string,draftId:row.draftId as string,...(row.baseVersion == null?{}:{baseVersion:row.baseVersion as number}),revision:row.revision as number,snapshot:JSON.parse(row.payload as string) as OntologySnapshotV3,updatedAt:row.updatedAt as string } : undefined; }
  saveDraft(record: DraftRecord, expectedRevision: number): DraftRecord { const nextRevision = expectedRevision + 1; const now = new Date().toISOString(); const result = this.db.prepare("UPDATE ontology_drafts SET revision=?,payload=?,updated_at=? WHERE namespace=? AND draft_id=? AND revision=?").run(nextRevision,JSON.stringify(record.snapshot),now,record.namespace,record.draftId,expectedRevision); if (Number(result.changes) !== 1) throw new Error("DRAFT_REVISION_CONFLICT"); return {...record,revision:nextRevision,updatedAt:now}; }
  deleteDraft(namespace: string, draftId: string): void { this.db.prepare("DELETE FROM ontology_drafts WHERE namespace=? AND draft_id=?").run(namespace,draftId); }
  getAxioms(namespace:string,version:number): AxiomAssertion[] { return (this.db.prepare("SELECT payload FROM axiom_assertions WHERE namespace=? AND ontology_version=? ORDER BY id").all(namespace,version) as Array<{payload:string}>).map(row=>JSON.parse(row.payload) as AxiomAssertion); }
  getInferences(namespace:string,version:number): InferredAssertion[] { return (this.db.prepare("SELECT payload FROM inferred_assertions WHERE namespace=? AND ontology_version=? ORDER BY id").all(namespace,version) as Array<{payload:string}>).map(row=>JSON.parse(row.payload) as InferredAssertion); }
  explainInference(namespace:string,version:number,id:string): InferredAssertion|undefined { const row=this.db.prepare("SELECT payload FROM inferred_assertions WHERE namespace=? AND ontology_version=? AND id=?").get(namespace,version,id) as {payload:string}|undefined; return row?JSON.parse(row.payload) as InferredAssertion:undefined; }
  saveSession(session: {sessionId:string;namespace:string;ontologyVersion:number;refs:Record<string,string>;expiresAt:string}): void { this.db.prepare("INSERT OR REPLACE INTO semantic_sessions(session_id,namespace,ontology_version,refs,expires_at,created_at) VALUES(?,?,?,?,?,?)").run(session.sessionId,session.namespace,session.ontologyVersion,JSON.stringify(session.refs),session.expiresAt,new Date().toISOString()); }
  getSession(sessionId:string) { const row=this.db.prepare("SELECT session_id sessionId,namespace,ontology_version ontologyVersion,refs,expires_at expiresAt FROM semantic_sessions WHERE session_id=? AND expires_at>?").get(sessionId,new Date().toISOString()) as Record<string,unknown>|undefined; return row?{sessionId:row.sessionId as string,namespace:row.namespace as string,ontologyVersion:row.ontologyVersion as number,refs:JSON.parse(row.refs as string) as Record<string,string>,expiresAt:row.expiresAt as string}:undefined; }
  saveGoldenReport(namespace: string, report: GoldenReport): void {
    this.db.prepare("INSERT INTO draft_golden_reports(report_id,namespace,draft_id,payload,created_at) VALUES(?,?,?,?,?)").run(report.reportId, namespace, report.draftId, JSON.stringify(report), report.checkedAt);
  }
  getGoldenReport(namespace: string, draftId: string): GoldenReport | undefined {
    const row = this.db.prepare("SELECT payload FROM draft_golden_reports WHERE namespace=? AND draft_id=? ORDER BY rowid DESC LIMIT 1").get(namespace, draftId) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as GoldenReport : undefined;
  }
  saveClarification(record: ClarificationRecord): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM semantic_clarifications WHERE expires_at<=?").run(new Date().toISOString());
      this.db.prepare("INSERT INTO semantic_clarifications(clarification_id,namespace,ontology_version,payload,expires_at) VALUES(?,?,?,?,?)")
        .run(record.clarificationId, record.input.namespace, record.version, JSON.stringify(record), record.expiresAt);
    });
  }
  getClarification(clarificationId: string): ClarificationRecord | undefined {
    const row = this.db.prepare("SELECT payload FROM semantic_clarifications WHERE clarification_id=?").get(clarificationId) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as ClarificationRecord : undefined;
  }
  deleteClarification(clarificationId: string): void {
    this.db.prepare("DELETE FROM semantic_clarifications WHERE clarification_id=?").run(clarificationId);
  }
  appendAudit(auditId:string,requestId:string,eventType:string,payload:unknown): void { const next=(this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 value FROM audit_events WHERE audit_id=?").get(auditId) as {value:number}).value; this.db.prepare("INSERT INTO audit_events(audit_id,sequence,request_id,event_type,payload,created_at) VALUES(?,?,?,?,?,?)").run(auditId,next,requestId,eventType,JSON.stringify(redact(payload)),new Date().toISOString()); }
  listAudit(limit=100) { return (this.db.prepare("SELECT audit_id auditId,sequence,request_id requestId,event_type eventType,payload,created_at createdAt FROM audit_events ORDER BY created_at DESC,sequence DESC LIMIT ?").all(limit) as Array<Record<string,unknown>>).map(row=>({...row,payload:JSON.parse(row.payload as string)})); }
  putPhysicalSource(sourceId:string,payload:Record<string,unknown>,credentialCiphertext?:string):void { this.db.prepare("INSERT INTO physical_sources(source_id,payload,credential_ciphertext,updated_at) VALUES(?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,credential_ciphertext=COALESCE(excluded.credential_ciphertext,physical_sources.credential_ciphertext),updated_at=excluded.updated_at").run(sourceId,JSON.stringify(redact(payload)),credentialCiphertext??null,new Date().toISOString()); }
  getCredentialCiphertext(sourceId: string): string | undefined {
    const row = this.db.prepare("SELECT credential_ciphertext value FROM physical_sources WHERE source_id=?").get(sourceId) as { value: string | null } | undefined;
    return row?.value ?? undefined;
  }
  getPhysicalSource(sourceId:string):{sourceId:string;payload:Record<string,unknown>;credentialConfigured:boolean;updatedAt:string}|undefined { const row=this.db.prepare("SELECT source_id sourceId,payload,credential_ciphertext credentialCiphertext,updated_at updatedAt FROM physical_sources WHERE source_id=?").get(sourceId) as Record<string,unknown>|undefined;return row?{sourceId:row.sourceId as string,payload:JSON.parse(row.payload as string) as Record<string,unknown>,credentialConfigured:Boolean(row.credentialCiphertext),updatedAt:row.updatedAt as string}:undefined; }
  putPhysicalTable(sourceId:string,table:PhysicalTable):void { this.db.prepare("INSERT INTO physical_tables(source_id,table_id,payload,fingerprint,scan_status,scanned_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_id,table_id) DO UPDATE SET payload=excluded.payload,fingerprint=excluded.fingerprint,scan_status=excluded.scan_status,scanned_at=excluded.scanned_at").run(sourceId,table.id,JSON.stringify(table),table.fingerprint,table.status,table.scannedAt); }
  listPhysicalTables(sourceId?:string):PhysicalTable[]{ const rows=(sourceId?this.db.prepare("SELECT payload FROM physical_tables WHERE source_id=? ORDER BY table_id").all(sourceId):this.db.prepare("SELECT payload FROM physical_tables ORDER BY source_id,table_id").all()) as Array<{payload:string}>; return rows.map(row=>JSON.parse(row.payload) as PhysicalTable); }
  replaceIndexedValues(namespace:string,version:number,objectId:string,propertyId:string,values:Array<{displayValue:string;frequency:number}>):void { this.transaction(()=>{this.db.prepare("DELETE FROM property_value_index WHERE namespace=? AND ontology_version=? AND property_id=?").run(namespace,version,propertyId);const stmt=this.db.prepare("INSERT INTO property_value_index(namespace,ontology_version,object_id,property_id,normalized_value,display_value,frequency,updated_at) VALUES(?,?,?,?,?,?,?,?)");const now=new Date().toISOString();values.forEach(value=>stmt.run(namespace,version,objectId,propertyId,normalize(value.displayValue),value.displayValue,value.frequency,now));}); }
  matchValues(namespace: string, version: number, question: string) {
    return this.db.prepare("SELECT object_id objectId,property_id propertyId,display_value displayValue,frequency FROM property_value_index WHERE namespace=? AND ontology_version=? AND length(normalized_value)>0 AND instr(?,normalized_value)>0 ORDER BY length(normalized_value) DESC,frequency DESC,property_id,normalized_value LIMIT 1001")
      .all(namespace, version, normalize(question)) as Array<{objectId:string;propertyId:string;displayValue:string;frequency:number}>;
  }
  searchValues(namespace:string,version:number,query:string,limit=20){ const value=`%${normalize(query)}%`; return this.db.prepare("SELECT object_id objectId,property_id propertyId,display_value displayValue,frequency FROM property_value_index WHERE namespace=? AND ontology_version=? AND normalized_value LIKE ? ORDER BY CASE WHEN normalized_value=? THEN 0 ELSE 1 END,frequency DESC,display_value LIMIT ?").all(namespace,version,value,normalize(query),limit) as Array<{objectId:string;propertyId:string;displayValue:string;frequency:number}>; }
  saveIndexStatus(namespace:string,version:number,objectId:string,propertyId:string,status:string,distinctValues:number,coveredRows:number,error?:string):void { this.db.prepare("INSERT INTO property_value_index_status(namespace,ontology_version,object_id,property_id,status,distinct_values,covered_rows,error,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(namespace,ontology_version,property_id) DO UPDATE SET status=excluded.status,distinct_values=excluded.distinct_values,covered_rows=excluded.covered_rows,error=excluded.error,updated_at=excluded.updated_at").run(namespace,version,objectId,propertyId,status,distinctValues,coveredRows,error??null,new Date().toISOString()); }
  getIndexStatus(namespace:string,version:number){ return this.db.prepare("SELECT CASE WHEN SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)>0 THEN 'failed' WHEN SUM(CASE WHEN status='building' THEN 1 ELSE 0 END)>0 THEN 'building' WHEN SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END)>0 THEN 'partial' WHEN SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END)>0 THEN 'ready' ELSE 'empty' END status,COUNT(*) properties,COALESCE(SUM(distinct_values),0) valuesCount,COALESCE(SUM(covered_rows),0) coveredRows,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failedProperties,SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) partialProperties,MAX(updated_at) updatedAt FROM property_value_index_status WHERE namespace=? AND ontology_version=?").get(namespace,version) as Record<string,unknown>; }
  getCompiledTemplate(namespace: string, version: number, key: string): CompiledTemplate | undefined {
    const row = this.db.prepare("SELECT payload FROM compiled_query_templates WHERE namespace=? AND ontology_version=? AND cache_key=?").get(namespace, version, key) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as CompiledTemplate : undefined;
  }
  putCompiledTemplate(namespace: string, version: number, key: string, template: CompiledTemplate): void {
    this.db.prepare("INSERT OR REPLACE INTO compiled_query_templates(namespace,ontology_version,cache_key,payload,created_at) VALUES(?,?,?,?,?)")
      .run(namespace, version, key, JSON.stringify(template), new Date().toISOString());
  }
  putShape(namespace:string,version:number,fingerprint:string,ir:QueryIR,parameterSchema:unknown):void { this.db.prepare("INSERT OR REPLACE INTO query_shape_cache(namespace,ontology_version,fingerprint,ir_template,parameter_schema,created_at) VALUES(?,?,?,?,?,?)").run(namespace,version,fingerprint,JSON.stringify(ir),JSON.stringify(parameterSchema),new Date().toISOString()); }
  getShape(namespace:string,version:number,fingerprint:string):QueryIR|undefined { const row=this.db.prepare("SELECT ir_template value FROM query_shape_cache WHERE namespace=? AND ontology_version=? AND fingerprint=?").get(namespace,version,fingerprint) as {value:string}|undefined; return row?JSON.parse(row.value) as QueryIR:undefined; }
  createApiClient(record:ApiClientRecord):void { this.db.prepare("INSERT INTO api_clients(client_id,name,scopes,status,key_hash,rate_limit,rotated_at,created_at) VALUES(?,?,?,?,?,?,?,?)").run(record.clientId,record.name,JSON.stringify(record.scopes),record.status,record.keyHash,record.rateLimit,record.rotatedAt,new Date().toISOString()); }
  findApiClientByHash(keyHash:string):ApiClientRecord|undefined { const row=this.db.prepare("SELECT client_id clientId,name,scopes,status,key_hash keyHash,rate_limit rateLimit,rotated_at rotatedAt FROM api_clients WHERE key_hash=?").get(keyHash) as Record<string,unknown>|undefined;return row?{clientId:row.clientId as string,name:row.name as string,scopes:JSON.parse(row.scopes as string) as Scope[],status:row.status as "ACTIVE"|"DISABLED",keyHash:row.keyHash as string,rateLimit:row.rateLimit as number,rotatedAt:row.rotatedAt as string}:undefined; }
  listApiClients():Array<Omit<ApiClientRecord,"keyHash">> { return (this.db.prepare("SELECT client_id clientId,name,scopes,status,rate_limit rateLimit,rotated_at rotatedAt FROM api_clients ORDER BY created_at").all() as Array<Record<string,unknown>>).map(row=>({clientId:row.clientId as string,name:row.name as string,scopes:JSON.parse(row.scopes as string) as Scope[],status:row.status as "ACTIVE"|"DISABLED",rateLimit:row.rateLimit as number,rotatedAt:row.rotatedAt as string})); }
  deleteApiClient(clientId:string):void { this.db.prepare("DELETE FROM api_clients WHERE client_id=?").run(clientId); }
}

export function redact<T>(value:T):T { const visit=(item:unknown,key=""):unknown=>{ if (/password|secret|authorization|api[-_]?key|credential/i.test(key)) return "***REDACTED***"; if (Array.isArray(item)) return item.map(child=>visit(child)); if (item&&typeof item==="object") return Object.fromEntries(Object.entries(item as Record<string,unknown>).map(([k,v])=>[k,visit(v,k)])); return item; }; return visit(value) as T; }
function normalize(value:string):string{return value.trim().toLocaleLowerCase("zh-CN").normalize("NFKC");}
export { MIGRATIONS };
