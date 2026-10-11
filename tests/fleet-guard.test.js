import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,upgrade,damageEnemy,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {launchMission} from '../src/campaign.js';
import {recruitUnit,orderUnits,tickFleet,guardCycle} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {navigable} from '../src/navigation.js';
// Funded rule fixture; normal purchases and native saves are tested separately.
function ready(){const g=createCampaign();g.resources=3000;g.campaign.chapter=3;g.campaign.completed=missions.slice(0,18).map(m=>m.id);build(g,'shipyard',1,0);upgrade(g,g.facilities.at(-1).id);upgrade(g,g.facilities.at(-1).id);recruitUnit(g,'gunboat');recruitUnit(g,'tender');recruitUnit(g,'skiff');assert(launchMission(g,'kelp-1'));return g;}
function tick(g,seconds){for(let i=0;i<seconds*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);}
test('guard follows a moving paid ally, repairs damage and persists its real target',()=>{
  let g=ready();g.enemies=[];const [ward,support]=g.fleet.units;Object.assign(ward,{x:30,z:25,hp:60,command:{type:'hold'}});Object.assign(support,{x:30,z:15});assert(orderUnits(g,[support.id],'guard',{id:ward.id}));tick(g,2);assert(ward.hp>60);assert(orderUnits(g,[ward.id],'move',{x:60,z:25}));tick(g,5);assert(support.x>40);assert(Math.hypot(ward.x-support.x,ward.z-support.z)<12);assert(navigable(g,support,1));g=decodeSave(encodeSave(g));assert.deepEqual(g.fleet.units[1].command,{type:'guard',target:ward.id});
});
test('guard clears reservations, excludes the protected ship and preserves its own order',()=>{
  const g=ready(),[ward,support]=g.fleet.units;g.enemies=[];assert(orderUnits(g,[support.id],'move',{x:30,z:20}));assert(orderUnits(g,[support.id],'move',{x:40,z:20},true));const initial=structuredClone(ward.command);assert(orderUnits(g,[ward.id,support.id],'guard',{id:ward.id},true));assert.deepEqual(ward.command,initial);assert.deepEqual(support.command,{type:'guard',target:ward.id});assert.equal(support.orders,undefined);
});
test('guards do not initiate combat or pursue a distant active enemy',()=>{
  const g=ready(),[ward,,guard]=g.fleet.units;Object.assign(ward,{x:40,z:30,command:{type:'hold'}});Object.assign(guard,{x:40,z:24});const foe=g.enemies[0];Object.assign(foe,{x:40,z:28,active:false});g.enemies=[foe];g.campaign.waitingForDeparture=false;assert(orderUnits(g,[guard.id],'guard',{id:ward.id}));const hp=foe.hp;tick(g,2);assert.equal(foe.hp,hp);assert.equal(foe.active,false);foe.active=true;tick(g,1);assert(foe.hp<hp);foe.x=85;const location={x:guard.x,z:guard.z};tick(g,3);assert(Math.hypot(guard.x-location.x,guard.z-location.z)<1);assert.equal(guard.command.type,'guard');
});
test('missing or destroyed ward hands off to hold; pause preserves the guard exactly',()=>{
  let g=ready();const [ward,support]=g.fleet.units;assert(orderUnits(g,[support.id],'guard',{id:ward.id}));g.paused=true;const before=structuredClone(g.fleet);assert.equal(orderUnits(g,[support.id],'escort'),false);assert.deepEqual(g.fleet,before);g.paused=false;ward.hp=0;tick(g,1/60);assert.deepEqual(support.command,{type:'hold'});ward.hp=30;assert(orderUnits(g,[support.id],'guard',{id:ward.id}));g.fleet.units=g.fleet.units.filter(u=>u!==ward);g=decodeSave(encodeSave(g));tick(g,1/60);assert.deepEqual(g.fleet.units.find(u=>u.id===support.id).command,{type:'hold'});
});
test('self, missing, future and circular guard targets cannot replace existing orders',()=>{
  const g=ready(),[a,b,c]=g.fleet.units;const before=structuredClone(a.command);assert.equal(orderUnits(g,[a.id],'guard',{id:a.id}),false);assert.equal(orderUnits(g,[a.id],'guard',{id:900}),false);assert.deepEqual(a.command,before);assert(orderUnits(g,[a.id],'guard',{id:b.id}));assert(orderUnits(g,[b.id],'guard',{id:c.id}));assert(guardCycle(g.fleet,[c.id],a.id));assert.equal(orderUnits(g,[c.id],'guard',{id:a.id}),false);assert.deepEqual(c.command,{type:'escort'});const invalid=structuredClone(g);invalid.fleet.units[2].command={type:'guard',target:a.id};assert.throws(()=>encodeSave(invalid),/호위 목표/);invalid.fleet.units[2].command={type:'guard',target:900};assert.throws(()=>encodeSave(invalid),/호위 목표/);
});
test('multiple guards spread into safe water and explicit hold/escort cancel tracking',()=>{
  const g=ready(),[ward,a,b]=g.fleet.units;g.enemies=[];Object.assign(ward,{x:40,z:30,command:{type:'hold'}});assert(orderUnits(g,[a.id,b.id],'guard',{id:ward.id}));tick(g,8);assert(navigable(g,a,1)&&navigable(g,b,0.85));assert(Math.hypot(a.x-b.x,a.z-b.z)>2);assert(Math.hypot(a.x-ward.x,a.z-ward.z)<10);assert(orderUnits(g,[a.id],'hold'));assert(orderUnits(g,[b.id],'escort'));tick(g,1);assert.deepEqual(a.command,{type:'hold'});assert.deepEqual(b.command,{type:'escort'});
});
