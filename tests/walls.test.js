import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCampaign,build,expand,expansionSlots,moveFacility,upgrade,demolish,advance,damageEnemy,applyHullDamage,facilityPosition} from '../src/game.js';
import {launchDefense,startDefenseWave,retryDefense} from '../src/frontier.js';
import {defenseTarget,structureHull} from '../src/fortifications.js';
import {wallEdges,wallAt,validWallSlot} from '../src/walls.js';
import {validateCampaign,encodeSave,decodeSave} from '../src/save.js';
// Funded isolated cases verify placement/combat contracts, not earned playtime.
function base(){const g=createCampaign();g.resources=100000;return g;}
test('a first-sea farm and four walls share one tile, while neighbour faces cannot double-charge',()=>{
  const g=base();assert.equal(build(g,'farm',1,1),true);const farm=g.facilities.at(-1);farm.stock=18;
  for(const edge of Object.keys(wallEdges))assert.equal(build(g,'wall',1,1,edge),true);
  const cash=g.resources,count=g.facilities.length;
  assert.equal(build(g,'wall',0,1,'east'),false);assert.equal(build(g,'wall',1,0,'south'),false);
  assert.equal(build(g,'wall',1,1,'roof'),false);assert.equal(build(g,'wall',3,3,'north'),false);
  assert.equal(g.resources,cash);assert.equal(g.facilities.length,count);assert.equal(farm.stock,18);
  assert.equal(build(g,'wall',0,0,'east'),true);assert.equal(build(g,'farm',0,0),false);
  assert.deepEqual(facilityPosition(g,wallAt(g,1,1,'north')),{x:3.4,z:1.7});validateCampaign(g);
});
test('edge relocation preserves paid upgrades, damage and neighbouring crops; removing a wall keeps the centre',()=>{
  const g=base();build(g,'farm',1,1);const farm=g.facilities.at(-1);farm.cropProgress=2;farm.stock=18;
  build(g,'wall',1,1,'east');const wall=g.facilities.at(-1);wall.hp=structureHull(wall)-30;upgrade(g,wall.id);
  const old={hp:wall.hp,level:wall.level,investment:wall.investment},cash=g.resources;
  assert.equal(moveFacility(g,wall.id,1,1,'south'),true);assert.equal(g.resources,cash);
  assert.deepEqual({hp:wall.hp,level:wall.level,investment:wall.investment},old);
  assert.equal(wallAt(g,1,1,'east'),undefined);assert.equal(wallAt(g,1,1,'south'),wall);
  build(g,'wall',1,1,'north');const before=g.resources;assert.equal(moveFacility(g,wall.id,1,1,'north'),false);assert.equal(g.resources,before);
  demolish(g,wall.id);assert.equal(g.resources,before+Math.floor(old.investment*0.6));assert.equal(farm.stock,18);assert.equal(farm.cropProgress,2);
  // A wall-only tile has a free centre for a real facility.
  build(g,'wall',-1,1,'west');assert.equal(build(g,'fishery',-1,1),true);validateCampaign(g);
});
test('each wall intercepts only its own firing direction and destruction exposes the central hull',()=>{
  for(const [edge,s]of Object.entries(wallEdges)){
    const g=base();g.campaign.completed=['coral-1'];build(g,'wall',0,0,edge);const wall=g.facilities.at(-1);
    assert.equal(launchDefense(g,'defense-coral-1'),true);
    const attacker={type:'armored',x:s.dx*14,z:s.dz*14};assert.equal(defenseTarget(g,attacker).facilityId,wall.id);
    assert.equal(defenseTarget(g,{...attacker,x:-attacker.x,z:-attacker.z}),g.island);
    const hull=g.hull;applyHullDamage(g,attacker,structureHull(wall)+1,defenseTarget(g,attacker));assert.equal(wall.hp,0);assert.equal(g.hull,hull);assert.equal(defenseTarget(g,attacker),g.island);
  }
});
test('a wall beyond the firing segment does not protect a facility on its near side',()=>{
  const g=base();g.campaign.completed=['coral-1'];moveFacility(g,1,1,-1);build(g,'farm',-1,-1);const farm=g.facilities.at(-1);
  build(g,'wall',-1,-1,'south');launchDefense(g,'defense-coral-1');const enemy={type:'bomber',x:-3.4,z:-12};
  assert.equal(defenseTarget(g,enemy).facilityId,farm.id);
  build(g,'wall',-1,-1,'north');const wall=g.facilities.at(-1);wall.hp=structureHull(wall);
  assert.equal(defenseTarget(g,enemy).facilityId,wall.id);
});
test('edge ownership and crops survive mission checkpoints, save/reload and retry exactly',()=>{
  const g=base();g.campaign.completed=['coral-1'];build(g,'farm',1,1);g.facilities.at(-1).stock=24;
  build(g,'wall',1,1,'east');build(g,'wall',1,1,'south');launchDefense(g,'defense-coral-1');const checkpoint=structuredClone(g.checkpoint);
  startDefenseWave(g);g.facilities.at(-1).hp=42;
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.facilities,g.facilities);assert.deepEqual(restored.checkpoint.facilities,checkpoint.facilities);
  restored.paused=false;restored.hull=0;advance(restored,1/60);assert.equal(retryDefense(restored),true);assert.deepEqual(restored.facilities,checkpoint.facilities.map(f=>({...f,hp:f.hp ?? structureHull(f)})));
  const bad=structuredClone(restored);bad.facilities.at(-1).edge='roof';assert.throws(()=>encodeSave(bad),/타일 면/);
  const duplicate=structuredClone(restored);duplicate.facilities.at(-1).edge='east';assert.throws(()=>encodeSave(duplicate),/위치/);
  const other=structuredClone(restored);other.facilities[0].edge='east';assert.throws(()=>encodeSave(other),/타일 면/);
});
test('the complete 7 by 7 island supports 112 unique wall segments and saveable defense records above 48',()=>{
  const g=base();g.campaign.completed=['coral-1'];while(g.tiles.length<49){const t=expansionSlots(g)[0];assert.equal(expand(g,t.x,t.z),true);}
  for(const t of g.tiles)for(const edge of Object.keys(wallEdges))if(validWallSlot(g,t.x,t.z,edge))assert.equal(build(g,'wall',t.x,t.z,edge),true);
  assert.equal(g.facilities.filter(f=>f.type==='wall').length,112);assert.equal(g.facilities.length,113);validateCampaign(g);
  launchDefense(g,'defense-coral-1');for(let i=0;i<4;i++){startDefenseWave(g);for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);}
  assert.equal(g.operation.result.standing,113);assert.deepEqual(decodeSave(encodeSave(g)).operation,g.operation);
});
test('historical full campaign saves keep every old wall, upgrade, investment and earned balance',()=>{
  const raw=fs.readFileSync(new URL('./fixtures/atlas-legacy-journey.json',import.meta.url),'utf8'),old=JSON.parse(raw).payload;
  const g=decodeSave(raw);assert.equal(g.resources,old.resources);assert.equal(g.facilities.length,old.facilities.length);
  for(const f of old.facilities){const restored=g.facilities.find(v=>v.id===f.id);assert.deepEqual(restored,f.type==='wall'?{...f,edge:'north'}:f);}
  assert.equal(g.facilities.filter(f=>f.type==='wall').length,24);validateCampaign(g);assert.deepEqual(decodeSave(encodeSave(g)).facilities,g.facilities);
});
