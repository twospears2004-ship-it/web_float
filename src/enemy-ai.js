import {closestHullPoint,separateFromHull} from './hull.js';

export const enemySupportRadius=17;
export const enemyProtectionRadius=14;
export const enemyReinforcementLimit=3;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const enemyRepairRate=(g,stats)=>(stats.repair||0)*(1+(g.campaign?.chapter||0)*0.25);
export function repairsEnemy(source,enemy) {
  if(source===enemy||source.hp<=0||!source.active||source.captured||enemy.hp<=0||enemy.captured||enemy.hp>=enemy.maxHp||distance(source,enemy)>=enemySupportRadius)return false;
  // Mobile repair ships support their engaged assault. Stationary generators
  // retain their existing siege supply behavior, including idle structures.
  return source.type!=='tender'||enemy.active&&source.siteId===enemy.siteId;
}
export function enemyReinforcement(enemy,stats) {
  if(enemy.type!=='carrier')return null;
  const remaining=Math.max(0,enemyReinforcementLimit-(enemy.spawnCount||0)),seconds=Math.max(0,enemy.spawnTimer);
  const status=!remaining?'exhausted':!enemy.active?'waiting':!stats.spawn?'blocked':enemy.slowSeconds>0&&enemy.slowFactor<1?'slowed':'preparing';
  return {remaining,seconds,status};
}
const localAllies=(g,e)=>g.enemies.filter(a=>a!==e&&a.hp>0&&a.active&&!a.captured&&a.siteId===e.siteId&&distance(e,a)<=32);
export const protectsEnemy=(source,enemy)=>source!==enemy&&source.type==='bulwark'&&source.hp>0&&source.active&&!source.captured&&enemy.type!=='bulwark'&&enemy.hp>0&&!enemy.captured&&source.siteId===enemy.siteId&&distance(source,enemy)<enemyProtectionRadius;
export function enemyProtector(g,enemy) {
  if(!g.campaign||enemy.type==='bulwark'||enemy.hp<=0||enemy.captured)return null;
  return g.enemies.find(e=>protectsEnemy(e,enemy))||null;
}
export function bulwarkWard(g,e,target) {
  if(e.type!=='bulwark'||e.hp<=0||!e.active||e.captured)return null;
  const priority=a=>a.type==='tender'?0:a.type==='carrier'?1:2;
  const allies=localAllies(g,e).filter(a=>!['bulwark','generator','baseCore','seaWall','supplyDepot','gunTower','nest'].includes(a.type));
  // A lone shield/repair pair must keep attacking. Mutual support-following
  // otherwise leaves both waiting forever outside their own firing range.
  if(!allies.some(a=>a.type!=='tender'))return null;
  return allies
    .sort((a,b)=>priority(a)-priority(b)||a.hp/a.maxHp-b.hp/b.maxHp||distance(a,target)-distance(b,target)||a.id.localeCompare(b.id))[0]||null;
}
function supportTarget(g,e) {
  const allies=localAllies(g,e);
  const wounded=allies.filter(a=>a.hp<a.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||distance(e,a)-distance(e,b)||a.id.localeCompare(b.id));
  if(wounded.length)return wounded[0];
  // Keep pace with the local assault instead of waiting at the island edge.
  return allies.filter(a=>!['tender','generator','baseCore','seaWall','supplyDepot'].includes(a.type)).sort((a,b)=>distance(a,g.island)-distance(b,g.island)||a.id.localeCompare(b.id))[0];
}
export function steerEnemy(g,e,target,stats,dt,physicalHull,worldLimit) {
  const ally=e.type==='tender'?supportTarget(g,e):null,ward=bulwarkWard(g,e,target);
  // Cover the support ship from its threat-facing side without teleporting it
  // or changing movement speed. Fast attackers can still leave this bubble.
  const wd=ward?distance(ward,target):0;
  const shieldPoint=ward?{x:ward.x+(wd>1e-9?(target.x-ward.x)/wd:1)*6,z:ward.z+(wd>1e-9?(target.z-ward.z)/wd:0)*6}:null;
  const goal=shieldPoint||ally||target;
  const contact=physicalHull&&goal===g.island?closestHullPoint(g,e):goal;
  const d=distance(e,contact),minimum=ally||ward?0:stats.standoff||0;
  const stop=ward?0.5:ally?enemySupportRadius-4:Math.max(0,stats.range-0.5);
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
