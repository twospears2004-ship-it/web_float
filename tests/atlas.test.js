import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,advance,damageEnemy} from '../src/game.js';
import {missions,technologies} from '../src/campaign-content.js';
import {fieldDecisions} from '../src/expedition-content.js';
import {launchDefense} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {atlasHasSurvey,atlasSummary} from '../src/atlas.js';
import {returnToHarbor,resolveFieldDecision,researchTechnology,researchCost} from '../src/campaign.js';
import {recruitUnit} from '../src/fleet.js';
import {productionStats} from '../src/production.js';
import {encodeSave,decodeSave} from '../src/save.js';
// Isolated mechanics; injected funds/positions/damage are not playtime evidence.
function base(){const g=createCampaign();g.resources=10000;g.campaign.completed=missions.slice(0,18).map(m=>m.id);g.campaign.chapter=3;build(g,'shipyard',-1,0);recruitUnit(g,'skiff');return g;}
function survey(g,index){
  assert.equal(selectExplorationSite(g,`explore-node-${index}`),true);g.island={x:g.catalog[index].x,z:g.catalog[index].z};
  for(let i=0;i<100&&!g.campaign.pendingChoice;i++){for(const e of g.enemies)if(e.hp>0)damageEnemy(g,e,1e6);advance(g,0.25);}
  assert.ok(g.campaign.pendingChoice);const known=atlasHasSurvey(g.campaign,g.operation.id,g.catalog[index].id),option=fieldDecisions[g.campaign.pendingChoice.kind].options.find(o=>!o.elite&&(!known||!o.research));
  assert.equal(resolveFieldDecision(g,option.id),true);
}
function voyage(g,id,order){assert.equal(launchDefense(g,id),true);for(const i of order)survey(g,i);assert.equal(finishExploration(g),true);}
const full=[0,2,1,4,5,3,6,7],partial=[0,1,4,7],id='explore-kelp-1';

test('separate partial returns complete one chart, bank choices and award its bonus once',()=>{
  const g=base();voyage(g,id,partial);const first=g.campaign.atlas.charts[id];assert.equal(first.surveyed.length,4);assert.equal(first.fullRewarded,false);assert.equal(Object.keys(first.choices).length,4);returnToHarbor(g);
  assert.equal(launchDefense(g,id),true);for(const i of [2,3,5,6,1,4,7])survey(g,i);const cash=g.resources,points=g.campaign.research,bonus=g.campaign.bonusResearch;finishExploration(g);
  assert.equal(g.operation.result.full,false);assert.equal(g.operation.result.chartSurveyed,8);assert.equal(g.operation.result.newSurveys,4);assert.equal(g.operation.result.chartReward,true);
  assert.equal(g.resources-cash,Math.floor(400*0.4)+220);assert.equal(g.campaign.research-points,2+bonus);assert.equal(atlasSummary(g.campaign).full,1);assert.equal(g.campaign.atlas.charts[id].returns,2);assert.deepEqual(decodeSave(encodeSave(g)).campaign.atlas,g.campaign.atlas);
  returnToHarbor(g);voyage(g,id,[1,4,7]);assert.equal(g.operation.result.newSurveys,0);assert.equal(g.operation.result.chartReward,false);assert.equal(g.campaign.resultReward.research,0);assert.equal(g.campaign.resultReward.resources,160);
});

test('unbanked discovery, choices and optional surveys disappear on abandonment',()=>{
  const g=base();voyage(g,id,partial);returnToHarbor(g);const atlas=structuredClone(g.campaign.atlas),research=g.campaign.research;
  launchDefense(g,id);const cash=g.checkpoint.resources;survey(g,2);assert.ok(g.operation.visible.includes('explore-node-2'));assert.deepEqual(g.campaign.atlas,atlas);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.campaign.atlas,atlas);returnToHarbor(restored,true);
  assert.equal(restored.resources,cash);assert.equal(restored.campaign.research,research);assert.deepEqual(restored.campaign.atlas,atlas);
});

test('known archive decisions cannot charge for already banked research',()=>{
  const g=base();voyage(g,id,partial);returnToHarbor(g);launchDefense(g,id);selectExplorationSite(g,'explore-node-1');g.island={x:g.catalog[1].x,z:g.catalog[1].z};
  for(let i=0;i<100&&!g.campaign.pendingChoice;i++){for(const e of g.enemies)if(e.hp>0)damageEnemy(g,e,1e6);advance(g,0.25);}assert.ok(g.campaign.pendingChoice);
  const cash=g.resources,bonus=g.campaign.bonusResearch;assert.equal(resolveFieldDecision(g,'study'),false);assert.equal(g.resources,cash);assert.equal(g.campaign.bonusResearch,bonus);assert.equal(resolveFieldDecision(g,'parts'),true);
});

