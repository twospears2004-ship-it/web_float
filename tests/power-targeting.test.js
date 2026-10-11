import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setFleetTargeting,automaticFleetTarget} from '../src/fleet-targeting.js';
import {unitStats,tickFleet,orderUnits,recruitUnit} from '../src/fleet.js';
import {damageEnemy,enemyStats,upgrade} from '../src/game.js';
import {launchDefense,startDefenseWave} from '../src/frontier.js';
import {returnToHarbor} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {applyEnemySlow} from '../src/enemy-control.js';
const earned=()=>{const g=decodeSave(fs.readFileSync('tests/fixtures/field-control-earned-harbor.json','utf8'));g.paused=false;return g;}; // The public export was paused; exercise the resumed controls.

function tactical(){
  // Isolated candidate geometry and durability, not journey/playtime evidence.
  const g=earned(),u=g.fleet.units.find(u=>u.type==='torpedo');u.x=70;u.z=50;u.command={type:'hold'};
  g.enemies=[
    {id:'near',type:'crawler',x:72,z:50},
    {id:'spent',type:'generator',x:73,z:50,siteId:'old',powerLink:true,powerBus:'west'},
    {id:'live',type:'generator',x:80,z:50,siteId:'dock',powerLink:true,powerBus:'west'},
    {id:'core',type:'baseCore',x:74,z:50,siteId:'dock',powerBus:'west'},
    {id:'tower',type:'gunTower',x:78,z:50,siteId:'dock',powerBus:'east'},
  ].map(e=>({...e,hp:10000,maxHp:10000,active:true,captured:false}));
  assert(setFleetTargeting(g,[u.id],'power'));return {g,u};
}
const pick=({g,u})=>automaticFleetTarget(g,u,unitStats(g,u),enemyStats);

