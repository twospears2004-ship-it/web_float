// Two independent normal-earned islands. All sailing, fighting, refits, field
// choices, extraction and research use public actions; no injected resources,
// health, positions, enemies or elapsed time. This is simulated time evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {advance,build,demolish,upgrade,repair,setRoute,collectProduction} from '../src/game.js';
import {fieldDecisions} from '../src/expedition-content.js';
import {launchDefense} from '../src/frontier.js';
import {selectExplorationSite,finishExploration} from '../src/exploration.js';
import {atlasSummary,atlasHasSurvey} from '../src/atlas.js';
import {repairStructure} from '../src/fortifications.js';
import {returnToHarbor,useAbility,powerCapacity,powerUsed,resupplyAbilities,resolveFieldDecision,researchTechnology} from '../src/campaign.js';
import {recruitUnit,repairFleet,upgradeUnit,orderUnits} from '../src/fleet.js';
import {productionStats} from '../src/production.js';
import {decodeSave,encodeSave} from '../src/save.js';
const report={kind:'normal-earned banked atlas, partial return, replay and research',records:[],warning:'Independent islands and simulated time, not a continuous 20-hour human playtest.'};await fs.mkdir('artifacts/atlas-fixtures',{recursive:true});
for(const ch of ['coral','kelp']){
  const g=decodeSave(await fs.readFile(`artifacts/colony-fixtures/${ch}-6-harbor.json`,'utf8'));g.paused=false;
  if(powerUsed(g)+1>powerCapacity(g)){const old=g.facilities.find(f=>['fishery','workshop'].includes(f.type));if(old)demolish(g,old.id);}
  if(!g.facilities.some(f=>f.type==='shipyard')){const tile=g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z));assert.ok(tile);assert.equal(build(g,'shipyard',tile.x,tile.z),true);}
  const yard=g.facilities.find(f=>f.type==='shipyard');while(yard.level<3&&g.resources>400&&upgrade(g,yard.id)){}
  function refit(){
    for(const f of g.facilities){repairStructure(g,f.id);if(f.stock>0)collectProduction(g,f.id);}repairFleet(g);while(g.hull<g.maxHull&&repair(g)){}
    for(const type of g.campaign.chapter>=3?['torpedo','gunboat','tender','skiff']:['skiff','skiff'])if(g.resources>180&&g.fleet.units.filter(u=>u.hp>0&&u.type===type).length<(type==='skiff'?2:1))recruitUnit(g,type);
    for(const u of g.fleet.units)while(g.resources>200&&upgradeUnit(g,u.id)){}if(g.resources>300&&g.campaign.abilityCharges.mend<2)resupplyAbilities(g);
  }
  refit();
  async function voyage(id,order,label){
    assert.equal(launchDefense(g,id),true);await fs.writeFile(`artifacts/atlas-fixtures/${ch}-${label}-start.json`,encodeSave(g));
    for(const index of order){
      orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'escort');for(let i=0;i<15*60;i++)advance(g,1/60);refit();
      assert.equal(selectExplorationSite(g,`explore-node-${index}`),true);assert.equal(setRoute(g,g.catalog[index].id),true);let lastOrder='';
      for(let frame=0;frame<600*60&&!g.campaign.pendingChoice&&g.phase==='playing';frame++){
        if(frame%60===0){const target=g.enemies.find(e=>e.hp>0&&['nest','tender','bulwark','carrier'].includes(e.type))||g.enemies.find(e=>e.hp>0);
          if(target&&target.id!==lastOrder){orderUnits(g,g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id),'attack',{id:target.id});lastOrder=target.id;}
          if(!target&&g.campaign.encounterWave+1>=g.catalog[index].waves&&lastOrder!=='survey'){if(g.fleet.units.some(u=>u.hp>0))orderUnits(g,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id),'move',g.catalog[index]);else setRoute(g,g.catalog[index].id);lastOrder='survey';}
          if(g.hull<g.maxHull*0.78)useAbility(g,'mend');if(g.combat)useAbility(g,'barrier');if(g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<24))useAbility(g,'pulse');
        }advance(g,1/60);
      }
      if(!g.campaign.pendingChoice){await fs.writeFile(`artifacts/atlas-fixtures/${ch}-${label}-blocked.json`,encodeSave(g));console.log(JSON.stringify({blocked:`${ch}/${label}/${index}`,phase:g.phase,island:g.island,enemies:g.enemies.filter(e=>e.hp>0),fleet:g.fleet.units.map(u=>({id:u.id,hp:u.hp,x:u.x,z:u.z,order:u.order}))}));}
      assert.ok(g.campaign.pendingChoice,`${ch}/${label}/${index}: survey did not finish`);
      const known=atlasHasSurvey(g.campaign,id,g.catalog[index].id),options=fieldDecisions[g.campaign.pendingChoice.kind].options,option=options.find(o=>o.id==='study'&&!known&&g.resources>=(o.cost||0))||options.find(o=>!o.elite&&(!known||!o.research)&&g.resources>=(o.cost||0));assert.ok(option);assert.equal(resolveFieldDecision(g,option.id),true);
    }
    assert.equal(finishExploration(g),true);const result=structuredClone(g.operation.result),reward=structuredClone(g.campaign.resultReward);
    assert.deepEqual(decodeSave(encodeSave(g)).campaign.atlas,g.campaign.atlas);await fs.writeFile(`artifacts/atlas-fixtures/${ch}-${label}-result.json`,encodeSave(g));
    const record={island:ch,id,label,seconds:g.campaign.missionSeconds,result,reward,resources:g.resources,research:g.campaign.research,army:g.fleet.units.filter(u=>u.hp>0).length};report.records.push(record);console.log(JSON.stringify(record));returnToHarbor(g);await fs.writeFile(`artifacts/atlas-fixtures/${ch}-${label}-harbor.json`,encodeSave(g));return record;
  }
  const id=`explore-${ch}-1`;
  const partial=await voyage(id,[0,1,4,7],'partial');assert.equal(partial.result.chartSurveyed,4);assert.equal(partial.result.chartReward,false);
  const completion=await voyage(id,[2,3,5,6,1,4,7],'completion');assert.equal(completion.result.chartSurveyed,8);assert.equal(completion.result.full,false);assert.equal(completion.result.chartReward,true);
  const fish=g.facilities.find(f=>f.type==='fishery'),before=productionStats(fish,g);assert.equal(researchTechnology(g,'cartography'),true);assert.equal(productionStats(fish,g).catchValue>before.catchValue,true);
  const repeat=await voyage(id,[1,4,7],'repeat');assert.equal(repeat.result.newSurveys,0);assert.equal(repeat.result.chartReward,false);assert.equal(repeat.reward.research,0);
  if(ch==='kelp'){
    for(const [i,key]of ['explore-coral-1','explore-frost-1','explore-kelp-2'].entries())await voyage(key,[0,2,1,4,5,3,6,7],`chart-${i+2}`);
    assert.equal(atlasSummary(g.campaign).full,4);assert.equal(researchTechnology(g,'cartography'),true);const lab=g.facilities.find(f=>f.type==='laboratory');assert.ok(lab);assert.equal(productionStats(lab,g).samples,1+Math.floor((lab.level-1)/3)+2);
  }
  await fs.writeFile(`artifacts/atlas-fixtures/${ch}-research-harbor.json`,encodeSave(g));
}
report.complete=true;report.simulatedSeconds=report.records.reduce((n,r)=>n+r.seconds,0);await fs.writeFile('artifacts/atlas-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,sorties:report.records.length,simulatedMinutes:report.simulatedSeconds/60}));
