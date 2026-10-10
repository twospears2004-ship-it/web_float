import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,build,moveFacility,setRoute,startEncounter,canManage,damageEnemy} from '../src/game.js';
import {launchMission,resolveFieldDecision,useAbility} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
const run=(g,seconds,input={})=>{for(let i=0;i<seconds*60;i++)advance(g,1/60,input);};
function nearby(mode='destination') {
  const g=createCampaign(mode);build(g,'mortar',-1,-1);launchMission(g,'coral-1');
  g.island={x:g.catalog[0].x,z:g.catalog[0].z};return g;
}

test('field refit stays usable near enemies until departure and survives save/load',()=>{
  const g=nearby(),before=g.enemies.map(e=>e.hp);run(g,30);
  assert.equal(g.combat,false);assert.equal(g.shots,0);assert.deepEqual(g.enemies.map(e=>e.hp),before);
  assert.equal(g.hull,g.maxHull);assert.equal(canManage(g),true);assert.equal(moveFacility(g,2,1,-1),true);
  const saved=decodeSave(encodeSave(g));saved.paused=false;run(saved,5);
  assert.equal(saved.campaign.waitingForDeparture,true);assert.equal(saved.combat,false);assert.equal(saved.facilities[1].x,1);
  assert.equal(startEncounter(saved,'objective-1'),false);assert.equal(saved.campaign.waitingForDeparture,true);
  assert.equal(setRoute(saved,'objective-0'),true);run(saved,1);assert.equal(saved.campaign.waitingForDeparture,false);assert.ok(saved.shots>0);assert.ok(saved.combat);
});
test('manual steering, a valid route and offensive pulse each leave the refit window',()=>{
  const manual=nearby('direct');run(manual,0.1,{x:1});assert.equal(manual.campaign.waitingForDeparture,false);assert.ok(manual.shots>0);
  const pulse=nearby();assert.equal(useAbility(pulse,'pulse'),true);run(pulse,0.1);assert.equal(pulse.campaign.waitingForDeparture,false);assert.ok(pulse.enemies.some(e=>e.active));
  const routed=nearby();setRoute(routed,'home');run(routed,0.1);assert.equal(routed.campaign.waitingForDeparture,true);
  routed.route=null;routed.paused=true;assert.equal(startEncounter(routed,'objective-0'),false);assert.equal(setRoute(routed,'objective-0'),false);
});
test('captured supplies open the next refit window and cannot trigger an unseen attack',()=>{
  const g=nearby();startEncounter(g,'objective-0');
  for(const e of g.enemies)damageEnemy(g,e,100000);run(g,0.1);assert.ok(g.campaign.pendingChoice);
  resolveFieldDecision(g,'repair');assert.equal(g.campaign.objectiveIndex,1);assert.equal(g.campaign.waitingForDeparture,true);
  // A long-range gun can already reach the next shore, but the player still
  // has time to refit before explicitly committing to the next encounter.
  g.facilities[0].type='rail';g.facilities[0].level=3;g.island={x:g.catalog[1].x,z:g.catalog[1].z};
  const hull=g.hull,shots=g.shots;run(g,20);assert.equal(g.shots,shots);assert.equal(g.hull,hull);assert.equal(canManage(g),true);
});
test('an existing saved engagement resumes with or without the new optional state',()=>{
  for(const legacy of [false,true]) {
    const g=nearby();if(legacy)delete g.campaign.waitingForDeparture;else g.enemies[0].active=true;
    const saved=decodeSave(encodeSave(g));saved.paused=false;run(saved,1);
    assert.ok(saved.shots>0);assert.ok(saved.combat);
  }
});
