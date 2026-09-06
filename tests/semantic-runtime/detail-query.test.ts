import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { OntologyPlatform } from '../../packages/application/src/index.js';
import { SqlitePlatformStore } from '../../adapters/ontology-store-sqlite/src/index.js';
import { ExecuteSemanticQueryInputSchema, type OntologySnapshotV3 } from '../../packages/contracts/src/index.js';
import { finalizeSnapshot } from '../../packages/domain/src/index.js';
import { validSnapshot, physicalTables, property } from '../fixtures-v3.js';
const cleanup: Array<()=>void> = [];
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
function setup(change?: (snapshot:OntologySnapshotV3)=>void) {
 const snapshot=validSnapshot();
 snapshot.objects[0]!.properties.push(property('p_note','备注','TEXT',{visibility:'DETAIL_ONLY'}),property('p_secret','内部标记','TEXT',{visibility:'HIDDEN'}),property('p_sensitive','敏感内容','TEXT',{sensitive:true}));
 change?.(snapshot);
 const store=new SqlitePlatformStore(':memory:'); cleanup.push(()=>store.close());store.savePublished(finalizeSnapshot(snapshot));
 const tables=physicalTables();tables[0]!.columns.push(...['note','secret','sensitive'].map(name=>({name,dataType:'VARCHAR',nullable:true,sensitive:name==='sensitive'})));
 tables.forEach(table=>store.putPhysicalTable('selectdb',table));
 store.replaceIndexedValues('retail',1,'o_store','p_store_name',[{displayValue:'线上店',frequency:2}]);
 const db=new DatabaseSync(':memory:');cleanup.push(()=>db.close());
 db.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT,order_date TEXT,store_ref TEXT,sales REAL,cost REAL,note TEXT,secret TEXT,sensitive TEXT); CREATE TABLE retail.store(store_id TEXT,store_name TEXT,dept_ref TEXT); CREATE TABLE retail.dept(dept_id TEXT,dept_name TEXT,bu_ref TEXT); CREATE TABLE retail.bu(bu_id TEXT,bu_name TEXT); INSERT INTO retail.orders VALUES('1','2026-03-01','s',100,60,'备注1','keep','secret'),('2','2026-03-01','s',100,60,'备注2','drop','secret'),('3','2025-03-01','x',200,80,'备注3','keep','secret'); INSERT INTO retail.store VALUES('s','线上店','d'),('x','线下店','d'); INSERT INTO retail.dept VALUES('d','销售部','b'); INSERT INTO retail.bu VALUES('b','事业部A');");
 let calls=0;const sqls:string[]=[];
 const executor={execute:async(sql:string,parameters:unknown[],maxRows:number)=>{calls++;sqls.push(sql);const result=db.prepare(sql);const rows=result.all(...parameters as string[]);return {columns:result.columns().map(column=>column.name),rows,rowCount:rows.length,truncated:rows.length===maxRows};}};
 const app=new OntologyPlatform(store,executor,()=>new Date('2026-09-06T00:00:00Z'));
 const query=(shape:unknown,more={})=>app.executeSemanticQuery(ExecuteSemanticQueryInputSchema.parse({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:{rootObjectId:'o_order',resultKind:'detail',...shape as object},...more}));
 const intent=(input:unknown)=>app.executeSemanticQuery(ExecuteSemanticQueryInputSchema.parse({namespace:'retail',intent:{resultKind:'detail',object:'订单',...input as object}}));
 return {app,store,db,query,intent,calls:()=>calls,sqls};
}
it('returns every readable root property including detail-only fields, preserving duplicate projected rows',async()=>{
 const {query,sqls}=setup();const all=await query({});
 expect(all.status).toBe('SUCCEEDED');expect((all.data as any).columns).toContain('备注');expect((all.data as any).columns).not.toContain('内部标记');expect(JSON.stringify(all.data)).not.toContain('secret');
 expect((all.data as any).rows).toHaveLength(3);
 const projected=await query({selectPropertyIds:['p_sales'],filters:[{propertyId:'p_order_date',operator:'GTE',value:'2026-01-01'}]});
 expect((projected.data as any).rows).toEqual([{销售金额:100},{销售金额:100}]);
 expect(sqls.join('\n')).not.toMatch(/GROUP BY|DISTINCT|SUM\(/);
});
it('joins all explicitly included objects and exposes unambiguous column bindings',async()=>{
 const {query}=setup(snapshot=>{snapshot.objects[0]!.properties[0]!.label='编码';snapshot.objects[1]!.properties[0]!.label='编码';});
 const result=await query({includeObjectIds:['o_store']});expect(result.status).toBe('SUCCEEDED');
 expect((result.data as any).rows[0]).toMatchObject({'订单·编码':'1','店铺·编码':'s','订单·销售金额':100});
 expect((result.data as any).columnBindings.find((column:any)=>column.key==='店铺·编码')).toMatchObject({objectId:'o_store',propertyId:'p_store_id'});
 expect((result.data as any).columns).not.toContain('部门·部门名称');
});
it('binds detail object, fields, indexed values and time in one request with multi-hop joins',async()=>{
 const {intent,calls}=setup();
 const result=await intent({includeObjects:['事业部'],fields:['销售金额',{object:'事业部',property:'事业部名称'},'备注'],filters:[{object:'店铺',property:'店铺名称',value:'线上店'}],time:{field:'业务日期',period:'CURRENT_YEAR'}});
 expect(result.status).toBe('SUCCEEDED');expect(calls()).toBe(1);expect((result.data as any).rows).toHaveLength(2);expect((result.data as any).rows[0]).toMatchObject({'订单·销售金额':100,'事业部·事业部名称':'事业部A','订单·备注':'备注1'});
});
it('supports direct name-based comparisons without requiring a value index',async()=>{
 const {intent}=setup();const result=await intent({fields:['订单 ID','备注'],filters:[{property:'业务日期',operator:'LT',value:'2026-01-01'}]});
 expect((result.data as any).rows).toEqual([{'订单 ID':'3',备注:'备注3'}]);
});
it('requires expansion opt-in for reverse one-to-many joins',async()=>{
 const {query,calls}=setup(snapshot=>{snapshot.relations[0]!.direction='BIDIRECTIONAL';});
 const shape={rootObjectId:'o_store',selectPropertyIds:['p_store_name','p_order_id']};
 const blocked=await query(shape);expect(blocked.status).not.toBe('SUCCEEDED');expect(calls()).toBe(0);
 const allowed=await query({...shape,allowFanout:true});expect(allowed.status).toBe('SUCCEEDED');expect((allowed.data as any).rows).toHaveLength(3);
});
it('keeps forbidden fields and lineage or EXISTS-only relations out of detail output',async()=>{
 const {query,intent,calls}=setup();
 for(const id of ['p_secret','p_sensitive','missing']) expect((await query({selectPropertyIds:[id]})).status).not.toBe('SUCCEEDED');
 expect((await intent({fields:['内部标记']})).status).toBe('NEEDS_INPUT');expect(calls()).toBe(0);
 for(const policy of ['DERIVED','EXISTS_ONLY','DISABLED']) {
  const instance=setup(snapshot=>{const relation=snapshot.relations[0]!;if(policy==='DERIVED')relation.type='DERIVED';else if(policy==='DISABLED')relation.enabled=false;else{relation.type='COMPOSITION';relation.composition={parentObjectId:'o_store',childObjectId:'o_order',ownership:'OWNED',aggregationPolicy:'EXISTS_ONLY'};}});
  expect((await instance.query({includeObjectIds:['o_store'],allowFanout:true})).status).not.toBe('SUCCEEDED');expect(instance.calls()).toBe(0);
 }
});
it('preserves default row restrictions even when their property is hidden',async()=>{
 const {query}=setup(snapshot=>{snapshot.objects[0]!.defaultFilter="orders.secret = 'keep'";});
 const result=await query({selectPropertyIds:['p_order_id']});expect(result.status).toBe('SUCCEEDED');expect((result.data as any).rows).toEqual([{'订单 ID':'1'},{'订单 ID':'3'}]);
});
it('paginates raw rows with stable ordering and binds the cursor to the chosen fields',async()=>{
 const {query}=setup();const first=await query({selectPropertyIds:['p_order_id'],limit:2});
 expect((first.data as any).rows).toEqual([{'订单 ID':'1'},{'订单 ID':'2'}]);
 const cursor=first.completeness.nextCursor!;
 const second=await query({selectPropertyIds:['p_order_id'],limit:2},{pagination:{cursor}});
 expect((second.data as any).rows).toEqual([{'订单 ID':'3'}]);
 expect((await query({selectPropertyIds:['p_sales'],limit:2},{pagination:{cursor}})).status).not.toBe('SUCCEEDED');
});
it('clarifies duplicate object names then ambiguous relation paths, preserving earlier selections and version',async()=>{
 const {app,intent,store,calls}=setup(snapshot=>{
  snapshot.objects[0]!.synonyms.push('交易');snapshot.objects[1]!.synonyms.push('交易');
  snapshot.relations.push({...snapshot.relations[0]!,id:'r_alt',name:'备用店铺关联'});
 });
 let result=await intent({object:'交易',includeObjects:['店铺']});expect(result.status).toBe('NEEDS_CLARIFICATION');expect(calls()).toBe(0);
 const first=(result.data as any);result=await app.continueSemanticQuery(first.clarificationId,{object:'o_order'});
 expect(result.status).toBe('NEEDS_CLARIFICATION');const second=(result.data as any);const choice=second.clarifications[0];
 store.savePublished({...store.getSnapshot('retail',1)!,version:2});
 result=await app.continueSemanticQuery(second.clarificationId,{[choice.id]:choice.candidates[0].id});
 expect(result.status).toBe('SUCCEEDED');expect(result.ontologyVersion).toBe(1);expect(calls()).toBe(1);
});
it('does not silently accept aggregate-only calculations in detail mode',async()=>{
 const {query,calls}=setup();
 for(const extra of [{measureIds:['m_sales']},{timeGrain:{unit:'DAY',propertyId:'p_order_date'}},{aggregateFilters:[{entityId:'p_sales',operator:'GT',value:0}]}]) expect((await query(extra)).status).not.toBe('SUCCEEDED');
 expect(calls()).toBe(0);
});
