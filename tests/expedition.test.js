import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,upgrade,setRoute,startEncounter,damageEnemy,applyHullDamage,weaponStats,setTargeting,upgradeCost,facilityInvestment,demolish} from '../src/game.js';
import {missions,missionSites,getMission,getChapter} from '../src/campaign-content.js';
import {operationRoutes} from '../src/expedition-content.js';
import {launchMission,currentFieldDecision,resolveFieldDecision,useAbility,spawnWave,repairEscort,resupplyAbilities,campaignEnemyStats,maxFacilityLevel,returnToHarbor,retryMission} from '../src/campaign.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';

const run=(g,seconds,input={})=>{for(let i=0;i<seconds*60;i++)advance(g,1/60,input);};
function campaignAt(index=0) {
  const g=createCampaign('destination');g.campaign.completed=missions.slice(0,index).map(m=>m.id);g.campaign.chapter=Math.min(11,Math.floor(index/6));
  return g;
}
function firstDecision(g,id='coral-1') {
  build(g,'mortar',-1,-1);launchMission(g,id);
  for(let t=0;t<180*60&&!g.campaign.pendingChoice&&g.phase==='playing';t++) {
    if(!g.combat&&!g.route)setRoute(g,g.catalog[g.campaign.objectiveIndex].id);
    if(g.combat)useAbility(g,'pulse');advance(g,1/60);
  }
  assert.ok(currentFieldDecision(g));
}

