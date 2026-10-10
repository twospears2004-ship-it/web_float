// Reachability and pacing evidence using normal game actions only.
// Simulated play is not a substitute for a human ten-hour playtest.
import { createCampaign, advance, build, upgrade, expand, expansionSlots, repair, demolish, moveFacility, setRoute, setTargeting, upgradeCost, rulesFor, collectProduction, facilityPosition } from '../src/game.js';
import { launchMission, returnToHarbor, availableMissions, researchTechnology, researchCost, useAbility, repairEscort, resupplyAbilities, currentFieldDecision, resolveFieldDecision, powerUsed, powerCapacity, facilityPower } from '../src/campaign.js';
import { missions, technologies } from '../src/campaign-content.js';
import { validateCampaign, encodeSave, decodeSave } from '../src/save.js';
import { productionTypes, atShore } from '../src/production.js';
import fs from 'node:fs/promises';

const strategy=process.argv.includes('--colony')?'colony':process.argv.includes('--rapid')?'rapid':process.argv.includes('--pierce')?'pierce':'balanced';
const g=createCampaign('destination'); build(g,strategy==='balanced'?'mortar':'cannon',-1,-1);
const report={kind:'normal-action automated model traversal',strategy,date:new Date().toISOString(),records:[],blocked:null};
let harvested=0;
await fs.mkdir('artifacts/campaign-fixtures',{recursive:true});
if(strategy==='colony')await fs.mkdir('artifacts/colony-fixtures',{recursive:true});
function harvest() {
  for(const f of g.facilities)if(f.stock>0){const amount=f.stock;if(collectProduction(g,f.id))harvested+=amount;}
}
function emptyTile() {return g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z));}
function addFacility(type,limit=1) {
  const w=rulesFor(g).weapons[type];
  if(g.facilities.filter(f=>f.type===type).length>=limit || w.unlock>g.campaign.chapter || g.resources<w.cost+100 || powerUsed(g)+w.power>powerCapacity(g))return;
  let tile=emptyTile();
  if(!tile){const slot=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!slot||!expand(g,slot.x,slot.z))return;tile=slot;}
  build(g,type,tile.x,tile.z);
}
function spreadWeapons() {
  const weapons=g.facilities.filter(f=>rulesFor(g).weapons[f.type].damage>0),radius=Math.max(...g.tiles.map(t=>Math.max(Math.abs(t.x),Math.abs(t.z))));
  for(const [i,f] of weapons.entries()) {
    const angle=i*Math.PI*2/weapons.length,scale=radius/Math.max(Math.abs(Math.sin(angle)),Math.abs(Math.cos(angle))),desired={x:Math.round(Math.sin(angle)*scale),z:-Math.round(Math.cos(angle)*scale)};
    const tile=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(other=>other.id!==f.id&&other.x===t.x&&other.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];
    if(tile && (tile.x!==f.x || tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
}
function prepareColony() {
  harvest();
  while(g.hull<g.maxHull && g.resources>=rulesFor(g).repairCost)repair(g);
  let researched=true;while(researched){researched=false;for(const id of ['reactor','ballistics','bulkhead','logistics','navigation','cultivation','distributed','precision']){const tech=technologies.find(t=>t.id===id);if(g.campaign.chapter>=(tech.unlock || 0) && (!tech.materials || g.resources>=researchCost(g,tech).materials+150) && researchTechnology(g,id))researched=true;}}
  if(g.campaign.chapter>=2 && !g.facilities.some(f=>f.type==='rail') && g.resources>300) {
    const old=g.facilities.find(f=>f.type==='cannon');
    if(old && powerUsed(g)-facilityPower(old)+3<=powerCapacity(g)){const {x,z}=old;demolish(g,old.id);build(g,'rail',x,z);}
  }
  // Reserve slots and electricity for a working economy rather than maximizing
  // every turret first. Everything below uses the same paid refit as the UI.
  addFacility('mortar',g.campaign.chapter>=2?2:1);
  for(const type of ['fishery','crane','laboratory','shield','farm','workshop'])addFacility(type);
  const targets={cannon:2,mortar:Math.min(8,2+g.campaign.chapter),rail:6,shield:(g.campaign.tech.distributed || 0)>=2?4:2,workshop:2,fishery:2,crane:3,farm:2,laboratory:(g.campaign.tech.distributed || 0)>=3 && g.campaign.chapter>=9?7:g.campaign.chapter>=3?4:2};
  // Alternate upgrades so one early weapon cannot consume every new power unit.
  let improved=true;while(improved){improved=false;for(const f of g.facilities){if(f.level<Math.min(targets[f.type],rulesFor(g).maxLevel) && g.resources>=upgradeCost(f,g)+100 && upgrade(g,f.id))improved=true;setTargeting(g,f.id,f.type==='rail'?'armored':'support');}}
  while(g.resources>350 && g.tiles.length<49){const slot=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!slot||!expand(g,slot.x,slot.z))break;}
  spreadWeapons();
}
function prepare() {
  if(strategy==='colony'){prepareColony();return;}
  while(g.hull<g.maxHull && g.resources>=rulesFor(g).repairCost)repair(g);
  let researched=true;while(researched){researched=false;for(const id of ['ballistics','bulkhead','reactor','navigation','logistics'])if(researchTechnology(g,id))researched=true;}
  if(strategy==='pierce' && g.campaign.chapter>=2)for(const old of [...g.facilities]) {
    if(old.type!=='cannon' || g.resources<250 || powerUsed(g)-facilityPower(old)+rulesFor(g).weapons.rail.power>powerCapacity(g))continue;
    const {x,z}=old;demolish(g,old.id);build(g,'rail',x,z);
  }
  if(strategy==='balanced' && g.campaign.chapter>=2 && !g.facilities.some(f=>f.type==='rail') && g.resources>100) {
    const old=g.facilities.find(f=>f.type==='cannon');
    if(old){const {x,z}=old;demolish(g,old.id);build(g,'rail',x,z);}
  }
  for(const type of ['shield','workshop'])if(strategy==='balanced' && g.campaign.chapter>=rulesFor(g).weapons[type].unlock && !g.facilities.some(f=>f.type===type) && g.resources>100) {
    const old=g.facilities.find(f=>f.type==='frost') || g.facilities.find(f=>f.type==='cannon');
    if(old){const {x,z}=old;demolish(g,old.id);build(g,type,x,z);}
  }
  for(const f of g.facilities) {while(f.level<rulesFor(g).maxLevel && g.resources>=upgradeCost(f,g) && upgrade(g,f.id)){}setTargeting(g,f.id,f.type==='rail'?'armored':'support');}
  // Preserve a repair reserve; choose mixed range/splash rather than an invulnerable test state.
  const preferences=strategy==='rapid'?['cannon']:strategy==='pierce'?[g.campaign.chapter>=2?'rail':'cannon']:['mortar','cannon','frost'];
  while(g.facilities.length<12 && g.resources>200 && powerUsed(g)<powerCapacity(g)) {
    let tile=g.tiles.filter(t=>t.x!==0 || t.z!==0).find(t=>!g.facilities.some(f=>f.x===t.x&&f.z===t.z));
    if(!tile) {const slot=expansionSlots(g).sort((a,b)=>a.z-b.z || Math.abs(a.x)-Math.abs(b.x))[0];if(!slot||!expand(g,slot.x,slot.z))break;tile=slot;}
    const choices=preferences.filter(type=>g.facilities.filter(f=>f.type===type).length<(strategy!=='balanced'?8:type==='mortar'?2:1) && rulesFor(g).weapons[type].unlock<=g.campaign.chapter && g.resources>=rulesFor(g).weapons[type].cost+50);
    if(!choices.length)break;const type=choices.find(type=>powerUsed(g)+rulesFor(g).weapons[type].power<=powerCapacity(g));if(!type||!build(g,type,tile.x,tile.z))break;
  }
  while(g.resources>220 && g.tiles.length<49) {const slot=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!slot||!expand(g,slot.x,slot.z))break;}
  // Spread weapons over the actual perimeter using the player's free refit.
  // Keeping all guns in an early north row can leave a grown ship's rear bare.
  spreadWeapons();
}
function choose() {
  const d=currentFieldDecision(g);if(!d)return;
  const preference={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:g.resources>180?'calibrate':'recycle',salvage:'surface',signal:'shield'};
  resolveFieldDecision(g,preference[g.campaign.pendingChoice.kind]);
}
function faceProtection() {
  const site=g.catalog[g.campaign.objectiveIndex],dx=site.x-g.island.x,dz=site.z-g.island.z;
  const desired=Math.abs(dx)>Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)};
  for(const f of g.facilities.filter(f=>f.type==='shield')) {
    const tile=g.tiles.filter(t=>(t.x||t.z)&&Math.abs(t.x)<=1&&Math.abs(t.z)<=1&&!g.facilities.some(other=>other.id!==f.id&&other.x===t.x&&other.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];
    if(tile && (tile.x!==f.x || tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
  if(strategy==='colony')for(const f of g.facilities.filter(f=>productionTypes.includes(f.type) && f.type!=='farm')) {
    const tiles=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(other=>other.id!==f.id&&other.x===t.x&&other.z===t.z)&& (f.type!=='fishery'||atShore(g,t)));
    const tile=tiles.sort((a,b)=>Math.hypot(facilityPosition(g,a).x-site.x,facilityPosition(g,a).z-site.z)-Math.hypot(facilityPosition(g,b).x-site.x,facilityPosition(g,b).z-site.z))[0];
    if(tile && (tile.x!==f.x || tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
}
for(const mission of missions) {
  prepare(); if(!availableMissions(g).some(m=>m.id===mission.id)||!launchMission(g,mission.id)){report.blocked={id:mission.id,reason:g.message};break;}
  faceProtection();setRoute(g,'objective-0');let lastObjective=0;
  let guardianSaved=false;
  while(g.phase==='playing' && g.campaign.missionSeconds<2400) {
    choose();
    if(g.campaign.objectiveIndex!==lastObjective && !g.combat&&!g.route) {harvest();while(g.hull<g.maxHull*0.9 && g.resources>=rulesFor(g).repairCost)repair(g);while(g.campaign.allyHull<g.campaign.allyMaxHull*0.9 && g.resources>=40 && repairEscort(g)){}if(g.campaign.abilityCharges.barrier===0 && g.campaign.abilityCharges.mend===0 && g.resources>300)resupplyAbilities(g);faceProtection();lastObjective=g.campaign.objectiveIndex;setRoute(g,`objective-${lastObjective}`);}
    if(g.hull<g.maxHull*0.8 || (g.campaign.allyPosition&&g.campaign.allyHull<g.campaign.allyMaxHull*0.8))useAbility(g,'mend');
    if(g.enemies.some(e=>e.windup) || (g.combat&&g.campaign.allyPosition&&g.campaign.allyHull<g.campaign.allyMaxHull*0.6))useAbility(g,'barrier');
    if(g.combat && g.enemies.some(e=>e.hp>0 && Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))useAbility(g,'pulse');
    if(g.campaign.hazards.some(h=>h.remaining<1.5))useAbility(g,'brace');
    // Browser samples import these through the real save-file UI. These are earned
    // model checkpoints, never injected health, economy or deleted enemies.
    if(strategy==='balanced' && !guardianSaved && mission.kind==='boss' && g.catalog[g.campaign.objectiveIndex]?.task==='guardian') {
      await fs.writeFile(`artifacts/campaign-fixtures/${mission.id}-guardian.json`,encodeSave(g));guardianSaved=true;
    }
    advance(g,1/60);
  }
  validateCampaign(g);const restored=decodeSave(encodeSave(g));
  if(restored.phase!==g.phase)throw new Error('Save round trip changed completion');
  report.records.push({id:mission.id,kind:mission.kind,seconds:Math.round(g.campaign.missionSeconds*10)/10,result:g.phase,resources:g.resources,hull:Math.round(g.hull),allyHull:Math.round(g.campaign.allyHull),facilities:g.facilities.length,layout:g.facilities.map(f=>`${f.type}-${f.level}`),positions:g.facilities.map(f=>({type:f.type,x:f.x,z:f.z})),tiles:g.tiles.length,objectives:g.catalog.length,decisions:g.campaign.decisions.length,power:powerUsed(g),tech:structuredClone(g.campaign.tech),harvested,production:g.facilities.filter(f=>productionTypes.includes(f.type)).map(f=>({type:f.type,level:f.level,totalProduced:f.totalProduced||0,stock:f.stock||0,atShore:f.type==='fishery'?atShore(g,f):undefined})),survey:{tasks:g.campaign.surveyedTasks,remaining:g.campaign.surveyProgress,bonusResearch:g.campaign.bonusResearch,research:g.campaign.research}});
  if(g.phase==='defeat'||g.phase==='playing') {report.blocked={id:mission.id,reason:g.message,objective:g.campaign.objectiveIndex,wave:g.campaign.encounterWave,island:g.island,alive:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,hp:e.hp,maxHp:e.maxHp,x:e.x,z:e.z,active:e.active})),tech:g.campaign.tech};break;}
  returnToHarbor(g);
  if(strategy==='colony' && mission.kind==='boss')await fs.writeFile(`artifacts/colony-fixtures/${mission.id}-harbor.json`,encodeSave(g));
  if(strategy==='colony')console.log(`${mission.id}: ${report.records.at(-1).result} · ${g.facilities.length} facilities · power ${powerUsed(g)}/${powerCapacity(g)} · harvested ${harvested}`);
}
report.completed=report.records.filter(r=>['mission-complete','campaign-complete'].includes(r.result)).length;
report.simulatedMissionSeconds=report.records.reduce((n,r)=>n+r.seconds,0);
report.designedMinutes=missions.reduce((n,m)=>n+m.estimatedMinutes,0);
report.warning='Authored mission count and estimated minutes do not prove a ten-hour campaign. Fast traversal reveals pacing/content gaps.';
await fs.mkdir('artifacts',{recursive:true});await fs.writeFile(strategy==='balanced'?'artifacts/campaign-audit.json':`artifacts/campaign-audit-${strategy}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({completed:report.completed,simulatedMissionMinutes:report.simulatedMissionSeconds/60,designedMinutes:report.designedMinutes,blocked:report.blocked,last:report.records.at(-1)},null,2));
if(report.blocked)process.exitCode=1;
