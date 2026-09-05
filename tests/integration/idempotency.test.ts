import { describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";
import { validSnapshot } from "../fixtures-v3.js";
it("deduplicates concurrent writes and rejects changed payloads", async () => {
  const app = buildApp({ databasePath: ":memory:", apiKey: "test-key" });
  try {
    app.platformStore.savePublished(validSnapshot());
    const request = { method: "POST" as const, url: "/v1/namespaces/retail/drafts", headers: { authorization: "Bearer test-key", "idempotency-key": "create-once" }, payload: { baseVersion: 1 } };
    const [first, second] = await Promise.all([app.inject(request), app.inject(request)]);
    expect(first.statusCode).toBe(200); expect(second.statusCode).toBe(200);
    expect(first.json().data.draftId).toBe(second.json().data.draftId);
    expect(app.platformStore.db.prepare("SELECT * FROM ontology_drafts").all()).toHaveLength(1);
    const conflict = await app.inject({ ...request, payload: { baseVersion: "latest" } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  } finally { await app.close(); }
});
