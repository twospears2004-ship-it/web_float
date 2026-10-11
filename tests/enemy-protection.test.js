// Isolated tactical fixtures; funded positions do not certify campaign economy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,damageEnemy,enemyStats} from '../src/game.js';
import {launchMission} from '../src/campaign.js';
import {campaignRules} from '../src/campaign-content.js';
import {steerEnemy,enemyProtector,bulwarkWard,protectsEnemy} from '../src/enemy-ai.js';
import {inspectedContact,inspectionContext} from '../src/combat-inspector.js';
import {encodeSave,decodeSave} from '../src/save.js';
import {hullDistance} from '../src/hull.js';
function battle(){const g=createCampaign();launchMission(g,'coral-1');g.facilities=[];const seed=g.enemies[0];g.enemies=[];return {g,add:(type,x,z=0,id=type)=>{const hp=campaignRules.enemies[type].hp,e={...structuredClone(seed),id,type,x,z,hp,maxHp:hp,active:true};g.enemies.push(e);return e;}};}
const run=(g,seconds)=>{for(let i=0;i<seconds*60;i++)advance(g,1/60);};
test('actual damage is reduced only by a living active uncaptured shield in the same assault, within 14m',()=>{
  for(const [change,protectedHit] of [[{},true],[{x:44},false],[{x:43.999},true],[{hp:0},false],[{active:false},false],[{captured:true},false],[{siteId:'other'},false]]){
    const {g,add}=battle(),victim=add('carrier',30),shield=add('bulwark',40);Object.assign(shield,change);const before=victim.hp;damageEnemy(g,victim,100);assert.equal(before-victim.hp,protectedHit?65:100);
  }
  const {g,add}=battle(),victim=add('carrier',30),a=add('bulwark',35,0,'a'),b=add('bulwark',36,0,'b');assert(protectsEnemy(a,victim));assert(protectsEnemy(b,victim));damageEnemy(g,victim,100);assert.equal(victim.hp,victim.maxHp-65);damageEnemy(g,a,100);assert.equal(a.hp,a.maxHp-100);
});
test('bulwark moves toward a local repair ship ahead of wounded attackers and holds a threat-facing shield point',()=>{
  const {g,add}=battle(),shield=add('bulwark',30),medic=add('tender',50),attacker=add('crawler',28);attacker.hp=1;assert.equal(bulwarkWard(g,shield,g.island),medic);
  steerEnemy(g,shield,g.island,enemyStats(g,shield),1,true,110);assert.equal(shield.x,31.6);
  for(let i=0;i<1200;i++)steerEnemy(g,shield,g.island,enemyStats(g,shield),1/60,true,110);
  assert(Math.abs(shield.x-43.5)<1e-8);assert.equal(enemyProtector(g,medic),shield);assert(hullDistance(g,shield)>20);
  medic.x=52;steerEnemy(g,shield,g.island,enemyStats(g,shield),1,true,110);assert(Math.abs(shield.x-45.1)<1e-8);
});
test('carrier is the next escort priority and invalid wards fall back to ordinary approach',()=>{
  for(const change of [{hp:0},{active:false},{captured:true},{siteId:'other'},{x:80}]){
    const {g,add}=battle(),shield=add('bulwark',30),medic=add('tender',50),carrier=add('carrier',49);Object.assign(medic,change);assert.equal(bulwarkWard(g,shield,g.island),carrier);Object.assign(carrier,change);assert.equal(bulwarkWard(g,shield,g.island),null);steerEnemy(g,shield,g.island,enemyStats(g,shield),1,true,110);assert(shield.x<30);
  }
  const {g,add}=battle(),shield=add('bulwark',30);for(const type of ['bulwark','generator','baseCore','seaWall','supplyDepot','gunTower','nest'])add(type,50,0,`${type}-other`);assert.equal(bulwarkWard(g,shield,g.island),null);
});
test('escort slows, overlapping threat fallback and world edges remain finite without teleporting',()=>{
  for(const x of [-110,40,110]){const {g,add}=battle(),shield=add('bulwark',x),ward=add('carrier',x);shield.slowSeconds=2;shield.slowFactor=.5;const before={x:shield.x,z:shield.z};steerEnemy(g,shield,ward,enemyStats(g,shield),1,false,110);assert(Number.isFinite(shield.x)&&Number.isFinite(shield.z));assert(Math.abs(shield.x)<=110&&Math.abs(shield.z)<=110);assert(Math.hypot(shield.x-before.x,shield.z-before.z)<=.8+1e-9);}
});
test('killing or separating the protector opens a real damage window without stacking or protecting captured targets',()=>{
  const {g,add}=battle(),victim=add('carrier',30),shield=add('bulwark',35);damageEnemy(g,victim,100);assert.equal(victim.hp,225);victim.x=50;damageEnemy(g,victim,100);assert.equal(victim.hp,125);victim.x=30;damageEnemy(g,shield,shield.hp);damageEnemy(g,victim,100);assert.equal(victim.hp,25);victim.captured=true;damageEnemy(g,victim,100);assert.equal(victim.hp,25);
});
test('inspection reads actual protection, each overlapping source count, current ward and out-of-range loss without changing the battle',()=>{
  const {g,add}=battle(),victim=add('carrier',30),a=add('bulwark',35,0,'a'),b=add('bulwark',36,0,'b'),ui={inspectedEnemy:victim.id,inspectionContext:inspectionContext(g),selectedUnits:[]},before=structuredClone(g);
  let info=inspectedContact(g,ui);assert.equal(info.shield,a);assert.match(info.support,/피해35% 경감/);assert.deepEqual(g,before);ui.inspectedEnemy=b.id;info=inspectedContact(g,ui);assert.equal(info.shield,b);assert.match(info.support,/보호 1기.*모체 엄호/);
  ui.inspectedEnemy=victim.id;victim.x=80;assert.equal(inspectedContact(g,ui).support,'');assert.equal(inspectedContact(g,ui).shield,null);ui.inspectedEnemy=a.id;a.active=false;assert.match(inspectedContact(g,ui).support,/교전 전 대기/);assert.doesNotMatch(inspectedContact(g,ui).support,/35%/);
});
test('real combat shield steering and protection replay exactly after an ordinary active save, without new saved AI fields',()=>{
  const {g,add}=battle(),shield=add('bulwark',30),carrier=add('carrier',50);run(g,1);assert(shield.x>30);const text=encodeSave(g),restored=decodeSave(text);restored.paused=false;run(g,3);run(restored,3);assert.deepEqual(restored.enemies,g.enemies);assert.equal(restored.hull,g.hull);assert.equal(restored.resources,g.resources);assert(!Object.hasOwn(carrier,'ward'));assert(!Object.hasOwn(shield,'protector'));
});
test('last shield and repair pair resumes the assault instead of waiting in a mutual escort loop',()=>{
  const {g,add}=battle(),shield=add('bulwark',30),medic=add('tender',50);assert.equal(bulwarkWard(g,shield,g.island),null);run(g,30);assert(g.hull<g.maxHull);assert(shield.x<30);assert.equal(enemyProtector(g,medic),shield);assert(hullDistance(g,shield)<=10);
});
