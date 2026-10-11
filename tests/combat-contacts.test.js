import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,enemyStats} from '../src/game.js';
import {launchMission} from '../src/campaign.js';
import {battleContacts} from '../src/combat-contacts-view.js';

// Isolated visibility fixtures; these are not earned playtime or combat results.
function ready(){const g=createCampaign();launchMission(g,'coral-1');return g;}
test('current contacts use real stats and preserve the complete campaign without engaging waiting enemies',()=>{
  const g=ready(),before=structuredClone(g),contacts=battleContacts(g);assert(contacts.length>0);
  for(const c of contacts){assert.equal(c.enemy,g.enemies[c.number-1]);assert.deepEqual(c.stats,enemyStats(g,c.enemy));}
  assert.deepEqual(g,before);
});
test('dead and captured contacts disappear without renumbering surviving enemies',()=>{
  const g=ready(),first=battleContacts(g);assert(first.length>=3);g.enemies[0].hp=0;g.enemies[1].captured=true;const before=structuredClone(g),alive=battleContacts(g);assert.equal(alive.length,first.length-2);assert.equal(alive[0].number,3);assert.equal(alive[0].enemy.id,first[2].enemy.id);assert.deepEqual(g,before);
});
test('unopened remote docks stay absent while actually engaged remote enemies remain inspectable',()=>{
  const g=ready(),site=g.catalog[g.campaign.objectiveIndex].id,current=g.enemies[0];g.operation={kind:'siege',id:'siege-coral-1',round:0};g.campaign.stage='operation';
  g.enemies=[{...current,id:'current',siteId:site,active:false},{...current,id:'future',siteId:'unopened',active:false},{...current,id:'engaged',siteId:'unopened',active:true}];const before=structuredClone(g);assert.deepEqual(battleContacts(g).map(c=>c.enemy.id),['current','engaged']);assert.deepEqual(g,before);
});
test('pause permits reading current contacts; harbor, result, defeat and training clear the list',()=>{
  const g=ready();g.paused=true;const before=structuredClone(g);assert(battleContacts(g).length>0);assert.deepEqual(g,before);
  for(const stage of ['harbor','operation-result','result']){g.campaign.stage=stage;assert.deepEqual(battleContacts(g),[]);}g.campaign.stage='mission';g.phase='defeat';assert.deepEqual(battleContacts(g),[]);g.phase='playing';g.campaign=null;assert.deepEqual(battleContacts(g),[]);
});
test('each new objective lists its own waiting defenders rather than inactive previous contacts',()=>{
  const g=ready(),enemy=g.enemies[0],first=g.catalog[0].id,second=g.catalog[1].id;g.enemies=[{...enemy,id:'old',siteId:first,active:false},{...enemy,id:'new',siteId:second,active:false}];g.campaign.objectiveIndex=1;assert.deepEqual(battleContacts(g).map(c=>c.enemy.id),['new']);
});
