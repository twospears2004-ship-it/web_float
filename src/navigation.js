import {hullDistance,separateFromHull} from './hull.js';
import {fixedEnemyRadius} from './siege-content.js';
const step=3.4,limit=31,key=(x,z)=>`${x},${z}`;
export function clearLine(g,a,b,radius=1,blockers=[]) {
  const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/1));
  for(let i=1;i<=count;i++)if(!navigable(g,{x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count},radius,blockers))return false;
  return true;
}
export function navigable(g,p,radius=1,blockers=[]) {
  if(Math.abs(p.x)>109 || Math.abs(p.z)>109 || hullDistance(g,p)<radius+0.1)return false;
  return !g.enemies.some(e=>e.hp>0&&fixedEnemyRadius(e)>0&&Math.hypot(p.x-e.x,p.z-e.z)<fixedEnemyRadius(e)+radius+0.1)&&!blockers.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<radius+other.radius+0.1);
}
export function waterPoint(g,p,radius=1,occupied=[]) {
  const safe=q=>navigable(g,q,radius)&&occupied.every(other=>Math.hypot(q.x-other.x,q.z-other.z)>=radius+other.radius+1.3-1e-9);
  if(safe(p))return {x:p.x,z:p.z};
  let point={x:Math.max(-107,Math.min(107,p.x)),z:Math.max(-107,Math.min(107,p.z))};
  point=separateFromHull(g,point,radius+0.25,safe);
  for(let pass=0;pass<3;pass++)for(const e of g.enemies)if(e.hp>0&&fixedEnemyRadius(e)>0) {
    const dx=point.x-e.x,dz=point.z-e.z,d=Math.hypot(dx,dz),r=fixedEnemyRadius(e)+radius+0.2;
    if(d<r){point.x=e.x+(d?dx/d:1)*r;point.z=e.z+(d?dz/d:0)*r;}
  }
  point={x:Math.max(-109,Math.min(109,point.x)),z:Math.max(-109,Math.min(109,point.z))};
  if(safe(point))return point;
  // Clamping a shore/fortress projection can put it back inside a collider.
  // Search nearby water only in that exceptional case, before issuing a route.
  for(let ring=1;ring<=110;ring++) {
    let best=null,distance=Infinity;
    const consider=(dx,dz)=>{const q={x:point.x+dx*2,z:point.z+dz*2},d=dx*dx+dz*dz;if(d<distance&&safe(q)){best=q;distance=d;}};
    for(let i=-ring;i<=ring;i++){consider(i,-ring);consider(i,ring);if(Math.abs(i)<ring){consider(-ring,i);consider(ring,i);}}
    if(best)return best;
  }
  return point;
}
function nearbyCell(g,p,radius,blockers) {
  const x=Math.round(p.x/step),z=Math.round(p.z/step);let best=null,distance=Infinity;
  for(let r=0;r<=6&&!best;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++) {
    const cell={x:x+dx,z:z+dz};if(Math.abs(cell.x)>limit||Math.abs(cell.z)>limit)continue;
    const world={x:cell.x*step,z:cell.z*step},d=Math.hypot(world.x-p.x,world.z-p.z);
    if(d<distance&&navigable(g,world,radius,blockers)&&clearLine(g,p,world,radius,blockers)){best=cell;distance=d;}
  }
  return best;
}
export function waterPath(g,from,destination,radius=1,blockers=[]) {
  let goal=waterPoint(g,destination,radius);
  if(!navigable(g,goal,radius,blockers))goal=waterPoint(g,goal,radius,blockers);
  if(!navigable(g,goal,radius,blockers)||!navigable(g,from,radius,blockers))return [];
  if(clearLine(g,from,goal,radius,blockers))return [goal];
  const start=nearbyCell(g,from,radius,blockers),end=nearbyCell(g,goal,radius,blockers);if(!start||!end)return [];
  const heuristic=p=>Math.hypot(p.x-end.x,p.z-end.z),open=[{...start,cost:0,score:heuristic(start)}],costs=new Map([[key(start.x,start.z),0]]),previous=new Map(),closed=new Set();
  while(open.length) {
    open.sort((a,b)=>a.score-b.score || a.cost-b.cost);const current=open.shift(),id=key(current.x,current.z);if(closed.has(id))continue;
    if(current.x===end.x&&current.z===end.z) {
      const path=[{x:end.x*step,z:end.z*step}];let cursor=id;
      while(previous.has(cursor)){const p=previous.get(cursor);path.push({x:p.x*step,z:p.z*step});cursor=key(p.x,p.z);}
      path.reverse();path.push(goal);return path.length<=128?path:[];
    }
    closed.add(id);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const next={x:current.x+dx,z:current.z+dz},nextId=key(next.x,next.z);if(Math.abs(next.x)>limit||Math.abs(next.z)>limit||closed.has(nextId))continue;
      if(!navigable(g,{x:next.x*step,z:next.z*step},radius,blockers) || (dx&&dz&&(!navigable(g,{x:current.x*step,z:next.z*step},radius,blockers)||!navigable(g,{x:next.x*step,z:current.z*step},radius,blockers))))continue;
      if(!clearLine(g,{x:current.x*step,z:current.z*step},{x:next.x*step,z:next.z*step},radius,blockers))continue;
      const cost=current.cost+Math.hypot(dx,dz);if(cost>=(costs.get(nextId)??Infinity))continue;
      costs.set(nextId,cost);previous.set(nextId,current);open.push({...next,cost,score:cost+heuristic(next)});
    }
  }
  return [];
}
