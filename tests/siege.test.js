import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,damageEnemy,enemyStats,canManage,upgrade} from '../src/game.js';
import {missions,campaignRules} from '../src/campaign-content.js';
import {returnToHarbor,resupplyAbilities,useAbility} from '../src/campaign.js';
import {launchDefense,startDefenseWave,retryDefense,availableSieges} from '../src/frontier.js';
import {siegeContracts,isEnemyStructure,basePower} from '../src/siege-content.js';
import {recruitUnit,orderUnits} from '../src/fleet.js';
import {waterPath,navigable} from '../src/navigation.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';

const run=(g,s)=>{for(let i=0;i<s*60;i++)advance(g,1/60);};
// Funded rule fixtures isolate mechanics; these are not earned playtime evidence.
function base(chapter=0) {
  const g=createCampaign();g.resources=10000;g.campaign.completed=missions.slice(0,Math.max(1,chapter*6)).map(m=>m.id);g.campaign.chapter=chapter;
  build(g,'shipyard',-1,0);recruitUnit(g,'skiff');return g;
}
const capture=g=>{for(const e of g.enemies)if(e.type==='baseCore')damageEnemy(g,e,1e6);advance(g,1/60);};

test('siege requires an earned unlock and a real fleet, then preserves three ordered bases',()=>{
  const fresh=createCampaign();assert.equal(launchDefense(fresh,'siege-coral-1'),false);
  const g=base();assert.equal(availableSieges(g).length,1);assert.equal(launchDefense(g,'siege-coral-2'),false);assert.equal(launchDefense(g,'siege-coral-1'),true);
  assert.equal(g.catalog.length,3);assert.equal(startDefenseWave(g),true);assert.equal(startDefenseWave(g),false);assert.equal(canManage(g),false);assert.equal(recruitUnit(g,'skiff'),false);assert.equal(upgrade(g,1),false);validateCampaign(g);
});

test('sailing and fleet orders during raid refit cannot produce fish before the base starts',()=>{
  const g=base();g.mode='direct';build(g,'fishery',1,0);launchDefense(g,'siege-coral-1');
  orderUnits(g,[1],'move',{x:40,z:0});for(let i=0;i<8*60;i++)advance(g,1/60,{x:1,z:0});
  const fishery=g.facilities.find(f=>f.type==='fishery');assert.equal(fishery.stock || 0,0);assert.equal(fishery.travel,0);
  startDefenseWave(g);for(let i=0;i<8*60;i++)advance(g,1/60,{x:-1,z:0});assert.ok(fishery.stock>0);validateCampaign(g);
});

test('powered towers and core armor change immediately when generators die, and repair stops',()=>{
  const g=base();launchDefense(g,'siege-coral-1');startDefenseWave(g);
  const generator=g.enemies.find(e=>e.type==='generator'),core=g.enemies.find(e=>e.type==='baseCore'),tower=g.enemies.find(e=>e.type==='gunTower');
  const before=enemyStats(g,tower),armor=enemyStats(g,core).armor;assert.equal(basePower(g,core),1);
  core.hp-=100;generator.active=true;run(g,1);assert.ok(core.hp>core.maxHp-100);
  damageEnemy(g,generator,1e6);assert.equal(basePower(g,core),0);assert.ok(enemyStats(g,core).armor<armor);assert.ok(enemyStats(g,tower).damage<before.damage);assert.ok(enemyStats(g,tower).range<before.range);
  const hp=core.hp;run(g,1);assert.equal(core.hp,hp);validateCampaign(g);
});

