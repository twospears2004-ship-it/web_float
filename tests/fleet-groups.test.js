import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCampaign,build} from '../src/game.js';
import {launchMission,retryMission} from '../src/campaign.js';
import {recruitUnit,dismissUnit,assignControlGroup,controlGroupUnits} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';

// Funded rule fixture. Real paid recruitment is covered separately through UI.
function ready(){
  const g=createCampaign('direct');g.resources=1000;assert(build(g,'shipyard',1,0));
  for(let i=0;i<3;i++)assert(recruitUnit(g,'skiff'));
  return g;
}
test('control groups replace, append and clear without changing ships or resources',()=>{
  const g=ready(),before={resources:g.resources,units:structuredClone(g.fleet.units)};
  assert(assignControlGroup(g,5,[1,1,999]));assert.deepEqual(controlGroupUnits(g,5),[1]);
  assert(assignControlGroup(g,5,[2],true));assert.deepEqual(controlGroupUnits(g,5),[1,2]);
  assert(assignControlGroup(g,5,[3]));assert.deepEqual(controlGroupUnits(g,5),[3]);
  assert(assignControlGroup(g,6,[1,3]));assert.deepEqual(controlGroupUnits(g,6),[1,3]);
  assert(assignControlGroup(g,5,[]));assert.deepEqual(controlGroupUnits(g,5),[]);
  for(const n of [0,1,4,10,'5'])assert.equal(assignControlGroup(g,n,[1]),false);
  assert.deepEqual({resources:g.resources,units:g.fleet.units},before);
  g.paused=true;assert.equal(assignControlGroup(g,6,[2]),false);g.paused=false;
  g.campaign.pendingChoice={};assert.equal(assignControlGroup(g,6,[2]),false);
});
test('groups select living members, prune dismissed ships and do not recruit replacements into old slots',()=>{
  const g=ready();assert(assignControlGroup(g,5,[1,2]));assert(assignControlGroup(g,9,[2]));
  g.fleet.units[0].hp=0;assert.deepEqual(controlGroupUnits(g,5),[2]);
  assert(recruitUnit(g,'skiff'));assert.deepEqual(g.fleet.groups[5],[2]);assert.deepEqual(controlGroupUnits(g,5),[2]);
  assert(dismissUnit(g,2));assert.deepEqual(g.fleet.groups,{});assert.deepEqual(controlGroupUnits(g,9),[]);
  assert.deepEqual(decodeSave(encodeSave(g)).fleet,g.fleet);
});
test('departure, manual save and retry preserve the departure group and fleet identity',()=>{
  const g=ready();assert(assignControlGroup(g,5,[1,2]));assert(launchMission(g,'coral-1'));
  assert.deepEqual(controlGroupUnits(g,5),[1,2]);assert.deepEqual(g.checkpoint.fleet.groups,{5:[1,2]});
  assert(assignControlGroup(g,5,[3]));const saved=decodeSave(encodeSave(g));
  assert.deepEqual(controlGroupUnits(saved,5),[3]);assert.deepEqual(saved.checkpoint.fleet.groups,{5:[1,2]});
  saved.paused=false;assert(retryMission(saved));assert.deepEqual(controlGroupUnits(saved,5),[1,2]);
  assert.deepEqual(decodeSave(encodeSave(saved)).fleet,saved.fleet);
});
test('invalid group IDs, duplicate members and malformed checkpoint groups fail before overwriting saves',()=>{
  const g=ready();
  for(const groups of [null,[],{4:[1]},{'05':[1]},{5:[999]},{5:[1,1]},{5:'1'},{5:[true]},{5:[0]}]){
    const bad=structuredClone(g);bad.fleet.groups=groups;assert.throws(()=>encodeSave(bad),/전대/);
  }
  assert(launchMission(g,'coral-1'));g.checkpoint.fleet.groups={5:[999]};assert.throws(()=>encodeSave(g),/전대/);
});
test('normal-earned older fleet saves load and export without requiring group metadata',async()=>{
  const g=decodeSave(await fs.readFile('tests/fixtures/walls-legacy-coral-harbor.json','utf8'));
  assert.equal(g.fleet.groups,undefined);assert.deepEqual(controlGroupUnits(g,5),[]);
  const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.fleet,g.fleet);
  assert.equal(restored.resources,g.resources);assert.deepEqual(restored.campaign,g.campaign);
});
