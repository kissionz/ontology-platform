import { describe, expect, it, vi } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { finalizeSnapshot } from "../../packages/domain/src/index.js";
import { validSnapshot } from "../fixtures-v3.js";

describe("atomic publication", () => {
  it("retains the draft and rolls back the version if audit persistence fails", () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    const draft = store.createDraft("retail");
    const app = new OntologyPlatform(store);
    vi.spyOn(store, "appendAudit").mockImplementation(() => { throw new Error("disk full"); });
    expect(() => app.publishDraft("retail", draft.draftId, 1)).toThrow("disk full");
    expect(store.latestVersion("retail")).toBe(1);
    expect(store.getSnapshot("retail", 2)).toBeUndefined();
    expect(store.getDraft("retail", draft.draftId)).toBeDefined();
    expect(store.db.prepare("SELECT * FROM ontology_version_metadata").all()).toEqual([]);
    store.close();
  });
  it("commits snapshot, metadata and audit together with a reproducible digest", () => {
    const store = new SqlitePlatformStore(":memory:");
    store.savePublished(validSnapshot());
    const draft = store.createDraft("retail");
    const app = new OntologyPlatform(store);
    const published = app.publishDraft("retail", draft.draftId, 1, "发布说明", "publisher");
    expect(store.listVersions("retail")[0]?.publishedBy).toBe("publisher");
    expect(store.listAudit()[0]?.eventType).toBe("OntologyPublished");
    expect(store.getDraft("retail", draft.draftId)).toBeUndefined();
    const snapshot = store.getSnapshot("retail", 2)!;
    expect(finalizeSnapshot(snapshot).contentDigest).toBe(published.contentDigest);
    store.close();
  });
});

it("does not leave an orphan rollback draft when the source version is invalid", () => {
  const store = new SqlitePlatformStore(":memory:");
  try {
    store.savePublished(validSnapshot());
    expect(() => new OntologyPlatform(store).createDraft("retail", "latest", 99)).toThrow();
    expect(store.db.prepare("SELECT * FROM ontology_drafts").all()).toEqual([]);
  } finally { store.close(); }
});
