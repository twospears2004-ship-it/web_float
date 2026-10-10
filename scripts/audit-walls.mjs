// Fresh normal economy and public actions. No injected money/health/damage,
// teleports or timers. Simulation seconds are not human playtest duration.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createCampaign,build,advance,setRoute,collectProduction} from '../src/game.js';
import {launchMission,useAbility,resolveFieldDecision,returnToHarbor} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
const g=createCampaign('destination'),records=[];await fs.mkdir('artifacts/wall-fixtures',{recursive:true});
assert.equal(build(g,'farm',1,1),true);assert.equal(g.resources,0);assert.equal(launchMission(g,'coral-1'),true);
for(let seconds=0;seconds<1800;seconds+=0.25){
  if(g.facilities.find(f=>f.type==='farm').stock>=18&&!g.combat&&!g.route&&!g.campaign.pendingChoice)break;
  assert.equal(g.phase,'playing',g.message);
  if(g.campaign.pendingChoice){const option={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:'recycle',salvage:'surface',signal:'shield'}[g.campaign.pendingChoice.kind];assert.equal(resolveFieldDecision(g,option),true);}
  if(!g.combat&&!g.route&&g.campaign.waitingForDeparture)setRoute(g,`objective-${g.campaign.objectiveIndex}`);
  if(g.hull<g.maxHull*0.8)useAbility(g,'mend');if(g.enemies.some(e=>e.windup))useAbility(g,'barrier');
  if(g.combat&&g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))useAbility(g,'pulse');
  if(g.campaign.hazards.length)useAbility(g,'brace');advance(g,0.25);
}
const farm=g.facilities.find(f=>f.type==='farm');assert.ok(farm.stock>=18);assert.equal(g.sites.filter(s=>s.cleared).length,3);
await fs.writeFile('artifacts/wall-fixtures/farm-first-growth.json',encodeSave(g));records.push({action:'first-sea crops',objectives:3,stock:farm.stock,resources:g.resources,hull:g.hull,seconds:g.campaign.missionSeconds});
returnToHarbor(g);
const cash=g.resources,stock=farm.stock;assert.equal(collectProduction(g,farm.id),true);assert.equal(g.resources,cash+stock);assert.equal(collectProduction(g,farm.id),false);
assert.equal(build(g,'wall',1,1,'north'),true);assert.equal(build(g,'wall',1,1,'east'),true);assert.ok(g.facilities.includes(farm));
const saved=encodeSave(g);await fs.writeFile('artifacts/wall-fixtures/farm-edges-earned.json',saved);const loaded=decodeSave(saved);assert.deepEqual(loaded.facilities,g.facilities);records.push({action:'harvest and two paid edges',resources:g.resources,facilities:g.facilities.length,restored:true});
await fs.writeFile('artifacts/wall-audit.json',JSON.stringify({type:'fresh normal action model',records,warning:'Not a human playtime measurement.'},null,2));console.log(JSON.stringify(records));