test('72 operations have unique authored titles and multi-encounter routes within navigable bounds',()=>{
  assert.equal(new Set(missions.map(m=>m.name)).size,72);
  assert.equal(operationRoutes.length,12);
  for(const m of missions) {
    const sites=missionSites(m,2);assert.ok(sites.length>=3&&sites.length<=12);
    assert.ok(sites.every(s=>Math.abs(s.x)<=110&&Math.abs(s.z)<=110&&s.waves>=1));
    assert.equal(sites.filter(s=>s.task==='guardian').length,m.kind==='boss'?1:0);
    if(m.chapter>0)assert.equal(sites.length,12);
  }
});
test('a field choice pauses hostile simulation, survives reload, and cannot be rewarded twice',()=>{
  const g=createCampaign('destination');firstDecision(g);const before=structuredClone(g);
  run(g,8,{x:1});assert.deepEqual(g.island,before.island);assert.equal(g.hull,before.hull);assert.equal(g.campaign.abilityCooldowns.pulse,before.campaign.abilityCooldowns.pulse);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.campaign.pendingChoice,g.campaign.pendingChoice);restored.paused=false;
  const count=restored.campaign.abilityCharges.mend;assert.equal(resolveFieldDecision(restored,'repair'),true);
  assert.equal(restored.campaign.abilityCharges.mend,count+1);assert.equal(restored.campaign.objectiveIndex,1);
  const after=structuredClone(restored);assert.equal(resolveFieldDecision(restored,'repair'),false);assert.deepEqual(restored,after);assert.equal(validateCampaign(restored),true);
});
test('dangerous salvage changes the next real enemy wave and costs cannot overdraw resources',()=>{
  const base=campaignAt(1);firstDecision(base,'coral-2');assert.equal(base.campaign.pendingChoice.kind,'salvage');
  const deep=structuredClone(base),surface=structuredClone(base);resolveFieldDecision(deep,'deep');resolveFieldDecision(surface,'surface');
  assert.equal(deep.resources-surface.resources,55);assert.equal(deep.enemies.length,surface.enemies.length+1);
  const g=createCampaign('destination');firstDecision(g);g.campaign.pendingChoice.kind='ammunition';g.catalog[0].decision='ammunition';g.resources=49;
  const before=structuredClone(g);assert.equal(resolveFieldDecision(g,'calibrate'),false);assert.equal(g.resources,before.resources);assert.deepEqual(g.campaign,before.campaign);
});
test('facility upgrade rejects extra power without charging and priority settings survive save',()=>{
  const g=createCampaign();g.resources=1000;build(g,'mortar',-1,-1);build(g,'mortar',1,-1);upgrade(g,1);const money=g.resources;
  assert.equal(upgrade(g,1),false);assert.equal(g.resources,money);assert.equal(g.facilities[0].level,2);
  assert.equal(setTargeting(g,1,'support'),true);assert.equal(setTargeting(g,1,'constructor'),false);
  assert.equal(decodeSave(encodeSave(g)).facilities[0].targeting,'support');
});
test('repair enemies heal neighbors, and killing them removes that support',()=>{
  const g=campaignAt(18);launchMission(g,'kelp-1');g.facilities=[];const medic=g.enemies.find(e=>e.type==='tender'),other=g.enemies[0];
  Object.assign(medic,{x:4,z:0,active:true});Object.assign(other,{x:5,z:0,active:true,hp:50});g.enemies=[medic,other];
  run(g,1);assert.ok(other.hp>50);damageEnemy(g,medic,1e6);const hp=other.hp;run(g,1);assert.equal(other.hp,hp);
});
test('bulwark protection and carrier reinforcements affect actual combat with bounded spawns',()=>{
  const g=campaignAt(42);launchMission(g,'pearl-1');g.facilities=[];const first=g.enemies[0],second=g.enemies[1];
  Object.assign(first,{type:'crawler',x:0,z:0,hp:500,maxHp:500,active:true});Object.assign(second,{type:'bulwark',x:5,z:0,hp:500,maxHp:500,active:true});g.enemies=[first,second];
  damageEnemy(g,first,100);assert.equal(first.hp,435);damageEnemy(g,second,1e6);damageEnemy(g,first,100);assert.equal(first.hp,335);
  Object.assign(first,{type:'carrier',active:true,spawnTimer:0,spawnCount:0,x:26,z:0,hp:10000,maxHp:10000});g.enemies=[first];g.hull=g.maxHull=10000;
  run(g,55);assert.equal(first.spawnCount,3);assert.equal(g.enemies.filter(e=>e.type==='bomber').length,3);
  assert.equal(validateCampaign(g),true);
});
test('weather brace needs a warning, locks movement, reduces weather damage and obeys cooldown',()=>{
  const g=createCampaign('direct');launchMission(g,'coral-1');assert.equal(useAbility(g,'brace'),false);
  g.campaign.hazards=[{id:'test-storm',kind:'storm',x:0,z:0,radius:6,remaining:1,damage:60}];
  assert.equal(useAbility(g,'brace'),true);assert.equal(useAbility(g,'brace'),false);run(g,1.1,{x:1});
  assert.equal(g.island.x,0);assert.equal(g.hull,351);assert.equal(g.campaign.hazards.length,0);assert.equal(validateCampaign(g),true);
});
test('escort receives emergency repairs and paid field service is atomic and bounded',()=>{
  const g=campaignAt(2);launchMission(g,'coral-3');g.campaign.allyPosition={x:0,z:0};g.campaign.allyHull=100;
  assert.equal(useAbility(g,'mend'),true);assert.equal(g.campaign.allyHull,190);assert.equal(g.hull,g.maxHull);
  const money=g.resources;assert.equal(repairEscort(g),true);assert.equal(g.resources,money-40);assert.equal(g.campaign.allyHull,g.campaign.allyMaxHull);
  g.resources=74;const charges=structuredClone(g.campaign.abilityCharges);assert.equal(resupplyAbilities(g),false);assert.deepEqual(g.campaign.abilityCharges,charges);
  g.resources=75;assert.equal(resupplyAbilities(g),true);assert.equal(g.resources,0);assert.equal(g.campaign.abilityCharges.mend,charges.mend+2);
});
test('pre-expedition v1 mission saves restore the old battle layout and can finish safely',()=>{
  const g=createCampaign('destination');build(g,'mortar',-1,-1);launchMission(g,'coral-1');
  for(const k of ['expeditionVersion','encounterWave','decisions','pendingChoice','bonusResearch','buffs','eliteNext','abilityCharges','allyPosition'])delete g.campaign[k];
  g.catalog=missionSites(getMission('coral-1'));g.sites=g.catalog.map(s=>({id:s.id,cleared:false}));g.enemies=[];spawnWave(g);
  const restored=decodeSave(encodeSave(g));assert.equal(restored.catalog.length,1);assert.equal(restored.enemies.length,2);restored.paused=false;setRoute(restored,'objective-0');run(restored,100);
  assert.equal(restored.phase,'mission-complete');assert.equal(restored.campaign.completed.length,1);assert.equal(validateCampaign(restored),true);
});
test('later seas unlock stronger facilities and replays retain their actual chapter theme',()=>{
  const g=campaignAt(66);assert.equal(maxFacilityLevel(g),9);g.resources=5000;g.facilities[0].level=8;assert.equal(upgrade(g,1),true);
  assert.equal(decodeSave(encodeSave(g)).facilities[0].level,9);
  launchMission(g,'coral-1');assert.equal(getChapter(g).id,'coral');assert.equal(g.campaign.chapter,11);
});
test('destroyed batteries weaken actual core armor while field choices keep earned progress',()=>{
  const g=campaignAt(3);g.resources=1000;build(g,'mortar',-1,-1);upgrade(g,1);upgrade(g,2);launchMission(g,'coral-4');
  for(let t=0;t<300*60&&g.campaign.fortressBreaks<1;t++) {
    const decision=currentFieldDecision(g);if(decision)resolveFieldDecision(g,decision.options.find(o=>!(o.cost>g.resources)).id);
    if(!g.combat&&!g.route)setRoute(g,g.catalog[g.campaign.objectiveIndex].id);if(g.combat)useAbility(g,'pulse');advance(g,1/60);
  }
  assert.equal(g.campaign.fortressBreaks,1);assert.ok(Math.abs(campaignEnemyStats(g,{type:'nest'}).armor-0.495)<1e-9);
  assert.equal(decodeSave(encodeSave(g)).campaign.fortressBreaks,1);
});

