// Isolated mechanic setups verify paid outcomes; they do not prove journey time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,createGame,upgrade,upgradeStatus,weaponStats,build} from '../src/game.js';
import {facilityGrowth,facilityEffect} from '../src/facility-growth.js';
import {structureHull} from '../src/fortifications.js';
import {encodeSave,decodeSave} from '../src/save.js';

test('upgrade explains combined power and resource deficits and charges neither until both clear',()=>{
  const g=createCampaign(),f=g.facilities[0];f.level=2;g.resources=1000;assert.equal(build(g,'mortar',1,-1),true);assert.equal(build(g,'crane',-1,-1),true);assert.equal(build(g,'fishery',-1,0),true);g.resources=90;
  const state=upgradeStatus(g,f.id),before=structuredClone(f);
  assert.equal(state.cost,91);assert.equal(state.powerShortage,1);assert.equal(state.resourceShortage,1);assert.match(state.reason,/전력 1 부족.*자원 1 부족/);
  assert.equal(upgrade(g,f.id),false);assert.equal(g.resources,90);assert.deepEqual(f,before);
  g.campaign.tech.reactor=1;g.resources=91;assert.equal(upgrade(g,f.id),true);assert.equal(g.resources,0);assert.equal(f.level,3);
});

test('maximum, pause, movement and destruction gates prevent upgrades without consuming inventory',()=>{
  const g=createCampaign(),f=g.facilities[0],before=g.resources;
  g.paused=true;assert.match(upgradeStatus(g,f.id).reason,/일시정지/);assert.equal(upgrade(g,f.id),false);g.paused=false;
  g.route={id:'home'};assert.match(upgradeStatus(g,f.id).reason,/정비/);assert.equal(upgrade(g,f.id),false);g.route=null;
  f.hp=0;assert.match(upgradeStatus(g,f.id).reason,/복구/);assert.equal(upgrade(g,f.id),false);f.hp=structureHull(f);f.level=3;
  assert.match(upgradeStatus(g,f.id).reason,/최대 Lv.3/);assert.equal(facilityGrowth(g,f).next,null);assert.equal(upgrade(g,f.id),false);assert.equal(g.resources,before);
});

test('next weapon effects include real research, field buff and darkness, then match the paid upgrade and save',()=>{
  const g=createCampaign(),f=g.facilities[0];g.campaign.tech.ballistics=2;g.campaign.buffs={damage:0.15,protection:0,speed:0};g.campaign.darknessSeconds=2;
  const before=JSON.stringify(g),preview=facilityGrowth(g,f);assert.equal(JSON.stringify(g),before);assert.match(preview.next,/피해 34.2.*범위 15.4m/);
  assert.equal(upgrade(g,f.id),true);assert.equal(facilityEffect(g,f),preview.next);assert.ok(Math.abs(weaponStats(f,g).damage-34.224)<1e-9);
  // Buffed harbor setup is intentionally isolated. Use a valid harbor state to
  // verify that the actual paid level/cost and derived forecast survive a save.
  g.campaign.buffs={damage:0,protection:0,speed:0};g.campaign.darknessSeconds=0;
  const restored=decodeSave(encodeSave(g));assert.equal(restored.resources,104);assert.equal(restored.facilities[0].level,2);assert.equal(facilityEffect(restored,restored.facilities[0]),facilityEffect(g,f));
});

test('production, defenses and laboratory breakpoint forecasts match their actual paid upgrades',()=>{
  for(const type of ['crane','fishery','farm','laboratory','wall','shield','workshop','mine']){
    const g=createCampaign();g.campaign.chapter=9;g.campaign.tech={reactor:5,distributed:3,precision:3,cultivation:2,cartography:2};g.resources=20000;
    assert.equal(build(g,type,1,-1),true);const f=g.facilities.at(-1);f.level=type==='laboratory'?3:2;f.hp=structureHull(f)-10;
    const preview=facilityGrowth(g,f),oldHull=f.hp,oldMax=structureHull(f);assert.equal(upgrade(g,f.id),true,type);assert.equal(facilityEffect(g,f),preview.next,type);assert.equal(f.hp,oldHull+structureHull(f)-oldMax,type);
    if(type==='laboratory')assert.match(facilityEffect(g,f),/4표본/);
    if(type==='crane')assert.match(facilityEffect(g,f),/65%.*35m/);
  }
});

test('yard forecasts honor the strongest living yard and training weapons retain their actual prices',()=>{
  const g=createCampaign();g.campaign.chapter=3;g.campaign.tech.reactor=5;g.resources=1000;build(g,'shipyard',1,-1);const f=g.facilities.at(-1);f.level=2;
  assert.match(facilityGrowth(g,f).current,/정원 8.*2종/);assert.match(facilityGrowth(g,f).next,/정원 10.*4종/);
  build(g,'shipyard',-1,-1);g.facilities.at(-1).level=4;const forecast=facilityGrowth(g,f);assert.match(forecast.next,/정원 12.*4종/);assert.equal(upgrade(g,f.id),true);assert.equal(facilityEffect(g,f),forecast.next);
  const training=createGame(),t=training.facilities[0],preview=facilityGrowth(training,t);assert.equal(preview.cost,46);assert.equal(upgrade(training,t.id),true);assert.equal(training.resources,74);assert.equal(facilityEffect(training,t),preview.next);
});
