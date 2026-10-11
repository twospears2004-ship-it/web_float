import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,upgrade,damageEnemy,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {launchMission,returnToHarbor} from '../src/campaign.js';
import {unitTypes,unitRefits} from '../src/fleet-content.js';
import {recruitUnit,upgradeUnit,unitStats,refitUnit,unitRefitState,fleetSupply,fleetCapacity,tickFleet} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';
// Funded mechanical fixtures. UI/native tests use a normally earned island.
function ready(types=['gunboat']) {
  const g=createCampaign('direct');g.resources=20000;g.campaign.chapter=11;g.campaign.completed=missions.slice(0,66).map(m=>m.id);assert(build(g,'shipyard',1,0));const yard=g.facilities.at(-1);assert(upgrade(g,yard.id));assert(upgrade(g,yard.id));
  for(const type of types){assert(recruitUnit(g,type));while(g.fleet.units.at(-1).level<6)assert(upgradeUnit(g,g.fleet.units.at(-1).id));}return g;
}
test('all eight refits make a real tradeoff, charge exactly and preserve damage ratio, orders and firing cooldown',()=>{
  for(const [id,refit] of Object.entries(unitRefits)){
    const g=ready([refit.type]),u=g.fleet.units[0],base=unitStats(g,u),cost=unitRefitState(g,u,id).cost,supply=fleetSupply(g),capacity=fleetCapacity(g);u.hp=u.maxHp*.42;u.cooldown=1.7;u.command={type:'move',x:20,z:10};u.orders=[{type:'attackMove',x:30,z:20}];const order=structuredClone(u.command),cash=g.resources;
    assert(refitUnit(g,u.id,id));const after=unitStats(g,u);assert.equal(g.resources,cash-cost);assert.equal(u.maxHp,after.hp);assert(Math.abs(u.hp/u.maxHp-.42)<1e-12);assert.equal(u.cooldown,1.7);assert.deepEqual(u.command,order);assert.deepEqual(u.orders,[{type:'attackMove',x:30,z:20}]);assert.equal(fleetSupply(g),supply);assert.equal(fleetCapacity(g),capacity);
    const keys=['hp','damage','heal','range','speed','pierce','splash'];assert(keys.some(k=>(after[k]||0)>(base[k]||0)),id);assert(keys.some(k=>(after[k]||0)<(base[k]||0)),id);const refitCash=g.resources;assert(!refitUnit(g,u.id,id));assert.equal(g.resources,refitCash);assert(refitUnit(g,u.id,'standard'));assert.deepEqual(unitStats(g,u),base);assert.equal(u.refit,undefined);assert(Math.abs(u.hp/u.maxHp-.42)<1e-12);
  }
});
test('refit blockers are atomic and expose exact sea, level, yard, service and resource requirements',()=>{
  for(const [mutate,reason] of [
    [g=>g.paused=true,/정비/],[g=>g.combat=true,/정비/],[g=>g.route={id:'x'},/정비/],[g=>g.campaign.pendingChoice={site:'x'},/정비/],
    [g=>g.fleet.units[0].x=90,/34m/],[g=>g.facilities.at(-1).hp=0,/조선소 3단계/],[g=>g.campaign.chapter=3,/5번째 해역/],[g=>g.fleet.units[0].level=2,/3단계/],[g=>g.resources=2,/자원 498 부족/],
  ]){const g=ready();mutate(g);const before=structuredClone(g.fleet),cash=g.resources,state=unitRefitState(g,g.fleet.units[0],'artillery');assert(!state.available);assert.match(state.reason,reason);assert(!refitUnit(g,g.fleet.units[0].id,'artillery'));assert.deepEqual(g.fleet,before);assert.equal(g.resources,cash);}
  const g=ready();g.campaign.chapter=7;assert.match(unitRefitState(g,g.fleet.units[0],'barrage').reason,/9번째 해역/);
});
test('old standard equipment saves stay exact and unknown or cross-type refits are rejected',()=>{
  const g=ready(),old=structuredClone(g.fleet);assert.deepEqual(decodeSave(encodeSave(g)).fleet,old);for(const invalid of ['remote','standard','missing',null,{}]){g.fleet.units[0].refit=invalid;assert.throws(()=>encodeSave(g),/개장 장비/);}delete g.fleet.units[0].refit;const before=structuredClone(g.fleet);assert(!refitUnit(g,1,'remote'));assert(!refitUnit(g,1,'missing'));assert.deepEqual(g.fleet,before);
});
test('paid role equipment uses fleet schema two; mislabelled schema one cannot silently ignore equipment',()=>{
  const g=ready();assert.equal(g.fleet.version,1);assert(refitUnit(g,1,'artillery'));assert.equal(g.fleet.version,2);assert.equal(decodeSave(encodeSave(g)).fleet.version,2);g.fleet.version=1;assert.throws(()=>encodeSave(g),/개장 장비/);g.fleet.version=2;assert(refitUnit(g,1,'standard'));assert.equal(g.fleet.version,2);assert.equal(decodeSave(encodeSave(g)).fleet.units[0].refit,undefined);
});
test('paid equipment persists through active save and sortie rollback without changing the original checkpoint',()=>{
  let g=ready(['gunboat','tender']);assert(refitUnit(g,1,'artillery'));assert(refitUnit(g,2,'remote'));const fleet=structuredClone(g.fleet),cash=g.resources;assert(launchMission(g,'heart-1'));g=decodeSave(encodeSave(g));assert.deepEqual(g.checkpoint.fleet,fleet);assert.deepEqual(g.fleet.units.map(u=>u.refit),['artillery','remote']);g.paused=false;g.fleet.units[0].hp=1;g.resources-=70;assert(returnToHarbor(g,true));const equipment=f=>f.units.map(({id,type,level,refit,hp,maxHp})=>({id,type,level,refit,hp,maxHp}));assert.deepEqual(equipment(g.fleet),equipment(fleet));assert.equal(g.resources,cash);
});
function combat(type,refit){const g=ready([type]);if(refit)assert(refitUnit(g,1,refit));assert(launchMission(g,'heart-1'));g.campaign.waitingForDeparture=false;const u=g.fleet.units[0];Object.assign(u,{x:40,z:30,command:{type:'hold'},cooldown:0});return g;}
test('long range equipment fires outside standard range with the authored damage penalty',()=>{
  for(const id of [undefined,'artillery']){const g=combat('gunboat',id),u=g.fleet.units[0],e=g.enemies[0];Object.assign(e,{type:'crawler',x:69,z:30,hp:1000,maxHp:1000,active:true});g.enemies=[e];const before=e.hp;tickFleet(g,1/60,damageEnemy,enemyStats);if(id)assert(Math.abs(before-e.hp-unitStats(g,u).damage)<1e-9);else assert.equal(e.hp,before);}
});
test('penetrator trades lower raw damage for better real damage against heavy armor',()=>{
  const hits={};for(const armored of [false,true])for(const id of [undefined,'penetrator']){const g=combat('torpedo',id),e=g.enemies[0];Object.assign(e,{type:armored?'armored':'crawler',x:45,z:30,hp:1000,maxHp:1000,active:true});g.enemies=[e];tickFleet(g,1/60,damageEnemy,enemyStats);hits[`${armored}-${id}`]=1000-e.hp;}assert(hits['true-penetrator']>hits['true-undefined']);assert(hits['false-penetrator']<hits['false-undefined']);
});
test('barrage hits a wider group and loses standard reach',()=>{
  for(const id of [undefined,'barrage']){const g=combat('gunboat',id),a=g.enemies[0],b=structuredClone(a);Object.assign(a,{type:'crawler',x:50,z:30,hp:1000,maxHp:1000,active:true});Object.assign(b,{id:'neighbor',type:'crawler',x:55,z:30,hp:1000,maxHp:1000,active:true});g.enemies=[a,b];g.fleet.units[0].command={type:'attack',target:a.id};tickFleet(g,1/60,damageEnemy,enemyStats);assert(a.hp<1000);assert.equal(b.hp<1000,!!id);if(id)assert.equal(unitStats(g,g.fleet.units[0]).range,23);}
});
test('remote repair reaches a distant ally at lower throughput and intensive repair requires a closer ally',()=>{
  for(const [id,distance,expected] of [[undefined,20,0],['remote',20,12.8],['intensive',20,0],['intensive',12,20]]){const g=ready(['tender','skiff']);if(id)assert(refitUnit(g,1,id));assert(launchMission(g,'heart-1'));g.enemies=[];g.hull=g.maxHull;const [support,patient]=g.fleet.units;Object.assign(support,{x:40,z:30,command:{type:'hold'}});Object.assign(patient,{x:40+distance,z:30,hp:10,command:{type:'hold'}});tickFleet(g,1/60,damageEnemy,enemyStats);assert(Math.abs(patient.hp-10-expected)<1e-9);}
});
test('scout equipment changes actual sailing speed and carries its smaller hull into the sortie',()=>{
  const distances=[];for(const id of [undefined,'scout']){const g=combat('skiff',id),u=g.fleet.units[0];g.enemies=[];g.catalog=[];g.sites=[];u.command={type:'move',x:80,z:30};for(let i=0;i<60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);distances.push(u.x-40);if(id)assert.equal(u.maxHp,192);}assert(Math.abs(distances[1]/distances[0]-1.25)<1e-8);
});
