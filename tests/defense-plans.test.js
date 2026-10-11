// Deliberately isolated mechanics. Normal UI/model evidence is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,damageEnemy,build} from '../src/game.js';
import {missions,campaignRules} from '../src/campaign-content.js';
import {defenseContracts} from '../src/frontier-content.js';
import {defenseRegions,defenseWavePlan} from '../src/defense-plans.js';
import {launchDefense,startDefenseWave} from '../src/frontier.js';
import {recruitUnit} from '../src/fleet.js';
import {encodeSave,decodeSave} from '../src/save.js';
const base=chapter=>{const g=createCampaign();g.resources=10000;g.campaign.chapter=chapter;g.campaign.completed=missions.slice(0,Math.max(1,chapter*6)).map(m=>m.id);return g;};
const unlock={crawler:0,skimmer:1,armored:2,spitter:3,bomber:4,tender:3,bulwark:5,carrier:7};
const run=(g,seconds)=>{for(let i=0;i<seconds*60;i++)advance(g,1/60);};

test('36 distinct approaches keep wave counts, finite unique water positions and enemy unlocks',()=>{
  assert.equal(defenseRegions.length,12);const signatures=new Set();
  for(const def of defenseContracts){signatures.add(JSON.stringify(defenseRegions[def.chapter].lanes[def.rank]));
    for(let round=0;round<def.waves;round++){
      const plan=defenseWavePlan(def,round);assert.equal(plan.count,4+Math.min(8,def.chapter)+def.rank*2+round);assert.equal(plan.enemies.length,plan.count);assert.equal(plan.lanes.reduce((n,l)=>n+l.count,0),plan.count);assert.ok(plan.lanes.every(l=>l.count>0));
      assert.equal(new Set(plan.enemies.map(e=>`${e.x}:${e.z}`)).size,plan.count);
      for(const e of plan.enemies){assert.ok(unlock[e.type]<=def.chapter);assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.z)&&Math.abs(e.x)<=110&&Math.abs(e.z)<=110);assert.ok(Math.hypot(e.x,e.z)>=36-1e-9);assert.equal(plan.lanes[e.lane].count,plan.enemies.filter(v=>v.lane===e.lane).length);}
    }
  }
  assert.equal(signatures.size,36);
});

test('new paid operations spawn the exact announced lane composition and unchanged health formula',()=>{
  for(const def of defenseContracts){const g=base(def.chapter);g.campaign.frontier={version:1,cleared:defenseContracts.filter(d=>d.chapter===def.chapter&&d.rank<def.rank).map(d=>d.id),records:{},totalSeconds:0};
    assert.equal(launchDefense(g,def.id),true);assert.equal(g.operation.defenseVersion,2);const plan=defenseWavePlan(def,0);assert.equal(startDefenseWave(g),true);
    for(const [i,e]of g.enemies.entries()){const p=plan.enemies[i];assert.equal(e.type,p.type);assert.equal(e.x,p.x);assert.equal(e.z,p.z);assert.equal(e.maxHp,Math.round(campaignRules.enemies[e.type].hp*(1.2+def.rank*0.2)*(1+def.chapter*0.5)**1.25));}
  }
});

test('dominant lanes and counterplay change between waves without adding a start delay',()=>{
  const def=defenseContracts.find(d=>d.id==='defense-raider-2'),a=defenseWavePlan(def,0),b=defenseWavePlan(def,1);
  assert.notEqual(a.tactic,b.tactic);assert.ok(a.lanes[0].count>a.lanes[1].count);assert.ok(b.lanes[1].count>b.lanes[0].count);assert.notDeepEqual(a.enemies.map(e=>e.type),b.enemies.map(e=>e.type));
  const g=base(5);g.campaign.frontier={version:1,cleared:['defense-raider-1'],records:{},totalSeconds:0};launchDefense(g,def.id);startDefenseWave(g);assert.equal(g.campaign.missionSeconds,0);assert.ok(g.enemies.every(e=>e.active));
  for(const e of g.enemies)damageEnemy(g,e,1e6);advance(g,1/60);assert.equal(g.operation.waiting,true);assert.equal(g.operation.round,1);assert.equal(startDefenseWave(g),true);assert.deepEqual(g.enemies.map(e=>e.type),b.enemies.map(e=>e.type));
});

test('active version-two defenders and subsequent waves survive an exact saved round trip',()=>{
  const g=base(7);launchDefense(g,'defense-pearl-1');startDefenseWave(g);run(g,8);const restored=decodeSave(encodeSave(g));restored.paused=false;
  for(const key of ['operation','enemies','facilities','fleet','resources','checkpoint'])assert.deepEqual(restored[key],g[key]);run(g,2);run(restored,2);assert.deepEqual(restored.enemies,g.enemies);
  for(const state of [g,restored]){for(const e of state.enemies)damageEnemy(state,e,1e6);advance(state,1/60);startDefenseWave(state);}
  assert.deepEqual(restored.enemies,g.enemies);assert.ok(g.enemies.some(e=>e.type==='carrier'));
});

test('unversioned active saves retain original attack bearings and the old next-wave rules',()=>{
  const g=base(3);launchDefense(g,'defense-kelp-1');delete g.operation.defenseVersion;startDefenseWave(g);assert.equal(g.enemies[0].type,'crawler');assert.equal(g.enemies[0].x,Math.sin(-0.16)*44);assert.equal(g.enemies[0].z,Math.cos(-0.16)*44);
  run(g,5);const restored=decodeSave(encodeSave(g));restored.paused=false;assert.equal(restored.operation.defenseVersion,undefined);assert.deepEqual(restored.enemies,g.enemies);
  for(const state of [g,restored]){for(const e of state.enemies)damageEnemy(state,e,1e6);advance(state,1/60);startDefenseWave(state);}
  assert.deepEqual(restored.enemies,g.enemies);assert.equal(g.enemies[0].x,Math.sin(0.48-0.16)*44);assert.equal(g.enemies[0].type,'skimmer');
});

test('unsupported defense versions and a defense version attached to a siege are rejected',()=>{
  const g=base(2);launchDefense(g,'defense-rust-1');for(const version of [null,0,3,'2']){g.operation.defenseVersion=version;assert.throws(()=>encodeSave(g),/방어 공세 버전/);}g.operation.defenseVersion=2;assert.doesNotThrow(()=>encodeSave(g));
  const raid=base(2);build(raid,'shipyard',1,-1);recruitUnit(raid,'skiff');launchDefense(raid,'siege-rust-1');raid.operation.defenseVersion=2;assert.throws(()=>encodeSave(raid),/방어 공세 버전/);
});
