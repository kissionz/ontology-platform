import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { backupDatabase, restoreDatabase } from "../../scripts/backup.js";
import { validSnapshot } from "../fixtures-v3.js";

describe("Phase 7 backup and restore", () => {
  it("creates an integrity-checked backup and atomically restores it", async () => {
    const root = path.join(tmpdir(), `ontology-backup-${process.pid}-${Date.now()}`);
    const source = `${root}-source.sqlite`;
    const backup = `${root}-backup.sqlite`;
    const restored = `${root}-restored.sqlite`;
    const store = new SqlitePlatformStore(source);
    store.savePublished(validSnapshot());
    store.close();

    await backupDatabase(source, backup);
    restoreDatabase(backup, restored);

    expect(existsSync(backup)).toBe(true);
    const recovered = new SqlitePlatformStore(restored);
    expect(recovered.getSnapshot("retail", 1)?.contentDigest).toBe(
      validSnapshot().contentDigest,
    );
    recovered.close();
  });
});
