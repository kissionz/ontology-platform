type Definitions = {objects:Array<{id:string;name:string;label:string;sourceTableId:string;properties:Array<{id:string;name:string;label:string;sourceColumn:string}>}>;metrics:Array<{id:string;name:string;label:string}>};
export function businessExpression(expression:string, snapshot:Definitions, objectId:string) {
 const names=new Map<string,string>();
 for(const object of snapshot.objects){const table=object.sourceTableId.split(':').slice(1).join(':');for(const p of object.properties){names.set(p.id,p.label);for(const alias of [object.name,table].filter(Boolean)){names.set(`${alias}.${p.sourceColumn}`,p.label);names.set(`\`${alias}\`.\`${p.sourceColumn}\``,p.label);}}}
 for(const p of snapshot.objects.find(o=>o.id===objectId)?.properties??[]){names.set(p.name,p.label);names.set(p.sourceColumn,p.label);names.set(`\`${p.sourceColumn}\``,p.label);}
 for(const m of snapshot.metrics){names.set(m.id,m.label);if(!names.has(m.name))names.set(m.name,m.label);}
 const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const keys=[...names.keys()].filter(Boolean).sort((a,b)=>b.length-a.length);
 const pattern=keys.length?new RegExp(`(?<![A-Za-z0-9_.])(?:${keys.map(escape).join('|')})(?![A-Za-z0-9_.])`,'g'):undefined;
 // SQL 字符串常量保持原样，仅替换定义引用和常用函数名称。
 return expression.split(/('(?:''|[^'])*')/g).map((part,i)=>i%2?part:(pattern?part.replace(pattern,key=>`【${names.get(key)}】`):part).replace(/\b(SUM|AVG|MIN|MAX|COUNT|NULLIF)\s*\(/gi,(_,fn:string)=>`${({SUM:'求和',AVG:'平均值',MIN:'最小值',MAX:'最大值',COUNT:'计数',NULLIF:'空值保护'} as Record<string,string>)[fn.toUpperCase()]}(`)).join('');
}
export function sourceTableLabel(id:string){return id.includes(':')?id.slice(id.indexOf(':')+1):id;}
