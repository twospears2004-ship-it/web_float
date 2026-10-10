import {campaignRules} from './campaign-content.js';
import {closestHullPoint} from './hull.js';
import {structurePosition,wallIntersection} from './walls.js';
const baseHull={wall:180,mine:70,shipyard:180,cannon:140,mortar:155,rail:150,frost:130,shield:170,workshop:150,crane:120,fishery:105,farm:110,laboratory:130};
export const structureHull=f=>Math.round((baseHull[f.type] || 140)*(1+(f.level-1)*0.25));
export const structureRepairCost=f=>Math.ceil((structureHull(f)-(f.hp ?? structureHull(f)))*0.08);
export function repairStructure(g,id) {
  const f=g.facilities.find(f=>f.id===id),cost=f?structureRepairCost(f):0;
  if(!f||!g.campaign||g.phase!=='playing'||g.paused||g.combat||g.route||(g.operation?.kind==='defense'&&!g.operation.waiting)||cost<=0||g.resources<cost)return false;
  const power=facility=>['wall','mine'].includes(facility.type)?0:campaignRules.weapons[facility.type].power+Math.floor((facility.level-1)/2);
  const capacity=5+g.campaign.chapter+(g.campaign.tech.reactor || 0)*2+(g.campaign.tech.distributed || 0);
  if(f.hp===0&&g.facilities.filter(other=>other.hp!==0).reduce((n,other)=>n+power(other),0)+power(f)>capacity){g.message='시설 복구에 필요한 전력이 부족합니다. 배치 구성을 조정하세요.';return false;}
  g.resources-=cost;f.hp=structureHull(f);g.message=`시설 복구 완료. 자원 ${cost} 사용.`;return true;
}
export function defenseTarget(g,e) {
  if(g.operation?.kind!=='defense')return g.island;
  const living=g.facilities.filter(f=>(f.hp ?? structureHull(f))>0);
  const targets=living.filter(f=>f.type!=='wall').map(f=>({...f,facilityId:f.id,...structurePosition(g,f)}));
  const distance=p=>Math.hypot(p.x-e.x,p.z-e.z);
  const target=e.type==='armored'?g.island:targets.filter(f=>f.type!=='wall').sort((a,b)=>distance(a)*(e.type==='bomber'&&['farm','fishery','crane','laboratory'].includes(a.type)?0.65:1)-distance(b)*(e.type==='bomber'&&['farm','fishery','crane','laboratory'].includes(b.type)?0.65:1))[0] || g.island;
  const blocks=living.filter(f=>f.type==='wall').map(f=>({f,hit:wallIntersection(g,f,e,target)})).filter(b=>b.hit).sort((a,b)=>a.hit.t-b.hit.t);
  const block=blocks[0],selected=block?{...block.f,facilityId:block.f.id,...block.hit}:target,shore=closestHullPoint(g,e),stats=campaignRules.enemies[e.type];
  // Interior buildings cannot be reached through the physical deck. Attack the
  // hull instead of walking forever against its edge when no wall is in range.
  return selected!==g.island&&Math.hypot(selected.x-shore.x,selected.z-shore.z)>stats.range+stats.radius?g.island:selected;
}
