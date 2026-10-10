// Local ship economy. Production follows exploration, battle and discoveries;
// an idle harbor never generates currency or research.
import {campaignRules} from './campaign-content.js';
import balance from './balance.json' with {type:'json'};
import {atlasHasSurvey} from './atlas.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const position=(g,f)=>({x:g.island.x+f.x*balance.tileSize,z:g.island.z+f.z*balance.tileSize});
const emit=(g,e)=>{g.events.push(e);if(g.events.length>180)g.events.shift();};
export const productionTypes=['crane','fishery','farm','laboratory'];
export const productionRules=campaignRules.production;
export function productionStats(f,g) {
  const p=productionRules;
  const precision=g?.campaign?.tech.precision || 0,cartography=g?.campaign?.tech.cartography || 0,multiplier=1+(g?.campaign?.tech.cultivation || 0)*0.2+cartography*0.1,range=campaignRules.weapons[f.type].range;
  return {range:range>0?range+(f.level-1)*balance.upgradeRangePerLevel+(f.type==='crane'?precision*3:0):0,
    recovery:Math.min(p.recoveryMax,p.recoveryBase+(f.level-1)*p.recoveryPerLevel+precision*0.1),catchValue:Math.round((p.catchBase+(f.level-1)*p.catchPerLevel)*multiplier),
    catchCap:Math.round((p.catchCapBase+(f.level-1)*p.catchCapPerLevel)*multiplier),cropValue:Math.round((p.cropBase+(f.level-1)*p.cropPerLevel)*multiplier),samples:1+Math.floor((f.level-1)/3)+cartography};
}
export function atShore(g,f) {
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>!g.tiles.some(t=>t.x===f.x+x&&t.z===f.z+z));
}
function produce(g,f,amount) {
  f.stock=(f.stock || 0)+amount;f.totalProduced=(f.totalProduced || 0)+amount;
  emit(g,{type:'production',...position(g,f),amount});
}
export function resetProductionForMission(g) {
  g.campaign.surveyedTasks=[];g.campaign.surveyProgress=g.campaign.surveyArchiveProgress || 0;
  for(const f of g.facilities)if(f.type==='fishery'){f.travel=0;f.catchUsed=0;}
}
export function onSailed(g,from) {
  if(!(g.campaign?.stage==='mission'||(g.campaign?.stage==='operation'&&['siege','explore'].includes(g.operation?.kind)&&!g.operation.waiting)) || g.campaign.waitingForDeparture || g.campaign.pendingChoice)return;
  const sailed=distance(from,g.island);if(!sailed)return;
  for(const f of g.facilities)if(f.type==='fishery' && f.hp!==0 && atShore(g,f)) {
    const stats=productionStats(f,g);if((f.catchUsed || 0)>=stats.catchCap)continue;
    f.travel=(f.travel || 0)+sailed;
    while(f.travel>=productionRules.catchDistance && (f.catchUsed || 0)<stats.catchCap) {
      f.travel-=productionRules.catchDistance;const amount=Math.min(stats.catchValue,stats.catchCap-(f.catchUsed || 0));
      f.catchUsed=(f.catchUsed || 0)+amount;produce(g,f,amount);
    }
    f.travel=Math.min(productionRules.catchDistance-0.001,f.travel);
  }
}
export function salvageBonus(g,e,reward) {
  if(!g.campaign)return 0;
  const cranes=g.facilities.filter(f=>f.type==='crane' && f.hp!==0 && distance(position(g,f),e)<=productionStats(f,g).range).sort((a,b)=>b.level-a.level || a.id-b.id);
  const f=cranes[0];if(!f)return 0;
  const pos=position(g,f);f.aim=Math.atan2(e.x-pos.x,e.z-pos.z);
  const bonus=Math.floor(reward*productionStats(f,g).recovery);f.totalProduced=(f.totalProduced || 0)+bonus;
  if(bonus)emit(g,{type:'production',...position(g,f),amount:bonus});return bonus;
}
export function onSiteSecured(g,site) {
  for(const f of g.facilities)if(f.type==='farm' && f.hp!==0) {
    f.cropProgress=(f.cropProgress || 0)+1;
    if(f.cropProgress>=productionRules.cropObjectives){f.cropProgress=0;produce(g,f,productionStats(f,g).cropValue);}
  }
  const c=g.campaign,exploring=g.operation?.kind==='explore';if(c.completed.includes(c.missionId) || (exploring?atlasHasSurvey(c,g.operation.id,site.id):g.operation&&c.frontier?.cleared.includes(g.operation.id)) || (c.surveyedTasks || []).includes(site.task))return;
  const lab=g.facilities.filter(f=>f.type==='laboratory' && f.hp!==0 && distance(position(g,f),site)<=productionStats(f,g).range).sort((a,b)=>b.level-a.level || a.id-b.id)[0];
  if(!lab)return;
  c.surveyedTasks ||= [];c.surveyedTasks.push(site.task);c.surveyProgress=(c.surveyProgress || 0)+productionStats(lab,g).samples;
  while(c.surveyProgress>=productionRules.studyBatch){c.surveyProgress-=productionRules.studyBatch;c.bonusResearch++;}
  emit(g,{type:'research',...position(g,lab),amount:productionStats(lab,g).samples});
  g.message=`해상 연구소: ${site.name} 조사 완료. 표본 ${c.surveyProgress}/${productionRules.studyBatch} · 완료 시 추가 연구 ${c.bonusResearch}`;
}
