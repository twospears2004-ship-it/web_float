import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCampaign,advance,damageEnemy,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {classicExplorations,reconstructionExplorations,explorations,explorationSites} from '../src/exploration-content.js';
import {reconstructionRoutes} from '../src/reconstruction-content.js';
import {availableExplorations,launchDefense} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {returnToHarbor,resolveFieldDecision} from '../src/campaign.js';
import {atlasMarkup} from '../src/atlas-view.js';
import {atlasSummary} from '../src/atlas.js';
import {encodeSave,decodeSave} from '../src/save.js';
const id='explore-coral-3';
const ready=()=>{const g=decodeSave(fs.readFileSync('tests/fixtures/field-control-earned-harbor.json','utf8'));g.paused=false;return g;};
// Only the local mechanics tests force damage/proximity. Fresh continuous models
// separately verify normal paid progression, losses and every result save.
function survey(g,index){
  const site=g.catalog[index];if(!g.operation.visible.includes(site.id))g.operation.visible.push(site.id);
  assert(selectExplorationSite(g,site.id));g.island={x:site.x,z:site.z};
  for(let i=0;i<160&&!g.campaign.pendingChoice;i++){for(const e of g.enemies)if(e.hp>0)damageEnemy(g,e,1e6);advance(g,0.25);}
  assert(g.campaign.pendingChoice);assert(resolveFieldDecision(g,{supplies:'repair',archive:'parts',signal:'shield',salvage:'surface',rescue:'rescue',ammunition:'recycle'}[g.campaign.pendingChoice.kind]));
}
test('12 reconstruction charts have distinct connected third routes and real support-hunting formations',()=>{
  assert.equal(classicExplorations.length,24);assert.equal(explorations.length,36);assert.equal(reconstructionExplorations.length,12);
  const positions=new Set(explorations.map(d=>JSON.stringify(explorationSites(d).map(s=>[s.x,s.z]))));assert.equal(positions.size,36);
  for(const d of reconstructionExplorations){
    assert.equal(d.combatChapter,11);assert.equal(d.rank,2);assert.equal(d.endgame,true);const sites=explorationSites(d),seen=new Set([sites[0].id]);
    for(let n=0;n<8;n++)for(const s of sites)if(seen.has(s.id))for(const id of s.neighbors)seen.add(id);
    assert.equal(seen.size,8);assert.deepEqual(sites.filter(s=>s.landmark).map(s=>s.label),['2','5','8']);assert(sites.some(s=>s.formation==='hunt'));
    assert.equal(sites.reduce((n,s)=>n+s.waves,0),25);for(const s of sites){assert(Math.abs(s.x)<=76&&s.z>=-96&&s.z<=-22);assert.equal(s.neighbors.length,new Set(s.neighbors).size);for(const id of s.neighbors)assert(sites.find(v=>v.id===id).neighbors.includes(s.id));}
    for(const version of [1,2])assert.throws(()=>explorationSites(d,version),/지도 버전/);
  }
});
test('ending and the second local expedition unlock reconstruction without changing early entry',()=>{
  const early=createCampaign();assert.equal(availableExplorations(early).length,0);assert.doesNotMatch(atlasMarkup(early,0),/data-atlas-chart="explore-coral-3"/);
  const g=ready();assert.equal(availableExplorations(g).filter(d=>d.endgame).length,12);
  assert.match(atlasMarkup(g,0),/24\/36 완성 해도/);assert.match(atlasMarkup(g,0),/192\/288/);assert.match(atlasMarkup(g,0),/다음 사람이 건널 수 있도록/);
  g.campaign.completed.pop();assert(!availableExplorations(g).some(d=>d.endgame));assert(!launchDefense(g,id));
  g.campaign.completed.push(missions.at(-1).id);g.campaign.frontier.cleared=g.campaign.frontier.cleared.filter(v=>v!=='explore-coral-2');assert(!availableExplorations(g).some(d=>d.id===id));assert(!launchDefense(g,id));
});
test('new sortie uses envelope six, exact checkpoint restore, and old harbor keeps its original version',()=>{
  const g=ready(),oldVersion=JSON.parse(encodeSave(g)).version,charts=structuredClone(g.campaign.atlas);assert(launchDefense(g,id));assert.equal(g.operation.layoutVersion,3);const checkpoint=structuredClone(g.checkpoint);
  assert.equal(JSON.parse(encodeSave(g)).version,6);const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.operation,g.operation);assert.deepEqual(restored.checkpoint,checkpoint);assert.deepEqual(restored.catalog,g.catalog);
  survey(g,0);assert(returnToHarbor(g,true));assert.equal(g.resources,checkpoint.resources);assert.deepEqual(g.fleet,checkpoint.fleet);assert.deepEqual(g.campaign.atlas,charts);assert.equal(JSON.parse(encodeSave(g)).version,oldVersion);
});
test('support hunters are spawned as actual raiders at late-game strength even in coral',()=>{
  const g=ready();assert(launchDefense(g,id));survey(g,0);assert(selectExplorationSite(g,'explore-node-1'));
  assert.equal(g.catalog[1].formation,'hunt');assert.deepEqual(g.enemies.slice(0,2).map(e=>e.type),['raider','raider']);assert(g.enemies.some(e=>e.type==='bulwark'));assert(Math.abs(g.enemies[0].x-g.enemies[1].x)>=32);
  const other=ready();assert(launchDefense(other,'explore-heart-3'));const e=g.enemies[0];assert.equal(enemyStats(g,e).damage,enemyStats(other,e).damage);assert.equal(enemyStats(g,e).speed,enemyStats(other,e).speed);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.enemies,g.enemies);assert.equal(JSON.parse(encodeSave(restored)).version,6);
});
test('third-route relay and blockade have real linked effects and survive save restoration',()=>{
  const g=ready();launchDefense(g,id);survey(g,4);survey(g,5);assert(selectExplorationSite(g,'explore-node-7'));
  // The final archive is connected to both completed tactical sites.
  const e=g.enemies.find(e=>e.type!=='tender'),unsecured=structuredClone(g);unsecured.sites[4].cleared=false;assert(Math.abs(enemyStats(g,e).damage/enemyStats(unsecured,e).damage-0.8)<1e-9);
  Object.assign(e,{type:'carrier',active:true,spawnTimer:0,spawnCount:0});g.enemies=[e];g.facilities=[];g.fleet.units=[];
  const baseline=structuredClone(g);baseline.sites[5].cleared=false;advance(g,1/60);advance(baseline,1/60);assert.equal(e.spawnCount,0);assert.equal(baseline.enemies[0].spawnCount,1);
  assert.equal(enemyStats(decodeSave(encodeSave(g)),e).damage,enemyStats(g,e).damage);
});
test('partial returns bank new charts, preserve old lore, and complete new lore and bonuses once',()=>{
  const g=ready();launchDefense(g,id);for(const i of [0,1,4,7])survey(g,i);const oldFull=atlasSummary(g.campaign).full;assert(finishExploration(g));assert.equal(g.campaign.resultReward.resources,1000);assert.equal(g.operation.result.chartReward,false);
  returnToHarbor(g);assert.equal(g.campaign.atlas.charts[id].layoutVersion,3);assert.equal(g.campaign.atlas.charts[id].surveyed.length,4);assert.equal(JSON.parse(encodeSave(g)).version,6);assert.equal(atlasSummary(g.campaign).full,oldFull);
  assert.match(atlasMarkup(g,0),/다음 사람이 건널 수 있도록/);launchDefense(g,id);for(const i of [0,1,4,5,2,3,6,7])survey(g,i);assert(finishExploration(g));assert.equal(g.campaign.resultReward.resources,560);assert.equal(g.operation.result.chartReward,true);
  returnToHarbor(g);assert.equal(atlasSummary(g.campaign).full,oldFull+1);assert.match(atlasMarkup(g,0),new RegExp(reconstructionRoutes[0].story));assert.equal(JSON.parse(encodeSave(g)).version,6);
  launchDefense(g,id);for(const i of [0,1,4,7])survey(g,i);assert(finishExploration(g));assert.equal(g.campaign.resultReward.resources,400);assert.equal(g.campaign.resultReward.research,0);assert.equal(g.operation.result.chartReward,false);decodeSave(encodeSave(g));
});
test('mixed layouts, missing prerequisites and downgraded envelopes reject reconstruction records',()=>{
  const g=ready();launchDefense(g,id);
  for(const version of [undefined,null,0,1,2,4,'3']){const bad=structuredClone(g);bad.operation.layoutVersion=version;assert.throws(()=>encodeSave(bad),/지도 버전/);}
  const bad=structuredClone(g);bad.campaign.frontier.cleared=bad.campaign.frontier.cleared.filter(v=>v!=='explore-coral-2');delete bad.campaign.atlas.charts['explore-coral-2'];delete bad.campaign.frontier.records['explore-coral-2'];assert.throws(()=>encodeSave(bad),/선행 항로/);
  for(const version of [1,2,3,4,5,7]){const envelope=JSON.parse(encodeSave(g));envelope.version=version;assert.throws(()=>decodeSave(JSON.stringify(envelope)),/저장 형식|지원되지/);}
  for(const i of [0,1,4,7])survey(g,i);finishExploration(g);returnToHarbor(g);
  for(const version of [undefined,1,2,4]){const bad=structuredClone(g);bad.campaign.atlas.charts[id].layoutVersion=version;assert.throws(()=>encodeSave(bad),/지도 버전/);}
  const legacy=structuredClone(g);legacy.campaign.atlas.charts[id].legacySurveyed=4;assert.throws(()=>encodeSave(legacy),/선행 항로/);
});
