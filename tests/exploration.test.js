import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,damageEnemy,setRoute} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {fieldDecisions} from '../src/expedition-content.js';
import {explorations,explorationSites} from '../src/exploration-content.js';
import {launchDefense,availableExplorations} from '../src/frontier.js';
import {selectExplorationSite,finishExploration,canExtract} from '../src/exploration.js';
import {recruitUnit} from '../src/fleet.js';
import {returnToHarbor,resolveFieldDecision} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {atlasHasSurvey} from '../src/atlas.js';
const run=(g,s)=>{for(let i=0;i<s*60;i++)advance(g,1/60);};
// Funded isolated mechanics, including forced damage/positions, are not earned
// progression or playtime evidence. The separate model audit pays real costs.
function base(chapter=0){const g=createCampaign();g.resources=10000;g.campaign.completed=missions.slice(0,Math.max(1,chapter*6)).map(m=>m.id);g.campaign.chapter=chapter;build(g,'shipyard',-1,0);recruitUnit(g,'skiff');return g;}
function survey(g,index){assert.equal(selectExplorationSite(g,`explore-node-${index}`),true);g.island={x:g.catalog[index].x,z:g.catalog[index].z};for(let i=0;i<100&&!g.campaign.pendingChoice;i++){for(const e of g.enemies)if(e.hp>0)damageEnemy(g,e,1e6);advance(g,0.25);}assert.ok(g.campaign.pendingChoice);decodeSave(encodeSave(g));}
function choose(g){const known=atlasHasSurvey(g.campaign,g.operation.id,g.catalog[g.campaign.objectiveIndex].id),option=fieldDecisions[g.campaign.pendingChoice.kind].options.find(o=>!o.elite&&(!known||!o.research));assert.equal(resolveFieldDecision(g,option.id),true);}

