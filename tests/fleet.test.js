import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,upgrade,damageEnemy,enemyStats,applyHullDamage} from '../src/game.js';
import {launchMission,returnToHarbor} from '../src/campaign.js';
import {missions} from '../src/campaign-content.js';
import {recruitUnit,upgradeUnit,repairFleet,fleetRepairCost,fleetCapacity,fleetSupply,orderUnits,unitStats,deployFleet,tickFleet} from '../src/fleet.js';
import {waterPath,navigable,waterPoint} from '../src/navigation.js';
import {encodeSave,decodeSave} from '../src/save.js';
const run=(g,s)=>{for(let i=0;i<s*60;i++)advance(g,1/60);};
test('a temporarily occupied destination remains a move order until the ally clears it',()=>{
  const g=yard('direct');recruitUnit(g,'skiff');recruitUnit(g,'skiff');launchMission(g,'coral-1');g.enemies=[];
  const [moving,blocking]=g.fleet.units;Object.assign(moving,{x:50,z:0});Object.assign(blocking,{x:60,z:10,command:{type:'hold'}});
  assert.equal(orderUnits(g,[moving.id],'move',{x:60,z:0}),true);
  blocking.z=0;
  const tick=()=>tickFleet(g,1/60,()=>{},()=>({armor:0}));for(let i=0;i<180;i++)tick();
  assert.equal(moving.command.type,'move');assert.ok(Math.hypot(moving.x-60,moving.z)>.5);
  blocking.z=10;for(let i=0;i<180;i++)tick();assert.equal(moving.command.type,'hold');assert.ok(Math.hypot(moving.x-60,moving.z)<.5);
  assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
// Isolated rule fixtures. These funded setups are not campaign economy evidence.
function yard(mode='destination',chapter=0) {
  const g=createCampaign(mode);g.resources=10000;g.campaign.completed=missions.slice(0,chapter*6).map(m=>m.id);g.campaign.chapter=chapter;
  assert.equal(build(g,'shipyard',1,0),true);return g;
}
test('passive escort and hold ignore inactive enemies but defend against an existing engagement',()=>{
  for(const type of ['escort','hold']) {
    const g=yard();recruitUnit(g,'skiff');launchMission(g,'coral-1');
    const u=g.fleet.units[0],e=g.enemies[0];Object.assign(u,{x:e.x+5,z:e.z,command:{type}});g.campaign.waitingForDeparture=false;
    const before=e.hp,shots=g.shots;tickFleet(g,1/60,damageEnemy,enemyStats);
    assert.equal(e.active,false);assert.equal(e.hp,before);assert.equal(g.shots,shots);
    e.active=true;tickFleet(g,1/60,damageEnemy,enemyStats);assert.ok(e.hp<before);assert.ok(g.shots>shots);
  }
});
test('explicit attack and attack-move still engage inactive enemies',()=>{
  for(const type of ['attack','attackMove']) {
    const g=yard();recruitUnit(g,'skiff');launchMission(g,'coral-1');
    const u=g.fleet.units[0],e=g.enemies[0];Object.assign(u,{x:e.x+5,z:e.z});const before=e.hp;
    assert.equal(orderUnits(g,[u.id],type,type==='attack'?e:{x:e.x,z:e.z}),true);
    assert.equal(g.campaign.waitingForDeparture,false);tickFleet(g,1/60,damageEnemy,enemyStats);
    assert.equal(e.active,true);assert.ok(e.hp<before);
  }
});
test('field recruitment leaves an unobstructed berth and the new ship can move past parked allies',()=>{
  const g=yard();for(let i=0;i<5;i++)assert.equal(recruitUnit(g,'skiff'),true);assert.equal(launchMission(g,'coral-1'),true);
  assert.equal(orderUnits(g,g.fleet.units.map(u=>u.id),'hold'),true);const cash=g.resources;
  assert.equal(recruitUnit(g,'skiff'),true);assert.equal(g.resources,cash-45);const u=g.fleet.units.at(-1),peers=g.fleet.units.filter(v=>v!==u).map(v=>({...v,radius:unitStats(g,v).radius}));
  assert.equal(navigable(g,u,unitStats(g,u).radius,peers),true);assert.equal(orderUnits(g,[u.id],'move',{x:60,z:50}),true);run(g,15);
  assert.equal(u.command.type,'hold');assert.ok(Math.hypot(u.x-60,u.z-50)<1);assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
test('shipyard costs, fleet capacity and sea/type gates are atomic',()=>{
  const g=createCampaign();assert.equal(recruitUnit(g,'skiff'),false);assert.equal(g.resources,150);
  assert.equal(build(g,'shipyard',1,0),true);assert.equal(g.resources,30);assert.equal(recruitUnit(g,'skiff'),false);
  g.resources=1000;assert.equal(fleetCapacity(g),6);assert.equal(recruitUnit(g,'gunboat'),false);
  for(let i=0;i<6;i++)assert.equal(recruitUnit(g,'skiff'),true);
  const cash=g.resources;assert.equal(recruitUnit(g,'skiff'),false);assert.equal(g.resources,cash);assert.equal(fleetSupply(g),6);
  assert.equal(upgrade(g,2),true);assert.equal(fleetCapacity(g),8);assert.equal(recruitUnit(g,'gunboat'),false);
});
test('unit upgrade and nearby repair spend once and retain damage',()=>{
  const g=yard();recruitUnit(g,'skiff');const u=g.fleet.units[0];u.hp=35;const cash=g.resources;
  assert.equal(upgradeUnit(g,u.id),true);assert.equal(g.resources,cash-36);assert.equal(u.maxHp,111);assert.equal(u.hp,61);
  assert.equal(upgradeUnit(g,u.id),false);assert.equal(fleetRepairCost(g),9);assert.equal(repairFleet(g),true);assert.equal(u.hp,u.maxHp);assert.equal(repairFleet(g),false);
  u.x=80;u.hp-=20;assert.equal(fleetRepairCost(g),0);assert.equal(upgradeUnit(g,u.id),false);
});
test('water navigation routes around the physical island and fixed artillery',()=>{
  const g=yard();g.enemies=[{type:'nest',x:20,z:0,hp:100}];
  for(const [a,b] of [[{x:-15,z:0},{x:35,z:0}],[{x:20,z:-12},{x:20,z:12}]]) {
    const path=waterPath(g,a,b,1);assert.ok(path.length>1);let from=a;
    for(const p of path){const steps=Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.z-from.z)/0.25));for(let i=1;i<=steps;i++)assert.equal(navigable(g,{x:from.x+(p.x-from.x)*i/steps,z:from.z+(p.z-from.z)*i/steps},1),true);from=p;}
    assert.deepEqual(path.at(-1),b);
  }
  assert.equal(navigable(g,waterPoint(g,{x:0,z:0},1),1),true);
});

test('an unreachable move waits before replanning and resumes when the blockade opens',()=>{
  const g=yard();recruitUnit(g,'skiff');launchMission(g,missions[0].id);
  const u=g.fleet.units[0];Object.assign(u,{x:25,z:50});
  // An isolated closed ring proves failed-path behavior without damaging ships.
  g.enemies=Array.from({length:16},(_,i)=>({id:`block-${i}`,type:'nest',hp:100,x:50+Math.cos(i*Math.PI/8)*10,z:50+Math.sin(i*Math.PI/8)*10}));
  orderUnits(g,[u.id],'move',{x:50,z:50});tickFleet(g,1/60,damageEnemy,enemyStats);
  assert.equal(u.waypoints.length,0);const wait=u.repath,position={x:u.x,z:u.z};assert.ok(wait>0);
  tickFleet(g,1/60,damageEnemy,enemyStats);assert.ok(u.repath<wait,'a failed route is recomputed every frame');assert.deepEqual({x:u.x,z:u.z},position);
  g.enemies=[];for(let i=0;i<6*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);
  assert.equal(u.command.type,'hold');assert.ok(Math.hypot(u.x-50,u.z-50)<1);assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
test('formation move, stop and escort are real in both navigation modes',()=>{
  for(const mode of ['direct','destination']) {
    const g=yard(mode);recruitUnit(g,'skiff');recruitUnit(g,'skiff');launchMission(g,missions[0].id);
    const ids=g.fleet.units.map(u=>u.id);assert.equal(orderUnits(g,ids,'move',{x:22,z:-20}),true);assert.equal(g.campaign.waitingForDeparture,false);
    run(g,8);for(const u of g.fleet.units){assert.ok(Math.hypot(u.x-22,u.z+20)<3);assert.equal(u.command.type,'hold');}
    assert.deepEqual(g.island,{x:0,z:0});assert.equal(orderUnits(g,ids,'escort'),true);run(g,8);for(const u of g.fleet.units)assert.ok(Math.hypot(u.x,u.z)<14);
    g.paused=true;const before=structuredClone(g.fleet);assert.equal(orderUnits(g,ids,'move',{x:-40,z:0}),false);run(g,5);assert.deepEqual(g.fleet,before);
  }
});
test('an expanded ship near every world edge deploys its fleet in reachable water',()=>{
  const g=yard();g.tiles=Array.from({length:49},(_,i)=>({x:i%7-3,z:Math.floor(i/7)-3}));
  for(let i=0;i<6;i++)assert.equal(recruitUnit(g,'skiff'),true);
  for(const [x,z] of [[100,0],[105,0],[-100,0],[-105,0],[0,100],[0,105],[0,-100],[0,-105],[100,100],[-100,-100]]) {
    g.island={x,z};deployFleet(g);
    for(const u of g.fleet.units)assert.equal(navigable(g,u,0.85),true,`fleet inside the hull at ${x},${z}`);
    const goal={x:x?Math.sign(x)*110:0,z:z?Math.sign(z)*110:0},point=waterPoint(g,goal,1.15);
    assert.equal(navigable(g,point,1.15),true);assert.ok(waterPath(g,{x:0,z:0},goal,1.15).length>0);
  }
  decodeSave(encodeSave(g));
});
test('an off-center fortress at the world boundary cannot project a destination into its collider',()=>{
  const g=yard();g.enemies=[{type:'nest',hp:1,x:106,z:0}];
  const goal={x:110,z:0},point=waterPoint(g,goal,1.15);
  assert.equal(navigable(g,point,1.15),true);assert.ok(waterPath(g,{x:0,z:20},goal,1.15).length>0);
  const edge={x:109,z:20};assert.deepEqual(waterPoint(g,edge,1.15),edge);assert.deepEqual(waterPath(g,{x:0,z:20},edge,1.15).at(-1),edge);
});
test('opposing fleet orders can pass each other beside the shore',()=>{
  const g=yard();recruitUnit(g,'skiff');recruitUnit(g,'skiff');launchMission(g,missions[0].id);
  const [a,b]=g.fleet.units;Object.assign(a,{x:-4,z:7});Object.assign(b,{x:4,z:7});
  orderUnits(g,[a.id],'move',{x:8,z:7});orderUnits(g,[b.id],'move',{x:-8,z:7});
  for(let i=0;i<10*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);
  assert.equal(a.command.type,'hold');assert.equal(b.command.type,'hold');assert.ok(a.x>7&&b.x<-7);
  assert.equal(navigable(g,a,0.85),true);assert.equal(navigable(g,b,0.85),true);
});
test('a formation projected around an expanded shore assigns distinct destinations and finishes moving',()=>{
  const g=yard();g.tiles=Array.from({length:49},(_,i)=>({x:i%7-3,z:Math.floor(i/7)-3}));for(let i=0;i<6;i++)recruitUnit(g,'skiff');
  launchMission(g,missions[0].id);g.island={x:100,z:0};deployFleet(g);orderUnits(g,g.fleet.units.map(u=>u.id),'move',{x:109,z:0});
  for(const [i,u] of g.fleet.units.entries())for(const other of g.fleet.units.slice(i+1))assert.ok(Math.hypot(u.command.x-other.command.x,u.command.z-other.command.z)>1.9,'projected formation overlaps');
  for(let i=0;i<20*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);
  for(const u of g.fleet.units){assert.equal(u.command.type,'hold');assert.equal(navigable(g,u,0.85),true);}decodeSave(encodeSave(g));
});
test('stationary allies at the expanded shoreline cannot trap moving units on intermediate waypoints',()=>{
  const g=yard();g.tiles=Array.from({length:49},(_,i)=>({x:i%7-3,z:Math.floor(i/7)-3}));for(let i=0;i<6;i++)recruitUnit(g,'skiff');
  launchMission(g,missions[0].id);g.island={x:105.927,z:0};
  // Positions observed in the boundary browser failure; an isolated rule setup.
  const positions=[[91.3307,0.2302],[92.653,-1.1728],[102.7342,13.0207],[92.6035,1.6908],[104.5474,13.5999],[108.6224,13.6288]];
  for(const [i,u] of g.fleet.units.entries())Object.assign(u,{x:positions[i][0],z:positions[i][1],command:{type:'hold'},waypoints:[],repath:0});
  orderUnits(g,[1],'move',{x:106.158,z:-13.001});orderUnits(g,[3],'move',{x:107,z:13.001});
  for(let i=0;i<20*60;i++)tickFleet(g,1/60,damageEnemy,enemyStats);
  for(const id of [1,3]){const u=g.fleet.units.find(u=>u.id===id);assert.equal(u.command.type,'hold');assert.equal(navigable(g,u,0.85),true);}
});
test('touching allies at a concave shoreline can leave together without crossing the hull',()=>{
  for(const mode of ['direct','destination'])for(const fps of [30,60]){
    const g=yard(mode);recruitUnit(g,'skiff');recruitUnit(g,'skiff');launchMission(g,missions[0].id);
    // A real exploration failure, isolated from combat and earned-economy claims.
    g.island={x:-28.438930314698737,z:-83.52186990030518};
    g.tiles.push({x:0,z:-2},{x:-2,z:0},{x:2,z:0},{x:0,z:2},{x:-2,z:-1});
    const positions=[[-31.094228099282734,-91.27912839983937],[-31.708553011402383,-89.60943000303745]];
    for(const [i,u]of g.fleet.units.entries())Object.assign(u,{x:positions[i][0],z:positions[i][1]});
    assert.equal(orderUnits(g,[1,2],'move',{x:-42,z:-87}),true);
    for(let i=0;i<12*fps;i++){
      tickFleet(g,1/fps,damageEnemy,enemyStats);
      for(const u of g.fleet.units)assert.equal(navigable(g,u,0.85),true);
      const [a,b]=g.fleet.units;assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=1.77);
    }
    for(const u of g.fleet.units){assert.equal(u.command.type,'hold');assert.ok(Math.hypot(u.x+42,u.z+87)<3);}
    decodeSave(encodeSave(g));
  }
});

test('explicit attacks activate opponents and pay exactly once through common damage rules',()=>{
  const g=yard();recruitUnit(g,'skiff');launchMission(g,missions[0].id);const u=g.fleet.units[0],e=g.enemies[0];e.x=20;e.z=-12;const cash=g.resources;
  assert.equal(orderUnits(g,[u.id],'attack',{id:e.id}),true);run(g,20);assert.equal(e.hp,0);assert.equal(e.rewarded,true);assert.ok(g.resources>cash);assert.ok(g.shots>0);assert.ok(u.hp<u.maxHp);
  const reward=g.resources;damageEnemy(g,e,9999);assert.equal(g.resources,reward);
});
test('enemy attacks damage the fleet without secretly damaging the escort target',()=>{
  const g=yard();recruitUnit(g,'skiff');launchMission(g,missions[0].id);const u=g.fleet.units[0],hull=g.hull,ally=g.campaign.allyHull;
  applyHullDamage(g,{x:u.x+1,z:u.z},10,u);assert.equal(u.hp,u.maxHp-10);assert.equal(g.hull,hull);assert.equal(g.campaign.allyHull,ally);
  g.campaign.barrierSeconds=3;const hp=u.hp;assert.ok(Math.abs(applyHullDamage(g,{x:u.x+1,z:u.z},10,u)-3.5)<1e-8);assert.equal(u.hp,hp-3.5);
});
test('fleet casualties, orders and navigation restore with checkpoints and old saves',()=>{
  const g=yard();recruitUnit(g,'skiff');launchMission(g,missions[0].id);const original=structuredClone(g.checkpoint.fleet);
  orderUnits(g,[1],'move',{x:28,z:-15});run(g,0.4);g.fleet.units[0].hp=26;
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);assert.deepEqual(restored.checkpoint.fleet,original);
  g.fleet.units[0].hp=0;g.resources+=400;returnToHarbor(g,true);assert.equal(g.fleet.units[0].hp,85);assert.equal(g.resources,original.units.length?9835:0);
  const old=yard();delete old.fleet;const migrated=decodeSave(encodeSave(old));assert.deepEqual(migrated.fleet,{version:1,nextId:1,units:[]});
  const bad=yard();recruitUnit(bad,'skiff');bad.fleet.units[0].command={type:'move',x:NaN,z:0};assert.throws(()=>encodeSave(bad),/함대 이동/);
});
test('specialists use actual piercing and repair rather than cosmetic role labels',()=>{
  const g=yard('destination',3);g.facilities.find(f=>f.type==='shipyard').level=3;recruitUnit(g,'torpedo');recruitUnit(g,'tender');launchMission(g,missions[18].id);
  const torpedo=g.fleet.units[0],healer=g.fleet.units[1];torpedo.hp=30;healer.x=torpedo.x+2;healer.z=torpedo.z;
  run(g,2.2);assert.ok(torpedo.hp>30);assert.equal(unitStats(g,torpedo).pierce,0.7);
  const enemy=g.enemies[0];g.enemies=[enemy];torpedo.x=60;torpedo.z=-60;enemy.type='armored';enemy.hp=enemy.maxHp=1000;enemy.x=torpedo.x+8;enemy.z=torpedo.z;torpedo.cooldown=0;
  orderUnits(g,[torpedo.id],'attack',{id:enemy.id});const expected=28*(1-enemyStats(g,enemy).armor*0.3),before=enemy.hp;
  advance(g,1/60);assert.ok(Math.abs(before-enemy.hp-expected)<1e-7);
});
test('a repair ship advances with a fleet attack order instead of remaining behind',()=>{
  const g=yard('destination',3);g.facilities.find(f=>f.type==='shipyard').level=3;recruitUnit(g,'tender');launchMission(g,missions[18].id);
  const u=g.fleet.units[0],enemy=g.enemies[0],before=Math.hypot(u.x-enemy.x,u.z-enemy.z),position={x:u.x,z:u.z};
  assert.equal(orderUnits(g,[u.id],'attack',{id:enemy.id}),true);run(g,2);
  assert.ok(Math.hypot(u.x-enemy.x,u.z-enemy.z)<before-5);assert.ok(Math.hypot(u.x-position.x,u.z-position.z)>5);assert.equal(unitStats(g,u).damage,0);
});
test('area attacks strike fleet circles and moving units can evade their original telegraph',()=>{
  const g=yard();recruitUnit(g,'skiff');launchMission(g,missions[0].id);const u=g.fleet.units[0];u.x=60;u.z=-60;u.command={type:'hold'};
  g.campaign.hazards=[{id:'test',x:60,z:-60,radius:4,damage:10,remaining:0,kind:'mines'}];const hull=g.hull;advance(g,1/60);assert.equal(u.hp,75);assert.equal(g.hull,hull);
  g.campaign.hazards=[{id:'dodge',x:60,z:-60,radius:4,damage:10,remaining:1,kind:'mines'}];orderUnits(g,[u.id],'move',{x:75,z:-60});run(g,1.1);assert.equal(u.hp,75);
});
