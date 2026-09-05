import { describe,expect,it } from "vitest";
import { CONTRACT_SCHEMAS, ExecuteSemanticQueryInputSchema, OntologySnapshotV3Schema, jsonSchemas } from "../../packages/contracts/src/index.js";
import { createOpenApiDocument } from "../../packages/contracts/src/openapi.js";
import { validSnapshot } from "../fixtures-v3.js";
describe("Phase 0 contracts",()=>{it("publishes standalone v3 schemas",()=>{expect(OntologySnapshotV3Schema.parse(validSnapshot()).schemaVersion).toBe(3);expect(Object.keys(jsonSchemas())).toEqual(Object.keys(CONTRACT_SCHEMAS));});it("keeps the complete OpenAPI surface on the same Zod registry",()=>{const document=createOpenApiDocument();expect(Object.keys(document.components.schemas)).toEqual(Object.keys(jsonSchemas()));expect(document.paths["/semantic-query"].post.operationId).toBe("ExecuteSemanticQuery");expect(Object.keys(document.paths)).toHaveLength(26);expect(document.paths["/system/metrics"].get.operationId).toBe("GetSystemMetrics");});it("requires the public query mode and namespace",()=>{expect(()=>ExecuteSemanticQueryInputSchema.parse({queryMode:"AUTO"})).toThrow();});});

import { readFileSync } from "node:fs";
import { API_DOCS, REQUEST_DOCS } from "../../packages/contracts/src/api-docs.js";
import { MCP_EXAMPLES } from "../../packages/contracts/src/integration-docs.js";
import { MCP_INPUT_SCHEMAS } from "../../packages/mcp-server/src/index.js";

it("documents every API operation and validates request and MCP examples against contracts", () => {
  const document = createOpenApiDocument();
  const operations = Object.values(document.paths).flatMap(path => Object.values(path)) as any[];
  expect(operations.map(o => o.operationId).sort()).toEqual(Object.keys(API_DOCS).sort());
  for (const operation of operations) {
    expect(operation.summary).toMatch(/[\u4e00-\u9fff]/);
    expect(operation.description.length).toBeGreaterThan(10);
    expect(operation["x-required-scopes"]).toBeTruthy();
    expect(operation.responses["200"].description).toBeTruthy();
    for (const parameter of operation.parameters) expect(parameter.description).toBeTruthy();
  }
  for (const [name, docs] of Object.entries(REQUEST_DOCS)) {
    const validator = CONTRACT_SCHEMAS[name as keyof typeof CONTRACT_SCHEMAS];
    expect(validator.safeParse(docs.example).success, name).toBe(true);
    const schema = document.components.schemas[name] as any;
    for (const field of Object.values(schema.properties) as any[]) expect(field.description, name).toBeTruthy();
  }
  expect(Object.keys(MCP_EXAMPLES).sort()).toEqual(Object.keys(MCP_INPUT_SCHEMAS).sort());
  for (const [name, schema] of Object.entries(MCP_INPUT_SCHEMAS)) expect(schema.safeParse(MCP_EXAMPLES[name]).success, name).toBe(true);
});
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
