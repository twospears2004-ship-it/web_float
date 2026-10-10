import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,upgrade,moveFacility,collectProduction,damageEnemy,startEncounter,weaponStats} from '../src/game.js';
import {missions} from '../src/campaign-content.js';
import {launchMission,returnToHarbor,resolveFieldDecision,currentFieldDecision,researchTechnology,powerCapacity} from '../src/campaign.js';
import {onSailed,atShore,productionStats,onSiteSecured,salvageBonus} from '../src/production.js';
import {encodeSave,decodeSave,validateCampaign} from '../src/save.js';
const run=(g,seconds,input={})=>{for(let i=0;i<seconds*60;i++)advance(g,1/60,input);};
function atChapter(index=18) {
  const g=createCampaign('direct');g.campaign.completed=missions.slice(0,index).map(m=>m.id);g.campaign.chapter=index/6;g.resources=10000;return g;
}
// Isolated rule fixtures, not normal-play or duration evidence.
function secureMission(g) {
  for(let t=0;t<2000 && g.phase==='playing';t++) {
    if(g.campaign.pendingChoice){const d=currentFieldDecision(g);resolveFieldDecision(g,d.options.find(o=>!(o.cost>g.resources)).id);}
    if(g.phase!=='playing')break;
    const site=g.catalog[g.campaign.objectiveIndex];g.island={x:site.x,z:site.z};startEncounter(g,site.id);
    for(const e of g.enemies)damageEnemy(g,e,1000000);advance(g,0.25);
  }
  assert.ok(['mission-complete','campaign-complete'].includes(g.phase),JSON.stringify({phase:g.phase,message:g.message,stage:g.campaign.stage,objective:g.campaign.objectiveIndex,wave:g.campaign.encounterWave,pending:g.campaign.pendingChoice}));
}
test('economic buildings spend real funds, respect unlocks/power and improve with upgrades',()=>{
  const g=createCampaign();assert.equal(build(g,'fishery',1,-1),true);assert.equal(g.resources,55);assert.equal(build(g,'crane',-1,-1),false);
  assert.equal(build(g,'laboratory',1,0),false);g.resources=500;assert.equal(upgrade(g,2),true);assert.equal(g.facilities[1].level,2);
  const later=atChapter();assert.equal(build(later,'farm',1,1),true);assert.equal(build(later,'laboratory',-1,1),true);
});
test('cranes recover one highest eligible bonus from an actual death, never overkill twice',()=>{
  const g=atChapter(6);build(g,'crane',1,-1);build(g,'crane',-1,-1);g.facilities[1].level=4;
  launchMission(g,'frost-1');const e=g.enemies[0];e.x=15;e.z=0;const money=g.resources;
  damageEnemy(g,e,1e6);assert.equal(g.resources-money,7);assert.equal(g.facilities[1].totalProduced,2);assert.equal(g.facilities[2].totalProduced,undefined);
  damageEnemy(g,e,1e6);assert.equal(g.resources-money,7);
  const far=g.enemies[1];far.x=100;far.z=100;const before=g.resources;damageEnemy(g,far,1e6);assert.equal(g.resources-before,5);
});
test('fishery uses real sailing, pause is frozen, harvest is atomic and quota is bounded',()=>{
  const g=createCampaign();build(g,'fishery',1,-1);run(g,10);assert.equal(g.facilities[1].stock,undefined);
  launchMission(g,'coral-1');run(g,7,{x:1});const f=g.facilities[1];assert.equal(f.stock,10);
  const paused=encodeSave(g);g.paused=true;run(g,10,{x:1});g.paused=false;assert.equal(encodeSave(g).includes('"stock":10'),true);assert.equal(f.stock,10);
  const money=g.resources;assert.equal(collectProduction(g,f.id),true);assert.equal(g.resources,money+10);assert.equal(collectProduction(g,f.id),false);
  for(let i=0;i<100;i++)onSailed(g,{x:g.island.x-50,z:g.island.z});assert.equal(f.catchUsed,70);assert.equal(f.stock,60);
  const saved=decodeSave(paused);assert.equal(saved.facilities[1].stock,10);assert.equal(saved.facilities[1].catchUsed,10);
});
test('a buried fishery requires free shore relocation and retains uncollected cargo',()=>{
  const g=atChapter();build(g,'fishery',1,1);const f=g.facilities[1];g.tiles=[];for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++)g.tiles.push({x,z});
  launchMission(g,'kelp-1');startEncounter(g,'objective-0');assert.equal(atShore(g,f),false);onSailed(g,{x:-100,z:0});assert.equal(f.stock,undefined);
  assert.equal(moveFacility(g,f.id,3,0),true);onSailed(g,{x:-100,z:0});assert.equal(f.stock,20);
  const saved=decodeSave(encodeSave(g));assert.equal(saved.facilities[1].stock,20);assert.equal(atShore(saved,saved.facilities[1]),true);
});
test('crop checkpoints, research banking and remaining samples persist without replay research',()=>{
  const g=atChapter();g.hull=g.maxHull=10000;build(g,'farm',1,1);build(g,'laboratory',-1,1);const farm=g.facilities[1];const research=g.campaign.research;
  launchMission(g,'kelp-1');secureMission(g);assert.equal(farm.stock,72);assert.equal(farm.cropProgress,0);
  assert.equal(g.campaign.surveyArchiveProgress,2);assert.equal(g.campaign.research,research+1);
  returnToHarbor(g);launchMission(g,'kelp-2');secureMission(g);assert.equal(g.campaign.research,research+3);assert.equal(g.campaign.surveyArchiveProgress,0);
  assert.equal(g.campaign.resultReward.research,2);assert.equal(g.campaign.resultReward.bonusResearch,1);
  const saved=decodeSave(encodeSave(g));assert.equal(saved.facilities[1].stock,144);assert.equal(saved.campaign.surveyArchiveProgress,0);
  returnToHarbor(g);const banked=g.campaign.research;launchMission(g,'kelp-1');secureMission(g);assert.equal(g.campaign.research,banked);
  assert.equal(g.campaign.resultReward.research,0);assert.equal(g.campaign.resultReward.first,false);
});
test('failed expeditions restore crops, cargo, cash and unbanked research; bad stock is rejected',()=>{
  const g=atChapter();build(g,'farm',1,1);build(g,'laboratory',-1,1);g.facilities[1].stock=18;g.facilities[1].cropProgress=2;
  g.campaign.surveyArchiveProgress=3;const before=structuredClone(g);launchMission(g,'kelp-1');
  g.facilities[1].stock=999;g.facilities[1].cropProgress=1;g.campaign.surveyProgress=0;g.campaign.bonusResearch=2;g.resources+=500;
  returnToHarbor(g,true);assert.deepEqual(g.facilities,before.facilities);assert.equal(g.resources,before.resources);assert.equal(g.campaign.research,before.campaign.research);assert.equal(g.campaign.surveyProgress,3);
  g.facilities[1].stock=-1;assert.throws(()=>validateCampaign(g),/생산 기록/);
});
test('advanced island research unlocks by sea and spends both costs atomically',()=>{
  const g=atChapter(24);g.campaign.research=100;
  assert.equal(researchTechnology(g,'cultivation'),false);assert.equal(g.resources,10000);assert.equal(g.campaign.research,100);
  g.campaign.chapter=5;g.campaign.completed=missions.slice(0,30).map(m=>m.id);
  assert.equal(researchTechnology(g,'cultivation'),true);assert.equal(g.resources,9400);assert.equal(g.campaign.research,97);
  g.resources=999;assert.equal(researchTechnology(g,'cultivation'),false);assert.equal(g.resources,999);assert.equal(g.campaign.research,97);assert.equal(g.campaign.tech.cultivation,1);
  g.resources=1000;g.campaign.research=3;assert.equal(researchTechnology(g,'cultivation'),false);assert.equal(g.resources,1000);
  g.campaign.research=4;assert.equal(researchTechnology(g,'cultivation'),true);assert.equal(g.resources,0);assert.equal(g.campaign.research,0);
  assert.equal(decodeSave(encodeSave(g)).campaign.tech.cultivation,2);
});
test('late research changes actual crop yield, crane recovery/range and facility power',()=>{
  const g=atChapter(54);g.campaign.research=100;build(g,'farm',1,1);build(g,'fishery',-1,1);build(g,'crane',1,-1);
  researchTechnology(g,'cultivation');researchTechnology(g,'cultivation');researchTechnology(g,'precision');
  const [farm,fishery,crane]=g.facilities.slice(1);assert.equal(productionStats(farm,g).cropValue,25);assert.equal(productionStats(fishery,g).catchValue,14);assert.equal(productionStats(fishery,g).catchCap,98);
  for(let i=0;i<3;i++)onSiteSecured(g,{task:'patrol',name:'rule fixture',x:0,z:0});assert.equal(farm.stock,25);
  assert.equal(productionStats(crane,g).range,25);assert.equal(weaponStats(crane,g).range,25);
  assert.equal(salvageBonus(g,{x:7,z:-7},100),30);assert.equal(productionStats({...crane,level:9},g).recovery,0.8);
  const capacity=powerCapacity(g);assert.equal(researchTechnology(g,'distributed'),true);assert.equal(powerCapacity(g),capacity+1);
  const restored=decodeSave(encodeSave(g));assert.equal(powerCapacity(restored),capacity+1);assert.equal(weaponStats(restored.facilities.at(-1),restored).range,25);assert.equal(restored.facilities[1].stock,25);
});
