// Funded tactical fixtures test commands and real damage/navigation. They do
// not represent earned progression, campaign economy or human playtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,build,advance,enemyStats} from '../src/game.js';
import {launchMission,bossWarning,returnToHarbor} from '../src/campaign.js';
import {missions} from '../src/campaign-content.js';
import {recruitUnit,orderUnits,tickFleet} from '../src/fleet.js';
import {unitTypes} from '../src/fleet-content.js';
import {navigable} from '../src/navigation.js';
import {encodeSave,decodeSave} from '../src/save.js';
function fleet(count=2){const g=createCampaign();g.resources=100000;g.campaign.completed=missions.slice(0,66).map(m=>m.id);g.campaign.chapter=11;assert(build(g,'shipyard',-1,0));g.facilities.find(f=>f.type==='shipyard').level=9;for(let i=0;i<count;i++)assert(recruitUnit(g,'skiff'));assert(launchMission(g,'coral-1'));g.enemies=[];return g;}
const ids=g=>g.fleet.units.map(u=>u.id),commands=g=>g.fleet.units.map(u=>u.command),run=(g,s)=>{for(let i=0;i<s*60;i++)tickFleet(g,1/60,()=>{},enemyStats);};
test('default and explicit compact orders retain the prior 3m destinations and the entire paid state',()=>{
  for(const count of [1,2,5,22]){const g=fleet(count),copy=structuredClone(g),point={x:65.2,z:60.3},paid={resources:g.resources,hull:g.hull,facilities:structuredClone(g.facilities),checkpoint:structuredClone(g.checkpoint)},width=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/width);
    assert(orderUnits(g,ids(g),'move',point));assert(orderUnits(copy,ids(copy),'move',point,false,'compact'));assert.deepEqual(g,copy);
    assert.deepEqual(commands(g),ids(g).map((_,i)=>({type:'move',x:point.x+(i%width-(width-1)/2)*3,z:point.z+(Math.floor(i/width)-(rows-1)/2)*3})));assert.deepEqual({resources:g.resources,hull:g.hull,facilities:g.facilities,checkpoint:g.checkpoint},paid);
  }
});
test('spread moves to separate 12m destinations without teleporting, charging or mutating growth',()=>{
  const g=fleet(4),before=structuredClone(g);assert(orderUnits(g,ids(g),'move',{x:55,z:50},false,'spread'));
  assert.deepEqual(commands(g),[{type:'move',x:49,z:44},{type:'move',x:61,z:44},{type:'move',x:49,z:56},{type:'move',x:61,z:56}]);
  for(const key of ['resources','hull','maxHull','facilities','checkpoint'])assert.deepEqual(g[key],before[key]);for(let i=0;i<4;i++)assert.deepEqual({x:g.fleet.units[i].x,z:g.fleet.units[i].z},{x:before.fleet.units[i].x,z:before.fleet.units[i].z});
  const destinations=structuredClone(commands(g));run(g,20);for(let i=0;i<4;i++){const u=g.fleet.units[i];assert.equal(u.command.type,'hold');assert(Math.hypot(u.x-destinations[i].x,u.z-destinations[i].z)<.5);}
});
test('a large spread formation stays in safe distinct water at world edges, shores and fixed batteries',()=>{
  for(const point of [{x:110,z:110},{x:-110,z:-110},{x:0,z:0}]){const g=fleet(22);g.tiles=Array.from({length:49},(_,i)=>({x:i%7-3,z:Math.floor(i/7)-3}));if(point.x===0)g.enemies=[{id:'fixed',type:'gunTower',x:25,z:0,hp:200,maxHp:200}];assert(orderUnits(g,ids(g),'attackMove',point,false,'spread'));
    for(const u of g.fleet.units){assert(navigable(g,u.command,unitTypes[u.type].radius));for(const v of g.fleet.units)if(v!==u)assert(Math.hypot(u.command.x-v.command.x,u.command.z-v.command.z)>=3-1e-8);}
    if(point.x)for(const a of commands(g))for(const b of commands(g))if(a!==b)assert(Math.hypot(a.x-b.x,a.z-b.z)>=12-1e-8);
  }
});
test('each queued move keeps its chosen spacing; explicit attacks, holds and escorts retain their rules',()=>{
  const g=fleet(),target={x:50,z:40};assert(orderUnits(g,ids(g),'move',target));const original=structuredClone(commands(g));assert(orderUnits(g,ids(g),'attackMove',{x:70,z:60},true,'spread'));assert.deepEqual(commands(g),original);assert.deepEqual(g.fleet.units.map(u=>u.orders),[[{type:'attackMove',x:64,z:60}],[{type:'attackMove',x:76,z:60}]]);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);restored.paused=false;run(g,24);run(restored,24);assert.deepEqual(restored.fleet,g.fleet);assert(g.fleet.units.every(u=>u.command.type==='hold'));for(let i=0;i<2;i++)assert(Math.hypot(g.fleet.units[i].x-(i?76:64),g.fleet.units[i].z-60)<.5);
  for(const type of ['hold','escort','guard','attack']){const a=fleet(),b=structuredClone(a);a.enemies=[{id:'target',hp:100,x:50,z:50}];b.enemies=structuredClone(a.enemies);const point=type==='guard'?{id:2}:{id:'target'};assert(orderUnits(a,[1],type,point,false,'compact'));assert(orderUnits(b,[1],type,point,false,'spread'));assert.deepEqual(a,b);}
});
test('pause, choices, invalid modes and full queues reject the whole group without replacing orders',()=>{
  for(const mode of ['invalid','__proto__',undefined]){const g=fleet();g.paused=mode===undefined;const before=structuredClone(g);assert.equal(orderUnits(g,ids(g),'move',{x:50,z:50},false,mode),false);assert.deepEqual(g,before);}
  const g=fleet();g.campaign.pendingChoice={site:0,kind:'supplies'};const before=structuredClone(g);assert.equal(orderUnits(g,ids(g),'move',{x:50,z:50},false,'spread'),false);assert.deepEqual(g,before);g.campaign.pendingChoice=null;assert(orderUnits(g,ids(g),'move',{x:50,z:50}));g.fleet.units[0].orders=Array.from({length:8},()=>({type:'move',x:40,z:40}));const paid=structuredClone(g.fleet);assert.equal(orderUnits(g,ids(g),'move',{x:70,z:70},true,'spread'),false);assert.deepEqual(g.fleet,paid);
});
test('real guardian warning hits both compact ships but only one spread ship; save and rollback preserve commands',()=>{
  for(const formation of ['compact','spread']){const g=fleet(),seed=structuredClone(g.checkpoint);Object.assign(g.island,{x:-70,z:-70});assert(orderUnits(g,ids(g),'move',{x:40,z:40},false,formation));run(g,18);const [u,v]=g.fleet.units,e={id:'guardian',siteId:g.catalog[0].id,type:'leviathan',x:48,z:40,hp:10000,maxHp:10000,active:true,rewarded:false,cooldown:0,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10};g.enemies=[e];e.windup=bossWarning(g,e,u);e.windup.remaining=.001;
    const restored=decodeSave(encodeSave(g));restored.paused=false;const hp=u.hp,other=v.hp;advance(g,1/60);advance(restored,1/60);assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.enemies,g.enemies);assert(u.hp<hp);assert.equal(v.hp,formation==='spread'?other:other-(hp-u.hp));assert.deepEqual(g.checkpoint,seed);
    assert(returnToHarbor(g,true));assert.equal(g.resources,seed.resources);assert.equal(g.fleet.version,seed.fleet.version);assert.equal(g.fleet.nextId,seed.fleet.nextId);for(const ship of g.fleet.units){const prior=seed.fleet.units.find(p=>p.id===ship.id);for(const key of Object.keys(prior).filter(k=>!['x','z'].includes(k)))assert.deepEqual(ship[key],prior[key]);assert(navigable(g,ship,unitTypes[ship.type].radius));}assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
  }
});