test('armor gives each weapon a real role in the shared damage pipeline',()=>{
  const shoot=(type,enemyType)=>{
    const g=campaignAt(12);launchMission(g,'rust-1');
    g.facilities=[{id:1,type,x:0,z:-1,level:1,cooldown:0,aim:0}];
    const e=g.enemies[0];Object.assign(e,{type:enemyType,x:0,z:-12,hp:1000,maxHp:1000,active:false});g.enemies=[e];
    startEncounter(g,'objective-0');
    advance(g,1/60);return 1000-e.hp;
  };
  assert.ok(Math.abs(shoot('cannon','armored')-4.8)<1e-9);
  assert.ok(Math.abs(shoot('mortar','armored')-17.1)<1e-9);
  assert.ok(Math.abs(shoot('rail','armored')-72.24)<1e-9);
  assert.equal(shoot('cannon','crawler'),16);
});
test('overlapping defenses preserve the stronger weather protection',()=>{
  const g=createCampaign();launchMission(g,'coral-1');g.campaign.braceSeconds=3;g.campaign.barrierSeconds=6;
  assert.ok(Math.abs(applyHullDamage(g,{kind:'storm',x:0,z:0},60)-9)<1e-9);
  assert.ok(Math.abs(applyHullDamage(g,{type:'crawler',x:0,z:0},60)-21)<1e-9);
});
test('harbor clears temporary field effects and each departure replenishes cooldowns',()=>{
  const g=createCampaign();launchMission(g,'coral-1');useAbility(g,'barrier');
  Object.assign(g.campaign,{buffs:{damage:0.3,protection:0.12,speed:-0.1},slowSeconds:5,darknessSeconds:6,braceSeconds:3});
  returnToHarbor(g,true);assert.deepEqual(g.campaign.buffs,{damage:0,protection:0,speed:0});
  for(const key of ['slowSeconds','darknessSeconds','braceSeconds','barrierSeconds'])assert.equal(g.campaign[key],0);
  launchMission(g,'coral-1');assert.equal(useAbility(g,'barrier'),true);retryMission(g);
  assert.equal(g.campaign.abilityCharges.barrier,6);assert.equal(useAbility(g,'barrier'),true);assert.equal(validateCampaign(g),true);
});
test('late upgrades spend recorded investments and demolition cannot invent repriced old costs',()=>{
  const g=campaignAt(66);g.resources=10000;const f=g.facilities[0];f.level=3;
  assert.equal(facilityInvestment(f,g),202);assert.equal(upgradeCost(f,g),158);
  assert.equal(upgrade(g,f.id),true);assert.equal(f.investment,360);
  const saved=decodeSave(encodeSave(g));saved.paused=false;const money=saved.resources;
  assert.equal(demolish(saved,f.id),true);assert.equal(saved.resources-money,216);
  assert.equal(demolish(saved,f.id),false);
  assert.equal(upgradeCost({...f,level:8},g),2461);
  const invalid=structuredClone(g);invalid.facilities[0].investment=-1;assert.throws(()=>validateCampaign(invalid));
});
