import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,createGame,build,expand,expansionSlots} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {launchDefense} from '../src/frontier.js';
import {returnToHarbor,researchTechnology} from '../src/campaign.js';
import {structureHull,structureRepairCost,structureRepairPlan,repairAllStructures,repairStructure} from '../src/fortifications.js';
import {wallEdges,validWallSlot} from '../src/walls.js';
import {decodeSave,encodeSave} from '../src/save.js';
function ready(){const g=createCampaign();g.resources=10000;assert(build(g,'mortar',1,-1));assert(build(g,'farm',1,1));assert(build(g,'wall',0,-1,'north'));return g;}
function damage(g){g.facilities.forEach((f,i)=>{f.hp=structureHull(f)-(i+1)*15;f.cooldown=.7;f.aim=.2;});g.facilities.find(f=>f.type==='farm').stock=31;return g;}
test('bulk repair previews exact individual rounded costs and preserves all other paid and active state',()=>{
  const g=damage(ready()),before=structuredClone(g),plan=structureRepairPlan(g),cost=g.facilities.reduce((n,f)=>n+structureRepairCost(f),0);assert(plan.available);assert.equal(plan.cost,cost);assert.equal(plan.count,4);assert.deepEqual(g,before);
  assert(repairAllStructures(g));assert.equal(g.resources,before.resources-cost);for(const f of g.facilities){const prior=before.facilities.find(p=>p.id===f.id);assert.equal(f.hp,structureHull(f));for(const key of Object.keys(prior).filter(k=>k!=='hp'))assert.deepEqual(f[key],prior[key]);}
  for(const key of Object.keys(before).filter(k=>!['resources','facilities','message'].includes(k)))assert.deepEqual(g[key],before[key]);const after=structuredClone(g);assert(!repairAllStructures(g));assert.deepEqual(g,after);
});
test('bulk cost equals individual repair even for fractional damage; legacy full health remains absent',()=>{
  const g=ready();g.facilities[0].hp=structureHull(g.facilities[0])-.1;g.facilities[1].hp=structureHull(g.facilities[1])-.1;delete g.facilities[2].hp;const separate=structuredClone(g);assert.equal(structureRepairPlan(g).cost,2);
  assert(repairAllStructures(g));for(const f of separate.facilities)if(structureRepairCost(f)>0)assert(repairStructure(separate,f.id));assert.deepEqual(g.facilities,separate.facilities);assert.equal(g.resources,separate.resources);assert.equal(g.facilities[2].hp,undefined);
});
test('collective revival checks full power before spending; individual revival and paid research stay available',()=>{
  const g=ready();assert(build(g,'fishery',-1,1));const mortar=g.facilities.find(f=>f.type==='mortar'),farm=g.facilities.find(f=>f.type==='farm');mortar.level=3;mortar.hp=0;farm.hp=0;const before=structuredClone(g),plan=structureRepairPlan(g);assert.equal(plan.usedPower,2);assert.equal(plan.restoredPower,6);assert.equal(plan.capacity,5);assert(!plan.available);assert.match(plan.reason,/전력/);assert(!repairAllStructures(g));assert.deepEqual(g,before);
  assert(repairStructure(g,farm.id));assert.equal(mortar.hp,0);g.campaign.research=3;assert(researchTechnology(g,'reactor'));const cost=structureRepairCost(mortar),cash=g.resources;assert(repairAllStructures(g));assert.equal(g.resources,cash-cost);assert.equal(mortar.hp,structureHull(mortar));
});
test('a stale affordable quote cannot partially charge or repair a now unaffordable batch',()=>{
  const g=damage(ready()),plan=structureRepairPlan(g);assert(plan.available);g.resources=plan.cost-1;const before=structuredClone(g);assert(!structureRepairPlan(g).available);assert(!repairAllStructures(g));assert.deepEqual(g,before);assert(repairStructure(g,g.facilities[0].id));
});
test('all service modes reject pause, choices, combat, sailing, active operations and terminal or training states atomically',()=>{
  for(const change of [g=>g.paused=true,g=>g.campaign.pendingChoice={},g=>g.combat=true,g=>g.route={},g=>g.phase='mission-complete',g=>g.phase='defeat',g=>delete g.campaign,...['defense','siege','explore'].map(kind=>g=>g.operation={kind,waiting:false})]){
    const g=damage(ready());change(g);const before=structuredClone(g);assert(!structureRepairPlan(g).available);assert(!repairAllStructures(g));assert(!repairStructure(g,g.facilities[0].id));assert.deepEqual(g,before);
  }
  assert(!structureRepairPlan(createGame()).available);
});
test('a full seven-by-seven island repairs all 112 unique wall faces with one exact payment and valid save',()=>{
  const g=createCampaign();g.campaign.chapter=11;g.campaign.completed=missions.slice(0,66).map(m=>m.id);g.resources=200000;
  while(g.tiles.length<49){const slot=expansionSlots(g)[0];assert(slot);assert(expand(g,slot.x,slot.z));}
  for(const t of g.tiles)for(const edge of Object.keys(wallEdges))if(validWallSlot(g,t.x,t.z,edge))assert(build(g,'wall',t.x,t.z,edge));assert.equal(g.facilities.filter(f=>f.type==='wall').length,112);
  for(const f of g.facilities)f.hp=structureHull(f)*.34;const cash=g.resources,plan=structureRepairPlan(g);assert.equal(plan.count,113);assert(repairAllStructures(g));assert.equal(g.resources,cash-plan.cost);assert.deepEqual(decodeSave(encodeSave(g)).facilities,g.facilities);
});
test('active-save recovery retains the paid batch while abandonment restores the original damaged departure state',()=>{
  const g=damage(ready());g.campaign.completed=['coral-1'];assert(launchDefense(g,'defense-coral-1'));const departure=structuredClone(g.checkpoint),plan=structureRepairPlan(g),cash=g.resources;assert(repairAllStructures(g));assert.equal(g.resources,cash-plan.cost);assert.deepEqual(g.checkpoint,departure);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.facilities,g.facilities);assert.equal(restored.resources,g.resources);assert.deepEqual(restored.checkpoint,departure);restored.paused=false;assert(returnToHarbor(restored,true));assert.deepEqual(restored.facilities,departure.facilities);assert.equal(restored.resources,departure.resources);
});
