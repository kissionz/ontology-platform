import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { OntologyPlatform } from '../../packages/application/src/index.js';
import { SqlitePlatformStore } from '../../adapters/ontology-store-sqlite/src/index.js';
import { ExecuteSemanticQueryInputSchema } from '../../packages/contracts/src/index.js';
import { finalizeSnapshot } from '../../packages/domain/src/index.js';
import { validSnapshot, physicalTables } from '../fixtures-v3.js';
const cleanup: Array<()=>void> = [];
afterEach(()=>cleanup.splice(0).forEach(f=>f()));
function setup(ambiguous=false) {
 const snapshot=validSnapshot();
 if(ambiguous) {snapshot.metrics[0]!.synonyms.push('金额'); snapshot.metrics[1]!.synonyms.push('金额');}
 const store=new SqlitePlatformStore(':memory:');cleanup.push(()=>store.close());store.savePublished(finalizeSnapshot(snapshot));physicalTables().forEach(t=>store.putPhysicalTable('selectdb',t));
 store.replaceIndexedValues('retail',1,'o_bu','p_bu_name',[{displayValue:'线上渠道',frequency:1}]);
 const db=new DatabaseSync(':memory:');cleanup.push(()=>db.close());
 db.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT,order_date TEXT,store_ref TEXT,sales REAL,cost REAL); CREATE TABLE retail.store(store_id TEXT,store_name TEXT,dept_ref TEXT); CREATE TABLE retail.dept(dept_id TEXT,dept_name TEXT,bu_ref TEXT); CREATE TABLE retail.bu(bu_id TEXT,bu_name TEXT); INSERT INTO retail.orders VALUES('1','2026-03-01','s',100,60),('2','2025-03-01','s',200,80); INSERT INTO retail.store VALUES('s','店铺','d'); INSERT INTO retail.dept VALUES('d','部门','b'); INSERT INTO retail.bu VALUES('b','线上渠道');");
 let calls=0;
 const executor={execute:async(sql:string,parameters:unknown[])=>{calls++; const rows=db.prepare(sql).all(...parameters as string[]);return {columns:Object.keys(rows[0]??{}),rows,rowCount:rows.length,truncated:false};}};
 const app=new OntologyPlatform(store,executor,()=>new Date('2026-09-06T00:00:00Z'));
 return {app,store,executor,calls:()=>calls};
}
it('executes business intent through multihop joins and a time period in one call',async()=>{
 const {app,calls}=setup();
 const input=ExecuteSemanticQueryInputSchema.parse({namespace:'retail',intent:{metrics:['销售额'],filters:[{value:'线上渠道'}],time:{field:'业务日期',period:'CURRENT_YEAR'}}});
 const r=await app.executeSemanticQuery(input);
 expect(r.status).toBe('SUCCEEDED');expect((r.data as any).rows).toEqual([{销售额:100}]);expect(calls()).toBe(1);
 expect((r.data as any).businessSummary.filters[0]).toEqual({object:'事业部',property:'事业部名称',value:'线上渠道'});
 expect((r.data as any).ontologyContext).toBeUndefined();expect((r.data as any).sqlPreview).toBeUndefined();
});
it('groups by object names and sorts a bound measure without a second mapping request',async()=>{
 const {app}=setup();const r=await app.executeSemanticQuery(ExecuteSemanticQueryInputSchema.parse({namespace:'retail',intent:{metrics:['销售额'],dimensions:['事业部'],sort:[{field:'销售额',direction:'DESC'}]}}));
 expect(r.status).toBe('SUCCEEDED');expect((r.data as any).rows).toEqual([{事业部名称:'线上渠道',销售额:300}]);
});
it('does not execute incomplete scopes or ignore invalid sorting',async()=>{
 const {app,calls}=setup();
 for(const intent of [{metrics:['销售额'],filters:[{value:'线上渠道',object:'部门'}]},{metrics:['销售额'],sort:[{field:'未知',direction:'DESC'}]}]) {
 const r=await app.executeSemanticQuery(ExecuteSemanticQueryInputSchema.parse({namespace:'retail',intent}));expect(r.status).toBe('NEEDS_INPUT');}
 expect(calls()).toBe(0);
});
it('persists ambiguous intent and continues with the original version after a new publication',async()=>{
 const {app,store,executor,calls}=setup(true);
 const r=await app.executeSemanticQuery(ExecuteSemanticQueryInputSchema.parse({namespace:'retail',intent:{metrics:['金额']}}));
 expect(r.status).toBe('NEEDS_CLARIFICATION');expect(calls()).toBe(0);
 const data=r.data as any;const choice=data.clarifications[0].candidates.find((c:any)=>c.label==='销售额');
 store.savePublished(validSnapshot('retail',2));
 const restarted=new OntologyPlatform(store,executor,()=>new Date('2026-09-06T00:01:00Z'));
 await expect(restarted.continueSemanticQuery(data.clarificationId,{metric_0:'invalid'})).rejects.toThrow();
 const result=await restarted.continueSemanticQuery(data.clarificationId,{metric_0:choice.id});
 expect(result.status).toBe('SUCCEEDED');expect(result.ontologyVersion).toBe(1);expect((result.data as any).rows).toEqual([{销售额:300}]);expect(calls()).toBe(1);
});
