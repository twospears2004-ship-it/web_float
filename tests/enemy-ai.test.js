// Isolated combat/geometry invariants. These fixtures do not prove economy or play length.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,advance,enemyStats} from '../src/game.js';
import {launchMission} from '../src/campaign.js';
import {campaignRules} from '../src/campaign-content.js';
import {steerEnemy} from '../src/enemy-ai.js';
import {hullDistance} from '../src/hull.js';
import {encodeSave,decodeSave} from '../src/save.js';
const run=(g,n)=>{for(let i=0;i<n*60;i++)advance(g,1/60);};
function battle(type,x,z=0){const g=createCampaign();launchMission(g,'coral-1');g.facilities=[];const e=g.enemies[0];Object.assign(e,{type,x,z,hp:campaignRules.enemies[type].hp,maxHp:campaignRules.enemies[type].hp,active:true});g.enemies=[e];return g;}
test('spitter retreats from the physical shore while firing, stops at 12m, and can be caught by a faster island',()=>{
  const g=battle('spitter',15),e=g.enemies[0],before=e.x;run(g,1);assert.ok(e.x>before);assert.ok(g.hull<g.maxHull);
  run(g,5);assert.ok(Math.abs(hullDistance(g,e)-12)<0.05);const held=e.x;run(g,1);assert.equal(e.x,held);
  for(let i=0;i<60;i++)advance(g,1/60,{x:1});assert.ok(hullDistance(g,e)<7);assert.ok(e.x>held);
});
test('ranged approach still closes from outside firing range, and slows affect retreat speed',()=>{
  const g=battle('spitter',40),e=g.enemies[0];run(g,1);assert.ok(e.x<40);assert.equal(g.hull,g.maxHull);
  const quick=battle('spitter',15),slow=battle('spitter',15);Object.assign(slow.enemies[0],{slowSeconds:3,slowFactor:0.5});run(quick,1);run(slow,1);
  assert.ok(quick.enemies[0].x-slow.enemies[0].x>1);
});
test('tender follows a wounded local ally into healing range and ignores captured/dead/inactive/distant allies',()=>{
  const g=battle('tender',30),medic=g.enemies[0],wounded={...structuredClone(medic),id:'wounded',type:'crawler',x:50,hp:30,maxHp:80};
  g.enemies.push(wounded);run(g,1);assert.ok(medic.x>30);assert.ok(wounded.hp>30);
  for(const change of [{captured:true},{hp:0},{active:false},{x:80},{siteId:'another-wave'}]){
    const local=battle('tender',30),other={...wounded,x:50,hp:30,active:true,captured:false,...change};local.enemies.push(other);
    steerEnemy(local,local.enemies[0],local.island,enemyStats(local,local.enemies[0]),1,true,110);assert.ok(local.enemies[0].x<30);
  }
});
test('enemy repair never restores a captured target; generators remain fixed',()=>{
  const g=battle('generator',20),support=g.enemies[0],captured={...structuredClone(support),id:'captured',type:'gunTower',x:22,hp:10,maxHp:200,captured:true};
  g.enemies.push(captured);run(g,1);assert.equal(captured.hp,10);assert.equal(support.x,20);
});
test('role steering stays finite and bounded at overlap and world edges',()=>{
  for(const x of [-110,0,110]){const g=battle('spitter',x),e=g.enemies[0],target={x,z:0};
    steerEnemy(g,e,target,enemyStats(g,e),1,false,110);assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.z));assert.ok(Math.abs(e.x)<=110&&Math.abs(e.z)<=110);
  }
});
test('support and standoff decisions replay identically after a normal save reload',()=>{
  const g=battle('spitter',15);run(g,0.5);const restored=decodeSave(encodeSave(g));restored.paused=false;
  run(g,1);run(restored,1);assert.deepEqual(restored.enemies,g.enemies);assert.equal(restored.hull,g.hull);
});
