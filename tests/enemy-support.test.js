// Isolated tactical positions and health are not earned progression evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,enemyStats} from '../src/game.js';
import {launchMission,useAbility} from '../src/campaign.js';
import {campaignRules} from '../src/campaign-content.js';
import {repairsEnemy,enemyRepairRate,enemyReinforcement} from '../src/enemy-ai.js';
import {inspectedContact,inspectionContext} from '../src/combat-inspector.js';
import {encodeSave,decodeSave} from '../src/save.js';
function battle(){const g=createCampaign();launchMission(g,'coral-1');g.facilities=[];const seed=g.enemies[0];g.enemies=[];return {g,add:(type,x=90,z=0,id=type)=>{const hp=campaignRules.enemies[type].hp,e={...structuredClone(seed),id,type,x,z,hp,maxHp:hp,active:true};g.enemies.push(e);return e;}};}
const run=(g,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)advance(g,1/60);};
const contact=(g,e)=>inspectedContact(g,{inspectedEnemy:e.id,inspectionContext:inspectionContext(g),selectedUnits:[]});
test('mobile repair eligibility requires an engaged living wounded local ally inside 17m',()=>{
  const {g,add}=battle(),medic=add('tender'),patient=add('carrier',100);patient.hp-=50;
  for(const [change,eligible]of [[{},true],[{x:107},false],[{x:106.999},true],[{active:false},false],[{hp:0},false],[{captured:true},false],[{siteId:'other'},false],[{hp:patient.maxHp},false]]){const e={...patient,...change};assert.equal(repairsEnemy(medic,e),eligible);}
  assert.equal(repairsEnemy(medic,medic),false);for(const change of [{hp:0},{active:false},{captured:true}])assert.equal(repairsEnemy({...medic,...change},patient),false);
  assert.equal(enemyRepairRate(g,enemyStats(g,medic)),12);g.campaign.chapter=11;assert.equal(enemyRepairRate(g,enemyStats(g,medic)),45);
});
test('the actual healing tick and inspector agree, clamp full health and leave idle or cross-site patients unchanged',()=>{
  const {g,add}=battle(),medic=add('tender'),patient=add('carrier',95),idle=add('carrier',94,0,'idle'),other=add('carrier',93,0,'other');patient.hp-=.1;idle.hp-=20;idle.active=false;other.hp-=20;other.siteId='other';
  const before=structuredClone(g),info=contact(g,medic);assert.equal(info.repairRate,12);assert.match(info.support,/아군 1기 회복 중/);assert.deepEqual(g,before);
  advance(g,1/60);assert.equal(patient.hp,patient.maxHp);assert.equal(idle.hp,idle.maxHp-20);assert.equal(other.hp,other.maxHp-20);assert.match(contact(g,medic).support,/부상 아군 없음/);
  medic.active=false;assert.match(contact(g,medic).support,/교전 전 대기/);
});
test('stationary generators retain the previous healing of idle neighboring structures',()=>{
  const {g,add}=battle(),generator=add('generator'),core=add('baseCore',95);core.active=false;core.hp-=20;core.siteId='other';assert.equal(repairsEnemy(generator,core),true);advance(g,1/60);assert(Math.abs(core.hp-(core.maxHp-19.98))<1e-9);
});
test('a slowed carrier pauses its remaining preparation then resumes without resetting the timer or exceeding three spawns',()=>{
  const {g,add}=battle(),e=add('carrier');e.spawnTimer=1;e.slowSeconds=2;e.slowFactor=.5;run(g,1);assert.equal(e.spawnTimer,1);assert.equal(e.spawnCount,0);assert.equal(enemyReinforcement(e,enemyStats(g,e)).status,'slowed');
  run(g,1.1);assert(e.spawnTimer<1&&e.spawnTimer>.8);run(g,1);assert.equal(e.spawnCount,1);assert(g.enemies.some(a=>a.id===`${e.id}-spawn-1`));run(g,25);assert.equal(e.spawnCount,3);assert.equal(g.enemies.filter(a=>a.id.startsWith(`${e.id}-spawn-`)).length,3);assert.equal(contact(g,e).support,'증원 3회 소진');
});
test('actual pulse and frost hits suppress reinforcements; pause and pending decisions freeze both countdowns',()=>{
  const pulse=battle(),p=pulse.add('carrier',23);p.spawnTimer=1;assert.equal(useAbility(pulse.g,'pulse'),true);run(pulse.g,1);assert.equal(p.spawnTimer,1);assert.equal(p.spawnCount,0);assert.match(contact(pulse.g,p).support,/둔화 중 준비 정지 · 남은 1.0초/);
  const frost=battle(),f=frost.add('carrier',0,-12);f.spawnTimer=1;frost.g.facilities=[{id:1,type:'frost',x:0,z:-1,level:1,cooldown:0,aim:0}];advance(frost.g,1/60);assert.equal(f.slowSeconds,3);const remaining=f.spawnTimer;run(frost.g,.5);assert.equal(f.spawnTimer,remaining);assert.equal(f.spawnCount,0);
  frost.g.paused=true;const paused=structuredClone(frost.g);run(frost.g,2);assert.deepEqual(frost.g,paused);frost.g.paused=false;frost.g.campaign.pendingChoice={kind:'supplies',siteId:'objective-0'};const choice=structuredClone(frost.g);run(frost.g,2);for(const key of ['enemies','facilities','hull','resources'])assert.deepEqual(frost.g[key],choice[key]);
});
test('inactive, exhausted and blocked carriers report their actual state; mere slowSeconds without reduced speed does not suppress',()=>{
  const {g,add}=battle(),e=add('carrier');e.active=false;run(g,1);assert.equal(e.spawnTimer,10);assert.match(contact(g,e).support,/교전 전 대기/);e.active=true;assert.equal(enemyReinforcement(e,{spawn:false}).status,'blocked');assert.equal(enemyReinforcement({...e,slowSeconds:2,slowFactor:.3},{spawn:false}).status,'blocked');
  e.slowSeconds=2;e.slowFactor=1;run(g,1);assert(Math.abs(e.spawnTimer-9)<1e-9);e.spawnCount=3;assert.equal(enemyReinforcement(e,{spawn:false}).status,'exhausted');
});
test('suppressed reinforcement and mobile healing replay exactly after an ordinary active save with existing fields',()=>{
  const {g,add}=battle(),e=add('carrier'),medic=add('tender',95);e.hp-=30;e.spawnTimer=1;e.slowSeconds=2;e.slowFactor=.3;run(g,.5);const restored=decodeSave(encodeSave(g));restored.paused=false;assert.equal(restored.enemies[0].spawnTimer,1);run(g,3);run(restored,3);assert.deepEqual(restored.enemies,g.enemies);assert.equal(restored.hull,g.hull);assert.equal(restored.resources,g.resources);assert(!Object.hasOwn(e,'reinforcement'));assert(!Object.hasOwn(medic,'patients'));
});
