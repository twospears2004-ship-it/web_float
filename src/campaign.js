import { campaignRules, chapters, missions, getMission, missionSites, technologies, abilityDefinitions, bossPatterns, bossTactics } from './campaign-content.js';
import { fieldDecisions } from './expedition-content.js';
import { separateFromHull } from './hull.js';
import {onSiteSecured,resetProductionForMission} from './production.js';
import {emptyFleet,deployFleet} from './fleet.js';
import {shipFields,captureShip} from './ship-state.js';
import {atlasState,atlasHasSurvey,atlasSummary,researchChartRequirement} from './atlas.js';
import {getSiege} from './siege-content.js';
import {explorationInterference} from './exploration-content.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const event = (g, e) => { g.events.push(e); if (g.events.length > 180) g.events.shift(); };
const clone = value => structuredClone(value);
export function initializeCampaign(g) {
  g.resources = campaignRules.initialResources; g.hull = g.maxHull = campaignRules.initialHull;
  g.enemies = []; g.catalog = []; g.sites = []; g.checkpoint = null;
  g.fleet = emptyFleet();
  g.campaign = {
    version: 1, chapter: 0, completed: [], research: 0, tech: {}, records: {}, atlas:atlasState(),
    totalActiveSeconds: 0, stage: 'harbor', missionId: null, missionSeconds: 0,
    waveIndex: 0, nextWave: 0, objectiveIndex: 0, objectiveProgress: 0,
    allyHull: 0, allyMaxHull: 0, hazards: [], hazardTimer: 12,
    abilityCooldowns: { barrier: 0, mend: 0, pulse: 0, brace: 0 }, barrierSeconds: 0, braceSeconds: 0,
    missionStartKills: 0, missionStartHull: g.hull,
    expeditionVersion: 2, encounterWave: 0, decisions: [], pendingChoice: null,
    bonusResearch: 0, buffs: { damage: 0, protection: 0, speed: 0 }, eliteNext: false,
    abilityCharges: { barrier: 6, mend: 4, pulse: 8 }, allyPosition: null, waitingForDeparture: false, surveyedTasks:[], surveyProgress:0, surveyArchiveProgress:0, resultReward:null,
  };
  g.message = '캠페인을 시작합니다. 섬 정비 후 표류자의 항로를 선택하세요.';
  return g;
}
export function availableMissions(g) {
  const completed = new Set(g.campaign.completed);
  const firstUnfinished = missions.findIndex(m => !completed.has(m.id));
  return missions.filter(m => completed.has(m.id) || m.index === firstUnfinished);
}
function saveCheckpoint(g) { g.fleet ||= emptyFleet();g.checkpoint = captureShip(g); }
export function launchMission(g, id) {
  if (!g.campaign || g.campaign.stage !== 'harbor' || g.paused || g.phase !== 'playing') return false;
  const mission = getMission(id);
  if (!mission || !availableMissions(g).some(m => m.id === id)) { g.message = '앞선 임무를 완료하면 이 항로가 열립니다.'; return false; }
  if (!g.facilities.some(f => f.hp!==0&&campaignRules.weapons[f.type].damage > 0)) { g.message = '공격 시설이 필요합니다. 연사포 또는 박격포를 먼저 건설하거나 복구하세요.'; return false; }
  saveCheckpoint(g); g.enemies = []; g.catalog = missionSites(mission, 2);
  g.sites = g.catalog.map(s => ({ id: s.id, cleared: false }));
  g.island = { x: 0, z: 0 }; g.route = null; g.combat = false;
  const c = g.campaign;
  Object.assign(c, { stage: 'mission', missionId: id, missionSeconds: 0, waveIndex: 0, nextWave: 0, objectiveIndex: 0, objectiveProgress: 0, hazards: [], hazardTimer: 12, allyHull: 260 + mission.chapter * 95, allyMaxHull: 260 + mission.chapter * 95, missionStartKills: g.kills, missionStartHull: g.hull, barrierSeconds: 0 });
  Object.assign(c, { expeditionVersion: 2, encounterWave: 0, decisions: [], pendingChoice: null, bonusResearch: 0,
    buffs: { damage: 0, protection: 0, speed: 0 }, eliteNext: false,
    abilityCharges: { barrier: 6, mend: 4, pulse: 8 }, abilityCooldowns: { barrier:0, mend:0, pulse:0, brace:0 },
    allyPosition: null, waitingForDeparture:true, slowSeconds:0, darknessSeconds:0, braceSeconds:0, raidCount:0, fortressBreaks:0, resultReward:null });
  c.allyHull=c.allyMaxHull=360+mission.chapter*150;
  resetProductionForMission(g);
  for (const f of g.facilities) f.cooldown = 0;
  spawnWave(g);deployFleet(g); g.message = `${mission.name} — ${mission.description}. ${mission.hint}`;
  return true;
}
function waveEnemies(m, wave, site, g) {
  const c = m.chapter;
  if (g.campaign.expeditionVersion === 2) {
    if (m.index === 0) return ['crawler','crawler','crawler'];
    const pool = ['crawler', ...(c >= 1 ? ['skimmer'] : []), ...(c >= 2 ? ['armored'] : []), ...(c >= 3 ? ['spitter'] : []), ...(c >= 4 ? ['bomber'] : [])];
    const count = 3 + Math.min(4, Math.floor(c / 2)) + (wave % 2);
    const types = Array.from({ length: count }, (_, i) => pool[(i+wave+m.order+site.sector)%pool.length]);
    if (site.task === 'battery') types[0] = 'nest';
    if (site.task === 'ambush' && c > 0) { types[0]='skimmer'; if(c>=3)types[1]='spitter'; }
    if (site.task === 'guardian') types.splice(0,2,...(bossPatterns[c] === 'twin' ? ['leviathan','leviathan'] : ['leviathan']));
    if (c >= 3 && (wave+site.sector)%3 === 0) types.push('tender');
    if (c >= 5 && (wave+site.sector)%3 === 1) types.push('bulwark');
    if (c >= 7 && (wave+site.sector)%3 === 2) types.push('carrier');
    if (g.campaign.eliteNext) types.push(c>=2?'armored':'crawler');
    return types;
  }
  const count = 2 + Math.min(5, Math.floor(c / 2)) + (wave % 2);
  const pool = ['crawler', ...(c >= 1 ? ['skimmer'] : []), ...(c >= 2 ? ['armored'] : []), ...(c >= 3 ? ['spitter'] : []), ...(c >= 4 ? ['bomber'] : [])];
  if (m.kind === 'boss' && wave === m.waves - 1) return [...(bossPatterns[c]==='twin'?['leviathan','leviathan']:['leviathan']), ...Array.from({ length: Math.min(c, 4) }, (_, i) => pool[i % pool.length])];
  if (m.kind === 'siege') return ['nest', ...Array.from({ length: count - 1 }, (_, i) => pool[(wave + i) % pool.length])];
  return Array.from({ length: count }, (_, i) => pool[(i + wave + m.order) % pool.length]);
}
export function spawnWave(g) {
  const c = g.campaign, m = getMission(c.missionId), site = g.catalog[c.objectiveIndex];
  if (!m || !site) return;
  const types = waveEnemies(m, c.encounterWave ?? c.waveIndex, site, g);
  g.enemies = g.enemies.filter(e => e.hp > 0);
  for (const [i, type] of types.entries()) {
    const angle = (i / types.length) * Math.PI * 2 + c.waveIndex * 0.91;
    const radius = site.task === 'escort' || (c.expeditionVersion !== 2 && m.kind === 'defend') ? 26 : 10 + (i % 3) * 4;
    const stats = campaignRules.enemies[type];
    const scale = c.expeditionVersion === 2 ? (m.index === 0 ? 1.2 : 1.7 * (1 + m.chapter * 0.6) ** 1.25) : 1 + m.chapter * 0.32 + m.order * 0.025;
    const hp = Math.round(stats.hp * scale * (type === 'leviathan' ? (1 + m.chapter * 0.12)*(bossPatterns[m.chapter]==='twin'?0.65:1) : 1));
    const enemy={ id: `${m.id}-w${c.waveIndex}-${i}`, siteId: site.id, type, x: site.x + Math.sin(angle) * radius, z: site.z + Math.cos(angle) * radius, hp, maxHp: hp, active: false, rewarded: false, cooldown: 0, slowSeconds: 0, slowFactor: 1, windup: null, bossPhase: 1, spawnCount: 0, spawnTimer: 10 };
    if(c.expeditionVersion===2)Object.assign(enemy,separateFromHull(g,enemy,stats.radius));
    g.enemies.push(enemy);
  }
  // Retain dead enemies only until their wave ends; rewards are recorded before pruning.
  if (g.enemies.length > 80) g.enemies = g.enemies.filter(e => e.hp > 0);
  c.nextWave = 0;
  if (c.expeditionVersion === 2) c.allyPosition = site.task === 'escort' ? {x: site.x, z: site.z} : null;
  event(g, { type: 'wave', wave: c.waveIndex + 1, total: m.waves });
}
export function campaignEnemyStats(g, e) {
  const base = campaignRules.enemies[e.type];
  const m = getMission(g.campaign.missionId);
  const chapter = getSiege(g.operation?.id)?.combatChapter ?? g.operation?.chapter ?? m?.chapter ?? 0;
  const expedition = g.campaign.expeditionVersion === 2;
  const interference=explorationInterference(g,e);
  return { ...base, name:e.type==='leviathan'?chapters[chapter].boss:base.name, pattern:bossPatterns[chapter],
    armor: (base.armor || 0) * (expedition && ['nest','leviathan'].includes(e.type) ? 1-Math.min(0.75,(g.campaign.fortressBreaks || 0)*0.1) : 1),
    damage: Math.max(base.damage===0?0:1,Math.round(base.damage * (expedition ? 0.3+chapter*0.016 : 1+chapter*0.18))) * interference.damage,
    spawn:base.spawn&&interference.spawn,
    interval: base.interval + (expedition ? 0.8 : 0),
    reward: Math.max(1,Math.round(base.reward * (expedition ? Math.max(0.22,0.42-chapter*0.02) : 1+chapter*0.16) * (1 + (g.campaign.tech.logistics || 0) * 0.1))),
    speed: base.speed * (e.slowSeconds > 0 ? e.slowFactor : 1) * (e.bossPhase === 2 ? 1.2 : 1) };
}
export function bossWarning(g, e, target) {
  const pattern=campaignEnemyStats(g,e).pattern;
  const zones=[{...target,radius:pattern==='maelstrom'?8:6}];
  if(['fan','broadside','battery','storm'].includes(pattern)) {
    const axis=pattern==='battery'?'z':'x';
    zones.push({...target,[axis]:target[axis]-10,radius:5},{...target,[axis]:target[axis]+10,radius:5});
    if(pattern==='storm')zones.push({...target,z:target.z-10,radius:5},{...target,z:target.z+10,radius:5});
  }
  if(pattern==='eruption')zones[0].radius=8;
  g.message=`${campaignEnemyStats(g,e).name}: ${bossTactics[pattern].attack} 예고! 붉은 영역을 피하거나 보호막을 사용하세요.`;
  return {...target,radius:zones[0].radius,zones,pattern,remaining:pattern==='charge'?2.2:1.8};
}
export function campaignDamageMultiplier(g, f) { return (1 + (g.campaign.tech.ballistics || 0) * 0.12) * (1+(g.campaign.buffs?.damage || 0)); }
export function campaignMoveMultiplier(g) { return (1 + (g.campaign.tech.navigation || 0) * 0.08) * (1+(g.campaign.buffs?.speed || 0)); }
export function powerCapacity(g) { return 5 + g.campaign.chapter + (g.campaign.tech.reactor || 0) * 2 + (g.campaign.tech.distributed || 0); }
export function maxFacilityLevel(g) { return Math.min(9,3+Math.floor(g.campaign.chapter/2)+(g.campaign.chapter===11?1:0)); }
export const facilityPower = f => f.hp===0?0:['wall','mine'].includes(f.type)?0:campaignRules.weapons[f.type].power + Math.floor((f.level-1)/2);
export function powerUsed(g) { return g.facilities.reduce((n,f)=>n+facilityPower(f),0); }
export function useAbility(g, id) {
  const c = g.campaign, def = abilityDefinitions[id];
  if (!c || !Object.hasOwn(abilityDefinitions,id) || !def || g.phase !== 'playing' || g.paused || !['mission','operation'].includes(c.stage) || c.pendingChoice || c.abilityCooldowns[id] > 0 || (id!=='brace' && c.abilityCharges && c.abilityCharges[id] <= 0)) return false;
  if(id==='brace' && !c.hazards.length){g.message='환경 공격 예고가 있을 때 정박 방호를 사용할 수 있습니다. 수호자의 공격에는 보호막을 사용하세요.';return false;}
  const repairAlly=!!c.allyPosition && c.allyHull/c.allyMaxHull<g.hull/g.maxHull;
  if (id === 'mend' && g.hull >= g.maxHull && !repairAlly) { g.message = '현재 내구도가 온전합니다.'; return false; }
  c.abilityCooldowns[id] = def.cooldown;
  if(c.abilityCharges && id!=='brace')c.abilityCharges[id]--;
  if(id==='brace')c.braceSeconds=def.duration;
  if (id === 'barrier') c.barrierSeconds = def.duration;
  if (id === 'mend') {
    const amount=def.heal * (1 + (c.tech.bulkhead || 0) * 0.1) * (1+(c.expeditionVersion===2?c.chapter*0.1:0));
    if(repairAlly)c.allyHull=Math.min(c.allyMaxHull,c.allyHull+amount);else g.hull=Math.min(g.maxHull,g.hull+amount);
    event(g, { type: 'build', ...(repairAlly?c.allyPosition:g.island) });
  }
  if (id === 'pulse') {
    c.waitingForDeparture=false;
    for (const e of g.enemies) if (e.hp > 0 && !e.captured && dist(e, g.island) <= def.range) {
      // Damage is applied by the shared game damage pipeline next tick.
      e.pendingDamage = (e.pendingDamage || 0) + def.damage * (1 + (c.tech.ballistics || 0) * 0.12) * (1+(c.expeditionVersion===2?c.chapter*0.28:0));
      e.slowSeconds = 4; e.slowFactor = 0.3; e.active = true;
    }
    event(g, { type: 'pulse', ...g.island });
  }
  g.message = `${def.name} 사용!`; return true;
}
export function repairEscort(g) {
  const c=g.campaign;
  if(!c || getMission(c.missionId)?.kind!=='defend' || c.stage!=='mission' || g.phase!=='playing' || g.combat || g.route || g.paused || c.allyHull>=c.allyMaxHull)return false;
  if(g.resources<40){g.message='호위선 수리에 자원 40이 필요합니다.';return false;}
  g.resources-=40;c.allyHull=Math.min(c.allyMaxHull,c.allyHull+180);g.message='호위선 수리 완료. 내구도 +180';return true;
}
export function resupplyAbilities(g) {
  const c=g.campaign;
  if(!c?.abilityCharges || !['mission','operation'].includes(c.stage) || (g.operation&&!g.operation.waiting) || g.phase!=='playing' || g.combat || g.route || g.paused)return false;
  if(Object.values(c.abilityCharges).every(n=>n>=12)){g.message='능력 물자가 가득합니다.';return false;}
  if(g.resources<75){g.message='능력 재보급에 자원 75가 필요합니다.';return false;}
  g.resources-=75;for(const id of ['barrier','mend','pulse'])c.abilityCharges[id]=Math.min(12,c.abilityCharges[id]+2);
  g.message='능력 재보급 완료. 보호막·수리·파동 +2회';return true;
}
export function researchCost(g, tech) {
  const level=g.campaign.tech[tech.id] || 0;
  return {points:tech.cost+level,materials:(tech.materials || 0)+level*(tech.materialsStep || 0)};
}
export function researchStatus(g,tech,charts=atlasSummary(g.campaign).full) {
  const c=g.campaign,level=c.tech[tech.id]||0,cost=researchCost(g,tech),required=researchChartRequirement(c,tech);
  const missing=[];if(c.research<cost.points)missing.push(`자료 ${cost.points-c.research} 부족`);if(g.resources<cost.materials)missing.push(`자원 ${cost.materials-g.resources} 부족`);
  const reason=level>=tech.max?'최대 단계 완료':g.paused?'일시정지를 해제하세요':g.phase!=='playing'||c.stage!=='harbor'?'정박지에서 연구하세요':c.chapter<(tech.unlock||0)?`${chapters[tech.unlock].name}에서 설계도 해금`:charts<required?`완성 해도 ${charts}/${required} · 항로 기록에서 빠진 조사 확인`:missing.join(' · ');
  return {level,cost,available:!reason,reason};
}
export function researchTechnology(g, id) {
  const c = g.campaign, tech = technologies.find(t => t.id === id);
  if (!c || !tech) return false;
  const {level,cost,available,reason}=researchStatus(g,tech);
  if(!available){g.message=reason;return false;}
  c.research -= cost.points;g.resources-=cost.materials;c.tech[id] = level + 1;
  if (id === 'bulkhead') { g.maxHull += 80; g.hull += 80; }
  g.message = `${tech.name} ${level + 1}단계 연구 완료.`; return true;
}
export function returnToHarbor(g, restore = false) {
  if (!g.campaign) return false;
  if (restore && g.checkpoint) for (const key of shipFields) g[key] = clone(g.checkpoint[key]);
  Object.assign(g, { phase: 'playing', paused: false, combat: false, route: null, island: { x: 0, z: 0 }, heading: 0, enemies: [], catalog: [], sites: [], accumulator: 0, events: [] });
  Object.assign(g.campaign, { stage: 'harbor', missionId: null, hazards: [], barrierSeconds: 0, braceSeconds:0, slowSeconds:0, darknessSeconds:0,
    waveIndex:0, encounterWave:0, nextWave:0, objectiveIndex:0, objectiveProgress:0,
    buffs:{damage:0,protection:0,speed:0}, eliteNext:false, pendingChoice: null, allyPosition: null, waitingForDeparture:false, resultReward:null });
  g.checkpoint = null; g.message = restore ? '출항 전 상태로 안전하게 복귀했습니다. 배치를 바꾸어 다시 도전하세요.' : '정박지에 돌아왔습니다. 연구와 정비로 다음 항로를 준비하세요.';
  g.campaign.surveyProgress=g.campaign.surveyArchiveProgress || 0;g.campaign.surveyedTasks=[];
  g.fleet ||= emptyFleet();deployFleet(g);
  g.operation=null;
  return true;
}
export function retryMission(g) {
  if (!g.campaign || !g.campaign.missionId) return false;
  const id = g.campaign.missionId; returnToHarbor(g, true); return launchMission(g, id);
}
export function currentFieldDecision(g) {
  const choice = g.campaign?.pendingChoice;
  return choice ? fieldDecisions[choice.kind] : null;
}
function advanceObjective(g, m) {
  const c = g.campaign, site = g.catalog[c.objectiveIndex];
  if (c.objectiveIndex === g.catalog.length - 1) { completeMission(g,m); return; }
  c.objectiveIndex++; c.objectiveProgress=0; c.encounterWave=0; c.waveIndex++; c.waitingForDeparture=true;
  spawnWave(g);
  g.message=`${site.name} 확보. ${g.catalog[c.objectiveIndex].name}으로 이동하세요. 교전 사이에 정비할 수 있습니다.`;
}
export function resolveFieldDecision(g, id) {
  const c=g.campaign, decision=currentFieldDecision(g), option=decision?.options.find(o=>o.id===id);
  const exploration=c?.stage==='operation'&&g.operation?.kind==='explore';
  if(!option || g.paused || g.phase!=='playing' || (c.stage!=='mission'&&!exploration))return false;
  if(exploration&&option.research&&atlasHasSurvey(c,g.operation.id,g.catalog[c.objectiveIndex].id)){g.message='이미 보관한 조사 자료입니다. 다른 회수품을 선택하세요.';return false;}
  if(g.resources<(option.cost || 0)) {g.message='이 선택에 필요한 자원이 부족합니다. 다른 물자를 선택하세요.';return false;}
  g.resources-=option.cost || 0;
  g.resources+=option.resources || 0; g.earned+=option.resources || 0;
  g.hull=Math.min(g.maxHull,g.hull+(option.heal || 0));
  c.allyHull=Math.min(c.allyMaxHull,c.allyHull+(option.heal || 0));
  for(const key of ['barrier','mend','pulse'])c.abilityCharges[key]=Math.min(12,c.abilityCharges[key]+(option[key] || 0));
  for(const key of ['damage','protection','speed'])c.buffs[key]=Math.max(key==='speed'?-0.3:0,Math.min(key==='protection'?0.36:0.6,c.buffs[key]+(option[key] || 0)));
  if(!exploration||!atlasHasSurvey(c,g.operation.id,g.catalog[c.objectiveIndex].id))c.bonusResearch+=option.research || 0;
  c.eliteNext=!!option.elite;
  c.decisions.push({site:c.objectiveIndex,kind:c.pendingChoice.kind,option:id});
  c.pendingChoice=null; c.hazards=[]; g.route=null;
  event(g,{type:'build',...g.island});if(!exploration)advanceObjective(g,getMission(c.missionId));else g.message='회수품 선택 완료. 발견한 다음 지점을 선택하거나 필수 조사를 마쳤으면 귀환하세요.';
  return true;
}
function afterExpeditionTick(g, m, site, dt) {
  const c=g.campaign;
  if(c.pendingChoice)return;
  const alive=g.enemies.some(e=>e.hp>0), involved=dist(g.island,site)<=34 || g.enemies.some(e=>e.active);
  if(alive || !involved)return;
  if(c.encounterWave+1<site.waves) {
    if(c.nextWave===0)c.nextWave=2;
    c.nextWave=Math.max(0,c.nextWave-dt);
    if(c.nextWave<=0){c.encounterWave++;c.waveIndex++;spawnWave(g);}
    g.combat=true;return;
  }
  if(g.route)return;
  g.sites[c.objectiveIndex].cleared=true; c.eliteNext=false; c.hazards=[]; g.combat=false;
  onSiteSecured(g,site);
  if(site.task==='battery')c.fortressBreaks=(c.fortressBreaks || 0)+1;
  if(site.decision) {
    c.pendingChoice={site:c.objectiveIndex,kind:site.decision};
    g.message=`${site.name} 확보. ${fieldDecisions[site.decision].title}: 다음 항해에 실을 물자를 선택하세요.`;
    event(g,{type:'clear',siteId:site.id});
  } else advanceObjective(g,m);
}
function completeMission(g, m) {
  const c = g.campaign, first = !c.completed.includes(m.id);
  if (first) { c.completed.push(m.id); c.research += m.research + (c.bonusResearch || 0); c.surveyArchiveProgress=c.surveyProgress || 0; }
  const bonus = first ? m.reward : Math.floor(m.reward * 0.4);
  c.resultReward={resources:bonus,research:first?m.research+(c.bonusResearch || 0):0,bonusResearch:first?(c.bonusResearch || 0):0,first};
  g.resources += bonus; g.earned += bonus;
  const record = { seconds: c.missionSeconds, kills: g.kills - c.missionStartKills, hullRemaining: Math.ceil(g.hull) };
  if (!c.records[m.id] || record.seconds < c.records[m.id].seconds) c.records[m.id] = record;
  c.chapter = Math.min(chapters.length - 1, Math.floor(c.completed.length / 6));
  c.stage = 'result'; g.phase = c.completed.length === missions.length ? 'campaign-complete' : 'mission-complete';
  g.route = null; g.combat = false; c.hazards = [];
  g.message = `${m.name} 완료! 자원 +${bonus}${first ? ` · 연구 자료 +${c.resultReward.research}${c.resultReward.bonusResearch?`(현장 조사 +${c.resultReward.bonusResearch})`:''}` : ' · 재탐사 보상'}`;
  event(g, { type: 'missionComplete', missionId: m.id, first, bonus });
}
export function beforeCampaignTick(g, dt) {
  const c = g.campaign; c.totalActiveSeconds += dt;
  if(['mission','operation'].includes(c.stage))c.missionSeconds+=dt;
  if(c.pendingChoice)return;
  for (const key of Object.keys(c.abilityCooldowns)) c.abilityCooldowns[key] = Math.max(0, c.abilityCooldowns[key] - dt);
  c.barrierSeconds = Math.max(0, c.barrierSeconds - dt);
  c.braceSeconds=Math.max(0,(c.braceSeconds || 0)-dt);
  if(c.stage==='operation'){for(const e of g.enemies)e.slowSeconds=Math.max(0,(e.slowSeconds || 0)-dt);return;}
  if (c.stage !== 'mission') return;
  c.slowSeconds=Math.max(0,(c.slowSeconds || 0)-dt);
  c.darknessSeconds=Math.max(0,(c.darknessSeconds || 0)-dt);
  const m = getMission(c.missionId);
  for (const e of g.enemies) {
    e.slowSeconds = Math.max(0, (e.slowSeconds || 0) - dt);
    if (e.type === 'leviathan' && e.hp < e.maxHp / 2 && e.bossPhase === 1) { e.bossPhase = 2; g.message = '수호자가 격노합니다! 공격 예고를 확인하세요.'; event(g, { type: 'bossPhase', x: e.x, z: e.z }); }
  }
  c.hazardTimer -= dt;
  if (m.hazard !== 'none' && c.hazardTimer <= 0 && g.combat) {
    c.hazardTimer = m.hazard === 'storm' ? 10 : 15;
    if(m.hazard==='raids' && c.expeditionVersion===2) {
      if(c.raidCount<6) {
        const hp=Math.round(campaignRules.enemies.skimmer.hp*1.7*(1+m.chapter*0.6)**1.25);
        const angle=c.raidCount*2.4;c.raidCount++;
        g.enemies.push({id:`${m.id}-raid-${c.raidCount}`,siteId:g.catalog[c.objectiveIndex].id,type:'skimmer',x:g.island.x+Math.sin(angle)*32,z:g.island.z+Math.cos(angle)*32,hp,maxHp:hp,active:true,rewarded:false,cooldown:1,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10});
        g.message='외해에서 추격선이 접근합니다. 뒤쪽 무장의 사거리를 확인하세요.';
      }
    } else {
      const profile={frost:[7,6+m.chapter*2],mines:[5,25+m.chapter*3],current:[8,5],eruption:[9,25+m.chapter*3],storm:[5,16+m.chapter*3],tide:[4,12+m.chapter*2],fog:[14,0],pulse:[12,0],maelstrom:[9,18+m.chapter*3]}[m.hazard] || [6,15+m.chapter*5];
      const offsets=m.hazard==='storm'?[{x:0,z:0},{x:9,z:8}]:m.hazard==='tide'?[{x:-9,z:0},{x:0,z:0},{x:9,z:0}]:[{x:0,z:0}];
      for(const [i,offset] of offsets.entries())c.hazards.push({id:`hazard-${Math.round(c.missionSeconds*100)}-${i}`,x:g.island.x+offset.x,z:g.island.z+offset.z,radius:profile[0],remaining:m.hazard==='eruption'?3:2.8,damage:profile[1],kind:m.hazard});
    }
    event(g, { type: 'warning', ...g.island });
  }
  for (const hazard of c.hazards) hazard.remaining -= dt;
}
export function afterCampaignTick(g, dt) {
  const c = g.campaign; if (c.stage !== 'mission') return;
  const m = getMission(c.missionId), site = g.catalog[c.objectiveIndex];
  if (g.hull <= 0 || ((c.expeditionVersion===2 ? !!c.allyPosition : m.kind === 'defend') && c.allyHull <= 0)) { g.phase = 'defeat'; g.route = null; g.message = g.hull <= 0 ? '섬이 침몰했습니다. 출항 전 상태로 다시 도전할 수 있습니다.' : '동맹 정박지가 파괴되었습니다. 진입 경로와 무장 배치를 바꾸세요.'; return; }
  if(c.expeditionVersion===2){afterExpeditionTick(g,m,site,dt);return;}
  const alive = g.enemies.some(e => e.hp > 0);
  const involved = dist(g.island, site) <= 34 || g.enemies.some(e => e.active);
  if (!alive && involved) {
    if (g.catalog.length>1) {
      if (['salvage','relay'].includes(m.kind)) { if (dist(g.island, site) <= 19 && !g.route) c.objectiveProgress += dt; }
      else c.objectiveProgress=2;
      if (c.objectiveProgress >= 2) {
        g.sites[c.objectiveIndex].cleared = true;
        if (c.objectiveIndex < g.catalog.length - 1) {
          c.objectiveIndex++; c.objectiveProgress = 0; c.waveIndex++; spawnWave(g);
          g.message = `${site.name} 확보. 다음 ${g.catalog[c.objectiveIndex].name}으로 이동하세요.`;
        } else completeMission(g, m);
      }
    } else if (c.waveIndex + 1 < m.waves) {
      if (c.nextWave === 0) { c.nextWave = 2; g.message = `공세 ${c.waveIndex + 1}/${m.waves} 격퇴. 다음 적이 접근합니다.`; }
      c.nextWave -= dt;
      if (c.nextWave <= 0) { c.waveIndex++; spawnWave(g); }
      g.combat = true;
    } else { g.sites[c.objectiveIndex].cleared = true; completeMission(g, m); }
  }
}
