import {DatabaseSync} from 'node:sqlite';
import {afterEach,expect,it} from 'vitest';
import {OntologyPlatform} from '../../packages/application/src/index.js';
import {SqlitePlatformStore} from '../../adapters/ontology-store-sqlite/src/index.js';
import {finalizeSnapshot,runKernel} from '../../packages/domain/src/index.js';
import {RELATION_RULES,relationJoinExpression} from '../../packages/domain/src/relations.js';
import {QueryIrCompiler} from '../../packages/sql-selectdb/src/index.js';
import type {OntologyRelation} from '../../packages/contracts/src/index.js';
import type {OntologySnapshot,PhysicalTable} from '../../packages/contracts/src/legacy.js';
import {validSnapshot,physicalTables} from '../fixtures-v3.js';
const disposers:Array<()=>void>=[];
afterEach(()=>disposers.splice(0).forEach(f=>f()));
function definition(type:OntologyRelation['type']) {
 const s=validSnapshot();const r=s.relations[0]!;r.type=type;
 if(type==='IDENTITY'){r.sourcePropertyId='p_order_id';r.cardinality='ONE_TO_ONE';}
 if(type==='HIERARCHY')s.objects[0]!.objectType='ENTITY';
 if(type==='COMPOSITION')r.composition={parentObjectId:'o_store',childObjectId:'o_order',ownership:'OWNED',aggregationPolicy:'PRE_AGGREGATE_CHILD'};
 r.joinExpression=relationJoinExpression(s,r);return s;
}
function fixture(s=definition('REFERENCE')) {
 const store=new SqlitePlatformStore(':memory:');const db=new DatabaseSync(':memory:');disposers.push(()=>{store.close();db.close();});
 expect(runKernel(s).issues).toEqual([]);store.savePublished(finalizeSnapshot(s));physicalTables().forEach(t=>store.putPhysicalTable('selectdb',t));
 db.exec("ATTACH DATABASE ':memory:' AS retail; CREATE TABLE retail.orders(order_id TEXT,store_ref TEXT,sales REAL); CREATE TABLE retail.store(store_id TEXT,store_name TEXT,dept_ref TEXT); CREATE TABLE retail.dept(dept_id TEXT,dept_name TEXT,bu_ref TEXT); CREATE TABLE retail.bu(bu_id TEXT,bu_name TEXT); INSERT INTO retail.orders VALUES('a','a',100),('b','a',200),('c','missing',50); INSERT INTO retail.store VALUES('a','一店','d'),('b','二店','d'); INSERT INTO retail.dept VALUES('d','一部','u'); INSERT INTO retail.bu VALUES('u','线上事业部');");
 store.replaceIndexedValues('retail',1,'o_store','p_store_name',[{displayValue:'一店',frequency:1}]);
 const executed:Array<{sql:string;parameters:unknown[];rows:unknown[]}> = [];
 const executor={execute:async(sql:string,parameters:unknown[])=>{const rows=db.prepare(sql).all(...parameters as string[]);executed.push({sql,parameters,rows});return {rows,columns:Object.keys(rows[0]??{}),rowCount:rows.length,truncated:false};}};
 return {store,db,executed,executor,app:new OntologyPlatform(store,executor)};
}
const shape={rootObjectId:'o_order',measureIds:['m_sales'],dimensionPropertyIds:['p_store_name'],filters:[],sort:[]};
it.each(Object.keys(RELATION_RULES) as OntologyRelation['type'][])('%s: published axiom and actual Mock SQL behavior',async type=>{
 const s=definition(type);const {app,executed}=fixture(s);const kernel=runKernel(s);
 expect(kernel.axioms.some(a=>a.subjectId==='r_order_store'&&a.axiomCode===RELATION_RULES[type])).toBe(true);
 const result=await app.executeSemanticQuery({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:shape,options:{includeAxioms:true,includeSqlPreview:true}});
 if(type==='DERIVED') {expect(result.status).toBe('REJECTED');expect(executed).toHaveLength(0);expect(kernel.inferences.some(i=>i.predicate==='RELATION_LINEAGE'&&i.premiseAssertionIds.includes('r_order_store'))).toBe(true);return;}
 expect(result.status).toBe('SUCCEEDED');
 const rows=(result.data as any).rows;
 expect(rows).toEqual(expect.arrayContaining(type==='IDENTITY'?[{店铺名称:'一店',销售额:100},{店铺名称:'二店',销售额:200},{店铺名称:null,销售额:50}]:[{店铺名称:'一店',销售额:300},{店铺名称:null,销售额:50}]));
 expect(rows.reduce((sum:number,r:any)=>sum+r.销售额,0)).toBe(350);
 expect(executed).toHaveLength(1);expect(executed[0]!.sql).toContain('LEFT JOIN');
 expect((result.data as any).axioms.some((a:any)=>a.subjectId==='r_order_store'&&a.axiomCode===RELATION_RULES[type])).toBe(true);
});
it('HIERARCHY: a three-hop filter executes and excludes unmatched organizational paths',async()=>{
 const {app,executed}=fixture();
 const result=await app.executeSemanticQuery({namespace:'retail',queryMode:'INTENT',intent:{metrics:['销售额'],dimensions:['事业部']},options:{includeQueryIr:true}});
 expect(result.status).toBe('SUCCEEDED');expect((result.data as any).rows).toEqual([{事业部名称:'线上事业部',销售额:300}]);expect((result.data as any).queryIr.relationIds).toHaveLength(3);expect(executed).toHaveLength(1);
});
it('COMPOSITION PRE_AGGREGATE_CHILD: parent dimensions aggregate child measures without multiplying rows',async()=>{
 const {app,executed}=fixture(definition('COMPOSITION'));
 const result=await app.executeSemanticQuery({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:{...shape,rootObjectId:'o_store'},options:{includeQueryIr:true}});
 expect(result.status).toBe('SUCCEEDED');expect((result.data as any).queryIr.rootObjectId).toBe('o_order');expect((result.data as any).rows).toEqual(expect.arrayContaining([{店铺名称:'一店',销售额:300},{店铺名称:null,销售额:50}]));expect(executed).toHaveLength(1);
});
it('COMPOSITION EXISTS_ONLY: compiler executes parameterized EXISTS and blocks dimension expansion',async()=>{
 const s=definition('COMPOSITION');s.relations[0]!.composition!.aggregationPolicy='EXISTS_ONLY';const {app,executor,executed}=fixture(s);
 const compiled=new QueryIrCompiler().compile({...shape,title:'存在性筛选',resultKind:'aggregate',dimensionPropertyIds:[],filters:[{kind:'BOUND_VALUE',valueBindingId:'v1',objectId:'o_store',propertyId:'p_store_name',operator:'EQ',value:'一店',businessValue:'一店',evidenceTier:'EXACT_VALUE',objectPriority:50,propertyPriority:50}]},s as unknown as OntologySnapshot,physicalTables() as unknown as PhysicalTable[]);
 expect(compiled.sql).toContain('EXISTS (');expect(compiled.parameters).toEqual(['一店']);
 expect((await executor.execute(compiled.sql,compiled.parameters)).rows).toEqual([{销售额:300}]);
 const expanded=await app.executeSemanticQuery({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:shape});expect(expanded.status).toBe('REJECTED');expect(executed).toHaveLength(1);
});
it('COMPOSITION EXISTS_ONLY: records the current INTENT filter integration limitation without querying data',async()=>{
 const s=definition('COMPOSITION');s.relations[0]!.composition!.aggregationPolicy='EXISTS_ONLY';const {app,executed}=fixture(s);
 const r=await app.executeSemanticQuery({namespace:'retail',queryMode:'INTENT',intent:{metrics:['销售额'],filters:[{object:'店铺',value:'一店'}]}});
 expect(r.status).toBe('NEEDS_INPUT');expect((r.data as any).missing[0].reason).toContain('没有可安全使用的关联路径');expect(executed).toHaveLength(0);
});
it.each(['REFERENCE','ASSOCIATION','COMPOSITION','HIERARCHY','EVENT_PARTICIPATION','IDENTITY','DERIVED'] as const)('%s: invalid type-specific configuration cannot be published',type=>{
 const s=definition(type), {app}=fixture(s),draft=app.createDraft('retail');const r={...s.relations[0]!};
 if(type==='REFERENCE'){r.targetPropertyId='p_store_name';}
 if(type==='ASSOCIATION'){r.cardinality='ONE_TO_ONE';}
 if(type==='COMPOSITION'){r.composition={...r.composition!,parentObjectId:'o_dept'};}
 if(type==='HIERARCHY'){r.targetObjectId='o_order';r.targetPropertyId='p_order_id';}
 if(type==='EVENT_PARTICIPATION'){r.sourcePropertyId='p_order_id';}
 if(type==='IDENTITY'){r.cardinality='MANY_TO_ONE';}
 if(type==='DERIVED'){r.targetObjectId='o_order';r.targetPropertyId='p_order_id';}
 r.joinExpression=relationJoinExpression(s,r);
 const edited=app.applyDraftPatch('retail',draft.draftId,draft.revision,[{op:'UPSERT_RELATION',value:r}]);expect(edited.validation.valid).toBe(false);expect(()=>app.publishDraft('retail',draft.draftId,1)).toThrow();
});
it('REFERENCE required: publication changes SQL rows while the previous version stays unchanged',async()=>{
 const {app}=fixture();const query=(version:number)=>app.executeSemanticQuery({namespace:'retail',ontologyVersion:version,queryMode:'FIXED_SHAPE',queryShape:shape,options:{includeSqlPreview:true}});
 const before=await query(1);const draft=app.createDraft('retail');app.applyDraftPatch('retail',draft.draftId,draft.revision,[{op:'UPSERT_RELATION',value:{...draft.snapshot.relations[0]!,required:true}}]);app.publishDraft('retail',draft.draftId,1);
 const after=await query(2);expect((after.data as any).rows).toEqual([{店铺名称:'一店',销售额:300}]);expect((after.data as any).sqlPreview.sql).toContain('INNER JOIN');expect((await query(1)).data).toMatchObject({rows:(before.data as any).rows});
});
it.each(['disabled','reverse','many-to-many'] as const)('ASSOCIATION %s: unsafe traversal never executes Mock SQL',async mode=>{
 const s=definition('ASSOCIATION'),r=s.relations[0]!;
 if(mode==='disabled')r.enabled=false;if(mode==='reverse')r.direction='TARGET_TO_SOURCE';if(mode==='many-to-many')r.cardinality='MANY_TO_MANY';
 const {app,executed}=fixture(s);const result=await app.executeSemanticQuery({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:shape});expect(result.status).toBe('REJECTED');expect(executed).toHaveLength(0);
});
it('IDENTITY boundary: declared uniqueness is not a runtime data uniqueness check',async()=>{
 const {app,db}=fixture(definition('IDENTITY'));
 db.exec("INSERT INTO retail.store VALUES('a','重复标识店铺','d');");
 const result=await app.executeSemanticQuery({namespace:'retail',queryMode:'FIXED_SHAPE',queryShape:shape});
 expect(result.status).toBe('SUCCEEDED');expect((result.data as any).rows.reduce((sum:number,row:any)=>sum+row.销售额,0)).toBe(450);
});
it('COMPOSITION OWNED rejects assigning one child object to two parent objects',()=>{
 const s=definition('COMPOSITION');const second={...s.relations[0]!,id:'r_second_parent',targetObjectId:'o_dept',targetPropertyId:'p_dept_id',composition:{...s.relations[0]!.composition!,parentObjectId:'o_dept'}};second.joinExpression=relationJoinExpression(s,second);s.relations.push(second);
 expect(runKernel(s).issues.some(i=>i.code==='RELATION_COMPOSITION'&&i.message.includes('独占'))).toBe(true);
});
