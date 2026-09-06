import {expect,it} from 'vitest';
import {graphLayout,edgeAnchor} from '../../apps/console/src/graph-layout.js';
it('centers the highest degree node independent of catalog order and keeps cards separated',()=>{
 const graph={nodes:['leaf3','leaf1','hub','leaf2'].map(id=>({id})),edges:['leaf1','leaf2','leaf3'].map(target=>({source:'hub',target}))};
 const a=graphLayout(graph),b=graphLayout({...graph,nodes:[...graph.nodes].reverse()});
 expect(a.positions).toEqual(b.positions);expect(a.positions.hub).toEqual({x:a.width/2,y:a.height/2});
 const points=Object.values(a.positions);for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)expect(Math.abs(points[i]!.x-points[j]!.x)>=132||Math.abs(points[i]!.y-points[j]!.y)>=54).toBe(true);
});
it('handles empty and disconnected graphs and anchors edges on card boundaries',()=>{
 expect(graphLayout({nodes:[],edges:[]}).positions).toEqual({});
 const layout=graphLayout({nodes:Array.from({length:30},(_,i)=>({id:String(i)})),edges:[]});
 expect(Object.keys(layout.positions)).toHaveLength(30);for(const p of Object.values(layout.positions)){expect(p.x).toBeGreaterThan(66);expect(p.y).toBeGreaterThan(27);expect(p.y).toBeLessThan(layout.height-27);}
 expect(edgeAnchor({x:100,y:100},{x:300,y:100})).toEqual({x:166,y:100});expect(edgeAnchor({x:100,y:100},{x:100,y:300})).toEqual({x:100,y:127});
});
