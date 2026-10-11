import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,weaponStats} from '../src/game.js';
import {researchStatus,researchTechnology,powerCapacity} from '../src/campaign.js';
import {technologies} from '../src/campaign-content.js';
import {researchEffect} from '../src/research-view.js';
import {productionStats} from '../src/production.js';
const tech=id=>technologies.find(t=>t.id===id);
test('research explains both exact shortages and refuses an atomic charge until both are met',()=>{
  const g=createCampaign();g.campaign.chapter=9;g.resources=1199;g.campaign.research=5;
  assert.equal(researchStatus(g,tech('precision')).reason,'자료 1 부족 · 자원 1 부족');assert.equal(researchTechnology(g,'precision'),false);assert.equal(g.resources,1199);assert.equal(g.campaign.research,5);
  g.resources++;g.campaign.research++;assert.equal(researchStatus(g,tech('precision')).available,true);assert.equal(researchTechnology(g,'precision'),true);assert.equal(g.resources,0);assert.equal(g.campaign.research,0);
});
test('maximum, pause, harbor, blueprint and chart gates have actionable reasons',()=>{
  const g=createCampaign();g.campaign.research=100;g.resources=5000;
  assert.match(researchStatus(g,tech('cultivation')).reason,/설계도/);assert.match(researchStatus(g,tech('cartography')).reason,/완성 해도 0\/1/);
  g.paused=true;assert.match(researchStatus(g,tech('ballistics')).reason,/일시정지/);g.paused=false;g.campaign.stage='mission';assert.match(researchStatus(g,tech('ballistics')).reason,/정박지/);
  g.campaign.tech.ballistics=5;assert.match(researchStatus(g,tech('ballistics')).reason,/최대 단계/);
});
test('displayed research contributions correspond to actual weapon, hull, power and production changes',()=>{
  const g=createCampaign();g.campaign.chapter=9;g.resources=10000;g.campaign.research=100;const f={type:'cannon',level:1},base=weaponStats(f,g).damage;
  researchTechnology(g,'ballistics');assert.equal(researchEffect('ballistics',1),'무장 피해 +12%');assert.ok(Math.abs(weaponStats(f,g).damage/base-1.12)<1e-9);
  const hull=g.maxHull;researchTechnology(g,'bulkhead');assert.equal(g.maxHull,hull+80);assert.match(researchEffect('bulkhead',1),/내구 \+80.*6%/);
  const power=powerCapacity(g);researchTechnology(g,'reactor');assert.equal(powerCapacity(g),power+2);assert.equal(researchEffect('reactor',1),'전력 용량 +2');
  const crop=productionStats({type:'farm',level:1},g).cropValue;researchTechnology(g,'cultivation');assert.equal(productionStats({type:'farm',level:1},g).cropValue,Math.round(crop*1.2));assert.match(researchEffect('cultivation',1),/20%/);
  researchTechnology(g,'precision');assert.equal(productionStats({type:'crane',level:1},g).range,25);assert.match(researchEffect('precision',1),/10%p.*3m/);
});
