export type Point = {x:number;y:number};
export type LayoutGraph = {nodes:Array<{id:string}>;edges:Array<{source:string;target:string}>};
export function graphLayout(graph:LayoutGraph) {
 const nodes=graph.nodes.slice(0,30); const ids=new Set(nodes.map(n=>n.id));
 const edges=graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target);
 const neighbors=new Map(nodes.map(n=>[n.id,new Set<string>()]));
 for(const e of edges){neighbors.get(e.source)!.add(e.target);neighbors.get(e.target)!.add(e.source);}
 const sorted=[...nodes].sort((a,b)=>neighbors.get(b.id)!.size-neighbors.get(a.id)!.size||a.id.localeCompare(b.id));
 const columns=Math.max(5,Math.ceil(Math.sqrt(nodes.length*1.5))|1); const rows=Math.max(5,Math.ceil(nodes.length/columns)|1);
 const width=columns*180+20,height=rows*110+10,center={x:width/2,y:height/2};
 const slots:Point[]=[];
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)slots.push({x:center.x+(c-(columns-1)/2)*180,y:center.y+(r-(rows-1)/2)*110});
 const distance=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2;
 slots.sort((a,b)=>distance(a,center)-distance(b,center));
 const positions:Record<string,Point>={};
 for(const n of sorted){let best=0,cost=Infinity;for(let i=0;i<slots.length;i++){const p=slots[i]!;const linked=[...neighbors.get(n.id)!].filter(id=>positions[id]);const value=linked.reduce((v,id)=>v+distance(p,positions[id]!),0)+distance(p,center)*(linked.length?0.1:1);if(value<cost){cost=value;best=i;}}positions[n.id]=slots.splice(best,1)[0]!;}
 const cross=(a:Point,b:Point,c:Point,d:Point)=>{const side=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0;};
 const score=()=>{let total=0;for(let i=0;i<edges.length;i++){const e=edges[i]!;const a=positions[e.source]!,b=positions[e.target]!;total+=distance(a,b);for(let j=i+1;j<edges.length;j++){const f=edges[j]!;if(new Set([e.source,e.target,f.source,f.target]).size===4&&cross(a,b,positions[f.source]!,positions[f.target]!))total+=1e7;}for(const n of nodes){if(n.id===e.source||n.id===e.target)continue;const p=positions[n.id]!;const t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/distance(a,b)));const q={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};if(Math.abs(q.x-p.x)<75&&Math.abs(q.y-p.y)<35)total+=2e6;}}return total;};
 // 固定最高度节点，交换外围位置，优先消除交叉与穿过节点的连线。
 let best=edges.length>80?0:score();for(let pass=0;pass<(edges.length>80?0:4);pass++){let changed=false;for(let i=1;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){const a=sorted[i]!.id,b=sorted[j]!.id;[positions[a],positions[b]]=[positions[b]!,positions[a]!];const next=score();if(next<best){best=next;changed=true;}else [positions[a],positions[b]]=[positions[b]!,positions[a]!];}if(!changed)break;}
 return {positions,width,height,hubId:sorted[0]?.id};
}
export function edgeAnchor(a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)return a;const ratio=Math.min(dx?66/Math.abs(dx):Infinity,dy?27/Math.abs(dy):Infinity);return {x:a.x+dx*ratio,y:a.y+dy*ratio};}
