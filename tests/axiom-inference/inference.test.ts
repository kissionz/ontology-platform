import { describe,expect,it } from "vitest";import { runKernel } from "../../packages/domain/src/index.js";import { validSnapshot } from "../fixtures-v3.js";
describe("A10-A12 deterministic inference",()=>{it("A10 derives store to business unit with two premises and proof",()=>{const result=runKernel(validSnapshot());const inferred=result.inferences.find(i=>i.predicate==="RELATION_REACHABLE"&&i.subjectId==="o_store"&&i.objectId==="o_bu");expect(inferred?.premiseAssertionIds).toEqual(["r_dept_bu","r_store_dept"]);expect(inferred?.proof.filter(p=>p.kind==="FACT")).toHaveLength(2);expect(inferred?.proof.filter(p=>p.kind==="AXIOM").map(p=>p.refId).sort()).toEqual(inferred?.axiomAssertionIds);expect(inferred?.proof.at(-1)?.kind).toBe("DERIVATION");});it("A11 rejects hierarchy cycles",()=>{const s=validSnapshot();s.dimensionHierarchies[0]!.levels.push(s.dimensionHierarchies[0]!.levels[0]!);expect(runKernel(s).issues.some(i=>i.code==="HIERARCHY_TRANSITIVE"&&i.message.includes("环"))).toBe(true);});it("A12 is byte-for-byte deterministic",()=>{const a=runKernel(validSnapshot()),b=runKernel(validSnapshot());expect(a.inferences).toEqual(b.inferences);expect(a.inferenceDigest).toBe(b.inferenceDigest);});});

it("computes the complete directed relation closure beyond two hops", () => {
  const snapshot = validSnapshot();
  const result = runKernel(snapshot);
  const inference = result.inferences.find(i => i.predicate === "RELATION_REACHABLE" && i.subjectId === "o_order" && i.objectId === "o_bu");
  expect(inference?.premiseAssertionIds).toHaveLength(3);
  expect(inference?.proof.filter(step => step.kind === "FACT")).toHaveLength(3);
  expect(result.inferences.some(i => i.subjectId === "o_bu" && i.objectId === "o_order")).toBe(false);
  expect(runKernel({ ...snapshot, relations: [...snapshot.relations].reverse() }).inferenceDigest).toBe(result.inferenceDigest);
});