test('exploration needs a real fleet and earned unlock, and only known signals can be selected',()=>{
  assert.equal(launchDefense(createCampaign(),'explore-coral-1'),false);const g=base();g.fleet.units=[];
  assert.equal(launchDefense(g,'explore-coral-1'),false);recruitUnit(g,'skiff');assert.equal(availableExplorations(g).length,1);assert.equal(launchDefense(g,'explore-coral-2'),false);
  assert.equal(launchDefense(g,'explore-coral-1'),true);assert.deepEqual(g.operation.visible,['explore-node-0']);assert.equal(selectExplorationSite(g,'explore-node-7'),false);assert.equal(finishExploration(g),false);decodeSave(encodeSave(g));
});
test('fleet scouts discover signals without receiving survey rewards, and pause freezes discovery',()=>{
  const g=base();launchDefense(g,'explore-coral-1');const before=g.resources;g.fleet.units[0].x=g.catalog[2].x;g.fleet.units[0].z=g.catalog[2].z;g.fleet.units[0].command={type:'hold'};
  g.paused=true;run(g,1);assert.equal(g.operation.visible.includes('explore-node-2'),false);g.paused=false;run(g,0.1);
  assert.ok(g.operation.visible.includes('explore-node-2'));assert.equal(g.resources,before);assert.equal(g.sites.some(s=>s.cleared),false);assert.equal(selectExplorationSite(g,'explore-node-2'),true);assert.equal(selectExplorationSite(g,'explore-node-0'),false);
});
test('survey needs defeated waves and real proximity; a field choice freezes combat and resolves once',()=>{
  const g=base();launchDefense(g,'explore-coral-1');selectExplorationSite(g,'explore-node-0');run(g,1);assert.equal(g.operation.scan,0);
  for(let i=0;i<2;i++){for(const e of g.enemies)damageEnemy(g,e,1e6);run(g,2.1);}g.island={x:0,z:0};g.fleet.units[0].x=75;g.fleet.units[0].z=75;g.fleet.units[0].command={type:'hold'};run(g,1);assert.equal(g.operation.scan,0);
  const site=g.catalog[0];g.fleet.units[0].x=site.x;g.fleet.units[0].z=site.z;run(g,1);assert.ok(g.operation.scan>0&&g.operation.scan<2);assert.equal(decodeSave(encodeSave(g)).operation.scan,g.operation.scan);run(g,1.1);assert.ok(g.sites[0].cleared);assert.ok(g.campaign.pendingChoice);const frozen=structuredClone(g.fleet);run(g,4);assert.deepEqual(g.fleet,frozen);
  choose(g);assert.equal(resolveFieldDecision(g,'ammo'),false);assert.equal(selectExplorationSite(g,'explore-node-2'),true);decodeSave(encodeSave(g));
});
test('branch order, discoveries, partial scan and field choices restore exactly and reject invalid maps',()=>{
  const g=base();launchDefense(g,'explore-coral-1');survey(g,0);choose(g);survey(g,2);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.operation,g.operation);assert.deepEqual(restored.campaign.pendingChoice,g.campaign.pendingChoice);assert.deepEqual(restored.sites,g.sites);
  choose(g);survey(g,1);choose(g);assert.equal(g.campaign.objectiveIndex,1);
  const bad=structuredClone(g);bad.operation.visible.push('unknown');assert.throws(()=>encodeSave(bad),/탐험 발견/);bad.operation.visible=[...g.operation.visible];bad.operation.scan=3;assert.throws(()=>encodeSave(bad),/탐험 발견/);
});
test('all surveys grow crops and bank full-chart rewards and research only once',()=>{
  const g=base(3);build(g,'farm',1,0);build(g,'laboratory',0,1);const id='explore-kelp-1';launchDefense(g,id);
  for(const i of [0,2,1,4,5,3,6,7]){survey(g,i);choose(g);}assert.ok(canExtract(g));const cash=g.resources,points=g.campaign.research;
  assert.equal(finishExploration(g),true);assert.equal(g.operation.result.surveyed,8);assert.equal(g.operation.result.full,true);assert.equal(g.resources-cash,220+3*60+160+3*20);assert.ok(g.campaign.research>points);assert.ok(g.facilities.find(f=>f.type==='farm').stock>0);decodeSave(encodeSave(g));
  assert.equal(finishExploration(g),false);returnToHarbor(g);assert.ok(availableExplorations(g).some(d=>d.id==='explore-kelp-2'));launchDefense(g,id);
  for(const i of [0,1,4,7]){survey(g,i);choose(g);}const replayPoints=g.campaign.research;assert.equal(finishExploration(g),true);assert.equal(g.campaign.research,replayPoints);assert.equal(g.operation.result.full,false);assert.equal(g.campaign.resultReward.resources,Math.floor((220+3*60)*0.4));decodeSave(encodeSave(g));
});
test('abandoning a surveyed voyage restores paid ships, economy and unbanked research',()=>{
  const g=base();launchDefense(g,'explore-coral-1');const before=structuredClone(g.checkpoint);survey(g,0);choose(g);survey(g,1);resolveFieldDecision(g,'study');assert.ok(g.campaign.bonusResearch>0);
  g.fleet.units[0].hp=1;returnToHarbor(g,true);assert.equal(g.resources,before.resources);assert.deepEqual(g.fleet.units.map(u=>[u.id,u.hp]),before.fleet.units.map(u=>[u.id,u.hp]));assert.equal(g.campaign.research,0);assert.deepEqual(g.campaign.frontier.cleared,[]);decodeSave(encodeSave(g));
});
test('36 authored expeditions have connected branching maps and three required landmarks',()=>{
  assert.equal(explorations.length,36);assert.equal(new Set(explorations.map(d=>d.name)).size,36);
  for(const d of explorations){const sites=explorationSites(d),visited=new Set([sites[0].id]);for(let i=0;i<8;i++)for(const s of sites)if(visited.has(s.id))for(const id of s.neighbors)visited.add(id);assert.equal(visited.size,8);assert.equal(sites.filter(s=>s.landmark).length,3);for(const s of sites){assert.ok(Math.abs(s.x)<100&&Math.abs(s.z)<100);assert.ok(fieldDecisions[s.decision]);}}
});
test('destination exploration remains reachable after losing the entire fleet',()=>{
  const g=base();g.mode='destination';launchDefense(g,'explore-coral-1');selectExplorationSite(g,'explore-node-0');g.fleet.units[0].hp=0;
  for(let i=0;i<2;i++){for(const e of g.enemies)damageEnemy(g,e,1e6);run(g,2.1);}
  const site=g.catalog[0];assert.equal(g.operation.scan,0);
  // Use the same normal destination action as the field survey button.
  assert.equal(setRoute(g,site.id),true);assert.ok(Math.hypot(g.route.x-site.x,g.route.z-site.z)<4);run(g,6);assert.ok(g.sites[0].cleared);decodeSave(encodeSave(g));
});
test('saved exploration records reject missing, fractional, out-of-range and text survey counts',()=>{
  const g=base(),id='explore-coral-1';launchDefense(g,id);
  for(const i of [0,2,1,4,5,3,6,7]){survey(g,i);choose(g);}assert.equal(finishExploration(g),true);returnToHarbor(g);
  assert.equal(decodeSave(encodeSave(g)).campaign.frontier.records[id].surveyed,8);
  for(const value of [undefined,null,2,9,3.5,'8','<img src=x onerror=alert(1)>']){
    const bad=structuredClone(g);bad.campaign.frontier.records[id].surveyed=value;
    assert.throws(()=>encodeSave(bad),/탐험 기록/);
  }
});
