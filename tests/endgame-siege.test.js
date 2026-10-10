import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,advance,damageEnemy,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {availableSieges,launchDefense,startDefenseWave,retryDefense} from '../src/frontier.js';
import {siegeContracts,endgameSieges,basePower,powerConnections} from '../src/siege-content.js';
import {recruitUnit,assignControlGroup} from '../src/fleet.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';

// Funded mechanics fixtures. The continuous normal journey separately proves
// actual affordability and completion; these damage calls are not playtime.
function ready(){const g=createCampaign();g.resources=10000;g.campaign.completed=missions.map(m=>m.id);g.campaign.chapter=11;g.campaign.frontier={version:1,cleared:['siege-coral-1','siege-coral-2','siege-coral-3'],records:{},totalSeconds:0};assert(build(g,'shipyard',-1,0));assert(recruitUnit(g,'skiff'));assignControlGroup(g,5,[1]);return g;}
function start(id){const g=ready();if(id.endsWith('-5'))g.campaign.frontier.cleared.push('siege-coral-4');assert(launchDefense(g,id));assert(startDefenseWave(g));return g;}

test('original contracts remain intact; the 24 new raids require the ending and their predecessor',()=>{
  assert.equal(siegeContracts.filter(d=>!d.endgame).length,36);assert.equal(endgameSieges.length,24);assert.equal(new Set(siegeContracts.map(d=>d.id)).size,60);
  const g=ready();g.campaign.completed.pop();assert(!availableSieges(g).some(d=>d.endgame));assert(!launchDefense(g,'siege-coral-4'));
  g.campaign.completed=missions.map(m=>m.id);assert(availableSieges(g).some(d=>d.id==='siege-coral-4'));assert(!availableSieges(g).some(d=>d.id==='siege-coral-5'));
  const missing=ready();missing.campaign.frontier.cleared.pop();assert(!launchDefense(missing,'siege-coral-4'));
});

test('remote generators supply their own base beyond 28m and lose power immediately when destroyed',()=>{
  const g=start('siege-coral-4'),core=g.enemies.find(e=>e.type==='baseCore'),generators=g.enemies.filter(e=>e.type==='generator');
  assert(generators.every(e=>Math.hypot(e.x-core.x,e.z-core.z)>28));assert.equal(basePower(g,core),2);assert.equal(powerConnections(g).length,8);
  const other={...core,siteId:'other-base'};assert.equal(basePower(g,other),0);
  const armor=enemyStats(g,core).armor;damageEnemy(g,generators[0],1e6);assert.equal(basePower(g,core),1);assert.equal(powerConnections(g).length,4);
  damageEnemy(g,generators[1],1e6);assert.equal(basePower(g,core),0);assert.equal(powerConnections(g).length,0);assert(enemyStats(g,core).armor<armor);validateCampaign(g);
});
test('all seas have distinct physical layouts with saved flank power and legacy topology',()=>{
  const signatures={network:new Set(),citadel:new Set()};
  for(const d of endgameSieges) {
    const g=ready();g.campaign.frontier.cleared=siegeContracts.filter(o=>o.chapter===d.chapter&&o.rank<d.rank).map(o=>o.id);
    assert(launchDefense(g,d.id));assert(startDefenseWave(g));
    const site=g.catalog[0];signatures[d.pattern].add(JSON.stringify(g.enemies.filter(e=>['generator','baseCore','gunTower','seaWall','supplyDepot'].includes(e.type)).map(e=>[e.type,e.x-site.x,e.z-site.z,e.powerBus])));
    if(d.chapter){
      const west=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='west'),east=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='east');
      const westTower=g.enemies.find(e=>e.type==='gunTower'&&e.powerBus==='west'),eastTower=g.enemies.find(e=>e.type==='gunTower'&&e.powerBus==='east');
      assert.equal(basePower(g,westTower),1);assert.equal(basePower(g,eastTower),1);
      const shared=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='shared');assert.equal(basePower(g,shared),2);
      damageEnemy(g,west,1e6);assert.equal(basePower(g,westTower),0);assert.equal(basePower(g,eastTower),1);assert.equal(basePower(g,shared),1);assert(east.hp>0);
      assert.deepEqual(decodeSave(encodeSave(g)).enemies,g.enemies);
      const malformed=decodeSave(encodeSave(g));malformed.enemies.find(e=>e.type==='generator').powerBus='shared';assert.throws(()=>validateCampaign(malformed),/공급 구역/);
      // Saves produced before supply districts preserve their global wiring.
      for(const e of g.enemies)delete e.powerBus;validateCampaign(g);assert.equal(basePower(g,westTower),1);assert.deepEqual(decodeSave(encodeSave(g)).enemies,g.enemies);
    }else assert(g.enemies.every(e=>e.powerBus===undefined));
  }
  assert.equal(signatures.network.size,12);assert.equal(signatures.citadel.size,12);
});

test('three dock cores all require capture; surrender clears links without awarding optional guards',()=>{
  const g=start('siege-coral-5'),cores=g.enemies.filter(e=>e.type==='baseCore'),kills=g.kills;assert.equal(cores.length,3);assert.equal(powerConnections(g).length,12);
  for(const e of cores.slice(0,2)){damageEnemy(g,e,1e6);advance(g,1/60);assert.equal(g.operation.round,0);assert.equal(g.operation.waiting,false);}
  damageEnemy(g,cores[2],1e6);advance(g,1/60);assert.equal(g.operation.round,1);assert(g.operation.waiting);assert.equal(g.kills,kills+3);assert.equal(powerConnections(g).length,0);assert(g.enemies.filter(e=>e.hp>0).every(e=>e.captured));validateCampaign(g);
});

test('remote power survives save/load and rollback; forged links or pre-ending raid saves are rejected',()=>{
  const g=start('siege-coral-4'),saved=decodeSave(encodeSave(g));assert.deepEqual(saved.enemies,g.enemies);assert.equal(basePower(saved,saved.enemies.find(e=>e.type==='baseCore')),2);
  const broken=structuredClone(saved);broken.enemies.find(e=>e.type==='generator').powerLink=false;assert.throws(()=>validateCampaign(broken));
  delete broken.enemies.find(e=>e.type==='generator').powerLink;assert.throws(()=>validateCampaign(broken));
  const falseLink=structuredClone(saved);falseLink.enemies.find(e=>e.type==='gunTower').powerLink=true;assert.throws(()=>validateCampaign(falseLink));
  const locked=structuredClone(saved);locked.campaign.completed.pop();assert.throws(()=>validateCampaign(locked));
  const checkpoint=structuredClone(g.checkpoint);g.hull=0;advance(g,1/60);assert(retryDefense(g));assert.equal(g.resources,checkpoint.resources);assert.deepEqual(g.fleet.groups,checkpoint.fleet.groups);assert.deepEqual(g.fleet.units.map(u=>u.hp),checkpoint.fleet.units.map(u=>u.hp));validateCampaign(g);
});
