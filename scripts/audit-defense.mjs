// Every ship is a normal-earned colony checkpoint. Refits and repairs use the
// public game actions; no free health, money, kills or deleted attackers.
import fs from 'node:fs/promises';
import {advance,build,demolish,upgrade,repair} from '../src/game.js';
import {chapters} from '../src/campaign-content.js';
import {launchDefense,startDefenseWave,availableDefenses} from '../src/frontier.js';
import {defenseContracts} from '../src/frontier-content.js';
import {structureHull,repairStructure} from '../src/fortifications.js';
import {returnToHarbor,useAbility,powerCapacity,powerUsed} from '../src/campaign.js';
import {recruitUnit,repairFleet,upgradeUnit,orderUnits} from '../src/fleet.js';
import {decodeSave,encodeSave,validateCampaign} from '../src/save.js';
const report={type:'normal-earned defense model',records:[],warning:'These are simulated combat seconds, not a human playtime or Steam release certification.'};
const onlyId=process.argv.find(a=>a.startsWith('--only='))?.slice(7),only=onlyId?defenseContracts.find(d=>d.id===onlyId):null;
if(onlyId&&!only)throw new Error('Unknown defense contract.');
await fs.mkdir('artifacts/defense-fixtures',{recursive:true});
for(const [chapter,ch] of chapters.entries()) {
  if(only&&only.chapter!==chapter)continue;
  const g=decodeSave(await fs.readFile(`artifacts/colony-fixtures/${ch.id}-6-harbor.json`,'utf8'));g.paused=false;
  // Replace one passive producer with the paid command facility if necessary.
  const candidates=g.facilities.filter(f=>['fishery','workshop'].includes(f.type));
  if(powerUsed(g)+1>powerCapacity(g)&&candidates.length)demolish(g,candidates[0].id);
  const slot=()=>g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z));
  const yardSlot=slot();if(yardSlot)build(g,'shipyard',yardSlot.x,yardSlot.z);
  let yard=g.facilities.find(f=>f.type==='shipyard');
  while(yard&&yard.level<3&&upgrade(g,yard.id)){};
  for(const type of chapter>=2?['torpedo','gunboat','skiff','skiff']:['skiff','skiff','skiff','skiff'])recruitUnit(g,type);
  for(const u of g.fleet.units)while(upgradeUnit(g,u.id)){};
  const shoreline=t=>[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>!g.tiles.some(s=>s.x===t.x+x&&s.z===t.z+z));
  for(const tile of g.tiles.filter(shoreline))if(!g.facilities.some(f=>f.x===tile.x&&f.z===tile.z))build(g,'wall',tile.x,tile.z);
  for(const d of defenseContracts.filter(d=>d.chapter===chapter&&(!only||d.rank<=only.rank))) {
    if(!launchDefense(g,d.id)){report.blocked={id:d.id,message:'Defense could not launch',available:availableDefenses(g).map(d=>d.id)};break;}
    for(let frame=0;frame<1800*60&&g.phase==='playing';frame++) {
      if(g.operation.waiting){for(const f of g.facilities)repairStructure(g,f.id);repairFleet(g);while(g.hull<g.maxHull&&repair(g)){};startDefenseWave(g);orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'escort');}
      if(g.hull<g.maxHull*0.75)useAbility(g,'mend');
      if(g.enemies.filter(e=>e.hp>0&&Math.hypot(e.x,e.z)<24).length>=3)useAbility(g,'pulse');
      if(g.facilities.filter(f=>f.hp>0&&f.hp<structureHull(f)*0.5).length>=2)useAbility(g,'barrier');
      advance(g,1/60);
    }
    validateCampaign(g);const restored=decodeSave(encodeSave(g));if(restored.phase!==g.phase)throw new Error('Round-trip changed defense result');
    const record={id:d.id,phase:g.phase,seconds:Math.round(g.campaign.missionSeconds),round:g.operation.round+1,score:g.operation.result?.score,resources:g.resources,hull:Math.round(g.hull),facilities:g.facilities.length,standing:g.facilities.filter(f=>f.hp>0).length,army:g.fleet.units.filter(u=>u.hp>0).map(u=>`${u.type}-${u.level}`)};report.records.push(record);console.log(JSON.stringify(record));
    if(g.phase!=='mission-complete'){report.blocked={id:d.id,message:g.message,enemies:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,hp:e.hp,x:e.x,z:e.z}))};break;}
    await fs.writeFile(`artifacts/defense-fixtures/${d.id}-result.json`,encodeSave(g));returnToHarbor(g);validateCampaign(g);encodeSave(g);
  }
  if(report.blocked)break;
}
report.completed=report.records.filter(r=>r.phase==='mission-complete').length;report.simulatedSeconds=report.records.reduce((n,r)=>n+r.seconds,0);
await fs.writeFile(only?`artifacts/defense-audit-${only.id}.json`:'artifacts/defense-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,simulatedMinutes:report.simulatedSeconds/60,blocked:report.blocked}));if(report.blocked)process.exitCode=1;
