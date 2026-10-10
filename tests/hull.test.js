import test from 'node:test';
import assert from 'node:assert/strict';
import {closestHullPoint,hullDistance,separateFromHull} from '../src/hull.js';
import {createCampaign,advance,build,expand,expansionCost,setRoute,weaponStats,enemyStats} from '../src/game.js';
import {launchMission,spawnWave} from '../src/campaign.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';
const run=(g,seconds,input={})=>{for(let i=0;i<seconds*60;i++)advance(g,1/60,input);};
function largeShip(mode='direct') {
  const g=createCampaign(mode);g.tiles=[];for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++)g.tiles.push({x,z});return g;
}
function singleEnemy(g,type,x,z) {
  launchMission(g,'coral-1');const e=g.enemies[0];Object.assign(e,{type,x,z,active:true,hp:10000,maxHp:10000});g.enemies=[e];return e;
}

test('footprint follows translation, real tile edges and newly expanded tiles',()=>{
  const g=createCampaign();assert.ok(Math.abs(hullDistance(g,{x:8,z:0})-2.9)<1e-9);
  const q=closestHullPoint(g,{x:8,z:0});assert.equal(q.x,5.1);assert.equal(q.z,0);
  g.resources=1000;expand(g,2,0);assert.ok(hullDistance(g,{x:8,z:0})<0);
  assert.ok(hullDistance(g,{x:8,z:4})>2); // Water beside the extension stays water.
  g.island={x:30,z:-20};assert.ok(hullDistance(g,{x:38,z:-20})<0);
});
test('separation clears concave shores, corners and narrow water gaps',()=>{
  const g=createCampaign();g.tiles=[{x:0,z:0},{x:1,z:0},{x:0,z:1}];
  for(const p of [{x:0,z:0},{x:3.4,z:3.4},{x:1.7,z:1.7},{x:-1.8,z:-1.8}]) {
    const q=separateFromHull(g,p,2.3);assert.ok(hullDistance(g,q)>=2.3-1e-8);
    assert.deepEqual(separateFromHull(g,q,2.3),q);
  }
});
test('approaching enemies remain in water and strike the expanded hull edge',()=>{
  const g=largeShip();const e=singleEnemy(g,'crawler',0,-40);g.facilities=[];
  run(g,10);assert.ok(hullDistance(g,e)>7.4);assert.ok(e.z<-19);assert.ok(g.hull<g.maxHull);
  const side=singleEnemy(g,'crawler',0,0);advance(g,1/60);assert.ok(hullDistance(g,side)>=enemyStats(g,side).radius);
});
test('fixed fortresses hold position while both navigation modes respect their shore',()=>{
  for(const mode of ['direct','destination']) {
    const g=createCampaign(mode),position=mode==='direct'?{x:0,z:-12}:{x:-12,z:-6.4};const e=singleEnemy(g,'nest',position.x,position.z);g.facilities=[];
    if(mode==='destination')setRoute(g,'objective-0');
    for(let t=0;t<(mode==='destination'?10:3)*60;t++){advance(g,1/60,{z:-1});assert.ok(hullDistance(g,e)>=3.3-1e-8);}
    assert.equal(e.x,position.x);assert.equal(e.z,position.z);assert.ok(g.hull<g.maxHull);
    if(mode==='destination')assert.ok(Math.hypot(g.island.x,g.island.z)>40);else assert.ok(g.combat);
    assert.ok(Math.abs(g.island.x)<=110 && Math.abs(g.island.z)<=110);assert.equal(validateCampaign(g),true);
  }
});
test('front weapons reach hull-edge targets that rear weapons cannot reach',()=>{
  const a=largeShip(),b=largeShip();for(const [g,z] of [[a,-3],[b,3]]) {
    const e=singleEnemy(g,'crawler',0,-20);g.facilities=[{id:1,type:'cannon',x:0,z,level:1,cooldown:0,aim:0}];advance(g,1/60);
    assert.equal(weaponStats(g.facilities[0],g).range,20);assert.ok(hullDistance(g,e)>7);
  }
  assert.ok(a.enemies[0].hp<10000);assert.equal(b.enemies[0].hp,10000);
});
test('area attacks hit an outer tile and miss water that clears the entire hull',()=>{
  const g=largeShip();singleEnemy(g,'crawler',0,-50);g.facilities=[];
  g.campaign.hazards=[{id:'edge',kind:'storm',x:15,z:0,radius:4,remaining:0,damage:30}];advance(g,1/60);assert.equal(g.hull,330);
  g.campaign.hazards=[{id:'miss',kind:'storm',x:18,z:0,radius:4,remaining:0,damage:30}];advance(g,1/60);assert.equal(g.hull,330);
});
test('charge landings and old in-deck saves clear the hull without awarding kills',()=>{
  const g=largeShip();const e=singleEnemy(g,'leviathan',0,-30);g.facilities=[];
  e.windup={x:0,z:0,radius:6,pattern:'charge',remaining:0.001,zones:[{x:0,z:0,radius:6}]};
  advance(g,1/60);assert.ok(hullDistance(g,e)>=3.5);
  e.x=0;e.z=0;const saved=decodeSave(encodeSave(g));assert.equal(saved.enemies[0].x,0);assert.equal(saved.enemies[0].z,0);
  saved.paused=false;const kills=saved.kills,money=saved.resources;advance(saved,1/60);
  assert.ok(hullDistance(saved,saved.enemies[0])>=3.5);assert.equal(saved.kills,kills);assert.equal(saved.resources,money);assert.equal(validateCampaign(saved),true);
});
test('successive expansions compete with refit resources and persist their next price',()=>{
  const g=createCampaign();assert.equal(expansionCost(g),75);assert.equal(expand(g,2,0),true);
  assert.equal(g.resources,75);assert.equal(expansionCost(g),90);const before=structuredClone(g);
  assert.equal(expand(g,0,-2),false);assert.equal(g.resources,before.resources);assert.deepEqual(g.tiles,before.tiles);assert.equal(g.maxHull,before.maxHull);
  g.resources=90;assert.equal(expand(g,0,-2),true);assert.equal(g.resources,0);assert.equal(g.maxHull,430);
  const saved=decodeSave(encodeSave(g));assert.equal(expansionCost(saved),105);assert.equal(saved.tiles.length,11);
});
test('new waves and carrier spawns begin in water even beside a large island',()=>{
  const g=largeShip();launchMission(g,'coral-1');g.enemies=[];g.island={x:g.catalog[0].x,z:g.catalog[0].z};spawnWave(g);
  for(const e of g.enemies)assert.ok(hullDistance(g,e)>=enemyStats(g,e).radius);
  const carrier=singleEnemy(g,'carrier',-15,0);g.facilities=[];carrier.spawnTimer=0;advance(g,1/60);
  assert.equal(carrier.spawnCount,1);const child=g.enemies.find(e=>e.type==='bomber');assert.ok(child);
  assert.ok(hullDistance(g,child)>=1.6);assert.equal(validateCampaign(g),true);
});
test('shore collisions and damage remain deterministic at 30, 60 and 144 render fps',()=>{
  const states=[30,60,144].map(fps=>{
    const g=createCampaign('direct'),e=singleEnemy(g,'nest',0,-12);g.facilities=[];
    for(let t=0;t<fps*5;t++)advance(g,1/fps,{z:-1});return {island:g.island,hull:g.hull,enemy:{x:e.x,z:e.z}};
  });
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});