test('supply policy chooses the actual live feeding generator before closer mobile, spent generator and powered core without mutating observation',()=>{
  const s=tactical(),before=structuredClone(s.g);assert.equal(pick(s).id,'live');assert.deepEqual(s.g,before);
  s.g.enemies.find(e=>e.id==='core').captured=true;assert.equal(pick(s).id,'tower');
  s.g.enemies.find(e=>e.id==='tower').hp=0;assert.equal(pick(s).id,'near');
});
test('split and shared power buses, site identity and old local supply links use the real power topology',()=>{
  const s=tactical(),generator=s.g.enemies.find(e=>e.id==='live'),core=s.g.enemies.find(e=>e.id==='core');
  core.powerBus='east';assert.equal(pick(s).id,'core');core.powerBus='shared';assert.equal(pick(s).id,'live');
  core.siteId='other';assert.equal(pick(s).id,'core');core.siteId='dock';delete generator.powerLink;generator.x=109;assert.equal(pick(s).id,'core');generator.x=80;assert.equal(pick(s).id,'live');
});
test('supply selection retains range, passive discovery, dead/captured and stable distance/id gates',()=>{
  const s=tactical(),generator=s.g.enemies.find(e=>e.id==='live');generator.active=false;assert.equal(pick(s).id,'core');s.u.command={type:'attackMove',x:90,z:50};assert.equal(pick(s).id,'live');
  generator.captured=true;assert.equal(pick(s).id,'core');generator.captured=false;generator.hp=0;assert.equal(pick(s).id,'core');generator.hp=10000;generator.x=109;s.u.command={type:'hold'};assert.equal(pick(s).id,'core');
  s.g.enemies.find(e=>e.id==='tower').x=74;s.g.enemies.reverse();assert.equal(pick(s).id,'core');
});
test('actual fleet shot hits the feeding generator, while a direct attack and its queued route keep precedence over supply policy',()=>{
  const s=tactical(),core=s.g.enemies.find(e=>e.id==='core'),generator=s.g.enemies.find(e=>e.id==='live');s.g.campaign.stage='operation';s.g.campaign.waitingForDeparture=false;s.g.fleet.units=[s.u];s.u.cooldown=0;
  tickFleet(s.g,1/60,damageEnemy,enemyStats);assert(generator.hp<10000);assert.equal(core.hp,10000);const shot=s.g.events.filter(e=>e.type==='shot').at(-1);assert.equal(shot.tx,generator.x);assert.equal(shot.tz,generator.z);
  assert(orderUnits(s.g,[s.u.id],'attack',{id:'near'}));assert(orderUnits(s.g,[s.u.id],'move',{x:90,z:70},true));const before=generator.hp;s.u.cooldown=0;tickFleet(s.g,1/60,damageEnemy,enemyStats);assert(s.g.enemies.find(e=>e.id==='near').hp<10000);assert.equal(generator.hp,before);assert.equal(s.u.targeting,'power');assert.equal(s.u.orders[0].type,'move');
});
test('normal paid harbor mode changes are free, retain hull, cooldown, commands and groups, and exclude repair ships',()=>{
  const g=earned(),u=g.fleet.units.find(u=>u.type==='torpedo'),repair=g.fleet.units.find(u=>u.type==='tender'),before=structuredClone(g);
  assert(setFleetTargeting(g,[repair.id,u.id,u.id],'power'));assert.equal(g.fleet.version,5);assert.equal(u.targeting,'power');assert.equal(repair.targeting,undefined);assert.equal(g.resources,before.resources);assert.equal(g.campaign.research,before.campaign.research);
  for(const key of ['hp','maxHp','cooldown','command','orders','waypoints'])assert.deepEqual(u[key],before.fleet.units.find(v=>v.id===u.id)[key]);assert.deepEqual(g.fleet.groups,before.fleet.groups);
  const changed=structuredClone(g);g.paused=true;assert(!setFleetTargeting(g,[u.id],'nearest'));g.paused=false;assert.deepEqual(g,changed);assert(setFleetTargeting(g,[u.id],'auto'));assert.equal(u.targeting,undefined);assert.equal(g.fleet.version,5);
});
test('supply schema five roundtrips current and departure fleets, stacked control and old envelope semantics',()=>{
  const g=earned(),u=g.fleet.units.find(u=>u.type==='torpedo');assert.equal(JSON.parse(encodeSave(g)).version,3);assert.equal(g.fleet.version,1);assert(setFleetTargeting(g,[u.id],'power'));assert.equal(JSON.parse(encodeSave(g)).version,5);
  assert(launchDefense(g,'siege-coral-5'));assert(startDefenseWave(g));applyEnemySlow(g.enemies[0],'pulse',4,.3);applyEnemySlow(g.enemies[0],'frost',3,.35);const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.checkpoint.fleet,g.checkpoint.fleet);assert.deepEqual(restored.enemies,g.enemies);assert.equal(JSON.parse(encodeSave(restored)).version,5);
  assert(setFleetTargeting(g,[u.id],'auto'));g.fleet.version=4;assert.equal(JSON.parse(encodeSave(g)).version,5); // Only the departure snapshot carries the newer doctrine.
  g.paused=false;assert(returnToHarbor(g,true));assert.equal(g.fleet.version,5);assert.equal(g.fleet.units.find(v=>v.id===u.id).targeting,'power');
  const old=earned(),copy=decodeSave(encodeSave(old));assert.equal(copy.fleet.version,1);assert(copy.fleet.units.every(v=>v.targeting!=='power'));assert.equal(JSON.parse(encodeSave(copy)).version,3);
});
test('downgraded supply labels, unsupported future schema and malformed checkpoint settings reject before import',()=>{
  const g=earned(),u=g.fleet.units.find(u=>u.type==='torpedo');assert(setFleetTargeting(g,[u.id],'power'));
  for(const version of [3,4]){g.fleet.version=version;assert.throws(()=>encodeSave(g),/동력망/);}g.fleet.version=6;assert.throws(()=>encodeSave(g),/함대 형식/);g.fleet.version=5;
  const envelope=JSON.parse(encodeSave(g));envelope.version=4;assert.throws(()=>decodeSave(JSON.stringify(envelope)),/저장 형식/);
  assert(launchDefense(g,'siege-coral-5'));g.checkpoint.fleet.version=4;assert.throws(()=>encodeSave(g),/동력망/);
});
test('normally purchased ward and paid yard growth cannot downgrade an existing supply doctrine',()=>{
  const g=earned(),u=g.fleet.units.find(u=>u.type==='torpedo'),yard=g.facilities.find(f=>f.type==='shipyard');assert(setFleetTargeting(g,[u.id],'power'));assert(upgrade(g,yard.id));const money=g.resources;assert(recruitUnit(g,'ward'));assert.equal(g.resources,money-220);assert.equal(g.fleet.version,5);assert.equal(u.targeting,'power');assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
