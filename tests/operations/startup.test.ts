import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server.js";

describe("Phase 7 startup paths", () => {
  it("starts from an empty SQLite path and reports missing ontology explicitly", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "ontology-empty-")),
      "platform.sqlite",
    );
    const app = buildApp({ databasePath, apiKey: "test-key" });
    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(200);
    const missing = await app.inject({
      method: "GET",
      url: "/v1/namespaces/retail/ontology",
      headers: { authorization: "Bearer test-key" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("ONTOLOGY_VERSION_NOT_FOUND");
    await app.close();
  });
});
