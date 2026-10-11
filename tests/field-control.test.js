import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCampaign,createGame,advance,weaponStats} from '../src/game.js';
import {researchTechnology,researchStatus,researchCost,abilityStats,useAbility,launchMission,returnToHarbor} from '../src/campaign.js';
import {technologies} from '../src/campaign-content.js';
import {atlasSummary} from '../src/atlas.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {facilityEffect} from '../src/facility-growth.js';
import {researchEffect} from '../src/research-view.js';
const technology=technologies.find(t=>t.id==='cryodynamics');
// This previously earned colony is an import compatibility and paid-action
// fixture. The isolated combat/chart mutations below are not playtime evidence.
const earned=()=>{const g=decodeSave(fs.readFileSync('tests/fixtures/endgame-earned-coral-network-result.json','utf8'));returnToHarbor(g);return g;};
function charts(g,count){for(const id of Object.keys(g.campaign.atlas.charts).slice(count))delete g.campaign.atlas.charts[id];}
function purchase(g,level){for(let i=0;i<level;i++)assert.equal(researchTechnology(g,'cryodynamics'),true);}

test('research requires banked full charts at each level and pays both exact currencies once',()=>{
  const g=earned(),cash=g.resources,points=g.campaign.research;
  for(const [level,count,cost]of [[0,6,2200],[1,12,4000],[2,18,5800]]){
    const candidate=earned();purchase(candidate,level);charts(candidate,count-1);
    assert.equal(atlasSummary(candidate.campaign).full,count-1);assert.match(researchStatus(candidate,technology).reason,new RegExp(`${count-1}/${count}`));
    const before=JSON.stringify(candidate.campaign.tech),money=candidate.resources,info=candidate.campaign.research;
    assert.equal(researchTechnology(candidate,'cryodynamics'),false);assert.equal(candidate.resources,money);assert.equal(candidate.campaign.research,info);assert.equal(JSON.stringify(candidate.campaign.tech),before);
    assert.deepEqual(researchCost(g,technology),{points:6+level,materials:cost});assert.equal(researchTechnology(g,'cryodynamics'),true);
  }
  assert.equal(g.resources,cash-12000);assert.equal(g.campaign.research,points-21);assert.equal(researchTechnology(g,'cryodynamics'),false);assert.equal(g.resources,cash-12000);
});
test('unbanked current exploration progress cannot substitute for charts and blueprint/harbor/pause gates remain active',()=>{
  const g=earned();charts(g,5);g.sites=Array.from({length:8},(_,i)=>({id:`explore-node-${i}`,cleared:true}));
  assert.match(researchStatus(g,technology).reason,/5\/6/);assert.equal(researchTechnology(g,'cryodynamics'),false);
  g.campaign.chapter=3;assert.match(researchStatus(g,technology).reason,/설계도/);g.campaign.chapter=4;g.campaign.stage='mission';assert.match(researchStatus(g,technology).reason,/정박지/);g.paused=true;assert.match(researchStatus(g,technology).reason,/일시정지/);
});
test('insufficient materials or research refuses an atomic payment and does not add a sparse tech field',()=>{
  const g=earned();g.resources=2199;g.campaign.research=5;
  assert.equal(researchStatus(g,technology).reason,'자료 1 부족 · 자원 1 부족');assert.equal(researchTechnology(g,'cryodynamics'),false);assert.equal(Object.hasOwn(g.campaign.tech,'cryodynamics'),false);
  g.resources++;g.campaign.research++;assert.equal(researchTechnology(g,'cryodynamics'),true);assert.equal(g.resources,0);assert.equal(g.campaign.research,0);
});
test('paid control research matches actual frost stats and current/next UI without modifying ordinary damage/range/cadence',()=>{
  const g=earned(),f={type:'frost',level:4},before=weaponStats(f,g),other=weaponStats({type:'mortar',level:4},g);
  for(let level=1;level<=3;level++){
    assert.equal(researchTechnology(g,'cryodynamics'),true);const stats=weaponStats(f,g);
    assert.equal(stats.splash,6+level);assert.equal(stats.slow,[.45,.4,.35][level-1]);
    for(const key of ['damage','range','interval'])assert.equal(stats[key],before[key]);
    assert.deepEqual(weaponStats({type:'mortar',level:4},g),other);
    assert.match(facilityEffect(g,f),new RegExp(`폭발 ${6+level}m.*둔화 ${50+level*5}%`));assert.match(researchEffect('cryodynamics',level),new RegExp(`폭발 ${6+level}m.*둔화 ${50+level*5}%.*파동 ${24+level*2}m`));
  }
});
test('actual frost splash reaches the paid radius and applies its slow in the shared attack pipeline',()=>{
  for(const level of [0,1,2,3]){
    const g=createCampaign();launchMission(g,'coral-1');g.campaign.tech.cryodynamics=level;g.facilities=[{id:1,type:'frost',x:0,z:-1,level:1,cooldown:0,aim:0}];g.campaign.waitingForDeparture=false;
    const seed=g.enemies[0],radius=6+level;
    g.enemies=[0,radius-.01,radius+.01].map((offset,i)=>({...seed,id:`test-${i}`,type:'generator',x:10+offset,z:-4,hp:10000,maxHp:10000,active:false}));
    advance(g,1/60);assert.equal(g.shots,1);assert.ok(g.enemies[0].hp<10000);assert.ok(g.enemies[1].hp<10000);assert.equal(g.enemies[2].hp,10000);
    assert.equal(g.enemies[1].slowSeconds,3);assert.equal(g.enemies[1].slowFactor,weaponStats(g.facilities[0],g).slow);assert.equal(g.enemies[2].slowSeconds||0,0);
  }
});
test('pulse hits the exact derived range around the island and excludes outside, captured and dead contacts',()=>{
  for(const level of [0,1,2,3]){
    const g=earned();purchase(g,level);launchMission(g,'coral-1');const radius=24+level*2,seed=g.enemies[0];
    g.enemies=[{...seed,x:radius,z:0},{...seed,id:'outside',x:radius+.001,z:0},{...seed,id:'dead',x:1,z:0,hp:0},{...seed,id:'captured',x:1,z:0,captured:true}];
    const charges=g.campaign.abilityCharges.pulse,def=abilityStats(g,'pulse');assert.equal(def.range,radius);assert.equal(def.cooldown,28);
    assert.equal(useAbility(g,'pulse'),true);assert.ok(g.enemies[0].pendingDamage>0);assert.equal(g.enemies[0].slowFactor,.3);assert.equal(g.enemies[0].slowSeconds,4);
    for(const e of g.enemies.slice(1))assert.equal(e.pendingDamage,undefined);
    assert.equal(g.campaign.abilityCharges.pulse,charges-1);assert.equal(g.events.at(-1).radius,radius);assert.equal(useAbility(g,'pulse'),false);assert.equal(g.campaign.abilityCharges.pulse,charges-1);
  }
});
test('pulse still refuses pause, harbor, exhausted charges and pending decisions without changing state',()=>{
  const g=earned();purchase(g,3);launchMission(g,'coral-1');
  for(const change of [{paused:true},{charges:0},{pendingChoice:{}},{stage:'harbor'}]){
    g.paused=!!change.paused;g.campaign.abilityCharges.pulse=change.charges??12;g.campaign.pendingChoice=change.pendingChoice??null;g.campaign.stage=change.stage??'mission';const before=JSON.stringify(g);
    assert.equal(useAbility(g,'pulse'),false);assert.equal(JSON.stringify(g),before);
  }
});
test('legacy saves and training keep original effects and do not acquire research during migration',()=>{
  const g=earned(),f={type:'frost',level:1};assert.equal(JSON.parse(encodeSave(g)).version,1);const restored=decodeSave(encodeSave(g));
  assert.equal(Object.hasOwn(restored.campaign.tech,'cryodynamics'),false);assert.equal(weaponStats(f,restored).splash,6);assert.equal(weaponStats(f,restored).slow,.5);assert.equal(abilityStats(restored,'pulse').range,24);assert.equal(weaponStats(f,createGame()).splash,6);
});
test('new research uses format three even for a zero-valued explicit field; tampered version and invalid levels are rejected',()=>{
  const g=earned();g.campaign.tech.cryodynamics=0;const zero=encodeSave(g);assert.equal(JSON.parse(zero).version,3);assert.equal(decodeSave(zero).campaign.tech.cryodynamics,0);
  purchase(g,3);const text=encodeSave(g),envelope=JSON.parse(text);assert.equal(envelope.version,3);assert.equal(decodeSave(text).campaign.tech.cryodynamics,3);
  envelope.version=2;assert.throws(()=>decodeSave(JSON.stringify(envelope)),/저장 형식/);g.campaign.tech.cryodynamics=4;assert.throws(()=>encodeSave(g));g.campaign.tech.cryodynamics=1.5;assert.throws(()=>encodeSave(g));
});
test('format three research requires its banked prerequisites and survives normal departure/abandon rollback',()=>{
  const g=earned();purchase(g,3);const paid=g.resources;launchMission(g,'coral-1');assert.equal(JSON.parse(encodeSave(g)).version,3);const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.campaign.tech,g.campaign.tech);
  returnToHarbor(restored,true);assert.equal(restored.resources,paid);assert.equal(restored.campaign.tech.cryodynamics,3);assert.equal(JSON.parse(encodeSave(restored)).version,3);
  charts(restored,17);assert.throws(()=>encodeSave(restored),/완성 해도/);
});
