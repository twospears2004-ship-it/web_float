// Independent normal-earned chapter samples. No injected money/health/damage.
import fs from 'node:fs/promises';
import {advance,build,demolish,upgrade,repair,setRoute,collectProduction} from '../src/game.js';
import {chapters} from '../src/campaign-content.js';
import {fieldDecisions} from '../src/expedition-content.js';
import {explorations} from '../src/exploration-content.js';
import {launchDefense} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {repairStructure} from '../src/fortifications.js';
import {returnToHarbor,useAbility,powerCapacity,powerUsed,resupplyAbilities,resolveFieldDecision} from '../src/campaign.js';
import {recruitUnit,repairFleet,upgradeUnit,orderUnits} from '../src/fleet.js';
import {decodeSave,encodeSave} from '../src/save.js';
const report={kind:'normal-earned exploration model',records:[],warning:'Independent chapter samples and simulated seconds, not a continuous campaign or human playtime.'};
await fs.mkdir('artifacts/exploration-fixtures',{recursive:true});
for(const [chapter,ch]of chapters.entries()){
  const g=decodeSave(await fs.readFile(`artifacts/colony-fixtures/${ch.id}-6-harbor.json`,'utf8'));g.paused=false;
  if(powerUsed(g)+1>powerCapacity(g)){const old=g.facilities.find(f=>['fishery','workshop'].includes(f.type));if(old)demolish(g,old.id);}
  const tile=g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z));if(tile)build(g,'shipyard',tile.x,tile.z);
  const yard=g.facilities.find(f=>f.type==='shipyard');if(chapter>0)while(yard&&yard.level<3&&g.resources>400&&upgrade(g,yard.id)){}
  function refit(){for(const f of g.facilities){repairStructure(g,f.id);if(f.stock>0)collectProduction(g,f.id);}repairFleet(g);while(g.hull<g.maxHull&&repair(g)){};
    for(const type of chapter>=3?['torpedo','gunboat','tender','skiff']:chapter>=1?['gunboat','skiff','skiff']:['skiff','skiff'])if(g.resources>180&&g.fleet.units.filter(u=>u.hp>0&&u.type===type).length<(type==='skiff'?2:1))recruitUnit(g,type);
    for(const u of g.fleet.units)while(g.resources>200&&upgradeUnit(g,u.id)){};
    if(g.resources>300&&g.campaign.abilityCharges.mend<2)resupplyAbilities(g);
  }
  for(const d of explorations.filter(d=>d.chapter===chapter)){
    refit();if(!launchDefense(g,d.id)){report.blocked={id:d.id,message:g.message};break;}
    let lastOrder='',lastNode=null;
    for(let frame=0;frame<3600*60&&g.phase==='playing';frame++){
      if(g.campaign.pendingChoice){const options=fieldDecisions[g.campaign.pendingChoice.kind].options,option=options.find(o=>!o.elite&&g.resources>=(o.cost || 0))||options.find(o=>g.resources>=(o.cost || 0));resolveFieldDecision(g,option.id);}
      if(g.operation.waiting){
        if(g.sites.every(s=>s.cleared)){finishExploration(g);break;}
        orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'escort');for(let i=0;i<15*60;i++)advance(g,1/60);refit();
        const index=[0,2,1,4,5,3,6,7].find(i=>g.operation.visible.includes(g.catalog[i].id)&&!g.sites[i].cleared);
        if(index===undefined){report.blocked={id:d.id,message:'No discovered route remains.'};break;}
        await fs.writeFile(`artifacts/exploration-fixtures/${d.id}-node-${index}-start.json`,encodeSave(g));
        selectExplorationSite(g,g.catalog[index].id);setRoute(g,g.catalog[index].id);lastOrder='';lastNode=index;
      }
      if(frame%60===0){
        const target=g.enemies.find(e=>e.hp>0&&['nest','tender','bulwark','carrier'].includes(e.type))||g.enemies.find(e=>e.hp>0);
        if(target&&target.id!==lastOrder){orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'attack',{id:target.id});lastOrder=target.id;}
        if(!target&&g.campaign.encounterWave+1>=g.catalog[lastNode].waves&&lastOrder!==`scan-${lastNode}`){
          if(g.fleet.units.some(u=>u.hp>0))orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'move',g.catalog[lastNode]);else setRoute(g,g.catalog[lastNode].id);lastOrder=`scan-${lastNode}`;
        }
        if(g.hull<g.maxHull*0.78)useAbility(g,'mend');if(g.combat)useAbility(g,'barrier');if(g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<24))useAbility(g,'pulse');
      }
      advance(g,1/60);
    }
    decodeSave(encodeSave(g));const record={id:d.id,phase:g.phase,seconds:Math.round(g.campaign.missionSeconds),surveyed:g.sites.filter(s=>s.cleared).length,discovered:g.operation.visible.length,choices:g.campaign.decisions.length,resources:g.resources,hull:Math.round(g.hull),army:g.fleet.units.filter(u=>u.hp>0).map(u=>`${u.type}-${u.level}`)};report.records.push(record);console.log(JSON.stringify(record));
    if(g.phase!=='mission-complete'){report.blocked ||= {id:d.id,message:g.message,round:g.operation.round,scan:g.operation.scan,enemies:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,hp:e.hp,x:e.x,z:e.z})),fleet:g.fleet};break;}
    await fs.writeFile(`artifacts/exploration-fixtures/${d.id}-result.json`,encodeSave(g));returnToHarbor(g);
  }
  if(report.blocked)break;
}
report.completed=report.records.filter(r=>r.phase==='mission-complete').length;report.simulatedSeconds=report.records.reduce((n,r)=>n+r.seconds,0);await fs.writeFile('artifacts/exploration-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,simulatedMinutes:report.simulatedSeconds/60,blocked:report.blocked}));if(report.blocked)process.exitCode=1;
