import {enemyStats} from './game.js';
import {bossTactics,enemyTactics} from './campaign-content.js';
import {enemyProtector,enemyProtectionRadius,bulwarkWard,protectsEnemy} from './enemy-ai.js';

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
  return {enemy,stats,selected,shield,
    support:enemy.type==='bulwark'?`방호 ${enemyProtectionRadius}m · ${enemy.active?`피해35% 경감 · 보호 ${protectedCount}기${ward?` · ${enemyStats(g,ward).name} 엄호`:''}`:'교전 전 대기'}`:protector?`방호 해수 엄호 · 피해35% 경감 · ${enemyProtectionRadius}m 밖으로 분리하거나 방호 해수를 먼저 제압하세요.`:'',
    attacking:selected.filter(u=>u.command.type==='attack'&&u.command.target===enemy.id).length,
    queued:selected.filter(u=>u.orders?.some(o=>o.type==='attack'&&o.target===enemy.id)).length,
    hint:enemy.type==='leviathan'?bossTactics[stats.pattern]?.hint:enemyTactics[enemy.type],
    commandable:!g.paused&&!g.campaign.pendingChoice&&selected.length>0};
}
