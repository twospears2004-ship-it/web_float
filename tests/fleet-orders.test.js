import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,damageEnemy,enemyStats} from '../src/game.js';
import {launchMission,returnToHarbor} from '../src/campaign.js';
import {recruitUnit,orderUnits,tickFleet,deployFleet} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {fleetRules} from '../src/fleet-content.js';

// Funded, isolated rule fixtures. Economy and normal UI acquisition are
// exercised separately; these ticks are not real-time play evidence.
function prepared(){const g=createCampaign('direct');g.resources=1000;build(g,'shipyard',1,0);recruitUnit(g,'skiff');recruitUnit(g,'skiff');launchMission(g,'coral-1');return g;}
const tick=(g,seconds)=>{for(let i=0;i<seconds*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);};

test('queued formation visits both destinations in order and resumes its route after saving',()=>{
  let g=prepared();g.enemies=[];const ids=g.fleet.units.map(u=>u.id);
  assert(orderUnits(g,ids,'move',{x:30,z:30}));const first=structuredClone(g.fleet.units.map(u=>u.command));
  assert(orderUnits(g,ids,'move',{x:55,z:30},true));assert.deepEqual(g.fleet.units.map(u=>u.command),first);
  tick(g,1);g=decodeSave(encodeSave(g));const saved=g.fleet.units.map(u=>u.orders[0]);
  const visited=new Set();for(let frame=0;frame<600&&visited.size<ids.length;frame++){
    tick(g,1/60);for(const [i,u] of g.fleet.units.entries())if(!visited.has(u.id)&&u.command.x===saved[i].x){assert(Math.hypot(u.x-first[i].x,u.z-first[i].z)<0.7,'the second goal replaced the first goal');visited.add(u.id);}
  }
  assert.equal(visited.size,ids.length);
  tick(g,8);for(const [i,u] of g.fleet.units.entries()){assert.equal(u.command.type,'hold');assert.equal(u.orders,undefined);assert(Math.hypot(u.x-saved[i].x,u.z-saved[i].z)<0.5);}
  assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});

test('destroyed and captured queued targets are skipped while live attacks finish before retreat',()=>{
  const g=prepared(),u=g.fleet.units[0],enemy=g.enemies[0];
  // No state bypass in the UI tests; an isolated one-hit foe tests completion.
  Object.assign(u,{x:enemy.x+5,z:enemy.z});enemy.hp=1;
  assert(orderUnits(g,[u.id],'attack',enemy));assert(orderUnits(g,[u.id],'move',{x:50,z:35},true));
  tick(g,0.1);assert.equal(enemy.hp,0);assert.equal(u.command.type,'move');tick(g,14);assert.equal(u.command.type,'hold');
  const e=g.enemies[1];assert(orderUnits(g,[u.id],'move',{x:60,z:35}));assert(orderUnits(g,[u.id],'attack',e,true));assert(orderUnits(g,[u.id],'move',{x:70,z:35},true));e.captured=true;
  tick(g,6);assert.equal(u.command.type,'hold');assert(u.x>69);
});

test('full queue, invalid target and paused input reject a whole formation atomically',()=>{
  const g=prepared(),ids=g.fleet.units.map(u=>u.id);assert(orderUnits(g,ids,'move',{x:35,z:25}));
  for(let i=0;i<fleetRules.maximumQueuedOrders;i++)assert(orderUnits(g,[ids[0]],'move',{x:45+i,z:25},true));
  const before=structuredClone(g.fleet);assert.equal(orderUnits(g,ids,'move',{x:65,z:25},true),false);assert.deepEqual(g.fleet,before);
  assert.equal(orderUnits(g,ids,'move',{x:NaN,z:25},true),false);assert.equal(orderUnits(g,ids,'attack',{id:'missing'},true),false);assert.deepEqual(g.fleet,before);
  g.paused=true;assert.equal(orderUnits(g,ids,'hold'),false);assert.deepEqual(g.fleet,before);
});

test('new move, hold, escort, redeployment and rollback discard old routes',()=>{
  for(const type of ['move','hold','escort','deploy','rollback']){
    const g=prepared(),u=g.fleet.units[0];orderUnits(g,[u.id],'move',{x:40,z:30});orderUnits(g,[u.id],'move',{x:65,z:30},true);
    if(type==='deploy')deployFleet(g);else if(type==='rollback')returnToHarbor(g,true);else assert(orderUnits(g,[u.id],type,{x:50,z:40}));
    assert.equal(g.fleet.units[0].orders,undefined);assert.deepEqual(g.fleet.units[0].waypoints,[]);
  }
});

test('shift move starts immediately from escort or hold rather than waiting forever',()=>{
  for(const type of ['escort','hold']){const g=prepared(),u=g.fleet.units[0];u.command={type};assert(orderUnits(g,[u.id],'move',{x:40,z:30},true));assert.equal(u.command.type,'move');assert.equal(u.orders,undefined);}
});

test('legacy saves stay valid; malformed and oversized queued commands are rejected',()=>{
  const g=prepared(),u=g.fleet.units[0];assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
  for(const orders of [null,{},[{type:'hold'}],[{type:'move',x:111,z:0}],[{type:'attack',target:''}],Array.from({length:9},()=>({type:'move',x:30,z:30}))]){
    u.orders=orders;assert.throws(()=>encodeSave(g),/예약/);
  }
  u.orders=[{type:'move',x:40,z:30},{type:'attack',target:g.enemies[0].id}];assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
  g.checkpoint.fleet.units[0].orders=[{type:'move',x:Infinity,z:0}];assert.throws(()=>encodeSave(g),/예약/);
});
