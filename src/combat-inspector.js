import {enemyStats} from './game.js';
import {bossTactics,enemyTactics} from './campaign-content.js';
import {enemyProtector,enemyProtectionRadius,bulwarkWard,protectsEnemy,enemySupportRadius,enemyRepairRate,repairsEnemy,enemyReinforcement} from './enemy-ai.js';

export function inspectionContext(g) {
  return [g.campaign?.missionId,g.operation?.id,g.operation?.round,g.campaign?.objectiveIndex,g.campaign?.encounterWave].join('|');
}

// Inspection is view state. Reading a contact must never activate it, cancel a
// formation selection, or become part of a campaign save.
export function inspectedContact(g,ui) {
  if(!g.campaign||!['mission','operation'].includes(g.campaign.stage)||g.phase!=='playing'||ui.inspectionContext!==inspectionContext(g))return null;
  const enemy=g.enemies.find(e=>e.id===ui.inspectedEnemy&&e.hp>0&&!e.captured);
  if(!enemy)return null;
  const stats=enemyStats(g,enemy),selected=(g.fleet?.units||[]).filter(u=>u.hp>0&&ui.selectedUnits.includes(u.id));
  const protector=enemyProtector(g,enemy),shield=enemy.type==='bulwark'?enemy:protector;
  const ward=enemy.type==='bulwark'?bulwarkWard(g,enemy,g.island):null;
  const protectedCount=enemy.type==='bulwark'?g.enemies.filter(e=>protectsEnemy(enemy,e)).length:0;
  const repairRate=enemyRepairRate(g,stats),patients=repairRate?g.enemies.filter(e=>repairsEnemy(enemy,e)).length:0,reinforcement=enemyReinforcement(enemy,stats);
  const support=[];
  if(enemy.type==='bulwark')support.push(`방호 ${enemyProtectionRadius}m · ${enemy.active?`피해35% 경감 · 보호 ${protectedCount}기${ward?` · ${enemyStats(g,ward).name} 엄호`:''}`:'교전 전 대기'}`);
  else if(protector)support.push(`방호 해수 엄호 · 피해35% 경감 · ${enemyProtectionRadius}m 밖으로 분리하거나 방호 해수를 먼저 제압하세요.`);
  if(repairRate)support.push(`복구 ${enemySupportRadius}m · ${!enemy.active?'교전 전 대기':patients?`아군 ${patients}기 회복 중`:'범위 안 부상 아군 없음'}`);
  if(reinforcement){
    const {remaining,seconds,status}=reinforcement;
    support.push(status==='exhausted'?'증원 3회 소진':`증원 ${remaining}/3회 남음 · ${status==='waiting'?'교전 전 대기':status==='blocked'?'봉쇄 포대에 의해 차단':status==='slowed'?`둔화 중 준비 정지 · 남은 ${seconds.toFixed(1)}초`:`${seconds.toFixed(1)}초 후 폭발 해파리`}`);
  }
  return {enemy,stats,selected,shield,repairRate,reinforcement,support:support.join(' / '),
    attacking:selected.filter(u=>u.command.type==='attack'&&u.command.target===enemy.id).length,
    queued:selected.filter(u=>u.orders?.some(o=>o.type==='attack'&&o.target===enemy.id)).length,
    hint:enemy.type==='leviathan'?bossTactics[stats.pattern]?.hint:enemyTactics[enemy.type],
    commandable:!g.paused&&!g.campaign.pendingChoice&&selected.length>0};
}
