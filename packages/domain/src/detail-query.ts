import type { OntologySnapshotV3 } from "../../contracts/src/index.js";
import { relationTraversals } from "./relations.js";

export function detailPaths(snapshot: OntologySnapshotV3, rootId: string, targetId: string, specified?: string[]) {
  if (rootId === targetId) return [[]];
  const adjacent = new Map<string, Array<{ to: string; id: string }>>();
  for (const relation of snapshot.relations) {
    if (relation.type === "COMPOSITION" && relation.composition?.aggregationPolicy === "EXISTS_ONLY") continue;
    for (const edge of relationTraversals(relation)) adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), { to: edge.to, id: relation.id }]);
  }
  if (specified) {
    let at = rootId; const visited = new Set([at]);
    for (const id of specified) {
      const edge = adjacent.get(at)?.find(edge => edge.id === id);
      if (!edge || visited.has(edge.to)) throw new Error("指定的明细关联路径不可用或包含循环");
      at = edge.to; visited.add(at);
    }
    if (at !== targetId) throw new Error("指定的明细关联路径未到达目标对象");
    return [specified];
  }
  const paths: string[][] = []; let visits = 0;
  const walk = (at: string, path: string[], visited: Set<string>) => {
    if (++visits > 10000) throw new Error("明细关联路径过多，请通过 relationPaths 指定路径");
    if (at === targetId) { paths.push(path); return; }
    for (const edge of adjacent.get(at) ?? []) if (!visited.has(edge.to)) walk(edge.to, [...path, edge.id], new Set([...visited, edge.to]));
  };
  walk(rootId, [], new Set([rootId]));
  return paths;
}

export function detailFieldIds(snapshot: OntologySnapshotV3, rootId: string, selected?: string[], included: string[] = []) {
  const objects = [...new Set([rootId, ...included])].map(id => {
    const object = snapshot.objects.find(object => object.id === id);
    if (!object) throw new Error(`明细对象不存在：${id}`);
    return object;
  });
  const fields = selected ?? objects.flatMap(object => object.properties.filter(property => !property.sensitive && property.visibility !== "HIDDEN").map(property => property.id));
  if (!fields.length) throw new Error("没有可输出的明细属性");
  return [...new Set(fields)];
}
