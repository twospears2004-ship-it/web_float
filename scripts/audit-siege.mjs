// Earned chapter checkpoints, normal paid refits and the real combat pipeline.
// Chapters are independent samples; seconds are simulation time, not human playtime.
import fs from 'node:fs/promises';
import {advance,build,demolish,upgrade,repair,setRoute,collectProduction} from '../src/game.js';
import {chapters} from '../src/campaign-content.js';
import {launchDefense,startDefenseWave} from '../src/frontier.js';
import {siegeContracts} from '../src/siege-content.js';
import {repairStructure} from '../src/fortifications.js';
import {returnToHarbor,useAbility,powerCapacity,powerUsed,resupplyAbilities} from '../src/campaign.js';
import {recruitUnit,repairFleet,upgradeUnit,orderUnits} from '../src/fleet.js';
import {decodeSave,encodeSave,validateCampaign} from '../src/save.js';
const report={type:'normal-earned siege model',records:[],warning:'Independent chapter samples; simulated seconds do not certify human playtime or Steam readiness.'};
await fs.mkdir('artifacts/siege-fixtures',{recursive:true});
for(const [chapter,ch] of chapters.entries()) {
  const g=decodeSave(await fs.readFile(`artifacts/colony-fixtures/${ch.id}-6-harbor.json`,'utf8'));g.paused=false;
  const old=g.facilities.find(f=>['fishery','workshop'].includes(f.type));
  if(powerUsed(g)+1>powerCapacity(g)&&old)demolish(g,old.id);
  const tile=g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z));
  if(tile)build(g,'shipyard',tile.x,tile.z);
  const yard=g.facilities.find(f=>f.type==='shipyard');
  if(chapter>0)while(yard&&yard.level<3&&g.resources>400&&upgrade(g,yard.id)){}
  function replenish(){
    for(const type of chapter>=3?['torpedo','gunboat','tender','skiff']:chapter>=2?['torpedo','gunboat','skiff']:chapter>=1?['gunboat','gunboat','skiff']:['skiff','skiff','skiff','skiff'])
      if(g.resources>180&&!g.fleet.units.some(u=>u.hp>0&&u.type===type&&g.fleet.units.filter(v=>v.hp>0&&v.type===type).length>=(type==='skiff'&&chapter===0?4:type==='gunboat'&&chapter===1?2:1)))recruitUnit(g,type);
    for(const u of g.fleet.units)while(g.resources>200&&upgradeUnit(g,u.id)){}
  }
  // Independent chapter checkpoints do not unlock post-ending contracts.
  // The fresh continuous journey covers those after the final story.
  for(const d of siegeContracts.filter(d=>d.chapter===chapter&&!d.endgame)) {
    replenish();while(g.hull<g.maxHull&&repair(g)){};
    if(!launchDefense(g,d.id)){report.blocked={id:d.id,message:g.message};break;}
    let targetId=null;
    for(let frame=0;frame<2400*60&&g.phase==='playing';frame++) {
      if(g.operation.waiting){
        // Recall to the moving island before a paid repair; no remote healing.
        orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'escort');
        for(let i=0;i<15*60;i++)advance(g,1/60);
        for(const f of g.facilities){repairStructure(g,f.id);if(f.stock>0)collectProduction(g,f.id);}repairFleet(g);
        while(g.hull<g.maxHull&&repair(g)){};
        if(g.resources>300&&g.campaign.abilityCharges.mend<2)resupplyAbilities(g);
        await fs.writeFile(`artifacts/siege-fixtures/${d.id}-base-${g.operation.round}-start.json`,encodeSave(g));
        startDefenseWave(g);setRoute(g,g.catalog[g.operation.round].id);targetId=null;
      }
      if(frame%60===0) {
        const target=g.enemies.find(e=>e.hp>0&&e.type==='generator')||g.enemies.find(e=>e.hp>0&&e.type==='baseCore');
        if(target&&target.id!==targetId){orderUnits(g,g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id),'attack',{id:target.id});targetId=target.id;}
        if(g.hull<g.maxHull*0.78)useAbility(g,'mend');
        if(g.combat)useAbility(g,'barrier');
        if(g.enemies.some(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<24))useAbility(g,'pulse');
      }
      advance(g,1/60);
    }
    validateCampaign(g);decodeSave(encodeSave(g));
    const record={id:d.id,phase:g.phase,seconds:Math.round(g.campaign.missionSeconds),bases:g.sites.filter(s=>s.cleared).length,hull:Math.round(g.hull),resources:g.resources,army:g.fleet.units.filter(u=>u.hp>0).map(u=>`${u.type}-${u.level}`)};
    report.records.push(record);console.log(JSON.stringify(record));
    if(g.phase!=='mission-complete'){report.blocked={id:d.id,message:g.message,enemies:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,hp:e.hp,x:e.x,z:e.z})),fleet:g.fleet};break;}
    await fs.writeFile(`artifacts/siege-fixtures/${d.id}-result.json`,encodeSave(g));returnToHarbor(g);
  }
  if(report.blocked)break;
}
report.completed=report.records.filter(r=>r.phase==='mission-complete').length;report.simulatedSeconds=report.records.reduce((n,r)=>n+r.seconds,0);
await fs.writeFile('artifacts/siege-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,simulatedMinutes:report.simulatedSeconds/60,blocked:report.blocked}));if(report.blocked)process.exitCode=1;
