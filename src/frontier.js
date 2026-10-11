import {campaignRules,missions} from './campaign-content.js';
import {getOperation,defenseContracts,operationSites} from './frontier-content.js';
import {siegeContracts,spawnSiegeBase} from './siege-content.js';
import {resetProductionForMission,onSiteSecured} from './production.js';
import {emptyFleet,deployFleet} from './fleet.js';
import {captureShip} from './ship-state.js';
import {structureHull} from './fortifications.js';
import {separateFromHull} from './hull.js';
import {returnToHarbor} from './campaign.js';
import {explorations} from './exploration-content.js';
import {afterExplorationTick} from './exploration.js';
import {atlasChart} from './atlas.js';
import {defenseWavePlan} from './defense-plans.js';
const emit=(g,e)=>{g.events.push(e);if(g.events.length>180)g.events.shift();};
export const frontierState=()=>({version:1,cleared:[],records:{},totalSeconds:0});
export function availableExplorations(g){const c=g.campaign;return c?explorations.filter(d=>d.chapter<=c.chapter&&c.completed.length>0&&(d.rank===0||c.frontier?.cleared.includes(`explore-${d.id.split('-')[1]}-1`))):[];}
export function availableDefenses(g) {
  const done=g.campaign.frontier?.cleared || [];
  return defenseContracts.filter(d=>d.chapter<=g.campaign.chapter && g.campaign.completed.length>0 && (d.rank===0 || done.includes(`defense-${d.id.split('-')[1]}-${d.rank}`)));
}
export function availableSieges(g) {
  if(!g.campaign)return [];
  const done=g.campaign.frontier?.cleared || [];
  return siegeContracts.filter(d=>d.chapter<=g.campaign.chapter && g.campaign.completed.length>0 && (!d.endgame||g.campaign.completed.length===missions.length) && (d.rank===0 || done.includes(`siege-${d.id.split('-')[1]}-${d.rank}`)));
}
export function launchDefense(g,id) {
  const def=getOperation(id),c=g.campaign;
  if(!c||g.phase!=='playing'||g.paused||c.stage!=='harbor'||!def||!(def.kind==='explore'?availableExplorations(g):def.kind==='siege'?availableSieges(g):availableDefenses(g)).some(d=>d.id===id))return false;
  if(!g.facilities.some(f=>(f.hp ?? 1)>0&&campaignRules.weapons[f.type].damage>0)){g.message='작동하는 공격 시설을 먼저 복구하거나 건설하세요.';return false;}
  if(['siege','explore'].includes(def.kind)&&(!g.facilities.some(f=>f.type==='shipyard'&&f.hp!==0)||!g.fleet?.units.some(u=>u.hp>0))){g.message='기지 공략과 탐험에는 조선소와 살아 있는 함대가 필요합니다.';return false;}
  g.fleet ||= emptyFleet();g.checkpoint=captureShip(g);c.frontier ||= frontierState();
  g.operation={version:1,id,kind:def.kind,chapter:def.chapter,round:0,waiting:true,result:null};
  if(def.kind==='defense')g.operation.defenseVersion=2;
  if(def.kind==='explore'){const chart=atlasChart(c,id),recorded=!!c.atlas?.charts[id]||!!c.frontier.records[id];Object.assign(g.operation,{layoutVersion:recorded?chart.layoutVersion||1:2,visible:[...chart.seen],scan:0});}
  const catalog=operationSites(id,g.operation.layoutVersion);
  Object.assign(g,{island:{x:0,z:0},heading:0,route:null,combat:false,enemies:[],catalog,sites:catalog.map(s=>({id:s.id,cleared:false})),events:[],accumulator:0});
  Object.assign(c,{stage:'operation',missionId:null,missionSeconds:0,objectiveIndex:0,objectiveProgress:0,waveIndex:0,encounterWave:0,nextWave:0,allyPosition:null,allyHull:0,allyMaxHull:0,pendingChoice:null,waitingForDeparture:true,hazards:[],hazardTimer:12,barrierSeconds:0,braceSeconds:0,slowSeconds:0,darknessSeconds:0,fortressBreaks:0,raidCount:0,buffs:{damage:0,protection:0,speed:0},bonusResearch:0,eliteNext:false,decisions:[],abilityCharges:{barrier:6,mend:4,pulse:8},abilityCooldowns:{barrier:0,mend:0,pulse:0,brace:0},missionStartKills:g.kills,missionStartHull:g.hull,resultReward:null});
  for(const f of g.facilities){f.hp ??=structureHull(f);f.cooldown=0;}
  resetProductionForMission(g);deployFleet(g);g.message=def.kind==='explore'?`${def.name}: 발견한 부표의 항로를 선택하세요. 함대를 보내 새 신호를 찾을 수 있습니다.`:def.kind==='siege'?`${def.name}: 함대를 정비하고 첫 거점 공략을 시작하세요.`:`${def.name}: 성벽과 함대를 배치한 뒤 첫 공세를 시작하세요.`;return true;
}
export function startDefenseWave(g) {
  const op=g.operation,def=getOperation(op?.id);if(!def||def.kind==='explore'||g.campaign.stage!=='operation'||!op.waiting||g.paused||g.phase!=='playing')return false;
  op.waiting=false;g.campaign.waitingForDeparture=false;g.combat=true;g.enemies=[];
  if(def.kind==='siege') {
    g.enemies=spawnSiegeBase(g,def);g.combat=false;g.campaign.waveIndex=op.round;g.campaign.objectiveIndex=op.round;g.campaign.encounterWave=0;
    emit(g,{type:'wave'});g.message=`${g.catalog[op.round].name}: 동력망을 끊고 지휘핵을 파괴하세요. 바다·적 우클릭으로 함대를 보내세요.`;return true;
  }
  const types=['crawler',...(def.chapter>=1?['skimmer']:[]),...(def.chapter>=2?['armored']:[]),...(def.chapter>=3?['spitter']:[]),...(def.chapter>=4?['bomber']:[])];
  const count=4+Math.min(8,def.chapter)+def.rank*2+op.round;
  const plan=op.defenseVersion===2?defenseWavePlan(def,op.round):null;
  for(let i=0;i<count;i++) {
    const group=def.pattern==='spear'?0:def.pattern==='pincer'?i%2:i%4,angle=group*(def.pattern==='pincer'?Math.PI:Math.PI/2)+op.round*0.48+(i%3-1)*0.16;
    let type=types[(i+op.round)%types.length];if(def.chapter>=3&&i===count-1)type='tender';if(def.chapter>=5&&i===count-2)type='bulwark';if(def.chapter>=7&&op.round%2===1&&i===count-3)type='carrier';
    if(plan)type=plan.enemies[i].type;
    const stats=campaignRules.enemies[type],hp=Math.round(stats.hp*(1.2+def.rank*0.2)*(1+def.chapter*0.5)**1.25);
    const p=plan?plan.enemies[i]:{x:Math.sin(angle)*(44+i%3*4),z:Math.cos(angle)*(44+i%3*4)};
    g.enemies.push({id:`${op.id}-${op.round}-${i}`,siteId:'defense-base',type,...separateFromHull(g,p,stats.radius),hp,maxHp:hp,active:true,rewarded:false,cooldown:0,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10});
  }
  g.campaign.waveIndex=op.round;g.campaign.encounterWave=op.round;emit(g,{type:'wave'});g.message=`${def.name} · 공세 ${op.round+1}/${def.waves}. 시설과 함대를 지키세요.`;return true;
}
export function afterDefenseTick(g,dt=1/60) {
  const op=g.operation,def=getOperation(op?.id);if(!def||g.campaign.stage!=='operation')return;
  if(g.hull<=0){g.phase='defeat';g.combat=false;g.message='섬의 중앙 기지가 침몰했습니다. 출항 전 배치로 복구할 수 있습니다.';return;}
  if(def.kind==='explore'){afterExplorationTick(g,dt);return;}
  if(op.waiting)return;
  if(def.kind==='siege') {
    const cores=g.enemies.filter(e=>e.type==='baseCore');if(!cores.length||cores.some(e=>e.hp>0))return;
    const site=g.catalog[op.round];g.sites[op.round].cleared=true;onSiteSecured(g,site);
    // Captured structures/guards cease fighting; no free kills or salvage.
    for(const e of g.enemies)if(e.hp>0){e.captured=true;e.active=false;e.pendingDamage=0;}
    for(const u of g.fleet?.units || []){u.command={type:'escort'};delete u.orders;u.waypoints=[];u.repath=0;}
    g.route=null;
  }else if(g.enemies.some(e=>e.hp>0))return;
  g.combat=false;
  if(op.round+1<def.waves){op.round++;op.waiting=true;g.campaign.waitingForDeparture=true;if(def.kind==='siege'){g.campaign.objectiveIndex=op.round;g.campaign.encounterWave=0;}g.message=def.kind==='siege'?'거점 확보. 함대를 섬으로 불러 정비하고 다음 기지를 공략하세요.':'공세 격퇴. 손상 시설을 복구하고 다음 공세를 시작하세요.';return;}
  const c=g.campaign,frontier=c.frontier,first=!frontier.cleared.includes(op.id),standing=g.facilities.filter(f=>(f.hp ?? structureHull(f))>0).length;
  const score=Math.round(100*(g.hull/g.maxHull*0.5+standing/Math.max(1,g.facilities.length)*0.5)),reward=first?def.reward:Math.floor(def.reward*0.4),research=first?def.research:0;
  if(first)frontier.cleared.push(op.id);frontier.totalSeconds+=c.missionSeconds;
  const record={seconds:c.missionSeconds,score,standing,kills:g.kills-c.missionStartKills};if(!frontier.records[op.id]||frontier.records[op.id].score<score)frontier.records[op.id]=record;
  const bonus=first?(c.bonusResearch || 0):0;if(first)c.surveyArchiveProgress=c.surveyProgress || 0;
  op.result={score,standing,total:g.facilities.length,first};c.research+=research+bonus;g.resources+=reward;g.earned+=reward;c.resultReward={resources:reward,research:research+bonus,bonusResearch:bonus,first};
  c.stage='operation-result';g.phase='mission-complete';g.sites[def.kind==='siege'?op.round:0].cleared=true;g.message=def.kind==='siege'?`${def.name} 확보 · 기지 3개 · 함대 ${g.fleet.units.filter(u=>u.hp>0).length}기 귀환`:`${def.name} 방어 성공 · 시설 ${standing}/${g.facilities.length} 보존 · 방어 점수 ${score}`;emit(g,{type:'missionComplete'});
}
export function retryDefense(g){const id=g.operation?.id;if(!id)return false;returnToHarbor(g,true);return launchDefense(g,id);}
