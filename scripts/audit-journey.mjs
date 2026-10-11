// A fresh, continuous campaign: the same island, economy, research and surviving
// fleet complete the story and every frontier contract. No checkpoint imports,
// injected resources/health, teleports, forced damage or enemy removal.
// The resulting times are automated simulation time, not human playtest time.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {canonicalSavedValue} from './save-comparison.mjs';
import {createCampaign,advance,build,upgrade,expand,expansionSlots,repair,demolish,moveFacility,setRoute,setTargeting,upgradeCost,rulesFor,collectProduction,facilityPosition} from '../src/game.js';
import {launchMission,returnToHarbor,researchTechnology,researchCost,useAbility,repairEscort,resupplyAbilities,currentFieldDecision,resolveFieldDecision,powerUsed,powerCapacity,facilityPower} from '../src/campaign.js';
import {missions,technologies} from '../src/campaign-content.js';
import {fieldDecisions} from '../src/expedition-content.js';
import {frontierOperations} from '../src/frontier-content.js';
import {launchDefense,startDefenseWave} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {structureHull,repairStructure} from '../src/fortifications.js';
import {recruitUnit,repairFleet,upgradeUnit,orderUnits} from '../src/fleet.js';
import {fleetRules} from '../src/fleet-content.js';
import {productionTypes,atShore} from '../src/production.js';
import {validateCampaign,encodeSave,decodeSave} from '../src/save.js';
import {wallEdges,validWallSlot} from '../src/walls.js';

