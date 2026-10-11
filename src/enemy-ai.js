import {closestHullPoint,separateFromHull} from './hull.js';

export const enemySupportRadius=17;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function supportTarget(g,e) {
  const allies=g.enemies.filter(a=>a!==e&&a.hp>0&&a.active&&!a.captured&&a.siteId===e.siteId&&distance(e,a)<=32);
  const wounded=allies.filter(a=>a.hp<a.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||distance(e,a)-distance(e,b)||a.id.localeCompare(b.id));
  if(wounded.length)return wounded[0];
  // Keep pace with the local assault instead of waiting at the island edge.
  return allies.filter(a=>!['tender','generator','baseCore','seaWall','supplyDepot'].includes(a.type)).sort((a,b)=>distance(a,g.island)-distance(b,g.island)||a.id.localeCompare(b.id))[0];
}
export function steerEnemy(g,e,target,stats,dt,physicalHull,worldLimit) {
  const ally=e.type==='tender'?supportTarget(g,e):null,goal=ally||target;
  const contact=physicalHull&&goal===g.island?closestHullPoint(g,e):goal;
  const d=distance(e,contact),minimum=ally?0:stats.standoff||0;
  const stop=ally?enemySupportRadius-4:Math.max(0,stats.range-0.5);
  const retreat=d<minimum;
  if(!retreat&&d<=stop)return;
  const gap=retreat?minimum-d:d-stop,step=Math.min(stats.speed*dt,gap);
  if(step<=0)return;
  // A fixed fallback makes an exact overlap finite and replayable.
  const dx=d>1e-9?(contact.x-e.x)/d:1,dz=d>1e-9?(contact.z-e.z)/d:0,sign=retreat?-1:1;
  e.x=Math.max(-worldLimit,Math.min(worldLimit,e.x+dx*step*sign));
  e.z=Math.max(-worldLimit,Math.min(worldLimit,e.z+dz*step*sign));
  if(physicalHull)Object.assign(e,separateFromHull(g,e,stats.radius,p=>Math.abs(p.x)<=worldLimit&&Math.abs(p.z)<=worldLimit));
}
