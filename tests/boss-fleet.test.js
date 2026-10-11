// Funded, isolated combat invariants; these fixtures do not prove economy or
// playtime. Fleet commands, damage, warnings and recovery use the actual rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,advance,enemyStats} from '../src/game.js';
import {launchMission,bossWarning,useAbility} from '../src/campaign.js';
import {recruitUnit,orderUnits,threatenedUnit} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';
const run=(g,seconds)=>{for(let i=0;i<seconds*60;i++)advance(g,1/60);};
function battle(){
  const g=createCampaign('destination');g.resources=1000;assert(build(g,'shipyard',-1,0));assert(recruitUnit(g,'skiff'));assert(recruitUnit(g,'skiff'));assert(launchMission(g,'coral-1'));g.facilities=[];g.route=null;Object.assign(g.island,{x:-70,z:-70});
  const e=g.enemies[0];Object.assign(e,{type:'leviathan',x:40,z:40,hp:10000,maxHp:10000,active:true,cooldown:0,windup:null});g.enemies=[e];
  const [u,v]=g.fleet.units;Object.assign(u,{x:38,z:40,command:{type:'hold'}});Object.assign(v,{x:65,z:65,command:{type:'hold'}});return {g,e,u,v};
}
test('a guardian responds to a nearer living fleet threat, with the existing distance limit and stable tie break',()=>{
  const {g,e,u,v}=battle(),stats=enemyStats(g,e);assert.equal(threatenedUnit(g,e,g.island,stats),u);u.hp=0;assert.equal(threatenedUnit(g,e,g.island,stats),g.island);u.hp=85;u.x=65;u.z=65;assert.equal(threatenedUnit(g,e,g.island,stats),g.island);Object.assign(u,{x:38,z:40});Object.assign(v,{x:42,z:40});assert.equal(threatenedUnit(g,e,g.island,stats),u);
});
test('fleet-targeted warnings lock coordinates without copying ship health, orders or identity into save records',()=>{
  const {g,e,u}=battle();u.orders=[{type:'move',x:60,z:40}];const prior=structuredClone(u),warning=bossWarning(g,e,u);assert.deepEqual(warning,{x:38,z:40,radius:6,zones:[{x:38,z:40,radius:6}],pattern:'slam',remaining:1.8});assert.deepEqual(u,prior);e.windup=warning;const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.enemies[0].windup,warning);
});
test('actual guardian begins a warning at a distant ship and its original area can be evaded with a real move command',()=>{
  const {g,e,u}=battle();advance(g,1/60);assert.equal(e.windup.x,38);assert.equal(e.windup.z,40);const fixed=structuredClone(e.windup),health=u.hp,hull=g.hull;assert(orderUnits(g,[u.id],'move',{x:60,z:40}));run(g,1.85);assert(Math.hypot(u.x-fixed.x,u.z-fixed.z)>fixed.radius+1);assert.equal(u.hp,health);assert.equal(g.hull,hull);assert.equal(e.windup,null);
});
test('a fleet warning damages ships in its fixed area once and leaves a distant island untouched',()=>{
  const {g,e,u,v}=battle();Object.assign(v,{x:39,z:43});e.windup=bossWarning(g,e,u);e.windup.zones.push({...e.windup.zones[0]});e.windup.remaining=.001;const amount=enemyStats(g,e).damage*1.5,hull=g.hull;advance(g,1/60);assert.equal(u.hp,85-amount);assert.equal(v.hp,85-amount);assert.equal(g.hull,hull);assert.equal(e.windup,null);
});
test('changing the nearest threat during a warning cannot make an overlapping island immune or hit a ship twice',()=>{
  const {g,e,u,v}=battle();Object.assign(g.island,{x:30,z:40});Object.assign(e,{x:48,z:40});Object.assign(v,{x:39,z:44});e.windup=bossWarning(g,e,u);e.windup.zones.push({...e.windup.zones[0]});e.windup.remaining=.001;assert.equal(threatenedUnit(g,e,g.island,enemyStats(g,e)),v);const amount=enemyStats(g,e).damage*1.5,hull=g.hull;advance(g,1/60);assert.equal(g.hull,hull-amount);assert.equal(u.hp,85-amount);assert.equal(v.hp,85-amount);
});
test('existing barrier and bulkhead research protect a targeted fleet; fleet hits do not apply island-only root effects',()=>{
  const {g,e,u}=battle();g.campaign.tech.bulkhead=2;assert(useAbility(g,'barrier'));e.windup=bossWarning(g,e,u);e.windup.pattern='roots';e.windup.remaining=.001;const amount=enemyStats(g,e).damage*1.5*.35*.88;advance(g,1/60);assert(Math.abs(u.hp-(85-amount))<1e-9);assert.equal(g.campaign.slowSeconds,0);
});
test('active fleet-targeted warnings replay exact damage after normal save decoding; pause freezes the impact',()=>{
  const {g,e,u}=battle();advance(g,1/60);run(g,.5);const restored=decodeSave(encodeSave(g));restored.paused=false;const paused=decodeSave(encodeSave(g)),before=structuredClone(paused);run(paused,2);assert.deepEqual(paused,before);run(g,1.4);run(restored,1.4);assert.deepEqual(restored.enemies,g.enemies);assert.deepEqual(restored.fleet,g.fleet);assert.equal(restored.hull,g.hull);assert(u.hp<85);
});