let g=createCampaign('destination');build(g,'cannon',-1,-1);
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.slice(8) || Infinity);
const supportGuard=process.argv.includes('--support-guard');
const requestedOutput=process.argv.find(a=>a.startsWith('--output='))?.slice(9) || 'artifacts',outputPath=path.resolve(requestedOutput),relativeOutput=path.relative(path.resolve('artifacts'),outputPath);
if(relativeOutput==='..'||relativeOutput.startsWith(`..${path.sep}`)||path.isAbsolute(relativeOutput))throw new Error('Journey output must stay inside artifacts.');
const output=path.relative(process.cwd(),outputPath).split(path.sep).join('/');
if(!(limit>=1))throw new Error('Limit must be positive.');
const report={kind:'fresh continuous story and frontier model',date:new Date().toISOString(),records:[],blocked:null,harvested:0,recall:{calls:0,seconds:0,alreadyInRange:0,notRejoined:0},warning:'One continuous normal economy; simulated combat time does not certify human 20-hour playtime or Steam quality.'};
report.supportGuard=supportGuard;report.outlays={fleetProduction:0,fleetUpgrade:0,fleetRepair:0,structureRepair:0,islandRepair:0,resupply:0};
await fs.mkdir(`${output}/journey-fixtures`,{recursive:true});
const itinerary=Array.from({length:12},(_,chapter)=>[
  ...missions.filter(m=>m.chapter===chapter).map(item=>({item,kind:'story'})),
  ...['defense','siege','explore'].flatMap(kind=>frontierOperations.filter(d=>d.chapter===chapter&&d.kind===kind).map(item=>({item,kind}))),
]).flat().filter(({item})=>!item.endgame).concat(frontierOperations.filter(item=>item.endgame).map(item=>({item,kind:item.kind})));
const source=createHash('sha256');for(const name of (await fs.readdir('src')).filter(n=>/\.(js|json)$/.test(n)).sort()){source.update(name);source.update(await fs.readFile(`src/${name}`));}
report.runtime={node:process.version,sourceHash:source.digest('hex'),controllerHash:createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),startedAt:new Date().toISOString()};
function recordFor(state,item,kind){return {id:item.id,kind,result:state.phase,seconds:Math.round(state.campaign.missionSeconds*10)/10,resources:state.resources,hull:Math.round(state.hull),research:state.campaign.research,tiles:state.tiles.length,facilities:state.facilities.map(f=>({id:f.id,type:f.type,x:f.x,z:f.z,edge:f.edge,level:f.level,hp:f.hp,stock:f.stock})),army:state.fleet.units.filter(u=>u.hp>0).map(u=>({id:u.id,type:u.type,level:u.level,hp:u.hp})),kills:state.kills,completed:state.campaign.completed.length,frontier:state.campaign.frontier?.cleared.length||0};}
if(process.argv.includes('--resume')){
  let previous;try{previous=JSON.parse(await fs.readFile(`${output}/journey-audit.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  // New runs commit a progress manifest at every completed step. Respect its
  // prefix so stale files left by an older, longer run cannot enter a recovery.
  const committed=previous?.runtime?previous.records.findIndex(r=>!['mission-complete','campaign-complete'].includes(r.result)):-1;
  const recoverCount=previous?.runtime?(committed<0?previous.records.length:committed):Infinity;
  const completed=[],cleared=[];let active=0;
  for(const {item,kind} of itinerary.slice(0,recoverCount)){
    let text;try{text=await fs.readFile(`${output}/journey-fixtures/${item.id}-result.json`,'utf8');}catch(e){if(e.code==='ENOENT')break;throw e;}
    const envelope=JSON.parse(text),state=decodeSave(text);
    assert.ok(['mission-complete','campaign-complete'].includes(state.phase),`${item.id}: unfinished result`);
    assert.equal(kind==='story'?state.campaign.missionId:state.operation.id,item.id,`${item.id}: wrong operation`);
    (kind==='story'?completed:cleared).push(item.id);assert.deepEqual(state.campaign.completed,completed);assert.deepEqual(state.campaign.frontier?.cleared||[],cleared);
    active+=state.campaign.missionSeconds;assert.ok(Math.abs(state.campaign.totalActiveSeconds-active)<0.1,`${item.id}: continuous clock differs`);
    const prior=previous?.runtime?previous.records[report.records.length]:null;
    if(prior){assert.equal(prior.id,item.id);assert.equal(prior.resources,state.resources,`${item.id}: checkpoint does not match progress manifest`);}
    report.records.push({...recordFor(state,item,kind),recovered:true,savedAt:envelope.savedAt,...(prior?.sourceHash?{sourceHash:prior.sourceHash}:{}),controllerHash:prior?.controllerHash||previous?.runtime?.controllerHash});g=state;
  }
  if(!report.records.length)throw new Error('No verified completed journey to resume.');
  report.recovery={steps:report.records.length,lastId:report.records.at(-1).id,totalActiveSeconds:g.campaign.totalActiveSeconds,priorRuntime:'Completed saves from the earlier continuous run; engine changes across this restart are recorded separately.',previousHarvestedUnknown:true};
  if(previous?.recall&&Object.values(previous.recall).every(n=>Number.isFinite(n)&&n>=0))report.recall={...previous.recall};
  if(Number.isFinite(previous?.harvested))report.harvested=previous.harvested;
  // Recovery loads the last earned result exactly, then uses the normal harbor
  // action. It does not add resources, repair ships or import chapter fixtures.
  returnToHarbor(g);console.log(JSON.stringify({resumed:report.recovery}));
}
async function persistProgress(){
  report.completed={story:g.campaign.completed.length,defense:report.records.filter(r=>r.kind==='defense'&&r.result==='mission-complete').length,siege:report.records.filter(r=>r.kind==='siege'&&r.result==='mission-complete').length,explore:report.records.filter(r=>r.kind==='explore'&&r.result==='mission-complete').length};
  report.complete=report.records.length===itinerary.length&&report.records.every(r=>['mission-complete','campaign-complete'].includes(r.result))&&!report.blocked;
  report.simulatedSeconds=report.records.reduce((n,r)=>n+r.seconds,0);report.simulatedHours=report.simulatedSeconds/3600;report.totalActiveSeconds=g.campaign.totalActiveSeconds;report.updatedAt=new Date().toISOString();
  let text;try{text=encodeSave(g);}catch(error){report.saveFailure=error.message;await fs.writeFile(`${output}/journey-failure-state.json`,JSON.stringify(g,null,2));}
  for(const [path,data] of [[`${output}/journey-audit.json`,JSON.stringify(report,null,2)],...(text?[[`${output}/journey-final.json`,text]]:[])]){await fs.writeFile(`${path}.tmp`,data);await fs.rename(`${path}.tmp`,path);}
}
await persistProgress();
const alive=()=>g.fleet.units.filter(u=>u.hp>0).map(u=>u.id);
const emptyTile=()=>g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.type!=='wall'&&f.x===t.x&&f.z===t.z));
function harvest(){for(const f of g.facilities)if(f.stock>0){const amount=f.stock;if(collectProduction(g,f.id))report.harvested+=amount;}}
function addFacility(type,limit=1){
  const w=rulesFor(g).weapons[type];
  if(g.facilities.filter(f=>f.type===type).length>=limit||w.unlock>g.campaign.chapter||g.resources<w.cost+100||powerUsed(g)+w.power>powerCapacity(g))return;
  let tile=emptyTile();if(!tile){const slot=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!slot||!expand(g,slot.x,slot.z))return;tile=slot;}
  build(g,type,tile.x,tile.z);
}
function spreadWeapons(){
  const weapons=g.facilities.filter(f=>rulesFor(g).weapons[f.type].damage>0),radius=Math.max(...g.tiles.map(t=>Math.max(Math.abs(t.x),Math.abs(t.z))));
  for(const [i,f]of weapons.entries()){
    const angle=i*Math.PI*2/weapons.length,scale=radius/Math.max(Math.abs(Math.sin(angle)),Math.abs(Math.cos(angle))),desired={x:Math.round(Math.sin(angle)*scale),z:-Math.round(Math.cos(angle)*scale)};
    const tile=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(other=>other.type!=='wall'&&other.id!==f.id&&other.x===t.x&&other.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];
    if(tile&&(tile.x!==f.x||tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
}
function paidRefit(){
  harvest();for(const f of g.facilities)spend('structureRepair',()=>repairStructure(g,f.id));spend('fleetRepair',()=>repairFleet(g));
  while(g.hull<g.maxHull&&g.resources>=rulesFor(g).repairCost&&spend('islandRepair',()=>repair(g))){}
  while(g.campaign.allyHull<g.campaign.allyMaxHull*0.9&&g.resources>=40&&repairEscort(g)){}
  if(g.resources>300&&g.campaign.abilityCharges.mend<2)spend('resupply',()=>resupplyAbilities(g));
}
function spend(category,action){const before=g.resources,result=action();if(result)report.outlays[category]+=Math.max(0,before-g.resources);return result;}
function prepareColony(){
  paidRefit();let researched=true;
  while(researched){researched=false;for(const id of ['reactor','ballistics','bulkhead','logistics','navigation','cultivation','distributed','precision','cartography']){const tech=technologies.find(t=>t.id===id);if(g.campaign.chapter>=(tech.unlock||0)&&(!tech.materials||g.resources>=researchCost(g,tech).materials+150)&&researchTechnology(g,id))researched=true;}}
  if(g.campaign.chapter>=2&&!g.facilities.some(f=>f.type==='rail')&&g.resources>300){const old=g.facilities.find(f=>f.type==='cannon');if(old&&powerUsed(g)-facilityPower(old)+3<=powerCapacity(g)){const{x,z}=old;demolish(g,old.id);build(g,'rail',x,z);}}
  addFacility('mortar',g.campaign.chapter>=2?2:1);
  for(const type of ['fishery','crane','laboratory','shield','farm','workshop'])addFacility(type);
  const targets={cannon:2,mortar:Math.min(8,2+g.campaign.chapter),rail:6,shield:(g.campaign.tech.distributed||0)>=2?4:2,workshop:2,fishery:2,crane:3,farm:2,laboratory:(g.campaign.tech.distributed||0)>=3&&g.campaign.chapter>=9?7:g.campaign.chapter>=3?4:2};
  let improved=true;while(improved){improved=false;for(const f of g.facilities){if(f.level<Math.min(targets[f.type]||f.level,rulesFor(g).maxLevel)&&g.resources>=upgradeCost(f,g)+200&&upgrade(g,f.id))improved=true;setTargeting(g,f.id,f.type==='rail'?'armored':'support');}}
  while(g.resources>700&&g.tiles.length<49){const slot=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!slot||!expand(g,slot.x,slot.z))break;}
  spreadWeapons();
}
function prepareFleet(){
  paidRefit();if(!g.facilities.some(f=>f.type==='shipyard')){
    // A paid refit can exchange a passive workshop for command capacity.
    if(powerUsed(g)+1>powerCapacity(g)){const old=g.facilities.find(f=>f.type==='workshop');if(old)demolish(g,old.id);}
    addFacility('shipyard');
  }
  const yard=g.facilities.find(f=>f.type==='shipyard');while(yard&&yard.level<3&&g.resources>500&&upgrade(g,yard.id)){}
  const chapter=g.campaign.chapter,types=chapter>=3?['torpedo','gunboat','tender','skiff']:chapter>=2?['torpedo','gunboat','skiff']:chapter>=1?['gunboat','skiff','skiff']:['skiff','skiff'];
  for(const type of types)if(g.resources>180&&g.fleet.units.filter(u=>u.hp>0&&u.type===type).length<(type==='skiff'?2:1))spend('fleetProduction',()=>recruitUnit(g,type));
  for(const u of g.fleet.units)while(g.resources>400&&spend('fleetUpgrade',()=>upgradeUnit(g,u.id))){}
}
function guardSupport(){
  if(!supportGuard)return;
  const living=g.fleet.units.filter(u=>u.hp>0),ward=living.find(u=>u.type==='torpedo')||living.find(u=>u.type==='gunboat')||living.find(u=>u.type==='skiff');
  if(ward)for(const u of living.filter(u=>u.type==='tender'))if(u.command.type!=='guard'||u.command.target!==ward.id)orderUnits(g,[u.id],'guard',{id:ward.id});
}
function faceSite(){
  const site=g.catalog[g.campaign.objectiveIndex],dx=site.x-g.island.x,dz=site.z-g.island.z,desired=Math.abs(dx)>Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)};
  for(const f of g.facilities.filter(f=>f.type==='shield')){
    const tile=g.tiles.filter(t=>(t.x||t.z)&&Math.abs(t.x)<=1&&Math.abs(t.z)<=1&&!g.facilities.some(other=>other.type!=='wall'&&other.id!==f.id&&other.x===t.x&&other.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];
    if(tile&&(tile.x!==f.x||tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
  for(const f of g.facilities.filter(f=>productionTypes.includes(f.type)&&f.type!=='farm')){
    const tile=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(other=>other.type!=='wall'&&other.id!==f.id&&other.x===t.x&&other.z===t.z)&&(f.type!=='fishery'||atShore(g,t))).sort((a,b)=>Math.hypot(facilityPosition(g,a).x-site.x,facilityPosition(g,a).z-site.z)-Math.hypot(facilityPosition(g,b).x-site.x,facilityPosition(g,b).z-site.z))[0];
    if(tile&&(tile.x!==f.x||tile.z!==f.z))moveFacility(g,f.id,tile.x,tile.z);
  }
}
function choose(){
  if(!currentFieldDecision(g))return;
  const preference={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:g.resources>180?'calibrate':'recycle',salvage:'surface',signal:'shield'},options=fieldDecisions[g.campaign.pendingChoice.kind].options;
  const option=options.find(o=>o.id===preference[g.campaign.pendingChoice.kind]&&g.resources>=(o.cost||0))||options.find(o=>!o.elite&&g.resources>=(o.cost||0));
  if(!option||!resolveFieldDecision(g,option.id))throw new Error('No affordable field decision.');
}
function abilities(){
  if(g.hull<g.maxHull*0.8||(g.campaign.allyPosition&&g.campaign.allyHull<g.campaign.allyMaxHull*0.8))useAbility(g,'mend');
  if(g.combat||g.enemies.some(e=>e.windup))useAbility(g,'barrier');
  if(g.combat&&g.enemies.some(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))useAbility(g,'pulse');
  if(g.campaign.hazards.some(h=>h.remaining<1.5))useAbility(g,'brace');
}
function recall(){
  const near=()=>g.fleet.units.filter(u=>u.hp>0).every(u=>Math.hypot(u.x-g.island.x,u.z-g.island.z)<=fleetRules.serviceRange),start=g.time;
  report.recall.calls++;if(near())report.recall.alreadyInRange++;
  orderUnits(g,alive(),'escort');for(let i=0;i<15*60&&g.phase==='playing'&&!near();i++)advance(g,1/60);
  report.recall.seconds+=g.time-start;if(!near())report.recall.notRejoined++;
  paidRefit();prepareFleet();
}
async function finishRecord(item,kind){
  validateCampaign(g);const restored=decodeSave(encodeSave(g));
  for(const key of ['campaign','operation','resources','facilities','fleet','enemies','sites','checkpoint'])assert.deepEqual(canonicalSavedValue(restored[key]),canonicalSavedValue(g[key]),`Saved ${key} differs after ${item.id}`);
  const record={...recordFor(g,item,kind),harvested:report.harvested,recall:{...report.recall},outlays:{...report.outlays},sourceHash:report.runtime.sourceHash,controllerHash:report.runtime.controllerHash};
  report.records.push(record);console.log(JSON.stringify({id:record.id,kind,result:record.result,seconds:record.seconds,resources:record.resources,army:record.army.length}));
  if(!['mission-complete','campaign-complete'].includes(g.phase)){report.blocked={id:item.id,message:g.message,round:g.operation?.round,objective:g.campaign.objectiveIndex,island:g.island,enemies:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,hp:e.hp,x:e.x,z:e.z})),fleet:g.fleet};return false;}
  await fs.writeFile(`${output}/journey-fixtures/${item.id}-result.json`,encodeSave(g));returnToHarbor(g);await persistProgress();return true;
}
async function story(m){
  prepareColony();if(!launchMission(g,m.id)){report.blocked={id:m.id,message:g.message};return false;}
  faceSite();setRoute(g,'objective-0');let objective=0;
  for(let frame=0;frame<2400*60&&g.phase==='playing';frame++){
    choose();if(g.campaign.objectiveIndex!==objective&&!g.combat&&!g.route){paidRefit();faceSite();objective=g.campaign.objectiveIndex;setRoute(g,`objective-${objective}`);}
    if(frame%60===0)abilities();advance(g,1/60);
  }
  return finishRecord(m,'story');
}
async function frontier(d){
  prepareColony();prepareFleet();
  if(d.kind==='defense')for(const t of g.tiles)for(const [edge,s]of Object.entries(wallEdges))if(!g.tiles.some(v=>v.x===t.x+s.dx&&v.z===t.z+s.dz)&&validWallSlot(g,t.x,t.z,edge)&&g.resources>200)build(g,'wall',t.x,t.z,edge);
  if(!launchDefense(g,d.id)){report.blocked={id:d.id,message:g.message};return false;}
  let lastOrder='',lastNode=null,lastKills=g.kills,quietSeconds=0;
  for(let frame=0;frame<3600*60&&g.phase==='playing';frame++){
    choose();
    if(g.operation.waiting){
      if(d.kind==='explore'&&g.sites.every(s=>s.cleared)){finishExploration(g);break;}
      recall();if(d.kind==='explore'){
        const index=[0,2,1,4,5,3,6,7].find(i=>g.operation.visible.includes(g.catalog[i].id)&&!g.sites[i].cleared);
        if(index===undefined){report.blocked={id:d.id,message:'No discovered exploration route remains'};return false;}
        selectExplorationSite(g,g.catalog[index].id);setRoute(g,g.catalog[index].id);lastNode=index;
      }else{startDefenseWave(g);if(d.kind==='siege')setRoute(g,g.catalog[g.operation.round].id);else orderUnits(g,alive(),'escort');}
      lastOrder='';lastKills=g.kills;quietSeconds=0;
    }
    if(frame%60===0){
      if(d.kind==='defense'){
        // Escort stays near the island. A distant ranged attacker requires the
        // same explicit fleet pursuit that a player can order in the RTS UI.
        quietSeconds=g.kills===lastKills?quietSeconds+1:0;lastKills=g.kills;
        const remaining=g.enemies.filter(e=>e.hp>0);
        if(remaining.length<=2||quietSeconds>=20){
          const target=remaining.find(e=>['spitter','tender','carrier'].includes(e.type))||remaining[0];
          if(target&&target.id!==lastOrder){orderUnits(g,g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id),'attack',{id:target.id});lastOrder=target.id;}
        }
      }else{
        const target=d.kind==='siege'?g.enemies.find(e=>e.hp>0&&e.type==='generator')||g.enemies.find(e=>e.hp>0&&e.type==='baseCore'):g.enemies.find(e=>e.hp>0&&['nest','tender','bulwark','carrier'].includes(e.type))||g.enemies.find(e=>e.hp>0);
        if(target&&target.id!==lastOrder){orderUnits(g,g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id),'attack',{id:target.id});lastOrder=target.id;}
        if(d.kind==='explore'&&!target&&g.campaign.encounterWave+1>=g.catalog[lastNode].waves&&lastOrder!==`scan-${lastNode}`){if(alive().length)orderUnits(g,alive(),'move',g.catalog[lastNode]);else setRoute(g,g.catalog[lastNode].id);lastOrder=`scan-${lastNode}`;}
      }
      abilities();
      guardSupport();
    }
    advance(g,1/60);
  }
  return finishRecord(d,d.kind);
}

try{for(const {item,kind} of itinerary.slice(report.records.length)){if(report.records.length>=limit)break;if(!await (kind==='story'?story(item):frontier(item)))break;}}
catch(error){report.blocked={id:g.operation?.id||g.campaign.missionId,message:error.message,stack:error.stack};process.exitCode=1;await fs.writeFile(`${output}/journey-failure-state.json`,JSON.stringify(g,null,2));}
report.runtime.endedAt=new Date().toISOString();
await persistProgress();
console.log(JSON.stringify({completed:report.completed,complete:report.complete,simulatedHours:report.simulatedHours,totalActiveSeconds:report.totalActiveSeconds,blocked:report.blocked},null,2));if(report.blocked)process.exitCode=1;
