import type { OntologySnapshotV3 } from "../../contracts/src/index.js";
import type { OntologySnapshot as OntologySnapshotV2 } from "../../contracts/src/legacy.js";
import { digest, runKernel } from "./kernel.js";

export function migrateV2ToV3(input: OntologySnapshotV2, namespace: string): OntologySnapshotV3 {
  const normalized = {
    version: input.version,
    objects: input.objects.map(object => ({ ...object, properties: object.properties.map(property => ({ ...property })) })),
    relations: input.relations.map(relation => ({ ...relation })),
    metrics: input.metrics.map(metric => ({ ...metric, metricType: metric.metricType ?? (metric.leftMetricId || metric.rightMetricId ? "DERIVED" : "BASE") })),
    dimensionHierarchies: (input.dimensionHierarchies ?? []).map(hierarchy => ({ ...hierarchy, kind: hierarchy.kind ?? "FIXED_LEVELS" }))
  } as Pick<OntologySnapshotV3, "version" | "objects" | "relations" | "metrics" | "dimensionHierarchies">;
  const kernel = runKernel(normalized);
  const content = { schemaVersion: 3 as const, namespace, version: input.version, status: input.status, ...(input.baseVersion == null ? {} : { baseVersion: input.baseVersion }), ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}), objects: normalized.objects, relations: normalized.relations, metrics: normalized.metrics, dimensionHierarchies: normalized.dimensionHierarchies };
  return { ...content, contentDigest: digest(content), axiomAssertions: kernel.axioms, inferredAssertions: kernel.inferences, inferenceDigest: kernel.inferenceDigest };
}

export function finalizeSnapshot(input: Omit<OntologySnapshotV3, "contentDigest" | "axiomAssertions" | "inferredAssertions" | "inferenceDigest">): OntologySnapshotV3 {
  // Callers may spread an existing snapshot: derived fields must never hash themselves.
  const { contentDigest: _content, axiomAssertions: _axioms, inferredAssertions: _inferences,
    inferenceDigest: _digest, ...content } = input as OntologySnapshotV3;
  const kernel = runKernel(content);
  const contentDigest = digest(content);
  return { ...content, contentDigest, axiomAssertions: kernel.axioms, inferredAssertions: kernel.inferences, inferenceDigest: kernel.inferenceDigest };
}
