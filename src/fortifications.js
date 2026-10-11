import {campaignRules} from './campaign-content.js';
import {closestHullPoint} from './hull.js';
import {structurePosition,wallIntersection} from './walls.js';
const baseHull={wall:180,mine:70,shipyard:180,cannon:140,mortar:155,rail:150,frost:130,shield:170,workshop:150,crane:120,fishery:105,farm:110,laboratory:130};
export const structureHull=f=>Math.round((baseHull[f.type] || 140)*(1+(f.level-1)*0.25));
export const structureRepairCost=f=>Math.ceil((structureHull(f)-(f.hp ?? structureHull(f)))*0.08);
const structurePower=f=>['wall','mine'].includes(f.type)?0:campaignRules.weapons[f.type].power+Math.floor((f.level-1)/2);
const serviceBlock=g=>!g.campaign?'캠페인에서 사용할 수 있습니다.':g.phase!=='playing'?'항해를 계속한 뒤 정비하세요.':g.paused?'일시정지를 해제하면 정비할 수 있습니다.':g.campaign.pendingChoice?'회수품을 선택한 뒤 정비하세요.':g.combat?'교전을 마친 뒤 정비하세요.':g.route?'항해를 마친 뒤 정비하세요.':g.operation&&!g.operation.waiting?'공세를 격퇴한 뒤 정비하세요.':'';
const servicePower=g=>({used:g.facilities.filter(f=>f.hp!==0).reduce((n,f)=>n+structurePower(f),0),capacity:5+(g.campaign?.chapter||0)+(g.campaign?.tech?.reactor||0)*2+(g.campaign?.tech?.distributed||0)});
export function structureRepairPlan(g){
  const damaged=g.facilities.filter(f=>structureRepairCost(f)>0),destroyed=damaged.filter(f=>f.hp===0),cost=damaged.reduce((n,f)=>n+structureRepairCost(f),0),power=servicePower(g),restoredPower=power.used+destroyed.reduce((n,f)=>n+structurePower(f),0);
  let reason=serviceBlock(g);
  if(!reason&&!damaged.length)reason='복구할 시설이 없습니다.';
  if(!reason&&destroyed.length&&restoredPower>power.capacity)reason='전체 복구 후 전력이 부족합니다. 시설을 개별 복구하거나 배치 구성을 조정하세요.';
  if(!reason&&g.resources<cost)reason=`자원이 ${cost-g.resources} 부족합니다. 우선 필요한 시설을 개별 복구하세요.`;
  return {count:damaged.length,cost,usedPower:power.used,restoredPower,capacity:power.capacity,available:!reason,reason};
}
export function repairAllStructures(g){
  const plan=structureRepairPlan(g);if(!plan.available)return false;
  // Charge exactly the sum of the existing per-building rounded prices. The
  // whole plan is checked before payment or revival; timers and stock survive.
  g.resources-=plan.cost;
  for(const f of g.facilities)if(structureRepairCost(f)>0)f.hp=structureHull(f);
  g.message=`시설 ${plan.count}개 복구 완료. 자원 ${plan.cost} 사용.`;return true;
}
export function repairStructure(g,id) {
  const f=g.facilities.find(f=>f.id===id),cost=f?structureRepairCost(f):0;
  if(!f||serviceBlock(g)||cost<=0||g.resources<cost)return false;
  const power=servicePower(g);
  if(f.hp===0&&power.used+structurePower(f)>power.capacity){g.message='시설 복구에 필요한 전력이 부족합니다. 배치 구성을 조정하세요.';return false;}
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
