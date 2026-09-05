import { writeFileSync } from "node:fs";
import { createOpenApiDocument } from "../packages/contracts/src/openapi.js";
// JSON is valid YAML 1.2 and avoids an additional serialization dependency.
writeFileSync(new URL("../openapi/ontology-platform.v1.yaml", import.meta.url), `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`);
