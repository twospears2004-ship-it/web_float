import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCampaign,advance,build,damageEnemy,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {explorations,explorationSites} from '../src/exploration-content.js';
import {explorationFormations} from '../src/exploration-regions.js';
import {launchDefense} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {recruitUnit} from '../src/fleet.js';
import {returnToHarbor,resolveFieldDecision} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
// Explicitly funded/forced isolated mechanics. The separate fresh journey tests
// normal paid growth and does not consume these fixtures as playtime evidence.
function base(chapter=0){const g=createCampaign();g.resources=10000;g.campaign.completed=missions.slice(0,Math.max(1,chapter*6)).map(m=>m.id);g.campaign.chapter=chapter;build(g,'shipyard',-1,0);recruitUnit(g,'skiff');return g;}
function survey(g,index){if(!g.operation.visible.includes(g.catalog[index].id))g.operation.visible.push(g.catalog[index].id);assert.equal(selectExplorationSite(g,g.catalog[index].id),true);g.island={x:g.catalog[index].x,z:g.catalog[index].z};for(let i=0;i<120&&!g.campaign.pendingChoice;i++){for(const e of g.enemies)if(e.hp>0)damageEnemy(g,e,1e6);advance(g,0.25);}assert.ok(g.campaign.pendingChoice);resolveFieldDecision(g,{supplies:'repair',archive:'parts',signal:'shield',salvage:'surface',rescue:'rescue',ammunition:'recycle'}[g.campaign.pendingChoice.kind]);}
test('24 new coordinates differ, remain connected and bounded, expose both branch choices and preserve recorded landmarks',()=>{
  const layouts=new Set();
  for(const d of explorations){const sites=explorationSites(d,2),visited=new Set([sites[0].id]);layouts.add(JSON.stringify(sites.map(s=>[s.x,s.z])));
    for(let n=0;n<8;n++)for(const s of sites)if(visited.has(s.id))for(const id of s.neighbors)visited.add(id);
    assert.equal(visited.size,8);assert.deepEqual(sites.filter(s=>s.landmark).map(s=>s.id),['explore-node-1','explore-node-4','explore-node-7']);assert.ok(sites[0].neighbors.includes(sites[1].id)&&sites[0].neighbors.includes(sites[2].id));assert.ok(sites[4].neighbors.includes(sites[7].id)&&sites[5].neighbors.includes(sites[7].id));
    for(const s of sites){assert.ok(Math.abs(s.x)<=76&&s.z>=-96&&s.z<=-22);assert.ok(explorationFormations[s.formation]);assert.equal(new Set(s.neighbors).size,s.neighbors.length);for(const id of s.neighbors)assert.ok(sites.find(s=>s.id===id).neighbors.includes(s.id));}
  }
  assert.equal(layouts.size,24);
});
test('normally earned legacy active save restores old coordinates, paid fleet and resources without acquiring new tactical effects',()=>{
  const g=decodeSave(fs.readFileSync('tests/fixtures/exploration-legacy-coral-active.json','utf8'));assert.equal(g.operation.layoutVersion,undefined);assert.equal(g.resources,511);assert.equal(g.fleet.units.length,2);
  assert.equal(g.catalog[0].x,-12);assert.equal(g.catalog[7].z,-87);assert.equal(g.catalog[0].formation,undefined);
  assert.deepEqual(decodeSave(encodeSave(g)).catalog,g.catalog);const money=g.resources,ships=structuredClone(g.fleet);g.paused=false;
  for(const i of [2,1,4,5,3,6,7])survey(g,i);assert.equal(finishExploration(g),true);assert.equal(g.campaign.atlas.charts[g.operation.id].layoutVersion,1);returnToHarbor(g);assert.equal(launchDefense(g,'explore-coral-1'),true);assert.equal(g.operation.layoutVersion,1);assert.equal(g.catalog[0].x,-12);assert.ok(g.resources>=money);assert.equal(g.fleet.units.length,ships.units.length);
});
test('new surveys bank their layout, partial replay keeps it, and unknown/mixed layout versions are rejected',()=>{
  const g=base();launchDefense(g,'explore-coral-1');assert.equal(g.operation.layoutVersion,2);for(const i of [0,1,4,7])survey(g,i);finishExploration(g);returnToHarbor(g);
  assert.equal(g.campaign.atlas.charts['explore-coral-1'].layoutVersion,2);launchDefense(g,'explore-coral-1');assert.equal(g.operation.layoutVersion,2);const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.catalog,g.catalog);
  for(const version of [null,0,3,'2']){const bad=structuredClone(g);bad.operation.layoutVersion=version;assert.throws(()=>encodeSave(bad),/지도 버전/);const chart=structuredClone(g);chart.campaign.atlas.charts['explore-coral-1'].layoutVersion=version;assert.throws(()=>encodeSave(chart),/지도 버전/);}
  const mixed=structuredClone(g);mixed.operation.layoutVersion=1;assert.throws(()=>encodeSave(mixed),/지도 버전/);
});
test('relay clearance reduces actual linked enemy damage by 20 percent, survives reload and leaves distant guards unchanged',()=>{
  const g=base(3);launchDefense(g,'explore-kelp-1');survey(g,4);const connected=g.catalog[4].neighbors.find(id=>!g.sites.find(s=>s.id===id).cleared);g.operation.visible.push(...[connected].filter(id=>!g.operation.visible.includes(id)));selectExplorationSite(g,connected);
  const e=g.enemies.find(e=>e.type!=='tender'),scaled=enemyStats(g,e).damage,baseline=structuredClone(g);baseline.sites[4].cleared=false;assert.ok(Math.abs(scaled/enemyStats(baseline,e).damage-0.8)<1e-9);
  const far={...e,siteId:g.catalog.find(s=>!g.catalog[4].neighbors.includes(s.id)&&s.id!==g.catalog[4].id).id};assert.equal(enemyStats(g,far).damage,enemyStats(baseline,far).damage);
  assert.equal(enemyStats(decodeSave(encodeSave(g)),e).damage,scaled);
  for(const state of [g,baseline]){state.fleet.units=[];state.facilities=[];state.enemies=[{...e,x:state.island.x+9,z:state.island.z,active:true,cooldown:0}];advance(state,1/60);}
  assert.ok(Math.abs((g.maxHull-g.hull)/(baseline.maxHull-baseline.hull)-0.8)<1e-9);
});
test('optional battery clearance blocks linked carrier reinforcements instead of delaying them',()=>{
  const g=base(8);launchDefense(g,'explore-black-1');survey(g,5);selectExplorationSite(g,'explore-node-7');const e=g.enemies[0];Object.assign(e,{type:'carrier',active:true,spawnTimer:0,spawnCount:0});g.enemies=[e];g.facilities=[];g.fleet.units=[];
  const baseline=structuredClone(g);baseline.sites[5].cleared=false;advance(g,1/60);advance(baseline,1/60);assert.equal(e.spawnCount,0);assert.equal(g.enemies.length,1);assert.equal(baseline.enemies[0].spawnCount,1);assert.equal(baseline.enemies.length,2);
});
test('crossfire, screens and pincer groups put genuinely different units and firing approaches into the new waves',()=>{
  const g=base(3);launchDefense(g,'explore-kelp-1');for(const [index,formation]of [[0,'pincer'],[1,'screen'],[2,'crossfire']]){g.operation.waiting=true;g.campaign.pendingChoice=null;g.operation.visible.push(...[g.catalog[index].id].filter(id=>!g.operation.visible.includes(id)));selectExplorationSite(g,g.catalog[index].id);assert.equal(g.catalog[index].formation,formation);
    if(formation==='pincer')assert.deepEqual(g.enemies.slice(0,2).map(e=>e.type),['skimmer','skimmer']);if(formation==='screen')assert.ok(g.enemies.some(e=>e.type==='armored')&&g.enemies.some(e=>e.type==='tender'));if(formation==='crossfire'){assert.deepEqual(g.enemies.slice(0,2).map(e=>e.type),['spitter','spitter']);assert.ok(Math.abs(g.enemies[0].x-g.enemies[1].x)>=38);}
  }
});