test('completed charts gate paid research and improve actual facility production and samples',()=>{
  const g=base();build(g,'farm',1,0);build(g,'laboratory',0,1);build(g,'fishery',1,-1);const tech=technologies.find(t=>t.id==='cartography'),cash=g.resources;
  assert.equal(researchTechnology(g,'cartography'),false);assert.equal(g.resources,cash);voyage(g,id,full);returnToHarbor(g);
  const lab=g.facilities.find(f=>f.type==='laboratory'),fish=g.facilities.find(f=>f.type==='fishery'),farm=g.facilities.find(f=>f.type==='farm'),before=[lab,fish,farm].map(f=>productionStats(f,g)),cost=researchCost(g,tech),funds=g.resources;
  assert.equal(researchTechnology(g,'cartography'),true);assert.equal(g.resources,funds-cost.materials);assert.equal(productionStats(lab,g).samples,before[0].samples+1);assert.ok(productionStats(fish,g).catchValue>before[1].catchValue);assert.ok(productionStats(farm,g).cropValue>before[2].cropValue);
  const unchanged=g.resources;assert.equal(researchTechnology(g,'cartography'),false);assert.equal(g.resources,unchanged);
  for(const key of ['explore-coral-1','explore-frost-1','explore-kelp-2']){voyage(g,key,full);returnToHarbor(g);}assert.equal(atlasSummary(g.campaign).full,4);assert.equal(researchTechnology(g,'cartography'),true);assert.equal(productionStats(lab,g).samples,before[0].samples+2);decodeSave(encodeSave(g));
});

test('new exploration nodes bank laboratory samples while repeat nodes cannot create research',()=>{
  const g=base();build(g,'laboratory',0,1);voyage(g,id,partial);returnToHarbor(g);
  launchDefense(g,id);for(const i of [2,3,5,6,1,4,7])survey(g,i);assert.ok(g.campaign.bonusResearch>0);const points=g.campaign.research,bonus=g.campaign.bonusResearch;finishExploration(g);assert.equal(g.campaign.research-points,bonus+2);returnToHarbor(g);
  voyage(g,id,full);assert.equal(g.campaign.bonusResearch,0);assert.equal(g.campaign.resultReward.research,0);decodeSave(encodeSave(g));
});

test('old full and partial exploration counts migrate without inventing optional locations or paying again',()=>{
  for(const order of [partial,full]){const g=base();voyage(g,id,order);returnToHarbor(g);delete g.campaign.atlas;const cash=g.resources,points=g.campaign.research,restored=decodeSave(encodeSave(g)),chart=restored.campaign.atlas.charts[id];
    assert.equal(restored.resources,cash);assert.equal(restored.campaign.research,points);assert.equal(chart.legacySurveyed,order.length);assert.equal(chart.surveyed.length,order.length===8?8:3);assert.equal(chart.fullRewarded,true);assert.deepEqual(chart.choices,{});encodeSave(restored);
  }
});

test('malformed banked charts, decision strings and fabricated bonus flags are rejected',()=>{
  const g=base();voyage(g,id,partial);returnToHarbor(g);
  for(const mutate of [r=>r.surveyed.push(r.surveyed[0]),r=>r.seen=['explore-node-1'],r=>r.returns=0,r=>r.choices['explore-node-1']='<img src=x>',r=>r.choices={},r=>r.fullRewarded=true,r=>r.legacySurveyed=2]){const bad=structuredClone(g);mutate(bad.campaign.atlas.charts[id]);assert.throws(()=>encodeSave(bad),/보관한|항로/);}
  const bad=structuredClone(g);bad.campaign.atlas.charts.other=bad.campaign.atlas.charts[id];assert.throws(()=>encodeSave(bad),/보관한 항로/);
});

test('saved chart research needs its earned full charts and a complete chart cannot repay its bonus',()=>{
  const g=base();g.campaign.tech.cartography=1;assert.throws(()=>encodeSave(g),/완성 해도/);delete g.campaign.tech.cartography;
  voyage(g,id,full);returnToHarbor(g);g.campaign.tech.cartography=2;assert.throws(()=>encodeSave(g),/완성 해도/);delete g.campaign.tech.cartography;
  g.campaign.atlas.charts[id].fullRewarded=false;assert.throws(()=>encodeSave(g),/보상 기록/);
});
