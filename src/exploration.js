import {campaignRules} from './campaign-content.js';
import {getExploration} from './exploration-content.js';
import {hullDistance,separateFromHull} from './hull.js';
import {onSiteSecured} from './production.js';
import {structureHull} from './fortifications.js';
import {bankExploration} from './atlas.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const emit=(g,e)=>{g.events.push(e);if(g.events.length>180)g.events.shift();};
export const isExploring=g=>g.operation?.kind==='explore';
export const knownSite=(g,id)=>!isExploring(g)||g.operation.visible.includes(id);
export const canExtract=g=>isExploring(g)&&g.operation.waiting&&!g.campaign.pendingChoice&&g.catalog.filter(s=>s.landmark).every(s=>g.sites.find(v=>v.id===s.id).cleared);
export function selectExplorationSite(g,id){
  const op=g.operation,c=g.campaign,def=getExploration(op?.id),index=g.catalog?.findIndex(s=>s.id===id);
  if(!def||g.phase!=='playing'||g.paused||!op.waiting||c.pendingChoice||!knownSite(g,id)||index<0||g.sites[index].cleared)return false;
  op.round=c.objectiveIndex=index;op.waiting=false;op.scan=0;c.encounterWave=0;c.nextWave=0;c.waitingForDeparture=false;g.route=null;g.combat=false;
  spawnExplorationWave(g);g.message=`${g.catalog[index].name}: 수비대를 격파한 뒤 함대로 조사하세요.`;return true;
}
function spawnExplorationWave(g){
  const op=g.operation,def=getExploration(op.id),site=g.catalog[op.round],wave=g.campaign.encounterWave;
  const pool=['crawler',...(def.chapter>=1?['skimmer']:[]),...(def.chapter>=2?['armored']:[]),...(def.chapter>=3?['spitter']:[]),...(def.chapter>=4?['bomber']:[])];
  const types=Array.from({length:3+Math.floor(def.chapter/3)+(wave%2)},(_,i)=>pool[(i+wave+op.round)%pool.length]);
  if(['battery','guardian'].includes(site.task))types[0]='nest';
  if(def.chapter>=3&&wave%2===1)types.push('tender');if(def.chapter>=5&&wave===0)types.push('bulwark');if(def.chapter>=7&&wave===1)types.push('carrier');
  if(g.campaign.eliteNext)types.push(def.chapter>=2?'armored':'crawler');
  g.enemies=types.map((type,i)=>{const stats=campaignRules.enemies[type],hp=Math.round(stats.hp*1.7*(1+def.chapter*0.6)**1.25*(1+def.rank*0.2)),p=separateFromHull(g,{x:site.x+(i%2?1:-1)*(6+Math.floor(i/2)*4),z:site.z-8+Math.floor(i/2)*4},stats.radius);return {id:`${op.id}-${op.round}-${wave}-${i}`,siteId:site.id,type,...p,hp,maxHp:hp,active:false,rewarded:false,cooldown:0,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10};});
  g.campaign.waveIndex++;emit(g,{type:'wave'});
}
export function afterExplorationTick(g,dt){
  const op=g.operation,c=g.campaign,site=g.catalog[op.round];
  for(const s of g.catalog)if(!op.visible.includes(s.id)&&(hullDistance(g,s)<=20||g.fleet.units.some(u=>u.hp>0&&dist(u,s)<=22))){op.visible.push(s.id);g.message=`신호 발견: ${s.name}. 정비 후 조사 항로를 선택할 수 있습니다.`;emit(g,{type:'research',...s,amount:1});}
  if(op.waiting||c.pendingChoice)return;
  if(g.enemies.some(e=>e.hp>0))return;
  g.combat=false;
  if(c.encounterWave+1<site.waves){c.nextWave+=dt;if(c.nextWave>=2){c.nextWave=0;c.encounterWave++;spawnExplorationWave(g);}return;}
  const near=hullDistance(g,site)<=4||g.fleet.units.some(u=>u.hp>0&&dist(u,site)<=6);
  op.scan=near?Math.min(2,op.scan+dt):0;if(op.scan<2)return;
  g.sites[op.round].cleared=true;onSiteSecured(g,site);op.waiting=true;g.route=null;c.waitingForDeparture=true;c.eliteNext=false;
  for(const id of site.neighbors)if(!op.visible.includes(id))op.visible.push(id);
  c.pendingChoice={site:op.round,kind:site.decision};g.message=`${site.name} 조사 완료. 회수품을 선택한 뒤 다음 항로를 고르세요.`;
}
export function finishExploration(g){
  if(!canExtract(g)||g.phase!=='playing'||g.paused)return false;
  const op=g.operation,c=g.campaign,def=getExploration(op.id),frontier=c.frontier,first=!frontier.cleared.includes(op.id),surveyed=g.sites.filter(s=>s.cleared).length,full=surveyed===g.catalog.length;
  const chart=bankExploration(g),standing=g.facilities.filter(f=>(f.hp ?? structureHull(f))>0).length,score=Math.round(50*g.hull/g.maxHull+50*surveyed/g.catalog.length),resources=(first?def.reward:Math.floor(def.reward*0.4))+(chart.chartReward?160+def.chapter*20:0),bonus=first||chart.newSurveys>0?c.bonusResearch:0,research=(first?def.research:0)+(chart.chartReward?2:0)+bonus;
  if(first)frontier.cleared.push(op.id);if(first||chart.newSurveys>0)c.surveyArchiveProgress=c.surveyProgress || 0;frontier.totalSeconds+=c.missionSeconds;
  if(!frontier.records[op.id]||frontier.records[op.id].score<score)frontier.records[op.id]={seconds:c.missionSeconds,score,standing,kills:g.kills-c.missionStartKills,surveyed};
  op.result={first,score,standing,total:g.facilities.length,surveyed,full,...chart};g.resources+=resources;g.earned+=resources;c.research+=research;c.resultReward={first,resources,research,bonusResearch:bonus};c.stage='operation-result';g.phase='mission-complete';g.route=null;g.combat=false;
  g.message=`${def.name}: ${surveyed}/8 지점 지도 기록을 가지고 귀환합니다.`;emit(g,{type:'missionComplete'});return true;
}
