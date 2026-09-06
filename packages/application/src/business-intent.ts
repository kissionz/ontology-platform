import { bindDetailIntent } from "./detail-intent.js";
import type { ExecuteSemanticQueryInput, FixedQueryShape, OntologySnapshotV3 } from '../../contracts/src/index.js';
import { retrieveContext, type ContextCandidate, type SearchRequest, type ValueLookup } from './context-retrieval.js';

const periods = { CURRENT_YEAR: '今年', PREVIOUS_YEAR: '去年', CURRENT_MONTH: '本月', PREVIOUS_MONTH: '上月', TODAY: '今天', YESTERDAY: '昨天' };
export function bindBusinessIntent(snapshot: OntologySnapshotV3, intent: NonNullable<ExecuteSemanticQueryInput['intent']>, lookup: ValueLookup, selections: Record<string,string> = {}) {
  if (intent.resultKind === "detail") return bindDetailIntent(snapshot, intent, lookup, selections);
  const slots: Array<{key:string; request:SearchRequest}> = [];
  intent.metrics.forEach((term,i)=>slots.push({key:`metric_${i}`,request:{term,role:'metrics'}}));
  intent.dimensions?.forEach((term,i)=>slots.push({key:`dimension_${i}`,request:{term,role:'dimensions'}}));
  intent.filters?.forEach((f,i)=>slots.push({key:`filter_${i}`,request:{term:f.value,role:'values',object:f.object,property:f.property}}));
  if(intent.time) slots.push({key:'time',request:{term:intent.time.field,role:'time'}});
  const context = retrieveContext(snapshot,{namespace:snapshot.namespace,purpose:'PLAN',terms:slots.map(s=>s.request)},lookup);
  const chosen = new Map<string,ContextCandidate>();
  const clarifications: Array<{id:string;term:string;reason:string;candidates:Array<{id:string;label:string;object:string;property?:string}>}> = [];
  const missing: Array<{field:string;term:string;reason:string}> = [];
  slots.forEach((slot,i)=>{
    const binding=context.bindings[i]!;
    if(binding.status==='UNMATCHED') { missing.push({field:slot.key,term:slot.request.term,reason:context.retrieval.unmatchedTerms.find(t=>t.term===slot.request.term)?.reason ?? '未命中'}); return; }
    const candidates=binding.selected ? [binding.selected] : binding.candidates ?? [];
    if (slot.request.role === 'dimensions' && candidates.some(c=>!c.propertyId)) {
      missing.push({field:slot.key,term:slot.request.term,reason:'请配置对象主名称属性后重新查询'}); return;
    }
    const choiceId=(c:ContextCandidate)=>JSON.stringify([c.kind,c.id,c.propertyId]);
    const selected=selections[slot.key] ? candidates.find(c=>choiceId(c)===selections[slot.key]) : binding.selected;
    if(selected) chosen.set(slot.key,selected);
    else clarifications.push({id:slot.key,term:slot.request.term,reason:'请确认业务含义',candidates:candidates.map(c=>({id:choiceId(c),label:c.label,object:c.objectLabel,property:c.propertyLabel}))});
  });
  const shape: FixedQueryShape = {rootObjectId:chosen.get('metric_0')?.objectId ?? '',measureIds:[],dimensionPropertyIds:[],filters:[],sort:[],limit:intent.limit ?? 200};
  const summary = {metrics:[] as string[],dimensions:[] as string[],filters:[] as Array<{object:string;property:string;value:string}>,time:intent.time ? periods[intent.time.period] : undefined};
  for(const [key,c] of chosen) {
    if(key.startsWith('metric_')) {shape.measureIds.push(c.id);summary.metrics.push(c.label);}
    if(key.startsWith('dimension_') && c.propertyId) {shape.dimensionPropertyIds.push(c.propertyId);summary.dimensions.push(c.propertyLabel ?? c.label);}
    if(key.startsWith('filter_')) {shape.filters.push({propertyId:c.propertyId!,operator:'EQ',value:c.displayValue!});summary.filters.push({object:c.objectLabel,property:c.propertyLabel!,value:c.displayValue!});}
    if(key==='time') shape.timeRange={propertyId:c.propertyId!,expression:periods[intent.time!.period],kind:intent.time!.period};
  }
  for(const sort of intent.sort ?? []) {
    const matches=[...chosen.entries()].filter(([key,c])=>(key.startsWith('metric_') || key.startsWith('dimension_')) && [c.id,c.label,c.propertyId,c.propertyLabel,c.objectLabel].includes(sort.field));
    if(matches.length!==1) missing.push({field:'sort',term:sort.field,reason:'排序字段必须唯一对应已选择的指标或维度'});
    else {const [key,c]=matches[0]!;shape.sort.push({entityId:key.startsWith('metric_')?c.id:c.propertyId!,direction:sort.direction});}
  }
  return {shape,summary,clarifications,missing,context};
}
