import { describe,expect,it } from "vitest";
import { CONTRACT_SCHEMAS, ExecuteSemanticQueryInputSchema, OntologySnapshotV3Schema, jsonSchemas } from "../../packages/contracts/src/index.js";
import { createOpenApiDocument } from "../../packages/contracts/src/openapi.js";
import { validSnapshot } from "../fixtures-v3.js";
describe("Phase 0 contracts",()=>{it("publishes standalone v3 schemas",()=>{expect(OntologySnapshotV3Schema.parse(validSnapshot()).schemaVersion).toBe(3);expect(Object.keys(jsonSchemas())).toEqual(Object.keys(CONTRACT_SCHEMAS));});it("keeps the complete OpenAPI surface on the same Zod registry",()=>{const document=createOpenApiDocument();expect(Object.keys(document.components.schemas)).toEqual(Object.keys(jsonSchemas()));expect(document.paths["/semantic-query"].post.operationId).toBe("ExecuteSemanticQuery");expect(Object.keys(document.paths)).toHaveLength(26);expect(document.paths["/system/metrics"].get.operationId).toBe("GetSystemMetrics");});it("requires the public query mode and namespace",()=>{expect(()=>ExecuteSemanticQueryInputSchema.parse({queryMode:"AUTO"})).toThrow();});});

import { readFileSync } from "node:fs";
it("keeps the checked-in OpenAPI document identical to the served contract", () => {
  const frozen = JSON.parse(readFileSync("openapi/ontology-platform.v1.yaml", "utf8"));
  expect(frozen).toEqual(createOpenApiDocument());
});

it("resolves every recursive local reference inside the full OpenAPI document", () => {
  const document = createOpenApiDocument();
  let refs = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string" && item.startsWith("#/")) {
        refs++;
        const resolved = item.slice(2).split("/").reduce((node: any, segment) => node?.[segment.replace(/~1/g, "/").replace(/~0/g, "~")], document);
        expect(resolved, item).toBeDefined();
      } else visit(item);
    }
  };
  visit(document);
  expect(refs).toBeGreaterThan(10);
});
