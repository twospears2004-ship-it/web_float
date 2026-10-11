import {unitTypes} from './fleet-content.js';
import {generatorPowers} from './siege-content.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const fleetTargetingModes={
  auto:{name:'기본 대응',hint:'폭발 해파리·복구 해수·모체를 먼저 상대합니다.'},
  nearest:{name:'가까운 적',hint:'가장 가까운 적을 상대하며 먼 지원선을 쫓지 않습니다.'},
  support:{name:'지원 적',hint:'복구 해수·모체·방호 해수를 먼저 상대합니다.'},
  armored:{name:'장갑 적',hint:'현재 장갑이 높은 적부터 상대합니다. 관통 무장에 적합합니다.'},
  weakest:{name:'손상 적',hint:'남은 내구도가 적은 적부터 마무리합니다.'},
  power:{name:'동력망',hint:'살아 있는 기지에 전력을 보내는 동력기를 먼저 끊고 지휘핵·기지 방어탑을 제압합니다.'},
};
export const armedUnit=u=>unitTypes[u.type]?.damage>0;
export function setFleetTargeting(g,ids,mode){
  if(!g.campaign||!g.fleet||g.phase!=='playing'||g.paused||g.campaign.pendingChoice||!Array.isArray(ids)||!Object.hasOwn(fleetTargetingModes,mode))return false;
  const units=g.fleet.units.filter(u=>u.hp>0&&armedUnit(u)&&ids.includes(u.id));
  if(!units.length||units.every(u=>(u.targeting||'auto')===mode))return false;
  for(const u of units){if(mode==='auto')delete u.targeting;else u.targeting=mode;}
  if(mode!=='auto')g.fleet.version=Math.max(g.fleet.version,mode==='power'?5:3);
  g.message=`공격 함선 ${units.length}기: 자동 사격 ${fleetTargetingModes[mode].name}. 직접 지정한 공격과 예약은 유지됩니다.`;return true;
}
export function automaticFleetTarget(g,u,stats,enemyStats){
  const command=u.command?.type||'escort';
  const candidates=g.enemies.filter(e=>e.hp>0&&!e.captured&&(e.active||command==='attackMove')&&distance(u,e)<=stats.range+(['hold','guard'].includes(command)?0:9));
  // Missing settings retain the original sort, including stable equal-distance
  // ordering. Explicit attacks and repair patients are chosen by their own rules.
  if(!u.targeting)return candidates.sort((a,b)=>(['bomber','tender','carrier'].includes(a.type)?0:1)-(['bomber','tender','carrier'].includes(b.type)?0:1)||distance(u,a)-distance(u,b))[0];
  // Reuse the actual live supply links, including split and shared buses.
  // A spent generator never outranks a remaining core or defense tower.
  const suppliers=u.targeting==='power'?new Set(candidates.filter(e=>e.type==='generator'&&g.enemies.some(target=>generatorPowers(e,target))).map(e=>e.id)):null;
  const rank=e=>u.targeting==='power'?(suppliers.has(e.id)?0:['baseCore','gunTower'].includes(e.type)?1:2):u.targeting==='support'?(['tender','carrier','bulwark'].includes(e.type)?0:1):u.targeting==='armored'?-(enemyStats(g,e).armor||0):u.targeting==='weakest'?e.hp:0;
  return candidates.sort((a,b)=>rank(a)-rank(b)||distance(u,a)-distance(u,b)||String(a.id).localeCompare(String(b.id)))[0];
}
