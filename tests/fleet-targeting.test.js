// Funded isolated tactical invariants, not normal economy or playtime proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,upgrade,damageEnemy,enemyStats} from '../src/game.js';
import {launchMission,returnToHarbor} from '../src/campaign.js';
import {missions} from '../src/campaign-content.js';
import {recruitUnit,orderUnits,tickFleet,unitStats,upgradeUnit,refitUnit} from '../src/fleet.js';
import {setFleetTargeting,automaticFleetTarget} from '../src/fleet-targeting.js';
import {encodeSave,decodeSave} from '../src/save.js';
function ready(types=['skiff']){
  const g=createCampaign('direct');g.resources=20000;g.campaign.chapter=11;g.campaign.completed=missions.slice(0,66).map(m=>m.id);assert(build(g,'shipyard',1,0));assert(upgrade(g,g.facilities.at(-1).id));assert(upgrade(g,g.facilities.at(-1).id));for(const type of types)assert(recruitUnit(g,type));return g;
}
function battle(type='skiff'){
  const g=ready([type]);assert(launchMission(g,'heart-1'));g.route=null;g.campaign.waitingForDeparture=false;const u=g.fleet.units[0];Object.assign(u,{x:60,z:50,command:{type:'hold'},cooldown:0});
  const template=g.enemies[0];g.enemies=['crawler','tender','armored','spitter'].map((type,i)=>({...structuredClone(template),id:`target-${i}`,type,x:65+i,z:50,hp:i===3?10:4000,maxHp:4000,active:true,captured:false}));return {g,u};
}
const chosen=({g,u},mode)=>{if(mode!=='auto')assert(setFleetTargeting(g,[u.id],mode));return automaticFleetTarget(g,u,unitStats(g,u),enemyStats);};
test('default fire selection retains support response and existing eligibility/range/stable ties',()=>{
  const {g,u}=battle();assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).type,'tender');
  g.enemies[1].active=false;assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).type,'crawler');g.enemies[0].captured=true;g.enemies[2].hp=0;assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).type,'spitter');g.enemies[3].x=u.x+unitStats(g,u).range+1;assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats),undefined);
  Object.assign(g.enemies[0],{captured:false,x:65});Object.assign(g.enemies[3],{x:65});assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).id,'target-0');delete u.command;assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).id,'target-0');
});
test('four fire priorities deliver actual shots to nearest, support, armored or low-health targets',()=>{
  for(const [mode,type] of [['nearest','crawler'],['support','tender'],['armored','armored'],['weakest','spitter']]){
    const state=battle('torpedo'),target=chosen(state,mode),before=target.hp;assert.equal(target.type,type);tickFleet(state.g,1/60,damageEnemy,enemyStats);const shot=state.g.events.filter(e=>e.type==='shot').at(-1);assert.equal(shot.tx,target.x);assert.equal(shot.tz,target.z);assert(target.hp<before);
  }
  const state=battle();state.g.enemies[1].type='bulwark';assert.equal(chosen(state,'support').type,'bulwark');
});
test('priority keeps range and passive discovery gates; deliberate attack move can open fire',()=>{
  const {g,u}=battle();assert(setFleetTargeting(g,[u.id],'armored'));for(const e of g.enemies)e.active=false;assert.equal(automaticFleetTarget(g,u,unitStats(g,u),enemyStats),undefined);const hp=g.enemies.map(e=>e.hp);tickFleet(g,1/60,damageEnemy,enemyStats);assert.deepEqual(g.enemies.map(e=>e.hp),hp);
  assert(orderUnits(g,[u.id],'attackMove',{x:80,z:50}));tickFleet(g,1/60,damageEnemy,enemyStats);assert.equal(g.enemies[2].active,true);assert(g.enemies[2].hp<4000);g.enemies[2].x=109;assert.notEqual(automaticFleetTarget(g,u,unitStats(g,u),enemyStats).id,g.enemies[2].id);
});
test('group settings preserve paid hull, weapon timers, orders and groups; support/dead/unselected ships are untouched',()=>{
  const g=ready(['skiff','torpedo','tender']),[a,b,c]=g.fleet.units;a.command={type:'move',x:30,z:20};a.orders=[{type:'attack',target:'known'}];a.hp-=9;a.cooldown=1.3;g.fleet.groups={5:[a.id,b.id]};b.hp=0;const before=structuredClone(g);
  assert(setFleetTargeting(g,[a.id,a.id,b.id,c.id,999],'support'));assert.equal(g.fleet.version,3);assert.equal(a.targeting,'support');assert.equal(b.targeting,undefined);assert.equal(c.targeting,undefined);for(const key of ['resources','hull','facilities'])assert.deepEqual(g[key],before[key]);for(const key of ['hp','maxHp','cooldown','command','orders','waypoints'])assert.deepEqual(a[key],before.fleet.units[0][key]);assert.deepEqual(g.fleet.groups,before.fleet.groups);assert(!setFleetTargeting(g,[c.id],'nearest'));assert(!setFleetTargeting(g,[a.id],'support'));assert(setFleetTargeting(g,[a.id],'auto'));assert.equal(a.targeting,undefined);assert.equal(g.fleet.version,3);
});
test('invalid modes, pause, choices, absent selection and terminal/training states reject atomically',()=>{
  for(const change of [g=>g.paused=true,g=>g.campaign.pendingChoice={site:'x'},g=>g.phase='mission-complete',g=>delete g.campaign]){const g=ready();change(g);const before=structuredClone(g);assert(!setFleetTargeting(g,[1],'armored'));assert.deepEqual(g,before);}
  const g=ready(),before=structuredClone(g);for(const [ids,mode] of [[[],'nearest'],[[999],'nearest'],[[1],'mixed'],[[1],'unknown'],[null,'nearest']])assert(!setFleetTargeting(g,ids,mode));assert.deepEqual(g,before);
});
test('manual focus and queued commands override automatic priorities without erasing them',()=>{
  const {g,u}=battle();assert(setFleetTargeting(g,[u.id],'armored'));const crawler=g.enemies[0];assert(orderUnits(g,[u.id],'attack',{id:crawler.id}));assert(orderUnits(g,[u.id],'move',{x:80,z:50},true));tickFleet(g,1/60,damageEnemy,enemyStats);assert(crawler.hp<4000);assert.equal(g.enemies[2].hp,4000);assert.equal(u.targeting,'armored');assert.equal(u.orders[0].type,'move');crawler.hp=0;tickFleet(g,1/60,damageEnemy,enemyStats);assert.equal(u.command.type,'move');assert.equal(u.targeting,'armored');
});
test('schema three priorities coexist with paid refits and old fleets migrate without injected settings',()=>{
  const g=ready(['gunboat']);assert.equal(decodeSave(encodeSave(g)).fleet.version,1);assert(setFleetTargeting(g,[1],'armored'));for(let i=0;i<2;i++)assert(upgradeUnit(g,1));assert(refitUnit(g,1,'artillery'));assert.equal(g.fleet.version,3);assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
  const legacy=ready(['gunboat']);for(let i=0;i<2;i++)assert(upgradeUnit(legacy,1));assert(refitUnit(legacy,1,'artillery'));const restored=decodeSave(encodeSave(legacy));assert.equal(restored.fleet.version,2);assert.equal(restored.fleet.units[0].targeting,undefined);assert.deepEqual(restored.fleet,legacy.fleet);
  for(const [version,value,type] of [[1,'nearest','gunboat'],[2,'nearest','gunboat'],[3,'auto','gunboat'],[3,'unsupported','gunboat'],[3,null,'gunboat'],[3,'nearest','tender']]){const broken=ready([type]);broken.fleet.version=version;broken.fleet.units[0].targeting=value;assert.throws(()=>encodeSave(broken),/사격 우선순위/);}
});
test('active priority saves replay combat exactly and abandonment restores the original departure doctrine',()=>{
  let {g,u}=battle();assert(setFleetTargeting(g,[u.id],'weakest'));const restored=decodeSave(encodeSave(g));restored.paused=false;tickFleet(g,1/60,damageEnemy,enemyStats);tickFleet(restored,1/60,damageEnemy,enemyStats);assert.deepEqual(restored.enemies,g.enemies);assert.deepEqual(restored.fleet,g.fleet);
  g=ready();assert(setFleetTargeting(g,[1],'support'));assert(launchMission(g,'heart-1'));assert(setFleetTargeting(g,[1],'armored'));g=decodeSave(encodeSave(g));g.paused=false;assert(returnToHarbor(g,true));assert.equal(g.fleet.units[0].targeting,'support');assert.equal(g.fleet.version,3);
});
