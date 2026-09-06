import type { ExecuteSemanticQueryInput, FixedQueryShape, OntologyObject, OntologyProperty, OntologySnapshotV3 } from '../../contracts/src/index.js';
import { bindingPriority } from '../../domain/src/semantic-identity.js';
import { detailFieldIds, detailPaths } from '../../domain/src/detail-query.js';
import { normalizeTerm, retrieveContext, type ValueLookup } from './context-retrieval.js';

export function bindDetailIntent(snapshot: OntologySnapshotV3, intent: NonNullable<ExecuteSemanticQueryInput['intent']>, lookup: ValueLookup, selections: Record<string,string>) {
  const missing: Array<{field:string;term:string;reason:string}> = [];
  const clarifications: Array<{id:string;term:string;reason:string;candidates:Array<{id:string;label:string;object:string;property?:string}>}> = [];
  const score = (term: string, item: { id:string; name:string; label:string; synonyms:string[] }) => {
    const at = [item.id,item.name,item.label,...item.synonyms].findIndex(alias => normalizeTerm(alias) === normalizeTerm(term));
    return at < 0 ? 0 : at === 0 ? 3 : at < 3 ? 2 : 1;
  };
  const choose = <T,>(key: string, term: string, entries: Array<{value:T;id:string;label:string;object:string;property?:string;score:number;priority:number}>): T | undefined => {
    if (!entries.length) { missing.push({field:key,term,reason:'指定范围内未命中可读取定义'}); return; }
    const bestScore = Math.max(...entries.map(entry => entry.score));
    const ranked = entries.filter(entry => entry.score === bestScore);
    const bestPriority = Math.max(...ranked.map(entry => entry.priority));
    const candidates = ranked.filter(entry => entry.priority === bestPriority);
    const selected = selections[key] ? candidates.find(entry => entry.id === selections[key]) : candidates.length === 1 ? candidates[0] : undefined;
    if (selected) return selected.value;
    clarifications.push({id:key,term,reason:'请确认业务含义',candidates:candidates.map(({id,label,object,property})=>({id,label,object,property}))});
  };
  const object = (term: string,key: string) => choose(key,term,snapshot.objects.map(object => ({value:object,id:object.id,label:object.label,object:object.label,score:score(term,object),priority:bindingPriority(object)})).filter(item=>item.score));
  const root = object(intent.object ?? '', 'object');
  const included = (intent.includeObjects ?? []).map((term,i)=>object(term,`include_${i}`)).filter((o): o is OntologyObject=>Boolean(o));
  const scope = [root,...included].filter((o): o is OntologyObject=>Boolean(o));
  const owners = snapshot.objects.flatMap(object => object.properties.filter(p=>!p.sensitive && p.visibility!=='HIDDEN').map(property=>({object,property})));
  const field = (input: string | {object?:string;property:string}, key: string, allowed = owners): {object:OntologyObject;property:OntologyProperty} | undefined => {
    const spec = typeof input === 'string' ? {property:input} : input;
    let terms = spec;
    if (!spec.object && spec.property.includes('.') && !allowed.some(({property})=>score(spec.property,property))) {
      const at = spec.property.indexOf('.'); terms = {object:spec.property.slice(0,at),property:spec.property.slice(at+1)};
    }
    const scoped = allowed.filter(({object})=>terms.object ? score(terms.object,object) : scope.some(o=>o.id===object.id));
    const candidates = terms.object || scoped.some(({property})=>score(terms.property,property)) ? scoped : allowed;
    return choose(key,spec.property,candidates.map(value=>({value,id:value.property.id,label:value.property.label,object:value.object.label,property:value.property.label,score:score(terms.property,value.property),priority:bindingPriority(value.object,value.property)})).filter(item=>item.score));
  };
  const shape: FixedQueryShape = {rootObjectId:root?.id ?? '',resultKind:'detail',measureIds:[],dimensionPropertyIds:[],filters:[],sort:[],limit:intent.limit ?? 200,includeObjectIds:included.map(o=>o.id),allowFanout:intent.allowFanout,relationPaths:{}};
  if (missing.length || clarifications.length) return {shape,summary:{resultKind:"detail",object:root?.label},clarifications,missing,context:{bindings:[]}};
  if (intent.fields) shape.selectPropertyIds = intent.fields.map((spec,i)=>field(spec,`field_${i}`)?.property.id).filter((id):id is string=>Boolean(id));
  const context = { bindings: [] as unknown[] };
  for (const [i,filter] of (intent.filters ?? []).entries()) {
    if (filter.operator) {
      if (!filter.property) { missing.push({field:`filter_${i}`,term:filter.value,reason:'明确比较运算需要 property 指定筛选属性'}); continue; }
      const binding = field({object:filter.object,property:filter.property},`filter_${i}`);
      if (binding) shape.filters.push({propertyId:binding.property.id,operator:filter.operator,value:filter.value});
    } else {
      const result = retrieveContext(snapshot,{namespace:snapshot.namespace,purpose:'PLAN',terms:[{term:filter.value,role:'values',object:filter.object,property:filter.property}]},lookup);
      context.bindings.push(...result.bindings);
      const binding = result.bindings[0]!;
      const candidates = binding.selected ? [binding.selected] : binding.candidates ?? [];
      const selected = choose(`filter_${i}`,filter.value,candidates.map(value=>({value,id:JSON.stringify([value.kind,value.id,value.propertyId]),label:value.displayValue ?? value.label,object:value.objectLabel,property:value.propertyLabel,score:value.score,priority:value.priority})));
      if (selected?.propertyId) shape.filters.push({propertyId:selected.propertyId,operator:'EQ',value:selected.displayValue});
    }
  }
  if (intent.time) {
    const binding = field(intent.time.field,'time',owners.filter(owner=>owner.property.meaning==='TIME'));
    if (binding) shape.timeRange={propertyId:binding.property.id,kind:intent.time.period,expression:intent.time.period};
  }
  for (const [i,sort] of (intent.sort ?? []).entries()) {
    const binding = field(sort.field,`sort_${i}`);
    if (binding) shape.sort.push({entityId:binding.property.id,direction:sort.direction});
  }
  if (root && !missing.length && !clarifications.length) {
    const output = detailFieldIds(snapshot,root.id,shape.selectPropertyIds,shape.includeObjectIds);
    const ids = [...output,...shape.filters.map(filter=>filter.propertyId),...shape.sort.map(sort=>sort.entityId),...(shape.timeRange?.propertyId ? [shape.timeRange.propertyId] : [])];
    const targets = new Set(ids.map(id=>owners.find(owner=>owner.property.id===id)!.object.id));
    for (const target of targets) {
      if (target===root.id) continue;
      const paths = detailPaths(snapshot,root.id,target);
      const selected = choose(`path_${target}`,snapshot.objects.find(o=>o.id===target)!.label,paths.map(path=>({value:path,id:JSON.stringify(path),label:path.map(id=>snapshot.relations.find(r=>r.id===id)!.name).join(' → '),object:snapshot.objects.find(o=>o.id===target)!.label,score:1,priority:1})));
      if (selected) shape.relationPaths![target]=selected;
    }
  }
  return {shape,summary:{resultKind:'detail',object:root?.label,includeObjects:included.map(o=>o.label),fields:shape.selectPropertyIds?.map(id=>owners.find(owner=>owner.property.id===id)?.property.label) ?? '全部可读取属性',allowFanout:intent.allowFanout ?? false},clarifications,missing,context};
}
