import { expect, it } from "vitest";
import { objectRemovalOperations } from "../../apps/console/src/modeling.js";
import { validSnapshot, physicalTables } from "../fixtures-v3.js";
import { SqlitePlatformStore } from "../../adapters/ontology-store-sqlite/src/index.js";
import { OntologyPlatform } from "../../packages/application/src/index.js";
import { runKernel } from "../../packages/domain/src/kernel.js";

it("removes dependent definitions in one draft patch and keeps published objects intact", () => {
  const store = new SqlitePlatformStore(":memory:");
  try {
    const initial = validSnapshot();
    store.savePublished(initial);
    physicalTables().forEach(table => store.putPhysicalTable("selectdb", table));
    const platform = new OntologyPlatform(store);
    const draft = platform.createDraft("retail");
    const operations = objectRemovalOperations(draft.snapshot, "o_order");
    expect(operations).toEqual(expect.arrayContaining([{ op: "REMOVE_OBJECT", id: "o_order" }, { op: "REMOVE_METRIC", id: "m_sales" }, { op: "REMOVE_METRIC", id: "m_margin" }, { op: "REMOVE_RELATION", id: "r_order_store" }]));
    const result = platform.applyDraftPatch("retail", draft.draftId, draft.revision, operations);
    expect(result.validation.valid).toBe(true);
    expect(result.snapshot.objects.some(object => object.id === "o_order")).toBe(false);
    expect(store.getSnapshot("retail", 1)?.objects.some(object => object.id === "o_order")).toBe(true);
    const withoutStore = platform.applyDraftPatch("retail", draft.draftId, result.revision, objectRemovalOperations(result.snapshot, "o_store"));
    expect(withoutStore.snapshot.dimensionHierarchies).toEqual([]);
    expect(withoutStore.validation.valid).toBe(true);
  } finally { store.close(); }
});

it("exposes different axioms for all five object types and enforces their constraints", () => {
  for (const objectType of ["ENTITY", "EVENT", "SNAPSHOT", "AGGREGATE", "RELATIONSHIP"] as const) {
    const snapshot = validSnapshot();
    const object = snapshot.objects.find(object => object.id === "o_order")!;
    object.objectType = objectType;
    const result = runKernel(snapshot);
    const rules = result.axioms.filter(axiom => axiom.subjectId === object.id).map(axiom => axiom.axiomCode);
    expect(rules).toContain(objectType === "ENTITY" ? "IDENTITY_ENTITY_SINGLE" : "GRAIN_REQUIRED");
    if (objectType === "EVENT") expect(rules).toContain("IDENTITY_EVENT_MAX_ONE");
    if (objectType === "RELATIONSHIP") {
      expect(rules).toContain("RELATIONSHIP_REFERENCES_REQUIRED");
      expect(result.issues.some(issue => issue.code === "RELATIONSHIP_REFERENCES_REQUIRED")).toBe(true);
    }
  }
});
