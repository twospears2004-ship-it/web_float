// Pure game state. Render meshes never participate in damage or economy.
import balance from './balance.json' with { type: 'json' };
import { campaignRules } from './campaign-content.js';
import { closestHullPoint, hullDistance, separateFromHull } from './hull.js';
import {onSailed,salvageBonus} from './production.js';
import {tickFleet,threatenedUnit} from './fleet.js';
import {structureHull,defenseTarget} from './fortifications.js';
import {structurePosition,validWallSlot,wallEdge} from './walls.js';
import {afterDefenseTick} from './frontier.js';
import {poweredEnemyStats} from './siege-content.js';
import { initializeCampaign, beforeCampaignTick, afterCampaignTick, campaignEnemyStats, campaignDamageMultiplier, campaignMoveMultiplier, powerCapacity, powerUsed, facilityPower, maxFacilityLevel, bossWarning } from './campaign.js';
export { balance };
export const rulesFor = g => g?.campaign ? { ...balance, ...campaignRules, maxLevel:maxFacilityLevel(g) } : balance;
export const sitesFor = g => g.campaign ? g.catalog : balance.sites;
export const enemyStats = (g, e) => g.campaign ? poweredEnemyStats(g,e,campaignEnemyStats(g, e)) : balance.enemies[e.type];
export const keyOf = (x, z) => `${x},${z}`;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function createGame(mode = 'direct') {
  const tiles = [];
  for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) tiles.push({ x, z });
  return {
    mode, phase: 'playing', paused: false, time: 0, accumulator: 0,
    resources: balance.initialResources, hull: balance.initialHull, maxHull: balance.initialHull,
    island: { x: 0, z: 0 }, heading: 0, tiles,
    facilities: [{ id: 1, type: 'cannon', x: 0, z: -1, level: 1, cooldown: 0, aim: 0 }],
    nextId: 2, enemies: balance.sites.flatMap(site => site.enemies.map((e, i) => ({
      id: `${site.id}-${i}`, siteId: site.id, type: e.type,
      x: site.x + e.dx, z: site.z + e.dz, hp: balance.enemies[e.type].hp,
      maxHp: balance.enemies[e.type].hp, active: false, rewarded: false, cooldown: 0,
    }))),
    sites: balance.sites.map(s => ({ id: s.id, cleared: false })),
    route: null, combat: false, events: [], kills: 0, earned: 0, shots: 0,
    message: '박격포를 추가하거나, 연사포를 강화한 뒤 첫 원정을 떠나세요.',
  };
}
export function createCampaign(mode = 'direct') { return initializeCampaign(createGame(mode)); }
const emit = (g, event) => { g.events.push(event); if (g.events.length > 180) g.events.shift(); };
export function weaponStats(f, g) {
  const rules = rulesFor(g), w = rules.weapons[f.type] || campaignRules.weapons[f.type];
  return { ...w, damage: w.damage * (1 + (f.level - 1) * rules.upgradeDamageScale) * (g?.campaign ? campaignDamageMultiplier(g, f) : 1), range: ((w.range>0?w.range + (f.level - 1) * rules.upgradeRangePerLevel:0)+(f.type==='crane'?(g?.campaign?.tech.precision || 0)*3:0)) * (w.damage>0&&g?.campaign?.darknessSeconds>0?0.7:1) };
}
export const facilityPosition=structurePosition;
export function upgradeCost(f, g) {
  const base=(rulesFor(g).weapons[f.type] || campaignRules.weapons[f.type]).cost * balance.upgradeCostScale * f.level;
  return Math.round(base * (g?.campaign ? 1 + Math.max(0,f.level-2)**2 * 0.16 : 1));
}
export function facilityInvestment(f, g) {
  if(f.investment!==undefined)return f.investment;
  // Existing saves paid the former linear price. Repricing must not create a
  // demolition windfall; migrate their actual old investment on the next upgrade.
  const cost=rulesFor(g).weapons[f.type].cost;
  let total=cost;for(let level=1;level<f.level;level++)total+=Math.round(cost*balance.upgradeCostScale*level);
  return total;
}
export function canManage(g) { return g.phase === 'playing' && !g.combat && !g.route && (!g.operation || g.operation.waiting); }
const deny = (g, text) => { g.message = text; return false; };
const spend = (g, cost) => {
  if (g.resources < cost) return deny(g, g.campaign?'자원이 부족합니다. 원정에서 자원을 회수하거나 다른 정비를 선택하세요.':'자원이 부족합니다. 여울에서 자원을 확보하세요.');
  g.resources -= cost; return true;
};
export function validSlot(g, x, z) { return g.tiles.some(t => t.x === x && t.z === z) && (x !== 0 || z !== 0) && !g.facilities.some(f => f.type!=='wall'&&f.x === x && f.z === z); }
export function expansionSlots(g) {
  const rules = rulesFor(g);
  const occupied = new Set(g.tiles.map(t => keyOf(t.x, t.z)));
  const slots = new Map();
  for (const t of g.tiles) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = t.x + dx, z = t.z + dz;
    if (Math.abs(x) <= rules.maxTileRadius && Math.abs(z) <= rules.maxTileRadius && !occupied.has(keyOf(x, z))) slots.set(keyOf(x, z), { x, z });
  }
  return [...slots.values()];
}
export function build(g, type, x, z, edge='north') {
  const rules = rulesFor(g);
  if (!canManage(g)) return deny(g, '정비는 항해와 전투가 끝난 뒤 가능합니다.');
  if (!Object.hasOwn(rules.weapons, type)) return deny(g, '건설할 시설을 선택하세요.');
  if (!(type==='wall'?validWallSlot(g,x,z,edge):validSlot(g,x,z))) return deny(g, type==='wall'?'성벽이 없는 타일 면을 선택하세요. 이웃 타일의 맞닿은 면은 같은 자리입니다.':'빈 건설 타일을 선택하세요.');
  if (g.campaign && rules.weapons[type].unlock > g.campaign.chapter) return deny(g, '다음 해역의 설계도를 확보하면 건설할 수 있습니다.');
  if (g.campaign && powerUsed(g)+rules.weapons[type].power > powerCapacity(g)) return deny(g, '시설 전력이 부족합니다. 동력 확장을 연구하거나 시설 구성을 바꾸세요.');
  if (!spend(g, rules.weapons[type].cost)) return false;
  const f = { id: g.nextId++, type, x, z, level: 1, cooldown: 0, aim: 0, investment:rules.weapons[type].cost };
  if(type==='wall')f.edge=edge;
  g.facilities.push(f); g.message = type==='wall'?'타일 면에 성벽을 건설했습니다. 같은 타일 안에 생산 시설이나 무장을 함께 배치할 수 있습니다.':`${rules.weapons[type].name} 건설 완료. 위치에 따라 실제 사거리가 달라집니다.`;
  emit(g, { type: 'build', ...facilityPosition(g, f) }); return true;
}
export function expansionCost(g) { const rules=rulesFor(g);return rules.expansionCost+(g.campaign?(g.tiles.length-9)*(rules.expansionCostPerTile || 0):0); }
export function expand(g, x, z) {
  const rules = rulesFor(g);
  if (!canManage(g)) return deny(g, '정비는 항해와 전투가 끝난 뒤 가능합니다.');
  if (!expansionSlots(g).some(t => t.x === x && t.z === z)) return deny(g, '섬 가장자리의 확장 타일을 선택하세요.');
  if (!spend(g, expansionCost(g))) return false;
  g.tiles.push({ x, z }); g.maxHull += rules.expansionHull; g.hull += rules.expansionHull;
  g.message = '섬 확장 완료. 건설 공간과 최대 내구도가 늘었습니다.'; emit(g, { type: 'build', x: g.island.x + x * balance.tileSize, z: g.island.z + z * balance.tileSize }); return true;
}
export function upgrade(g, id) {
  const f = g.facilities.find(f => f.id === id);
  if (!canManage(g)) return deny(g, '전투와 항해 중에는 강화할 수 없습니다.');
  if (!f || f.level >= rulesFor(g).maxLevel) return deny(g, '최대 단계의 무장입니다.');
  if(g.campaign && powerUsed(g)+facilityPower({...f,level:f.level+1})-facilityPower(f)>powerCapacity(g))return deny(g,'강화에 필요한 전력이 부족합니다. 동력 확장을 연구하거나 구성을 바꾸세요.');
  const cost=upgradeCost(f,g), investment=facilityInvestment(f,g);
  if(f.hp===0)return deny(g,'파괴된 시설을 복구한 뒤 강화하세요.');
  if (!spend(g, cost)) return false;
  f.investment=investment+cost;
  const oldHull=structureHull(f);f.level++;if(f.hp!==undefined)f.hp+=structureHull(f)-oldHull;
  const effect={wall:'성벽의 최대 내구도가 증가했습니다.',crane:'회수율과 회수 범위가 증가했습니다.',fishery:'어획량과 원정 어획 한도가 증가했습니다.',farm:'작물 수확량이 증가했습니다.',laboratory:'조사 범위가 증가했습니다. 4·7단계에서 유형별 표본도 늘어납니다.',shield:'방호율과 적용 범위가 증가했습니다.',workshop:'교전 밖의 자동 수리량이 증가했습니다.'}[f.type] || '공격력과 사거리가 증가했습니다.';
  g.message = `${rulesFor(g).weapons[f.type].name} ${f.level}단계. ${effect}`; return true;
}
export function setTargeting(g,id,strategy) {
  const f=g.facilities.find(f=>f.id===id);
  if(!canManage(g) || g.paused || !f || !['nearest','support','armored','weakest'].includes(strategy))return false;
  f.targeting=strategy;g.message='무장 우선 목표를 변경했습니다.';return true;
}
export function moveFacility(g, id, x, z, edge) {
  if (!canManage(g)) return deny(g, '전투와 항해 중에는 재배치할 수 없습니다.');
  const f = g.facilities.find(f => f.id === id);
  if (!f || !(f.type==='wall'?validWallSlot(g,x,z,edge ?? wallEdge(f),id):validSlot(g,x,z))) return deny(g, f?.type==='wall'?'성벽이 없는 타일 면을 선택하세요.':'빈 건설 타일을 선택하세요.');
  if(f.type==='wall')f.edge=edge ?? wallEdge(f);
  f.x = x; f.z = z; g.message = '재배치 완료. 비용은 들지 않습니다.'; return true;
}
export function demolish(g, id) {
  if (!canManage(g)) return deny(g, '전투와 항해 중에는 철거할 수 없습니다.');
  const f = g.facilities.find(f => f.id === id);
  if (!f) return false;
  const refund = Math.floor(facilityInvestment(f,g) * balance.salvageRate);
  g.resources += refund; g.facilities = g.facilities.filter(a => a.id !== id);
  g.message = `철거 완료. 자원 ${refund}을 회수했습니다.`; return true;
}
export function repair(g) {
  const rules = rulesFor(g);
  if (!canManage(g)) return deny(g, '전투와 항해 중에는 수리할 수 없습니다.');
  if (g.hull >= g.maxHull) return deny(g, '섬의 내구도가 온전합니다.');
  if (!spend(g, rules.repairCost)) return false;
  g.hull = Math.min(g.maxHull, g.hull + rules.repairAmount);
  g.message = `수리 완료. 내구도를 ${rules.repairAmount}까지 회복했습니다.`; return true;
}
export function collectProduction(g,id) {
  const f=g.facilities.find(f=>f.id===id);
  if(!g.campaign || !canManage(g) || g.paused || !f || !(f.stock>0))return false;
  const amount=f.stock;f.stock=0;g.resources+=amount;g.earned+=amount;
  g.message=`${rulesFor(g).weapons[f.type].name} 수확! 자원 +${amount}`;
  emit(g,{type:'production',...facilityPosition(g,f),amount});return true;
}
export function startEncounter(g, siteId) {
  const c=g.campaign;
  if(!c || c.stage!=='mission' || g.phase!=='playing' || g.paused || c.pendingChoice || g.catalog[c.objectiveIndex]?.id!==siteId)return false;
  c.waitingForDeparture=false;return true;
}
export function setRoute(g, siteId) {
  if (g.mode !== 'destination' || g.phase !== 'playing' || g.paused) return false;
  if(g.campaign?.pendingChoice)return deny(g,'회수한 물자를 선택한 뒤 다음 항로로 이동하세요.');
  if (g.combat) return deny(g, '목적지 모드에서는 교전이 끝날 때까지 위치가 고정됩니다.');
  if (siteId === 'home') {
    g.route = { id: 'home', x: 0, z: 0 }; g.message = '정박지로 귀환합니다.'; return true;
  }
  const site = sitesFor(g).find(s => s.id === siteId);
  if (!site || g.sites.find(s => s.id === siteId).cleared) return deny(g, '이미 정리한 해역입니다.');
  if(g.campaign && g.catalog[g.campaign.objectiveIndex]?.id!==siteId)return deny(g,'현재 목표를 확보하면 다음 항로가 열립니다.');
  // The same enemies exist in both modes. Only the island's navigation changes.
  const dx = g.island.x - site.x, dz = g.island.z - site.z, d = Math.hypot(dx, dz) || 1;
  const surveying=g.operation?.kind==='explore'&&g.enemies.every(e=>e.hp<=0)&&g.campaign.encounterWave+1>=site.waves;
  const arrival=surveying||site.task==='escort'?3:balance.arrivalDistance;
  g.route = { id: siteId, x: site.x + dx / d * arrival, z: site.z + dz / d * arrival };
  if(g.campaign)startEncounter(g,siteId);
  g.message = `${site.name}으로 항해합니다. 도착 후 자동으로 교전합니다.`; return true;
}
export function damageEnemy(g, enemy, amount) {
  if (enemy.hp <= 0 || enemy.captured) return;
  if(g.campaign && enemy.type!=='bulwark' && g.enemies.some(e=>e.type==='bulwark'&&e.hp>0&&distance(e,enemy)<14))amount*=0.65;
  enemy.hp = Math.max(0, enemy.hp - amount);
  emit(g, { type: 'hit', x: enemy.x, z: enemy.z, amount });
  if (enemy.hp === 0 && !enemy.rewarded) {
    enemy.rewarded = true;
    const baseReward = enemyStats(g, enemy).reward;
    const reward = baseReward+salvageBonus(g,enemy,baseReward);
    g.resources += reward; g.earned += reward; g.kills++;
    emit(g, { type: 'kill', x: enemy.x, z: enemy.z, reward });
    g.message = `${enemyStats(g, enemy).name} 격파! 자원 +${reward}`;
  }
}
function tick(g, dt, input) {
  const rules = rulesFor(g);
  if (g.campaign) beforeCampaignTick(g, dt);
  g.time += dt;
  if(g.campaign?.pendingChoice)return;
  // Saved engagements continue immediately. Newly spawned, inactive enemies
  // wait until the player departs, leaving a usable window for field refit.
  if(g.campaign?.waitingForDeparture && g.enemies.some(e=>e.hp>0&&e.active))g.campaign.waitingForDeparture=false;
  const sailedFrom={...g.island};
  const moveSpeed = rules.moveSpeed * (g.campaign ? campaignMoveMultiplier(g) : 1) * (g.campaign?.slowSeconds>0?0.55:1) * (g.campaign?.braceSeconds>0||g.operation?.kind==='defense'?0:1);
  if (g.mode === 'direct') {
    const length = Math.hypot(input.x || 0, input.z || 0);
    if (length) {
      if(g.campaign?.stage==='mission' && g.campaign.waitingForDeparture)startEncounter(g,g.catalog[g.campaign.objectiveIndex].id);
      g.island.x += (input.x || 0) / length * moveSpeed * dt;
      g.island.z += (input.z || 0) / length * moveSpeed * dt;
      g.heading = Math.atan2(input.x || 0, input.z || 0);
    }
  } else if (g.route) {
    const d = distance(g.island, g.route), step = moveSpeed * dt;
    if (d <= step) {
      g.island.x = g.route.x; g.island.z = g.route.z;
      g.message = g.route.id === 'home' ? '정박지에 도착했습니다. 다음 항해를 준비하세요.' : '교전 위치에 도착했습니다. 방어시설이 자동으로 공격합니다.';
      g.route = null;
    } else {
      const dx = g.route.x - g.island.x, dz = g.route.z - g.island.z;
      g.heading = Math.atan2(dx, dz);
      g.island.x += dx / d * step; g.island.z += dz / d * step;
    }
  }
  g.island.x = Math.max(-rules.worldLimit, Math.min(rules.worldLimit, g.island.x));
  g.island.z = Math.max(-rules.worldLimit, Math.min(rules.worldLimit, g.island.z));
  const physicalHull=g.campaign?.expeditionVersion===2;
  if(physicalHull) {
    // Fixed fortresses hold their position. A route pauses at their edge while
    // weapons clear the obstruction; it continues after the fortress is gone.
    for(let pass=0;pass<2;pass++)for(const e of g.enemies)if(e.hp>0 && enemyStats(g,e).speed===0) {
      const radius=enemyStats(g,e).radius;
      const q=separateFromHull(g,e,radius,p=>Math.abs(g.island.x-(p.x-e.x))<=rules.worldLimit && Math.abs(g.island.z-(p.z-e.z))<=rules.worldLimit);
      g.island.x-=q.x-e.x;g.island.z-=q.z-e.z;
    }
    for(const e of g.enemies)if(e.hp>0 && enemyStats(g,e).speed>0)Object.assign(e,separateFromHull(g,e,enemyStats(g,e).radius));
  }
  onSailed(g,sailedFrom);
  for (const site of sitesFor(g)) {
    if(g.campaign?.waitingForDeparture)continue;
    if (distance(g.island, site) <= balance.activationRange || g.fleet?.units.some(u=>u.hp>0&&distance(u,site)<=balance.activationRange)) for (const e of g.enemies) if (e.siteId === site.id && e.hp > 0 && !e.captured) e.active = true;
  }
  tickFleet(g,dt,damageEnemy,enemyStats);
  for (const e of g.enemies) {
    if (e.pendingDamage) { damageEnemy(g, e, e.pendingDamage); e.pendingDamage = 0; }
    if (e.hp <= 0 || !e.active || e.captured) continue;
    const stats = enemyStats(g, e);
    const baseTarget = g.operation?.kind==='defense'?defenseTarget(g,e):g.campaign && (g.campaign.expeditionVersion===2 ? g.campaign.allyPosition : g.campaign.allyHull>0&&g.campaign.missionId?.endsWith('-3') ? sitesFor(g)[0] : null) || g.island;
    const target=threatenedUnit(g,e,baseTarget,stats);
    const shipTarget=physicalHull && target===g.island;
    let contact=shipTarget?closestHullPoint(g,e):target;
    let d = shipTarget?contact.distance:distance(e,target);
    if (stats.speed > 0 && d > stats.range - 0.5) {
      const step = Math.min(stats.speed * dt, d - stats.range + 0.5);
      e.x += (contact.x - e.x) / d * step; e.z += (contact.z - e.z) / d * step;
      if(physicalHull)Object.assign(e,separateFromHull(g,e,stats.radius));
      contact=shipTarget?closestHullPoint(g,e):target;
      d = shipTarget?contact.distance:distance(e,target);
    }
    e.cooldown = Math.max(0, e.cooldown - dt);
    if(stats.repair) for(const other of g.enemies)if(other!==e&&other.hp>0&&distance(e,other)<17)other.hp=Math.min(other.maxHp,other.hp+stats.repair*dt*(1+(g.campaign.chapter || 0)*0.25));
    if(stats.spawn && (e.spawnCount || 0)<3) {
      e.spawnTimer-=dt;
      if(e.spawnTimer<=0) {
        e.spawnCount++;e.spawnTimer=12;
        const hp=Math.round(e.maxHp*0.19);
        const spawned={id:`${e.id}-spawn-${e.spawnCount}`,siteId:e.siteId,type:'bomber',x:e.x+3,z:e.z,hp,maxHp:hp,active:true,rewarded:false,cooldown:1,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10};
        if(physicalHull)Object.assign(spawned,separateFromHull(g,spawned,rules.enemies.bomber.radius));
        g.enemies.push(spawned);
        emit(g,{type:'build',x:e.x,z:e.z});
      }
    }
    if (g.campaign && e.type === 'leviathan' && e.windup) {
      e.windup.remaining -= dt;
      if (e.windup.remaining <= 0) {
        const zones=e.windup.zones||[e.windup];
        if (zones.some(zone=>(shipTarget?hullDistance(g,zone):distance(target,zone))<=zone.radius)) {
          applyHullDamage(g, e, stats.damage * (e.bossPhase === 2 ? 2 : 1.5), target);
          if(e.windup.pattern==='pulse')for(const f of g.facilities)f.cooldown=Math.min(5,f.cooldown+0.8);
          if(e.windup.pattern==='roots')g.campaign.slowSeconds=5;
          if(e.windup.pattern==='darkness')g.campaign.darknessSeconds=6;
        }
        for(const u of g.fleet?.units || [])if(u.hp>0&&u!==target&&zones.some(zone=>distance(u,zone)<=zone.radius+1))applyHullDamage(g,e,stats.damage*(e.bossPhase===2?2:1.5),u);
        if(e.windup.pattern==='charge'){Object.assign(e,physicalHull?separateFromHull(g,e.windup,stats.radius):{x:e.windup.x,z:e.windup.z});}
        emit(g, { type: 'enemyShot', x: e.x, z: e.z, tx: e.windup.x, tz: e.windup.z, amount: stats.damage });
        e.windup = null; e.cooldown = stats.interval;
      }
    } else if (stats.damage>0 && d <= stats.range && e.cooldown <= 0) {
      if (g.campaign && e.type === 'leviathan') {
        e.windup = bossWarning(g,e,target); emit(g, { type: 'warning', ...target });
      } else {
        applyHullDamage(g, e, stats.damage, target); e.cooldown = stats.interval;
        emit(g, { type: 'enemyShot', x: e.x, z: e.z, tx: contact.x, tz: contact.z, amount: stats.damage });
        if (stats.suicide) { e.hp = 0; e.rewarded = true; emit(g, { type: 'kill', x: e.x, z: e.z, reward: 0 }); }
      }
    }
  }
  for (const f of g.facilities) {
    if(f.hp===0)continue;
    f.cooldown = Math.max(0, f.cooldown - dt);
    const stats = weaponStats(f, g), pos = facilityPosition(g, f);
    if (g.campaign && f.type === 'workshop' && !g.combat) { g.hull = Math.min(g.maxHull, g.hull + dt * 2 * f.level); continue; }
    if (stats.damage <= 0 || g.campaign?.waitingForDeparture) continue;
    const priority=e=>f.targeting==='support'?(['tender','bulwark','carrier'].includes(e.type)?0:1):f.targeting==='armored'?-(enemyStats(g,e).armor || 0):f.targeting==='weakest'?e.hp:0;
    const target = g.enemies.filter(e => e.hp > 0 && !e.captured && distance(pos, e) <= stats.range).sort((a, b) => priority(a)-priority(b) || distance(pos, a) - distance(pos, b) || a.id.localeCompare(b.id))[0];
    if (!target) continue;
    target.active = true; f.aim = Math.atan2(target.x - pos.x, target.z - pos.z);
    if (f.cooldown > 0) continue;
    f.cooldown = stats.interval; g.shots++;
    emit(g, { type: 'shot', weapon: f.type, x: pos.x, z: pos.z, tx: target.x, tz: target.z, splash: stats.splash });
    const center = { x: target.x, z: target.z };
    for (const e of g.enemies) if (e === target || (stats.splash > 0 && distance(e, center) <= stats.splash)) {
      const armor = g.campaign ? enemyStats(g, e).armor || 0 : 0;
      damageEnemy(g, e, stats.damage * (1 - armor * (1 - (stats.pierce || 0))));
      if (stats.slow) { e.slowSeconds = 3; e.slowFactor = stats.slow; }
    }
    if(f.type==='mine'){f.hp=0;emit(g,{type:'kill',...pos,reward:0});g.message='기뢰가 접근한 공세를 폭파했습니다. 정비 중 재무장하세요.';}
  }
  for (const site of g.campaign ? [] : g.sites) {
    if (!site.cleared && g.enemies.filter(e => e.siteId === site.id).every(e => e.hp <= 0)) {
      site.cleared = true; emit(g, { type: 'clear', siteId: site.id });
      g.message = `${balance.sites.find(s => s.id === site.id).name} 정리 완료! 자원을 써서 확장·강화하세요.`;
    }
  }
  g.combat = (g.operation?.kind==='defense'&&!g.operation.waiting) || g.enemies.some(e => e.hp > 0 && e.active && ((physicalHull?hullDistance(g,e):distance(e,g.island))<42 || (physicalHull&&g.campaign.allyPosition&&distance(e,g.campaign.allyPosition)<42) || g.fleet?.units.some(u=>u.hp>0&&distance(u,e)<42)));
  if (g.campaign) {
    for (const hazard of g.campaign.hazards) if (hazard.remaining <= 0) {
      for(const u of g.fleet?.units || [])if(u.hp>0&&distance(u,hazard)<=hazard.radius+1)applyHullDamage(g,hazard,hazard.damage,u);
      if((physicalHull?hullDistance(g,hazard):distance(g.island,hazard)) > hazard.radius)continue;
      applyHullDamage(g, hazard, hazard.damage);
      if(!(g.campaign.braceSeconds>0)) {
        if(hazard.kind==='frost')g.campaign.slowSeconds=5;
        if(['current','maelstrom'].includes(hazard.kind))g.campaign.slowSeconds=3;
        if(hazard.kind==='fog')g.campaign.darknessSeconds=6;
        if(hazard.kind==='pulse')for(const f of g.facilities)f.cooldown=Math.min(5,f.cooldown+1.2);
      }
    }
    g.campaign.hazards = g.campaign.hazards.filter(h => h.remaining > 0);
    afterCampaignTick(g, dt);
    afterDefenseTick(g,dt);
  }
  else if (g.hull <= 0) { g.phase = 'defeat'; g.route = null; g.message = '섬이 침몰했습니다. 같은 조건으로 다시 도전할 수 있습니다.'; }
  else if (g.sites.every(s => s.cleared)) { g.phase = 'victory'; g.message = '모든 해역을 정리했습니다. 다른 이동 방식으로 같은 시나리오를 비교해 보세요.'; }
}
export function applyHullDamage(g, source, amount, target = g.island) {
  let reduction = 0;
  if (g.campaign) {
    reduction=Math.max(reduction,g.campaign.buffs?.protection || 0);
    if(g.campaign.braceSeconds>0 && source.kind)reduction=0.85;
    if (g.campaign.barrierSeconds > 0) reduction = Math.max(reduction, 0.65);
    for (const f of g.facilities) if (f.type === 'shield') {
      const pos = facilityPosition(g, f), stats = weaponStats(f, g);
      const dot = (pos.x - target.x) * (source.x - target.x) + (pos.z - target.z) * (source.z - target.z);
      if (distance(pos, target) <= stats.range && dot > 0) reduction = Math.max(reduction, 0.3 + (f.level - 1) * 0.04);
    }
  }
  const armor = g.campaign?.expeditionVersion===2 ? 1-(g.campaign.tech.bulkhead || 0)*0.06 : 1;
  const damage = amount * (1 - reduction) * armor;
  if (target === g.island) g.hull = Math.max(0, g.hull - damage);
  else if(target.facilityId!==undefined){const f=g.facilities.find(f=>f.id===target.facilityId);if(f){f.hp=Math.max(0,(f.hp ?? structureHull(f))-damage);if(f.hp===0)emit(g,{type:'kill',x:target.x,z:target.z,reward:0});}}
  else if(g.fleet?.units.includes(target))target.hp=Math.max(0,target.hp-damage);
  else g.campaign.allyHull = Math.max(0, g.campaign.allyHull - damage);
  return damage;
}
// Fixed 60 Hz logic makes combat deterministic across render frame rates.
// Wall-clock stalls are clamped to 250 ms rather than fast-forwarding unseen combat.
export function advance(g, seconds, input = {}) {
  if (g.phase !== 'playing' || g.paused) return;
  g.accumulator += Math.min(Math.max(seconds, 0), 0.25);
  while (g.accumulator + 1e-10 >= balance.step && g.phase === 'playing') {
    tick(g, balance.step, input); g.accumulator -= balance.step;
  }
}
