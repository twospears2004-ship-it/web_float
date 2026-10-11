import { missions, getMission, missionSites, campaignRules, technologies } from './campaign-content.js';
import { fieldDecisions } from './expedition-content.js';
import {unitTypes,fleetRules,unitRefits} from './fleet-content.js';
import {guardCycle} from './fleet.js';
import {emptyFleet,controlGroupNumbers} from './fleet.js';
import {fleetTargetingModes,armedUnit} from './fleet-targeting.js';
import {migrateAtlas,atlasSummary} from './atlas.js';
import {getExploration,explorationSites,explorations} from './exploration-content.js';
import {getOperation,operationSites,frontierOperations} from './frontier-content.js';
import {structureHull} from './fortifications.js';
import {wallEdges,wallKey,wallEdge,migrateWalls} from './walls.js';
import {validEnemySlows} from './enemy-control.js';
import {coolingStats} from './field-control.js';

export const SAVE_KEY = 'tidehold.campaign.v1';
export const BACKUP_KEY = 'tidehold.campaign.v1.backup';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const finite = (n, min = 0, max = 1e8) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const integer = (n, min, max) => Number.isInteger(n) && finite(n, min, max);
function checksum(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(16); }
function position(p, bound = 180) { return p && finite(p.x, -bound, bound) && finite(p.z, -bound, bound); }
const validExplorationLayout=(d,version)=>d?.endgame?version===3:version===undefined||[1,2].includes(version);
const reconstructionReady=(c,d)=>!d?.endgame||d.kind!=='explore'||c.completed?.length===missions.length&&c.frontier?.cleared.includes(`explore-${d.id.split('-')[1]}-2`);
function validateAtlas(c){
  if(c.atlas===undefined)return;
  const a=c.atlas;check(a?.version===1&&a.charts&&typeof a.charts==='object'&&!Array.isArray(a.charts)&&Object.keys(a.charts).length<=explorations.length,'항로 기록 형식이 올바르지 않습니다.');
  for(const [id,r]of Object.entries(a.charts)){
    const d=getExploration(id);check(d&&c.frontier?.cleared.includes(id)&&d.chapter<=c.chapter,'보관한 항로를 복원할 수 없습니다.');
    check(r&&validExplorationLayout(d,r.layoutVersion),'보관한 탐험 지도 버전이 올바르지 않습니다.');
    check(reconstructionReady(c,d)&&(!d.endgame||r.legacySurveyed===0),'재건 탐험의 선행 항로 기록이 올바르지 않습니다.');
    const sites=explorationSites(d,r.layoutVersion||1),ids=new Set(sites.map(s=>s.id)),list=items=>Array.isArray(items)&&items.length<=8&&new Set(items).size===items.length&&items.every(v=>ids.has(v));
    check(r&&list(r.seen)&&r.seen.includes('explore-node-0')&&list(r.surveyed)&&sites.filter(s=>s.landmark).every(s=>r.surveyed.includes(s.id))&&r.surveyed.every(v=>r.seen.includes(v)),'보관한 조사 지점이 올바르지 않습니다.');
    check(integer(r.returns,1,100000)&&typeof r.fullRewarded==='boolean'&&integer(r.legacySurveyed,0,8)&&(r.legacySurveyed===0||r.legacySurveyed>=3)&&(!r.fullRewarded||r.surveyed.length===8||r.legacySurveyed>0)&&(r.surveyed.length<8||r.fullRewarded),'항로 귀환과 보상 기록이 올바르지 않습니다.');
    check(r.choices&&typeof r.choices==='object'&&!Array.isArray(r.choices)&&(r.legacySurveyed>0||Object.keys(r.choices).length===r.surveyed.length)&&Object.entries(r.choices).every(([site,option])=>r.surveyed.includes(site)&&fieldDecisions[sites.find(s=>s.id===site)?.decision]?.options.some(o=>o.id===option)),'보관한 회수품 선택이 올바르지 않습니다.');
  }
}
function validateFleet(fleet) {
  if(fleet===undefined)return; // Saves from before the fleet expansion remain valid.
  check([1,2,3,4,5].includes(fleet?.version)&&integer(fleet.nextId,1,1000001)&&Array.isArray(fleet.units)&&fleet.units.length<=fleetRules.maximum,'함대 형식 또는 정원이 올바르지 않습니다.');
  const ids=new Set();
  for(const u of fleet.units) {
    check(integer(u.id,1,fleet.nextId-1)&&!ids.has(u.id)&&Object.hasOwn(unitTypes,u.type)&&integer(u.level,1,6),'함대 식별자 또는 선종이 올바르지 않습니다.');ids.add(u.id);
    check(u.type!=='ward'||fleet.version>=4,'방호정이 포함된 함대 형식을 복원할 수 없습니다.');
    check(u.refit===undefined||fleet.version>=2&&typeof u.refit==='string'&&Object.hasOwn(unitRefits,u.refit)&&unitRefits[u.refit].type===u.type,'함대 개장 장비가 올바르지 않습니다.');
    check(u.targeting===undefined||fleet.version>=3&&armedUnit(u)&&typeof u.targeting==='string'&&u.targeting!=='auto'&&Object.hasOwn(fleetTargetingModes,u.targeting),'함대 자동 사격 우선순위가 올바르지 않습니다.');
    check(u.targeting!=='power'||fleet.version===5,'동력망 사격에 필요한 함대 형식이 올바르지 않습니다.');
    check(position(u,110)&&finite(u.maxHp,1,10000)&&finite(u.hp,0,u.maxHp)&&finite(u.heading,-Math.PI,Math.PI)&&finite(u.aim,-Math.PI,Math.PI)&&finite(u.cooldown,0,10)&&finite(u.repath,0,1),'함대 전투 상태가 올바르지 않습니다.');
    check(u.command&&['move','attackMove','attack','hold','escort','guard'].includes(u.command.type),'함대 명령을 복원할 수 없습니다.');
    if(['move','attackMove'].includes(u.command.type))check(position(u.command,110),'함대 이동 목표가 올바르지 않습니다.');
    if(u.command.type==='attack')check(typeof u.command.target==='string'&&u.command.target.length<100,'함대 공격 목표가 올바르지 않습니다.');
    if(u.command.type==='guard')check(integer(u.command.target,1,fleet.nextId-1)&&u.command.target!==u.id&&!guardCycle(fleet,[u.id],u.command.target),'함대 호위 목표가 올바르지 않습니다.');
    if(u.orders!==undefined)check(Array.isArray(u.orders)&&u.orders.length<=fleetRules.maximumQueuedOrders&&u.orders.every(order=>order&&(['move','attackMove'].includes(order.type)?position(order,110):order.type==='attack'&&typeof order.target==='string'&&order.target.length>0&&order.target.length<100)),'함대 예약 명령이 올바르지 않습니다.');
    check(Array.isArray(u.waypoints)&&u.waypoints.length<=128&&u.waypoints.every(p=>position(p,110)),'함대 항로가 올바르지 않습니다.');
  }
  if(fleet.groups!==undefined){
    check(fleet.groups&&typeof fleet.groups==='object'&&!Array.isArray(fleet.groups)&&Object.keys(fleet.groups).length<=controlGroupNumbers.length,'전대 편성 형식이 올바르지 않습니다.');
    for(const [number,members] of Object.entries(fleet.groups))check(/^[5-9]$/.test(number)&&Array.isArray(members)&&members.length<=fleetRules.maximum&&new Set(members).size===members.length&&members.every(id=>ids.has(id)),'전대의 번호 또는 함선이 올바르지 않습니다.');
  }
}
function validateShip(g) {
  validateFleet(g.fleet);
  check(finite(g.resources) && finite(g.maxHull, 1, 100000) && finite(g.hull, 0, g.maxHull), '자원 또는 내구도 값이 올바르지 않습니다.');
  check(Array.isArray(g.tiles) && g.tiles.length >= 9 && g.tiles.length <= 49, '섬의 타일 데이터가 올바르지 않습니다.');
  const slots = new Set();
  for (const t of g.tiles) { check(integer(t.x, -3, 3) && integer(t.z, -3, 3), '타일이 건설 범위를 벗어납니다.'); const key = `${t.x},${t.z}`; check(!slots.has(key), '중복 타일입니다.'); slots.add(key); }
  check(slots.has('0,0'), '중앙 기지가 없습니다.');
  const connected = new Set(['0,0']);
  let changed = true; while (changed) { changed = false; for (const t of g.tiles) if (!connected.has(`${t.x},${t.z}`) && [[1,0],[-1,0],[0,1],[0,-1]].some(([x,z]) => connected.has(`${t.x+x},${t.z+z}`))) { connected.add(`${t.x},${t.z}`); changed = true; } }
  check(connected.size === slots.size, '분리된 섬 타일입니다.');
  check(Array.isArray(g.facilities) && g.facilities.length <= 160, '시설 데이터가 올바르지 않습니다.');
  const occupied = new Set(), ids = new Set();
  for (const f of g.facilities) {
    check(Object.hasOwn(campaignRules.weapons,f.type) && integer(f.id, 1, 1000000) && integer(f.level, 1, 9), '시설 종류 또는 단계가 올바르지 않습니다.');
    check(f.type==='wall'?(f.edge===undefined||Object.hasOwn(wallEdges,f.edge)):f.edge===undefined,'시설의 타일 면이 올바르지 않습니다.');
    const tile=`${f.x},${f.z}`,key=f.type==='wall'?wallKey(f.x,f.z,wallEdge(f)):tile;
    check(integer(f.x,-3,3) && integer(f.z,-3,3) && slots.has(tile) && (f.type==='wall'||tile!=='0,0') && !occupied.has(key) && !ids.has(f.id), '시설 위치가 중복되거나 올바르지 않습니다.'); occupied.add(key); ids.add(f.id);
    check(finite(f.cooldown, 0, 10) && finite(f.aim, -Math.PI, Math.PI) && (f.targeting===undefined || ['nearest','support','armored','weakest'].includes(f.targeting)), '시설 공격 상태가 올바르지 않습니다.');
    check(f.investment===undefined || integer(f.investment,0,1000000),'시설 투자 기록이 올바르지 않습니다.');
    check(f.hp===undefined || finite(f.hp,0,structureHull(f)),'시설 내구도가 올바르지 않습니다.');
    for(const key of ['stock','catchUsed','totalProduced'])check(f[key]===undefined || integer(f[key],0,1e8),'시설 생산 기록이 올바르지 않습니다.');
    check((f.travel===undefined || finite(f.travel,0,50)) && (f.cropProgress===undefined || integer(f.cropProgress,0,2)),'시설 생산 진행이 올바르지 않습니다.');
  }
  check(integer(g.nextId, 1, 1000001) && [...ids].every(id => id < g.nextId), '시설 식별자 상태가 올바르지 않습니다.');
  for (const key of ['kills', 'earned', 'shots']) check(integer(g[key], 0, 1e8), '전투 기록이 올바르지 않습니다.');
}
export function validateCampaign(g) {
  check(g && typeof g === 'object' && g.campaign?.version === 1, '지원하지 않는 저장 형식입니다.');
  check(['direct', 'destination'].includes(g.mode), '이동 모드가 올바르지 않습니다.');
  check(['playing', 'defeat', 'mission-complete', 'campaign-complete'].includes(g.phase), '게임 단계가 올바르지 않습니다.');
  validateShip(g); check(position(g.island, 110) && finite(g.heading, -Math.PI, Math.PI) && finite(g.time), '항해 상태가 올바르지 않습니다.');
  const c = g.campaign;
  check(['harbor', 'mission', 'result','operation','operation-result'].includes(c.stage) && integer(c.chapter, 0, 11), '캠페인 진행 단계가 올바르지 않습니다.');
  const operation=getOperation(g.operation?.id),isOperation=['operation','operation-result'].includes(c.stage);
  check(isOperation ? operation&&g.operation.version===1&&g.operation.kind===operation.kind&&g.operation.chapter===operation.chapter&&integer(g.operation.round,0,operation.waves-1)&&typeof g.operation.waiting==='boolean'&&operation.chapter<=c.chapter : g.operation===undefined||g.operation===null,'외해 작전을 복원할 수 없습니다.');
  if(isOperation)check(g.operation.defenseVersion===undefined||(operation.kind==='defense'&&[1,2].includes(g.operation.defenseVersion)),'방어 공세 버전이 올바르지 않습니다.');
  if(isOperation)check(g.operation.siegeVersion===undefined||(operation.kind==='siege'&&[1,2].includes(g.operation.siegeVersion)),'기지 공략 편대 버전이 올바르지 않습니다.');
  if(c.frontier!==undefined) {
    const f=c.frontier;check(f?.version===1&&Array.isArray(f.cleared)&&f.cleared.length<=frontierOperations.length&&new Set(f.cleared).size===f.cleared.length&&f.cleared.every(id=>getOperation(id)&&getOperation(id).chapter<=c.chapter&&(!getOperation(id).endgame||c.completed.length===missions.length))&&finite(f.totalSeconds),'외해 진행이 올바르지 않습니다.');
    check(f.records&&Object.keys(f.records).every(id=>f.cleared.includes(id)&&finite(f.records[id].seconds)&&integer(f.records[id].score,0,100)&&integer(f.records[id].standing,0,160)&&integer(f.records[id].kills,0,10000)),'방어 작전 기록이 올바르지 않습니다.');
    check(Object.entries(f.records).every(([id,r])=>getOperation(id).kind!=='explore'||integer(r.surveyed,3,8)),'탐험 기록의 조사 수가 올바르지 않습니다.');
  }
  validateAtlas(c);
  check((c.frontier?.cleared||[]).every(id=>{const d=getExploration(id);return reconstructionReady(c,d)&&(!d?.endgame||!!c.atlas?.charts[id]);}),'재건 탐험의 선행 항로 기록이 올바르지 않습니다.');
  check(reconstructionReady(c,operation),'재건 탐험의 선행 항로 기록이 올바르지 않습니다.');
  const chartLevel=c.tech?.cartography||0;
  check(!chartLevel||atlasSummary(c).full>=(chartLevel===1?1:4),'항로 측량의 완성 해도가 부족합니다.');
  const coolingLevel=c.tech?.cryodynamics||0;
  check(!coolingLevel||(c.chapter>=4&&atlasSummary(c).full>=technologies.find(t=>t.id==='cryodynamics').charts[coolingLevel-1]),'빙해 제어의 설계도나 완성 해도가 부족합니다.');
  if(isOperation){check(!!c.frontier,'방어 진행 기록이 없습니다.');check(c.stage==='operation-result'?g.operation.result&&integer(g.operation.result.score,0,100)&&integer(g.operation.result.standing,0,160)&&integer(g.operation.result.total,0,160)&&typeof g.operation.result.first==='boolean':g.operation.result===null,'방어 결과가 올바르지 않습니다.');}
  check(typeof g.paused === 'boolean' && typeof g.combat === 'boolean', '일시정지 상태가 올바르지 않습니다.');
  check(c.waitingForDeparture===undefined || typeof c.waitingForDeparture==='boolean','현장 정비 상태가 올바르지 않습니다.');
  check(Array.isArray(c.completed) && c.completed.length <= missions.length && c.completed.every((id, i) => missions[i]?.id === id), '완료한 임무 순서가 올바르지 않습니다.');
  check(c.chapter === Math.min(11, Math.floor(c.completed.length / 6)), '해역 해금 상태가 올바르지 않습니다.');
  check(!operation?.endgame||c.completed.length===missions.length,'엔딩 이후 작전은 마지막 항로를 완료해야 합니다.');
  check(integer(c.research, 0, 100000) && finite(c.totalActiveSeconds) && finite(c.missionSeconds), '연구·시간 기록이 올바르지 않습니다.');
  check(c.tech && typeof c.tech === 'object' && Object.keys(c.tech).every(id => technologies.some(t => t.id === id && integer(c.tech[id], 0, t.max))), '연구 단계가 올바르지 않습니다.');
  check(c.records && typeof c.records === 'object' && Object.keys(c.records).length <= missions.length && Object.entries(c.records).every(([id, r]) => c.completed.includes(id) && finite(r.seconds) && integer(r.kills, 0, 10000) && integer(r.hullRemaining, 0, 100000)), '임무 기록이 올바르지 않습니다.');
  check(c.abilityCooldowns && ['barrier','mend','pulse'].every(k => finite(c.abilityCooldowns[k], 0, 50)) && finite(c.barrierSeconds, 0, 6), '능력 상태가 올바르지 않습니다.');
  check((c.braceSeconds===undefined || finite(c.braceSeconds,0,3)) && (c.abilityCooldowns.brace===undefined || finite(c.abilityCooldowns.brace,0,8)),'정박 방호 상태가 올바르지 않습니다.');
  check(integer(c.waveIndex, 0, 60) && finite(c.nextWave, 0, 2) && integer(c.objectiveIndex, 0, c.expeditionVersion===2?11:2) && finite(c.objectiveProgress, 0, 10), '임무 목표 상태가 올바르지 않습니다.');
  check(finite(c.allyMaxHull, 0, 100000) && finite(c.allyHull, 0, c.allyMaxHull) && finite(c.hazardTimer, -100000, 20), '방어 목표 상태가 올바르지 않습니다.');
  check(integer(c.missionStartKills, 0, 1e8) && finite(c.missionStartHull, 0, 100000), '출항 기록이 올바르지 않습니다.');
  const mission = getMission(c.missionId);
  check(c.stage === 'harbor'||isOperation ? c.missionId === null : mission && (c.completed.includes(mission.id) || mission.index === c.completed.length), '현재 임무를 복원할 수 없습니다.');
  check(c.expeditionVersion===undefined || [1,2].includes(c.expeditionVersion),'지원하지 않는 원정 규칙입니다.');
  check(operation?.kind==='explore'?validExplorationLayout(operation,g.operation.layoutVersion):g.operation?.layoutVersion===undefined,'탐험 지도 버전이 올바르지 않습니다.');
  const catalog = isOperation ? operationSites(operation.id,g.operation.layoutVersion||1):mission ? missionSites(mission,c.expeditionVersion) : [];
  if(operation?.kind==='explore'){
    const chart=c.atlas?.charts[operation.id];check(!chart||(chart.layoutVersion||1)===(g.operation.layoutVersion||1),'진행 중인 탐험과 보관한 지도 버전이 일치하지 않습니다.');
    check(Array.isArray(g.operation.visible)&&g.operation.visible.length<=catalog.length&&new Set(g.operation.visible).size===g.operation.visible.length&&g.operation.visible.includes(catalog[0].id)&&g.operation.visible.every(id=>catalog.some(s=>s.id===id))&&finite(g.operation.scan,0,2),'탐험 발견과 조사 상태가 올바르지 않습니다.');
    check(g.operation.round===c.objectiveIndex&&g.sites.every(s=>!s.cleared||g.operation.visible.includes(s.id)),'탐험 항로와 조사 기록이 일치하지 않습니다.');
    if(g.operation.result)check(integer(g.operation.result.surveyed,3,8)&&g.operation.result.surveyed===g.sites.filter(s=>s.cleared).length&&g.operation.result.full===(g.operation.result.surveyed===8)&&catalog.filter(s=>s.landmark).every(s=>g.sites.some(v=>v.id===s.id&&v.cleared)),'탐험 귀환 기록이 올바르지 않습니다.');
    if(g.operation.result&&['newSurveys','chartSurveyed','chartReward'].some(k=>k in g.operation.result)){const r=g.operation.result,chart=c.atlas?.charts[g.operation.id];check(chart&&integer(r.newSurveys,0,r.surveyed)&&r.chartSurveyed===chart.surveyed.length&&typeof r.chartReward==='boolean'&&(!r.chartReward||chart.surveyed.length===8&&chart.fullRewarded),'탐험 해도 보상이 올바르지 않습니다.');}
  }
  if(c.expeditionVersion===2) {
    check(integer(c.encounterWave,0,isOperation?operation.waves-1:3) && integer(c.bonusResearch,0,12) && typeof c.eliteNext==='boolean','원정 교전 상태가 올바르지 않습니다.');
    check(c.buffs && finite(c.buffs.damage,0,0.6) && finite(c.buffs.protection,0,0.36) && finite(c.buffs.speed,-0.3,0.6),'원정 물자 효과가 올바르지 않습니다.');
    check(c.abilityCharges && ['barrier','mend','pulse'].every(id=>integer(c.abilityCharges[id],0,12)),'능력 물자가 올바르지 않습니다.');
    check(c.allyPosition===null || position(c.allyPosition,110),'호위선 위치가 올바르지 않습니다.');
    const visited=new Set();
    check(Array.isArray(c.decisions) && c.decisions.length<=12 && c.decisions.every(d=>integer(d.site,0,11)&&Object.hasOwn(fieldDecisions,d.kind)&&fieldDecisions[d.kind].options.some(o=>o.id===d.option)&&!visited.has(d.site)&&visited.add(d.site)),'현장 선택 기록이 올바르지 않습니다.');
    check(c.pendingChoice===null || ((c.stage==='mission'||(c.stage==='operation'&&operation?.kind==='explore'&&g.operation.waiting)) && c.pendingChoice.site===c.objectiveIndex && catalog[c.objectiveIndex]?.decision===c.pendingChoice.kind && g.sites[c.objectiveIndex]?.cleared),'현장 선택을 복원할 수 없습니다.');
    check(c.stage==='harbor' || (catalog[c.objectiveIndex] && c.encounterWave<catalog[c.objectiveIndex].waves),'원정 목표가 항로를 벗어납니다.');
  }
  check((c.slowSeconds===undefined || finite(c.slowSeconds,0,5)) && (c.darknessSeconds===undefined || finite(c.darknessSeconds,0,6)),'해역 효과가 올바르지 않습니다.');
  check(c.raidCount===undefined || integer(c.raidCount,0,6),'해역 추격선 상태가 올바르지 않습니다.');
  check(c.fortressBreaks===undefined || integer(c.fortressBreaks,0,12),'방호망 파괴 상태가 올바르지 않습니다.');
  check((c.surveyProgress===undefined || integer(c.surveyProgress,0,3)) && (c.surveyedTasks===undefined || (Array.isArray(c.surveyedTasks)&&c.surveyedTasks.length<=7&&new Set(c.surveyedTasks).size===c.surveyedTasks.length&&c.surveyedTasks.every(t=>['patrol','ambush','recovery','escort','battery','beacon','guardian'].includes(t)))),'연구소 조사 기록이 올바르지 않습니다.');
  check(c.surveyArchiveProgress===undefined || integer(c.surveyArchiveProgress,0,3),'보관한 조사 표본이 올바르지 않습니다.');
  check(c.resultReward===undefined || c.resultReward===null || (['result','operation-result'].includes(c.stage) && integer(c.resultReward.resources,0,10000) && integer(c.resultReward.research,0,20) && integer(c.resultReward.bonusResearch,0,c.resultReward.research) && typeof c.resultReward.first==='boolean'),'원정 보상 기록이 올바르지 않습니다.');
  check(c.stage === 'harbor' ? g.phase === 'playing' && g.route === null && !g.combat && !g.checkpoint : ['mission','operation'].includes(c.stage) ? ['playing','defeat'].includes(g.phase) : c.stage==='operation-result'?g.phase==='mission-complete'&&c.frontier.cleared.includes(operation.id):['mission-complete','campaign-complete'].includes(g.phase) && c.completed.includes(c.missionId), '진행 상태와 결과가 일치하지 않습니다.');
  check(g.phase !== 'campaign-complete' || c.completed.length === missions.length, '엔딩에 도달하지 않은 저장입니다.');
  check(Array.isArray(g.sites) && g.sites.length === catalog.length && g.sites.every((s, i) => s.id === catalog[i].id && typeof s.cleared === 'boolean'), '해역 목표가 올바르지 않습니다.');
  check(Array.isArray(g.enemies) && g.enemies.length <= 100 && (c.stage !== 'harbor' || g.enemies.length === 0), '적 데이터가 올바르지 않습니다.');
  const enemyIds = new Set();
  for (const e of g.enemies) {
    check(e.captured===undefined || (typeof e.captured==='boolean' && (!e.captured || (operation?.kind==='siege'&&!e.active&&g.sites.some(s=>s.id===e.siteId&&s.cleared)))),'거점 확보 상태가 올바르지 않습니다.');
    check(operation?.endgame&&e.type==='generator'?e.powerLink===true:e.powerLink===undefined,'원격 동력망을 복원할 수 없습니다.');
    check(e.powerBus===undefined||(operation?.endgame&&['generator','baseCore','gunTower'].includes(e.type)&&['west','east','shared'].includes(e.powerBus)&&(e.type!=='generator'||e.powerBus!=='shared')),'송전선의 공급 구역을 복원할 수 없습니다.');
    check(typeof e.id === 'string' && e.id.length < 100 && !enemyIds.has(e.id) && Object.hasOwn(campaignRules.enemies,e.type) && catalog.some(s => s.id === e.siteId), '적의 종류 또는 식별자가 올바르지 않습니다.'); enemyIds.add(e.id);
    check(position(e) && finite(e.maxHp, 1, 1000000) && finite(e.hp, 0, e.maxHp) && typeof e.active === 'boolean' && typeof e.rewarded === 'boolean' && finite(e.cooldown, 0, 10), '적의 전투 상태가 올바르지 않습니다.');
    check(e.rewarded === (e.hp===0), '적의 생존과 보상 상태가 일치하지 않습니다.');
    check(finite(e.slowSeconds, 0, 4) && finite(e.slowFactor, 0, 1) && [1,2].includes(e.bossPhase), '적의 능력 상태가 올바르지 않습니다.');
    check(validEnemySlows(e,coolingStats(c.tech.cryodynamics||0).frostSlow),'적의 둔화 중첩과 남은 시간이 올바르지 않습니다.');
    check(!e.windup || (position(e.windup) && finite(e.windup.radius, 1, 20) && finite(e.windup.remaining, 0, 3) && Array.isArray(e.windup.zones) && e.windup.zones.length<=5 && e.windup.zones.every(z=>position(z)&&finite(z.radius,1,20))), '공격 예고가 올바르지 않습니다.');
    check(!e.pendingDamage || finite(e.pendingDamage, 0, 10000), '파동 피해 상태가 올바르지 않습니다.');
    check((e.spawnCount===undefined || integer(e.spawnCount,0,3)) && (e.spawnTimer===undefined || finite(e.spawnTimer,0,12)),'적의 증원 상태가 올바르지 않습니다.');
  }
  check(Array.isArray(c.hazards) && c.hazards.length <= 20 && c.hazards.every(h => position(h) && finite(h.remaining, 0, 3) && finite(h.radius, 1, 20) && finite(h.damage, 0, 10000) && typeof h.kind === 'string' && h.kind.length < 40), '해역 위험 상태가 올바르지 않습니다.');
  check(g.route === null || (position(g.route, 110) && ['home', ...catalog.map(s => s.id)].includes(g.route.id)), '항로가 올바르지 않습니다.');
  if (g.checkpoint) validateShip(g.checkpoint);
  check(c.stage === 'harbor' || !!g.checkpoint, '출항 전 복구 상태가 없습니다.');
  return true;
}
// Old engines must refuse new control research or pursuit tactics instead of
// silently discarding them. Unresearched saves retain their former envelope.
const hasReconstruction=g=>getExploration(g.operation?.id)?.endgame||(g.campaign.frontier?.cleared||[]).some(id=>getExploration(id)?.endgame)||Object.keys(g.campaign.atlas?.charts||{}).some(id=>getExploration(id)?.endgame)||Object.keys(g.campaign.frontier?.records||{}).some(id=>getExploration(id)?.endgame);
const requiredSaveVersion=g=>hasReconstruction(g)?6:g.fleet?.version===5||g.checkpoint?.fleet?.version===5?5:g.enemies.some(e=>Object.hasOwn(e,'controlSlows'))?4:Object.hasOwn(g.campaign.tech,'cryodynamics')?3:g.operation?.siegeVersion===2||g.enemies.some(e=>e.type==='raider')?2:1;
export function encodeSave(g) {
  validateCampaign(g);
  const payload = JSON.parse(JSON.stringify({ ...g, events: [], accumulator: 0 }));
  const serialized = JSON.stringify(payload);
  return JSON.stringify({ format: 'tidehold-campaign', version: requiredSaveVersion(g), savedAt: new Date().toISOString(), checksum: checksum(serialized), payload });
}
export function decodeSave(text) {
  check(typeof text === 'string' && text.length <= 1000000, '저장 파일이 너무 큽니다.');
  const envelope = JSON.parse(text);
  check(envelope.format === 'tidehold-campaign' && [1,2,3,4,5,6].includes(envelope.version) && checksum(JSON.stringify(envelope.payload)) === envelope.checksum, '저장 파일이 손상되었거나 지원되지 않습니다.');
  const g = envelope.payload; validateCampaign(g);
  check(envelope.version===requiredSaveVersion(g),'연구·편대 기능에 필요한 저장 형식이 올바르지 않습니다. 최신 실행판에서 복원하세요.');
  migrateAtlas(g.campaign);
  migrateWalls(g);
  g.fleet ||= emptyFleet();if(g.checkpoint)g.checkpoint.fleet ||= emptyFleet();
  g.catalog = g.operation?operationSites(g.operation.id,g.operation.layoutVersion||1):g.campaign.missionId ? missionSites(getMission(g.campaign.missionId),g.campaign.expeditionVersion) : [];
  g.events = []; g.accumulator = 0; g.paused = true; return g;
}
export function saveCampaign(g, storage = globalThis.localStorage) {
  try {
    const text = encodeSave(g), current = storage.getItem(SAVE_KEY);
    // Never replace a good backup with a corrupted primary.
    let goodCurrent = false;
    if (current) { try { decodeSave(current); goodCurrent = true; } catch { /* Keep the good backup. */ } }
    if (goodCurrent) storage.setItem(BACKUP_KEY, current);
    storage.setItem(SAVE_KEY, text); return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
}
export function loadCampaign(storage = globalThis.localStorage) {
  const errors = [];
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try { const text = storage.getItem(key); if (text) return { game: decodeSave(text), recovered: key === BACKUP_KEY, errors }; }
    catch (error) { errors.push(error.message); }
  }
  return { game: null, recovered: false, errors };
}
