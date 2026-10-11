// Funded combat/save fixtures, not normal economy or human playtime evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,upgrade,advance,enemyStats,damageEnemy} from '../src/game.js';
import {missions,campaignRules} from '../src/campaign-content.js';
import {recruitUnit,orderUnits} from '../src/fleet.js';
import {launchDefense,startDefenseWave,retryDefense} from '../src/frontier.js';
import {returnToHarbor} from '../src/campaign.js';
import {endgameSieges,siegeContracts,spawnSiegeBase} from '../src/siege-content.js';
import {raiderTarget,raiderFlank,steerEnemy} from '../src/enemy-ai.js';
import {inspectionContext,inspectedContact} from '../src/combat-inspector.js';
import {encodeSave,decodeSave,validateCampaign,saveCampaign,loadCampaign,SAVE_KEY} from '../src/save.js';
import {enemyModel} from '../src/models.js';
import {twoBankedCharts} from './banked-chart-fixture.js';
const run=(g,s)=>{for(let i=0;i<s*60;i++)advance(g,1/60);},near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function ready(id='siege-coral-5',start=true){
  const g=createCampaign();g.resources=50000;g.campaign.completed=missions.map(m=>m.id);g.campaign.chapter=11;g.campaign.frontier={version:1,cleared:siegeContracts.filter(d=>d.id!==id).map(d=>d.id),records:{},totalSeconds:0};twoBankedCharts(g);assert(build(g,'shipyard',-1,0));for(let i=1;i<4;i++)assert(upgrade(g,g.facilities.at(-1).id));for(const type of ['skiff','tender','ward'])assert(recruitUnit(g,type));assert(launchDefense(g,id));if(start)assert(startDefenseWave(g));return g;
}
function battle(){const g=ready(),e=g.enemies.find(e=>e.type==='raider'),core=g.enemies.find(e=>e.type==='baseCore'),[front,medic,ward]=g.fleet.units;g.enemies=[e,core];g.facilities=[];Object.assign(core,{x:100,z:100});Object.assign(g.island,{x:-70,z:-70});Object.assign(e,{id:'raider-left',x:40,z:40,hp:3000,maxHp:3000,active:true,cooldown:0});Object.assign(front,{x:42,z:40,command:{type:'hold'},cooldown:2});Object.assign(medic,{x:45,z:40,command:{type:'hold'},cooldown:2});Object.assign(ward,{x:48,z:40,command:{type:'hold'},cooldown:2});g.campaign.waitingForDeparture=false;return {g,e,front,medic,ward};}
test('all 12 fresh dock layouts replace exactly two opposing guards; legacy, network and standard raids retain their units',()=>{
  for(const d of endgameSieges){const g=ready(d.id);const modern=structuredClone(g.enemies);assert.equal(g.operation.siegeVersion,d.pattern==='citadel'?2:undefined);assert.equal(modern.filter(e=>e.type==='raider').length,d.pattern==='citadel'?2:0);const site=g.catalog[0];if(d.pattern==='citadel'){const sin=Math.sin(site.angle),cos=Math.cos(site.angle),flanks=modern.filter(e=>e.type==='raider').map(e=>(e.x-site.x)*cos+(e.z-site.z)*sin);assert(flanks[0]*flanks[1]<0);}
    delete g.operation.siegeVersion;const legacy=spawnSiegeBase(g,d);assert(!legacy.some(e=>e.type==='raider'));assert.equal(legacy.length,modern.length);for(let i=0;i<modern.length;i++)if(modern[i].type!=='raider')assert.deepEqual(modern[i],legacy[i]);
  }
  const g=ready('siege-coral-1');assert.equal(g.operation.siegeVersion,undefined);assert(!g.enemies.some(e=>e.type==='raider'));
});
test('local pursuit chooses medic then ward and wounded/distance/id ties without changing old enemy targeting',()=>{
  const {g,e,front,medic,ward}=battle(),stats=enemyStats(g,e),before=structuredClone(g);assert.equal(raiderTarget(g,e,g.island,stats),medic);assert.deepEqual(g,before);medic.hp=0;assert.equal(raiderTarget(g,e,g.island,stats),ward);ward.hp=0;assert.equal(raiderTarget(g,e,g.island,stats),null);medic.hp=20;const peer={...medic,id:99,x:44,hp:15};g.fleet.units.push(peer);assert.equal(raiderTarget(g,e,g.island,stats),peer);peer.hp=20;peer.x=medic.x;assert.equal(raiderTarget(g,e,g.island,stats),medic);e.type='skimmer';assert.equal(raiderTarget(g,e,g.island,stats),null);assert(front.hp>0);
});
test('dead, captured, inactive attackers and supports outside the real 24m perception are excluded; close hull remains a threat',()=>{
  for(const change of [{hp:0},{active:false},{captured:true}]){const {g,e}=battle();Object.assign(e,change);assert.equal(raiderTarget(g,e,g.island,enemyStats(g,e)),null);}
  const {g,e,medic,ward}=battle();ward.hp=0;medic.x=64;assert.equal(raiderTarget(g,e,g.island,enemyStats(g,e)),medic);medic.x=64.001;assert.equal(raiderTarget(g,e,g.island,enemyStats(g,e)),null);medic.x=60;Object.assign(g.island,{x:40,z:40});assert.equal(raiderTarget(g,e,g.island,enemyStats(g,e)),null);
});
test('side approach is stable after reload, responds to heading and moves by real speed/slowdown without teleporting',()=>{
  const {g,e,medic}=battle(),point=raiderFlank(g,e,medic);near(Math.hypot(point.x-medic.x,point.z-medic.z),7);const sign=Math.sign(point.x-medic.x);medic.heading=Math.PI/2;const turned=raiderFlank(g,e,medic);near(turned.x,medic.x);near(turned.z,medic.z-sign*7);medic.heading=0;assert.deepEqual(raiderFlank(g,e,medic),point);assert.equal(raiderFlank(g,e,g.island),null);
  const original={x:e.x,z:e.z};steerEnemy(g,e,medic,enemyStats(g,e),.1,true,110);near(Math.hypot(e.x-original.x,e.z-original.z),.44);Object.assign(e,original,{slowSeconds:3,slowFactor:.5});steerEnemy(g,e,medic,enemyStats(g,e),.1,true,110);near(Math.hypot(e.x-original.x,e.z-original.z),.22);assert.deepEqual(raiderFlank(decodeSave(encodeSave(g)),e,medic),null);const restored=decodeSave(encodeSave(g));assert.deepEqual(raiderFlank(restored,restored.enemies[0],restored.fleet.units[1]),point);
});
test('actual attack pursues a farther healer instead of the nearest fighter and uses ward mitigation',()=>{
  const {g,e,front,medic,ward}=battle(),stats=enemyStats(g,e),hp=medic.hp,fighter=front.hp;advance(g,1/60);near(medic.hp,hp-stats.damage*.78);assert.equal(front.hp,fighter);assert(ward.hp>0);assert.equal(e.cooldown,stats.interval);
});
test('moving support outside local perception ends pursuit; normal fleet moves remain navigable and can intercept',()=>{
  const {g,e,front,medic,ward}=battle();assert(orderUnits(g,[medic.id],'move',{x:105,z:40}));assert(orderUnits(g,[ward.id],'move',{x:40,z:105}));let escaped=false;for(let i=0;i<600;i++){advance(g,1/60);if(Math.hypot(medic.x-e.x,medic.z-e.z)>24&&Math.hypot(ward.x-e.x,ward.z-e.z)>24){assert.equal(raiderTarget(g,e,g.island,enemyStats(g,e)),null);escaped=true;}}assert(escaped);assert(front.hp>0);assert(Number.isFinite(e.x)&&Number.isFinite(e.z));assert(!g.operation.waiting);
});
test('active pursuit damage and positions replay exactly after decode and pause freezes all raid actors',()=>{
  const {g}=battle();run(g,.2);const restored=decodeSave(encodeSave(g)),paused=structuredClone(restored);run(restored,1);assert.deepEqual(restored,paused);restored.paused=false;run(g,1);run(restored,1);assert.deepEqual(restored.enemies,g.enemies);assert.deepEqual(restored.fleet,g.fleet);assert.equal(restored.hull,g.hull);
});
test('fresh waiting and active dock saves require envelope two, old version-one raids restore and new harbour saves stay one',()=>{
  for(const start of [false,true]){const g=ready('siege-coral-5',start),text=encodeSave(g),data=JSON.parse(text);assert.equal(data.version,2);const restored=decodeSave(text);assert.deepEqual(restored.operation,g.operation);data.version=1;assert.throws(()=>decodeSave(JSON.stringify(data)),/저장 형식/);const checkpoint=structuredClone(g.checkpoint);assert(returnToHarbor(g,true));assert.equal(JSON.parse(encodeSave(g)).version,1);assert.equal(g.resources,checkpoint.resources);assert.deepEqual(g.fleet.units.map(u=>[u.type,u.level,u.hp]),checkpoint.fleet.units.map(u=>[u.type,u.level,u.hp]));}
  const legacy=ready('siege-coral-5',false);delete legacy.operation.siegeVersion;assert(startDefenseWave(legacy));assert(!legacy.enemies.some(e=>e.type==='raider'));assert.equal(JSON.parse(encodeSave(legacy)).version,1);assert.deepEqual(decodeSave(encodeSave(legacy)).enemies,legacy.enemies);
});
test('unknown/misplaced raid versions and mislabelled envelopes cannot bypass validation',()=>{
  const g=ready();g.operation.siegeVersion=3;assert.throws(()=>validateCampaign(g),/편대 버전/);const defense=ready('defense-coral-1');defense.operation.siegeVersion=2;assert.throws(()=>validateCampaign(defense),/편대 버전/);const normal=ready('siege-coral-1'),data=JSON.parse(encodeSave(normal));data.version=2;assert.throws(()=>decodeSave(JSON.stringify(data)),/저장 형식/);
});
test('backup recovery and retry keep the new dock version, exact paid checkpoint and normally created raiders',()=>{
  const g=ready(),checkpoint=structuredClone(g.checkpoint),values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};assert(saveCampaign(g,storage).ok);assert(saveCampaign(g,storage).ok);values.set(SAVE_KEY,'{broken');const loaded=loadCampaign(storage);assert(loaded.recovered);assert.equal(loaded.game.operation.siegeVersion,2);assert.deepEqual(loaded.game.enemies,g.enemies);g.hull=0;advance(g,1/60);assert(retryDefense(g));assert.equal(g.operation.siegeVersion,2);assert(g.operation.waiting);assert.equal(g.resources,checkpoint.resources);assert(startDefenseWave(g));assert.equal(g.enemies.filter(e=>e.type==='raider').length,2);
});
test('inspection names the actual live support target without altering selection or starting combat',()=>{
  const {g,e,medic,ward}=battle(),ui={inspectedEnemy:e.id,inspectionContext:inspectionContext(g),selectedUnits:[1]},before=structuredClone(g);assert.match(inspectedContact(g,ui).support,new RegExp(`정비정 #${medic.id}`));assert.deepEqual(g,before);medic.hp=0;assert.match(inspectedContact(g,ui).support,new RegExp(`방호정 #${ward.id}`));e.active=false;assert.match(inspectedContact(g,ui).support,/교전 전 대기/);assert.match(inspectedContact(g,ui).hint,/차단/);
});
test('original local model is distinct, shares the authored combat radius and releases all procedural geometry',()=>{
  const mesh=enemyModel('raider');let parts=0;mesh.traverse(n=>{if(n.geometry){parts++;n.geometry.dispose();}});assert(parts>=6);assert.equal(campaignRules.enemies.raider.radius,1.55);
});
