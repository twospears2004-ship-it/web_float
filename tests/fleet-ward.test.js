// Funded rule fixtures. These assertions verify combat/save invariants, not
// campaign economy or human playtime; UI uses a normally earned journey save.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,upgrade,applyHullDamage,facilityPosition,advance,enemyStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {launchMission,returnToHarbor,bossWarning} from '../src/campaign.js';
import {recruitUnit,unitRecruitState,fleetSupply,unitStats,upgradeUnit,refitUnit,dismissUnit,orderUnits,assignControlGroup} from '../src/fleet.js';
import {setFleetTargeting} from '../src/fleet-targeting.js';
import {fleetProtector} from '../src/fleet-protection.js';
import {repairStructure,structureHull,structureRepairCost} from '../src/fortifications.js';
import {hullDistance} from '../src/hull.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {unitModel} from '../src/models.js';
import {twoBankedCharts} from './banked-chart-fixture.js';
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function ready(){
  const g=createCampaign('direct');g.resources=30000;g.campaign.chapter=11;g.campaign.completed=missions.slice(0,66).map(m=>m.id);twoBankedCharts(g);assert(build(g,'shipyard',-1,0));const yard=g.facilities.at(-1);for(let i=1;i<4;i++)assert(upgrade(g,yard.id));return g;
}
function pair(){const g=ready();assert(recruitUnit(g,'ward'));assert(recruitUnit(g,'gunboat'));const [w,u]=g.fleet.units;Object.assign(w,{x:40,z:40});Object.assign(u,{x:45,z:40});return {g,w,u};}
test('charted production requires banked full maps, sea, live yard, supply, cash and a safe choice-free state atomically',()=>{
  for(const mutate of [g=>g.campaign.atlas.charts={},g=>{for(const c of Object.values(g.campaign.atlas.charts))c.surveyed.pop();},g=>g.campaign.chapter=3,g=>g.facilities.at(-1).level=3,g=>g.facilities.at(-1).hp=0,g=>g.resources=219,g=>g.paused=true,g=>g.combat=true,g=>g.route={id:'x'},g=>g.campaign.pendingChoice={site:0},g=>{for(let i=0;i<10;i++)assert(recruitUnit(g,'skiff'));}]){
    const g=ready();mutate(g);const fleet=structuredClone(g.fleet),cash=g.resources,checkpoint=structuredClone(g.checkpoint);assert(!unitRecruitState(g,'ward').available);assert(!recruitUnit(g,'ward'));assert.deepEqual(g.fleet,fleet);assert.equal(g.resources,cash);assert.deepEqual(g.checkpoint,checkpoint);
  }
  const g=ready();g.campaign.atlas.charts={};g.sites=Array.from({length:8},()=>({cleared:true}));assert.equal(unitRecruitState(g,'ward').charts,0);assert(!recruitUnit(g,'ward'));
});
test('legacy full exploration records unlock without modifying maps; production pays 220, uses three berths and promotes only the new fleet',()=>{
  const g=ready();delete g.campaign.atlas;const frontier=structuredClone(g.campaign.frontier),cash=g.resources;assert.equal(g.fleet.version,1);assert.equal(unitRecruitState(g,'ward').charts,2);assert(recruitUnit(g,'ward'));assert.equal(g.resources,cash-220);assert.equal(fleetSupply(g),3);assert.equal(g.fleet.version,4);assert.deepEqual(g.campaign.frontier,frontier);assert.equal(g.campaign.atlas,undefined);assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
test('coverage is inclusive at its true radius, excludes self and stops immediately when the source dies',()=>{
  const {g,w,u}=pair();u.x=50;near(applyHullDamage(g,{x:80,z:40},20,u),15.6);u.x=50.001;assert.equal(applyHullDamage(g,{x:80,z:40},20,u),20);assert.equal(applyHullDamage(g,{x:80,z:40},20,w),20);u.x=45;w.hp=0;assert.equal(fleetProtector(g,u),null);assert.equal(applyHullDamage(g,{x:80,z:40},20,u),20);
});
test('strongest coverage wins without stacking and existing barrier, field protection and bulkhead remain exact',()=>{
  const {g,w,u}=pair();assert(recruitUnit(g,'ward'));const other=g.fleet.units.at(-1);Object.assign(other,{x:41,z:40});assert.equal(fleetProtector(g,u).unit,w);near(applyHullDamage(g,{x:80,z:40},10,u),7.8);other.refit='focusedWard';other.level=5;assert.equal(fleetProtector(g,u).unit,other);near(applyHullDamage(g,{x:80,z:40},10,u),7.14);g.campaign.buffs.protection=.4;near(applyHullDamage(g,{x:80,z:40},10,u),6);g.campaign.barrierSeconds=2;g.campaign.tech.bulkhead=2;near(applyHullDamage(g,{x:80,z:40},10,u),3.08);g.campaign.braceSeconds=2;near(applyHullDamage(g,{x:80,z:40,kind:'hazard'},10,u),1.32);
});
test('island coverage measures physical shoreline, while facilities and escort use their actual positions',()=>{
  const {g,w}=pair();g.tiles=Array.from({length:7},(_,i)=>({x:i-3,z:0}));Object.assign(w,{x:21,z:0});assert(Math.hypot(w.x-g.island.x,w.z-g.island.z)>10);assert(hullDistance(g,w)<10);near(applyHullDamage(g,{x:80,z:0},10),7.8);
  const facility=g.facilities.at(-1),pos={...facilityPosition(g,facility),facilityId:facility.id};Object.assign(w,{x:pos.x+5,z:pos.z});near(applyHullDamage(g,{x:80,z:0},10,pos),7.8);assert.equal(facility.hp,structureHull(facility)-7.8);
  const escort={x:w.x+8,z:w.z};g.campaign.allyHull=100;near(applyHullDamage(g,{x:80,z:0},10,escort),7.8);near(g.campaign.allyHull,92.2);Object.assign(w,{x:40,z:40});assert.equal(applyHullDamage(g,{x:80,z:0},10),10);
});
test('destroyed directional shield grants no reduction; paid repair restores it without changing stock, investment or checkpoint',()=>{
  const g=ready();assert(build(g,'shield',1,0));const f=g.facilities.at(-1);f.stock=7;f.investment=500;f.hp=0;g.checkpoint={marker:'preserve'};const cash=g.resources,cost=structureRepairCost(f);assert.equal(applyHullDamage(g,{x:40,z:0},10),10);assert(repairStructure(g,f.id));assert.equal(g.resources,cash-cost);assert.equal(f.hp,structureHull(f));assert.equal(f.stock,7);assert.equal(f.investment,500);assert.deepEqual(g.checkpoint,{marker:'preserve'});near(applyHullDamage(g,{x:40,z:0},10),7);delete f.hp;near(applyHullDamage(g,{x:40,z:0},10),7);
});
test('ward reinforcement changes real radius and both paid refits trade coverage for protection without schema downgrade',()=>{
  const g=ready();assert(recruitUnit(g,'ward'));const w=g.fleet.units[0];for(let i=0;i<4;i++)assert(upgradeUnit(g,w.id));near(unitStats(g,w).shieldRange,12);w.hp=w.maxHp*.6;const cash=g.resources;assert(refitUnit(g,w.id,'wideWard'));near(unitStats(g,w).shieldRange,16);near(unitStats(g,w).protection,.165);near(w.hp/w.maxHp,.6);assert.equal(g.resources,cash-990);assert(refitUnit(g,w.id,'focusedWard'));near(unitStats(g,w).shieldRange,9);near(unitStats(g,w).protection,.286);assert(setFleetTargeting(g,[w.id],'support'));assert.equal(g.fleet.version,4);assert(refitUnit(g,w.id,'standard'));assert.equal(g.fleet.version,4);assert(dismissUnit(g,w.id));assert.equal(g.fleet.version,4);assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
test('ward refit sea and level gates retain resources and equipment',()=>{
  for(const [id,chapter,level] of [['wideWard',5,3],['wideWard',6,2],['focusedWard',8,5],['focusedWard',9,4]]){const g=ready();assert(recruitUnit(g,'ward'));g.campaign.chapter=chapter;const w=g.fleet.units[0];w.level=level;const cash=g.resources,fleet=structuredClone(g.fleet);assert(!refitUnit(g,w.id,id));assert.equal(g.resources,cash);assert.deepEqual(g.fleet,fleet);}
});
test('new fleet rejects old and unknown schema labels in active saves and checkpoints',()=>{
  for(const version of [1,2,3,5]){const g=ready();assert(recruitUnit(g,'ward'));g.fleet.version=version;assert.throws(()=>encodeSave(g),/함대 형식|방호정/);}
  const g=ready();assert(recruitUnit(g,'ward'));assert(launchMission(g,'heart-1'));g.checkpoint.fleet.version=3;assert.throws(()=>encodeSave(g),/방호정/);
});
test('guard, queued orders, control groups and targeting restore exactly and abandoning restores the paid ward checkpoint',()=>{
  let {g,w,u}=pair();Object.assign(w,{x:10,z:10});Object.assign(u,{x:14,z:10});assert(setFleetTargeting(g,[w.id],'support'));assert(assignControlGroup(g,5,[w.id,u.id]));const departure=structuredClone(g.fleet),cash=g.resources;assert(launchMission(g,'heart-1'));assert(orderUnits(g,[w.id],'guard',{id:u.id}));assert(orderUnits(g,[u.id],'move',{x:60,z:40}));assert(orderUnits(g,[u.id],'attackMove',{x:70,z:40},true));const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.checkpoint.fleet,departure);restored.paused=false;assert(returnToHarbor(restored,true));const fixed=f=>f.units.map(({id,type,level,hp,maxHp,refit,targeting})=>({id,type,level,hp,maxHp,refit,targeting}));assert.deepEqual(fixed(restored.fleet),fixed(departure));assert.deepEqual(restored.fleet.groups,departure.groups);assert.equal(restored.resources,cash);
});
test('actual guardian impact is reduced for a covered ship and replays identically after save restoration',()=>{
  const {g,w,u}=pair();assert(launchMission(g,'heart-1'));g.campaign.waitingForDeparture=false;g.facilities=[];g.route=null;Object.assign(g.island,{x:-70,z:-70});Object.assign(u,{x:38,z:40,command:{type:'hold'}});Object.assign(w,{x:46,z:40,command:{type:'hold'}});const e=g.enemies[0];Object.assign(e,{type:'leviathan',x:40,z:40,hp:10000,maxHp:10000,active:true,cooldown:0,windup:bossWarning(g,{type:'leviathan',bossPhase:1},u)});g.enemies=[e];e.windup.remaining=.001;const before=u.hp,amount=enemyStats(g,e).damage*1.5*.78,restored=decodeSave(encodeSave(g));restored.paused=false;advance(g,1/60);advance(restored,1/60);near(before-u.hp,amount);assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.enemies,g.enemies);
});
test('procedural ward has a coverage ring that cannot intercept combat picks and leaves other unit models unchanged',()=>{
  for(const type of ['ward','skiff','gunboat','torpedo','tender']){const mesh=unitModel(type),ring=mesh.userData.protection;if(type==='ward'){assert(ring);assert.equal(ring.visible,false);const hits=[];ring.raycast({},hits);assert.deepEqual(hits,[]);assert.equal(ring.material.depthWrite,false);assert(ring.geometry.attributes.position.count>64);}else assert.equal(ring,undefined);mesh.traverse(o=>o.geometry?.dispose());}
});