test('all base layouts have separate physical structures and reachable flanking paths',()=>{
  for(const d of siegeContracts) {
    const g=base(d.endgame?11:d.chapter);if(d.endgame)g.campaign.completed=missions.map(m=>m.id);g.campaign.frontier={version:1,cleared:siegeContracts.filter(o=>o.chapter===d.chapter&&o.rank<d.rank).map(o=>o.id),records:{},totalSeconds:0};
    assert.equal(launchDefense(g,d.id),true);
    for(let n=0;n<3;n++) {
      startDefenseWave(g);const structures=g.enemies.filter(e=>isEnemyStructure(e.type));
      for(const [i,e] of structures.entries()) {
        assert.ok(Math.abs(e.x)<108&&Math.abs(e.z)<108);
        for(const other of structures.slice(i+1))assert.ok(Math.hypot(e.x-other.x,e.z-other.z)>campaignRules.enemies[e.type].radius+campaignRules.enemies[other.type].radius,`${d.id} overlaps ${e.type}/${other.type}`);
      }
      const generator=g.enemies.find(e=>e.type==='generator'),path=waterPath(g,g.fleet.units[0],{x:generator.x,z:generator.z},0.85);
      assert.ok(path.length>0,`${d.id}/${n} has no generator approach`);assert.ok(path.every(p=>navigable(g,p,0.85)));capture(g);validateCampaign(g);
    }
  }
});

test('a captured base surrenders without fabricated kills or duplicated optional salvage',()=>{
  const g=base();launchDefense(g,'siege-coral-1');startDefenseWave(g);const before=g.kills;capture(g);
  assert.equal(g.kills,before+1);assert.equal(g.operation.round,1);assert.equal(g.operation.waiting,true);assert.equal(g.sites[0].cleared,true);assert.equal(canManage(g),true);
  const captive=g.enemies.find(e=>e.hp>0),resources=g.resources;assert.equal(captive.captured,true);assert.equal(orderUnits(g,[1],'attack',{id:captive.id}),false);
  damageEnemy(g,captive,1e6);run(g,2);assert.equal(g.resources,resources);assert.equal(g.combat,false);
  g.island={x:captive.x,z:captive.z};assert.equal(useAbility(g,'pulse'),true);
  assert.equal(captive.active,false);assert.equal(captive.pendingDamage,0);validateCampaign(g);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.enemies,g.enemies);assert.deepEqual(restored.operation,g.operation);
  restored.enemies.find(e=>e.hp>0).active=true;assert.throws(()=>validateCampaign(restored));
});

test('all cores, first rewards, crops and saved results complete a raid without banking research twice',()=>{
  const g=base(3);build(g,'farm',1,0);const first='siege-coral-1';launchDefense(g,first);
  for(let n=0;n<3;n++){startDefenseWave(g);capture(g);validateCampaign(g);}
  assert.equal(g.phase,'mission-complete');assert.ok(g.sites.every(s=>s.cleared));assert.equal(g.facilities.find(f=>f.type==='farm').stock,18);
  assert.equal(g.campaign.resultReward.resources,220);assert.equal(g.campaign.resultReward.research,1);const research=g.campaign.research;
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.operation,g.operation);returnToHarbor(g);assert.ok(availableSieges(g).some(d=>d.id==='siege-coral-2'));
  launchDefense(g,first);for(let n=0;n<3;n++){startDefenseWave(g);capture(g);}assert.equal(g.campaign.research,research);assert.equal(g.campaign.resultReward.resources,88);validateCampaign(g);
});

test('mid-raid saving and failure rollback retain exact paid fleet, resources and old defense saves',()=>{
  const g=base();launchDefense(g,'siege-coral-1');startDefenseWave(g);orderUnits(g,[1],'attack',{id:g.enemies.find(e=>e.type==='generator').id});run(g,2);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.enemies,g.enemies);
  const checkpoint=structuredClone(g.checkpoint);g.hull=0;advance(g,1/60);assert.equal(g.phase,'defeat');assert.equal(retryDefense(g),true);assert.equal(g.resources,checkpoint.resources);assert.deepEqual(g.fleet.units.map(u=>u.hp),checkpoint.fleet.units.map(u=>u.hp));validateCampaign(g);
  const supply=g.campaign.abilityCharges.pulse;
  assert.equal(resupplyAbilities(g),true);assert.equal(g.campaign.abilityCharges.pulse,Math.min(12,supply+2));assert.equal(startDefenseWave(g),true);assert.equal(resupplyAbilities(g),false);
  returnToHarbor(g,true);launchDefense(g,'defense-coral-1');startDefenseWave(g);assert.equal(decodeSave(encodeSave(g)).operation.kind,'defense');
});
