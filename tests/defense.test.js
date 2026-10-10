import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,moveFacility,damageEnemy,applyHullDamage,canManage,upgrade} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {returnToHarbor,powerUsed} from '../src/campaign.js';
import {launchDefense,startDefenseWave,retryDefense,availableDefenses} from '../src/frontier.js';
import {defenseTarget,structureHull,repairStructure,structureRepairCost} from '../src/fortifications.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';
const run=(g,s,input={})=>{for(let i=0;i<s*60;i++)advance(g,1/60,input);};
// Isolated rules, not earned progression or time evidence.
function base(chapter=0) {
  const g=createCampaign();g.resources=10000;g.campaign.completed=missions.slice(0,Math.max(1,chapter*6)).map(m=>m.id);g.campaign.chapter=chapter;return g;
}
test('defense contracts unlock sequentially and waves cannot be started twice',()=>{
  const fresh=createCampaign();assert.equal(launchDefense(fresh,'defense-coral-1'),false);
  const g=base();assert.equal(availableDefenses(g).length,1);assert.equal(launchDefense(g,'defense-coral-2'),false);assert.equal(launchDefense(g,'defense-coral-1'),true);
  assert.equal(g.operation.waiting,true);assert.equal(canManage(g),true);assert.equal(startDefenseWave(g),true);const ids=g.enemies.map(e=>e.id);assert.equal(startDefenseWave(g),false);assert.deepEqual(g.enemies.map(e=>e.id),ids);assert.equal(canManage(g),false);run(g,1,{x:1});assert.deepEqual(g.island,{x:0,z:0});
  validateCampaign(g);
});
test('a placed wall blocks the real firing line and destruction exposes the protected structure',()=>{
  const g=base();moveFacility(g,1,1,1);build(g,'wall',0,-1);launchDefense(g,'defense-coral-1');const wall=g.facilities.find(f=>f.type==='wall'),enemy={type:'armored',x:0,z:-12};
  assert.equal(defenseTarget(g,enemy).facilityId,wall.id);const hull=g.hull;
  applyHullDamage(g,enemy,200,defenseTarget(g,enemy));assert.equal(wall.hp,0);assert.equal(g.hull,hull);assert.equal(defenseTarget(g,enemy),g.island);
  const cash=g.resources,cost=structureRepairCost(wall);assert.equal(repairStructure(g,wall.id),true);assert.equal(g.resources,cash-cost);assert.equal(wall.hp,structureHull(wall));assert.equal(repairStructure(g,wall.id),false);
});
test('destroyed guns stop firing, power is released, and upgrades retain the previous damage',()=>{
  const g=base();launchDefense(g,'defense-coral-1');const gun=g.facilities[0],max=structureHull(gun);gun.hp=max-50;assert.equal(upgrade(g,gun.id),true);assert.equal(gun.hp,structureHull(gun)-50);
  startDefenseWave(g);gun.hp=0;const shots=g.shots;run(g,8);assert.equal(g.shots,shots);assert.equal(powerUsed(g),0);assert.equal(upgrade(g,gun.id),false);assert.equal(repairStructure(g,gun.id),false);
});
test('mines detonate once with splash and require paid rearming',()=>{
  const g=base(1);build(g,'mine',1,-1);launchDefense(g,'defense-coral-1');startDefenseWave(g);const mine=g.facilities.find(f=>f.type==='mine');
  for(const e of g.enemies){e.x=7;e.z=-4;e.hp=e.maxHp=500;e.active=true;}for(const f of g.facilities)if(f!==mine)f.hp=0;
  const hp=g.enemies.map(e=>e.hp);advance(g,1/60);assert.equal(mine.hp,0);assert.ok(g.enemies.every((e,i)=>e.hp<hp[i]));const shots=g.shots;run(g,1);assert.equal(g.shots,shots);assert.equal(repairStructure(g,mine.id),false);
  for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);assert.equal(g.operation.waiting,true);assert.equal(repairStructure(g,mine.id),true);assert.equal(mine.hp,structureHull(mine));
});
test('all waves, reward banking, defense record and result saves form a complete operation',()=>{
  const g=base();launchDefense(g,'defense-coral-1');const before=g.campaign.completed.length;
  for(let wave=0;wave<4;wave++){assert.equal(startDefenseWave(g),true);for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);validateCampaign(g);}
  assert.equal(g.phase,'mission-complete');assert.equal(g.campaign.stage,'operation-result');assert.equal(g.operation.result.score,100);assert.equal(g.campaign.completed.length,before);assert.equal(g.campaign.frontier.cleared[0],'defense-coral-1');
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.operation,g.operation);assert.deepEqual(restored.campaign.frontier,g.campaign.frontier);returnToHarbor(g);validateCampaign(g);assert.ok(availableDefenses(g).some(d=>d.id==='defense-coral-2'));
  const research=g.campaign.research;launchDefense(g,'defense-coral-1');for(let wave=0;wave<4;wave++){startDefenseWave(g);for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);}assert.equal(g.campaign.research,research);assert.equal(g.campaign.resultReward.resources,48);
});

test('returning from a late six-wave defense leaves a valid saveable harbor',()=>{
  for(const restore of [false,true]){
    const g=base(8);assert.equal(launchDefense(g,'defense-black-1'),true);
    for(let wave=0;wave<6;wave++){assert.equal(startDefenseWave(g),true);for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);}
    assert.equal(g.phase,'mission-complete');assert.equal(g.campaign.encounterWave,5);
    const frontier=structuredClone(g.campaign.frontier),research=g.campaign.research,cash=restore?g.checkpoint.resources:g.resources;
    const result=decodeSave(encodeSave(g));returnToHarbor(result,restore);
    assert.equal(result.resources,cash);assert.equal(result.campaign.research,research);assert.deepEqual(result.campaign.frontier,frontier);
    validateCampaign(result);assert.deepEqual(decodeSave(encodeSave(result)).campaign,result.campaign);assert.equal(result.campaign.stage,'harbor');
  }
});
test('mid-wave damage restores exactly, and defeat rolls the ship back without retaining loot',()=>{
  const g=base();build(g,'wall',0,1);launchDefense(g,'defense-coral-1');const before=structuredClone(g.checkpoint);startDefenseWave(g);g.facilities[0].hp=32;run(g,0.5);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.facilities,g.facilities);assert.deepEqual(restored.enemies,g.enemies);assert.deepEqual(restored.operation,g.operation);
  g.hull=0;g.resources+=400;advance(g,1/60);assert.equal(g.phase,'defeat');assert.equal(retryDefense(g),true);assert.equal(g.hull,before.hull);assert.equal(g.resources,before.resources);assert.equal(g.operation.waiting,true);assert.equal(g.campaign.frontier.cleared.length,0);
  const bad=decodeSave(encodeSave(g));bad.facilities[0].hp=1e6;assert.throws(()=>encodeSave(bad),/시설 내구도/);
});
test('a deep interior building cannot stall attackers at an expanded shore',()=>{
  const g=base();g.tiles=[];for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++)g.tiles.push({x,z});moveFacility(g,1,0,1);launchDefense(g,'defense-coral-1');
  assert.equal(defenseTarget(g,{type:'crawler',x:0,z:-25}),g.island);
});
