import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,enemyStats} from '../src/game.js';
import {launchMission} from '../src/campaign.js';
import {inspectionContext,inspectedContact} from '../src/combat-inspector.js';
import {applyEnemySlow} from '../src/enemy-control.js';

function ready(){const g=createCampaign();launchMission(g,'coral-1');const enemy=g.enemies[0];g.fleet={units:[{id:1,hp:60,command:{type:'escort'}},{id:2,hp:60,command:{type:'attack',target:enemy.id}},{id:3,hp:0,command:{type:'attack',target:enemy.id}}]};return {g,enemy,ui:{inspectedEnemy:enemy.id,inspectionContext:inspectionContext(g),selectedUnits:[1,2,3]}};}
test('reading an inactive contact preserves game, formation and engagement exactly',()=>{
  const {g,enemy,ui}=ready(),before=structuredClone(g),selection=structuredClone(ui);
  const info=inspectedContact(g,ui);assert.equal(info.enemy,enemy);assert.deepEqual(info.stats,enemyStats(g,enemy));assert.equal(info.attacking,1);assert.equal(info.selected.length,2);assert.equal(info.commandable,true);assert.deepEqual(g,before);assert.deepEqual(ui,selection);
});
test('queued contact attacks are distinguished from current fire orders',()=>{
  const {g,enemy,ui}=ready();g.fleet.units[0].orders=[{type:'attack',target:enemy.id},{type:'attack',target:enemy.id}];
  const info=inspectedContact(g,ui);assert.equal(info.attacking,1);assert.equal(info.queued,1);ui.selectedUnits=[];assert.equal(inspectedContact(g,ui).commandable,false);
});
test('inspection disappears for dead, captured and replaced contacts',()=>{
  const {g,enemy,ui}=ready();enemy.hp=0;assert.equal(inspectedContact(g,ui),null);enemy.hp=20;enemy.captured=true;assert.equal(inspectedContact(g,ui),null);delete enemy.captured;g.campaign.objectiveIndex++;assert.equal(inspectedContact(g,ui),null);
});
test('pause and reward choice allow reading but block commands; harbor and defeat clear contact',()=>{
  const {g,ui}=ready();g.paused=true;assert.equal(inspectedContact(g,ui).commandable,false);g.paused=false;g.campaign.pendingChoice={};assert.equal(inspectedContact(g,ui).commandable,false);g.campaign.stage='harbor';assert.equal(inspectedContact(g,ui),null);g.campaign.stage='mission';g.phase='lost';assert.equal(inspectedContact(g,ui),null);
});
test('inspector reflects actual powered siege armor and range rather than base catalog stats',()=>{
  const {g,ui}=ready();g.operation={id:'siege-coral-1',kind:'siege',round:0,chapter:0};g.campaign.stage='operation';g.enemies=[{id:'generator',type:'generator',siteId:'dock',x:0,z:0,hp:100,maxHp:100},{id:'tower',type:'gunTower',siteId:'dock',x:3,z:0,hp:80,maxHp:80}];ui.inspectedEnemy='tower';ui.inspectionContext=inspectionContext(g);
  const powered=inspectedContact(g,ui).stats;g.enemies[0].hp=0;const unpowered=inspectedContact(g,ui).stats;assert.equal(powered.range,unpowered.range+3);assert.ok(powered.armor>unpowered.armor);assert.ok(powered.damage>unpowered.damage);
});

test('immobile defenses retain actual control clocks without claiming that their movement is slowed',()=>{
  for(const type of ['seaWall','gunTower','baseCore','generator','supplyDepot','nest']){
    const {g,enemy,ui}=ready();enemy.type=type;applyEnemySlow(enemy,'pulse',4,.3);applyEnemySlow(enemy,'frost',3,.5);const before=structuredClone(g);
    assert.doesNotMatch(inspectedContact(g,ui).support,/이동 둔화|남은 냉각/);assert.deepEqual(g,before);
  }
});

test('mobile contacts display genuine immobilization even when the current calculated speed is zero',()=>{
  const {g,enemy,ui}=ready();enemy.slowSeconds=1.2;enemy.slowFactor=0;const before=structuredClone(g);
  assert.equal(enemyStats(g,enemy).speed,0);assert.match(inspectedContact(g,ui).support,/이동 둔화 100% · 1.2초/);assert.deepEqual(g,before);
});

test('generator inspection counts only actual split/shared live recipients and does not mutate the battle',()=>{
  const {g,ui}=ready();g.enemies=[
    {id:'source',type:'generator',siteId:'dock',powerLink:true,powerBus:'west',hp:100,maxHp:100,x:0,z:0},
    {id:'west',type:'baseCore',siteId:'dock',powerBus:'west',hp:100,maxHp:100,x:40,z:0},
    {id:'shared',type:'baseCore',siteId:'dock',powerBus:'shared',hp:100,maxHp:100,x:50,z:0},
    {id:'east',type:'baseCore',siteId:'dock',powerBus:'east',hp:100,maxHp:100,x:2,z:0},
    {id:'west-tower',type:'gunTower',siteId:'dock',powerBus:'west',hp:100,maxHp:100,x:40,z:4},
  ];ui.inspectedEnemy='source';const before=structuredClone(g);assert.match(inspectedContact(g,ui).support,/송전 · 지휘핵 2기 · 방어탑 1기/);assert.deepEqual(g,before);
  g.enemies[1].captured=true;g.enemies[2].siteId='other';g.enemies[4].hp=0;assert.match(inspectedContact(g,ui).support,/전력을 공급할 기지 없음/);
});

test('core inspection follows live supply count and the same actual powered stats after captured and destroyed generators',()=>{
  const {g,ui}=ready();g.enemies=[
    {id:'source-a',type:'generator',siteId:'dock',powerLink:true,powerBus:'west',hp:100,maxHp:100,x:40,z:0},
    {id:'source-b',type:'generator',siteId:'dock',powerLink:true,powerBus:'east',hp:100,maxHp:100,x:-40,z:0},
    {id:'core',type:'baseCore',siteId:'dock',powerBus:'shared',hp:100,maxHp:100,x:0,z:0},
  ];ui.inspectedEnemy='core';const before=structuredClone(g),powered=inspectedContact(g,ui);assert.match(powered.support,/동력기 공급 2곳/);assert.deepEqual(g,before);
  g.enemies[0].captured=true;assert.match(inspectedContact(g,ui).support,/동력기 공급 1곳/);g.enemies[1].hp=0;const none=inspectedContact(g,ui);assert.match(none.support,/동력기 공급 0곳/);assert(none.stats.armor<powered.stats.armor);assert.deepEqual(none.stats,enemyStats(g,g.enemies[2]));
});
