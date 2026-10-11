import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyEnemySlow,tickEnemySlow,strongestSlow,slowDescription} from '../src/enemy-control.js';
import {createCampaign,advance,enemyStats} from '../src/game.js';
import {launchMission,useAbility,returnToHarbor} from '../src/campaign.js';
import {encodeSave,decodeSave} from '../src/save.js';
const body=()=>({hp:100,slowSeconds:0,slowFactor:1});
const run=(g,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)advance(g,1/60);};
const earned=()=>{const g=decodeSave(fs.readFileSync('tests/fixtures/endgame-earned-coral-network-result.json','utf8'));returnToHarbor(g);return g;};

test('weaker frost hits keep independent clocks and neither cancel nor extend a four-second pulse',()=>{
  const e=body();applyEnemySlow(e,'pulse',4,.3);tickEnemySlow(e,1.2);applyEnemySlow(e,'frost',3,.35);
  assert.equal(e.slowFactor,.3);assert.equal(e.slowSeconds,2.8);assert.deepEqual(e.controlSlows.frost,{seconds:3,factor:.35});
  tickEnemySlow(e,1.4);applyEnemySlow(e,'frost',3,.35);assert.equal(e.slowSeconds,1.4);assert.equal(e.slowFactor,.3);
  tickEnemySlow(e,1.41);assert.equal(e.controlSlows.pulse,undefined);assert.equal(e.slowFactor,.35);assert.equal(e.slowSeconds,1.59);
  tickEnemySlow(e,1.6);assert.equal(e.controlSlows,undefined);assert.equal(e.slowSeconds,0);assert.equal(e.slowFactor,1);
});
test('pulse replaces frost in strength while the earlier frost expires on its original clock',()=>{
  const e=body();applyEnemySlow(e,'frost',3,.5);tickEnemySlow(e,.5);applyEnemySlow(e,'pulse',4,.3);tickEnemySlow(e,2.6);
  assert.equal(e.controlSlows.frost,undefined);assert.ok(Math.abs(e.slowSeconds-1.4)<1e-9);assert.equal(e.slowFactor,.3);tickEnemySlow(e,1.5);assert.equal(e.controlSlows,undefined);
});
test('the carried legacy effect keeps its exact unknown duration, never inventing a prior pulse or resetting expiry',()=>{
  const e={hp:100,slowSeconds:1.2,slowFactor:.1};applyEnemySlow(e,'frost',3,.5);assert.deepEqual(e.controlSlows.legacy,{seconds:1.2,factor:.1});assert.equal(e.slowSeconds,1.2);
  tickEnemySlow(e,1.21);assert.equal(e.controlSlows.legacy,undefined);assert.equal(e.slowFactor,.5);assert.ok(Math.abs(e.slowSeconds-1.79)<1e-9);
  const old={hp:100,slowSeconds:2.7,slowFactor:.35};tickEnemySlow(old,.4);assert.equal(old.controlSlows,undefined);assert.ok(Math.abs(old.slowSeconds-2.3)<1e-9);assert.equal(old.slowFactor,.35);
});
test('equal-strength clocks choose the longest remaining time without mutation or source-order dependence',()=>{
  const a={legacy:{seconds:2,factor:.3},pulse:{seconds:4,factor:.3}},b={pulse:a.pulse,legacy:a.legacy},before=JSON.stringify(a);
  assert.deepEqual(strongestSlow(a),{seconds:4,factor:.3});assert.deepEqual(strongestSlow(a),strongestSlow(b));assert.equal(JSON.stringify(a),before);
});
test('invalid effects, dead bodies and captured contacts reject control without adding fields',()=>{
  for(const [change,kind,seconds,factor]of [[{},'legacy',3,.5],[{},'pulse',5,.3],[{},'pulse',4,.5],[{},'frost',3,.7],[{},'frost',NaN,.5],[{hp:0},'pulse',4,.3],[{captured:true},'frost',3,.5]]){
    const e={...body(),...change},before=JSON.stringify(e);assert.equal(applyEnemySlow(e,kind,seconds,factor),false);assert.equal(JSON.stringify(e),before);
  }
});
test('contact text shows the effective clock and a longer surviving cooling effect without modifying state',()=>{
  const e=body();applyEnemySlow(e,'pulse',4,.3);tickEnemySlow(e,2);applyEnemySlow(e,'frost',3,.35);const before=JSON.stringify(e);
  assert.equal(slowDescription(e),'이동 둔화 70% · 2.0초 · 남은 냉각 65% 3.0초');assert.equal(JSON.stringify(e),before);tickEnemySlow(e,2.1);assert.match(slowDescription(e),/이동 둔화 65%.*0.9초/);
});
test('actual automatic frost fire preserves pulse strength and movement during four seconds, then falls back to frost',()=>{
  // Isolated combat invariants; injected bodies/positions are not journey proof.
  const g=createCampaign();launchMission(g,'coral-1');g.campaign.waitingForDeparture=false;g.facilities=[{id:1,type:'frost',x:0,z:-1,level:1,cooldown:0,aim:0}];
  const e=g.enemies[0];Object.assign(e,{type:'carrier',x:0,z:-12,hp:10000,maxHp:10000,active:true,spawnTimer:1});g.enemies=[e];const base=enemyStats(g,{...e,slowSeconds:0}).speed;
  useAbility(g,'pulse');run(g,3.9);assert.equal(e.slowFactor,.3);assert.ok(Math.abs(enemyStats(g,e).speed-base*.3)<1e-9);assert(e.controlSlows.frost.seconds>e.controlSlows.pulse.seconds);assert.equal(e.spawnTimer,1);
  run(g,.2);assert.equal(e.controlSlows.pulse,undefined);assert.equal(e.slowFactor,.5);assert.equal(e.spawnTimer,1);assert.ok(g.shots>=4);
});
test('story, operation and paused save clocks remain independent and restore exact layered control as format four',()=>{
  const g=earned();launchMission(g,'coral-1');const e=g.enemies[0];applyEnemySlow(e,'pulse',4,.3);tickEnemySlow(e,2);applyEnemySlow(e,'frost',3,.5);
  const text=encodeSave(g);assert.equal(JSON.parse(text).version,4);const restored=decodeSave(text);assert.deepEqual(restored.enemies,g.enemies);const before=structuredClone(restored.enemies);advance(restored,.25);assert.deepEqual(restored.enemies,before);
  // Remove weapons to isolate expiry while preserving the normally earned hull.
  g.facilities=[];restored.facilities=[];restored.paused=false;run(g,2.1);run(restored,2.1);assert.deepEqual(restored.enemies,g.enemies);assert.equal(e.slowFactor,.5);assert.equal(e.controlSlows.pulse,undefined);
});
test('legacy envelopes keep their fields on import and new stacked timers cannot be relabeled as an old format',()=>{
  const g=earned();assert.equal(JSON.parse(encodeSave(g)).version,1);assert(g.enemies.every(e=>!Object.hasOwn(e,'controlSlows')));launchMission(g,'coral-1');applyEnemySlow(g.enemies[0],'pulse',4,.3);
  const envelope=JSON.parse(encodeSave(g));assert.equal(envelope.version,4);envelope.version=3;assert.throws(()=>decodeSave(JSON.stringify(envelope)),/저장 형식/);
  const e=g.enemies[0];e.slowFactor=.5;assert.throws(()=>encodeSave(g),/둔화 중첩/);e.slowFactor=.3;e.controlSlows.pulse.factor=.4;assert.throws(()=>encodeSave(g),/둔화 중첩/);
});
test('unknown, empty, excessive and mismatched effect data is rejected and harbor cleanup returns to the correct former envelope',()=>{
  const g=earned();launchMission(g,'coral-1');const e=g.enemies[0];applyEnemySlow(e,'pulse',4,.3);const valid=structuredClone(e.controlSlows);
  for(const invalid of [undefined,{},{mystery:{seconds:2,factor:.5}},{pulse:{seconds:4.01,factor:.3}},{pulse:{seconds:4,factor:.3,extra:true}},{pulse:{seconds:4,factor:.3},frost:{seconds:3,factor:.35}}]){e.controlSlows=invalid;assert.throws(()=>encodeSave(g),/둔화 중첩/);}
  e.controlSlows=valid;returnToHarbor(g,true);assert.equal(JSON.parse(encodeSave(g)).version,1);assert.equal(g.enemies.length,0);
});
