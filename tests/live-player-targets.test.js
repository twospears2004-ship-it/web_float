import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleStackTarget} from '../scripts/live-player.mjs';
const fixture=()=>({phase:'playing',paused:false,campaign:{},enemies:[{id:'hidden',siteId:'one',hp:100,x:0,z:0},{id:'front',siteId:'one',hp:100,x:.2,z:1}],fleet:{units:[{id:1,hp:100,command:{type:'attack',target:'front'}},{id:2,hp:100,command:{type:'attack',target:'front'}},{id:3,hp:0,command:{type:'escort'}}]}});
test('a recorded public attack on a nearby front body remains a redirect, ignores dead selected ships and does not mutate the snapshot',()=>{
 const g=fixture(),before=structuredClone(g);assert.equal(visibleStackTarget(g,g.enemies[0],[1,2,3]),g.enemies[1]);assert.deepEqual(g,before);
});
test('paused, pending, completed, missing, dead or captured contacts never turn a failed selection into success',()=>{
 for(const mutate of [g=>g.paused=true,g=>g.phase='mission-complete',g=>g.campaign.pendingChoice={},g=>g.enemies[0].hp=0,g=>g.enemies[0].captured=true,g=>g.enemies[1].hp=0,g=>g.enemies[1].captured=true,g=>g.enemies.pop(),g=>g.fleet.units.forEach(u=>u.hp=0)]){const g=fixture();mutate(g);assert.equal(visibleStackTarget(g,{id:'hidden'},[1,2,3]),null);}
});
test('a different encounter, distant target, mixed orders or already exact selection remain outside the redirect',()=>{
 for(const mutate of [g=>g.enemies[1].siteId='two',g=>g.enemies[1].x=4.01,g=>g.fleet.units[1].command={type:'hold'},g=>g.fleet.units[1].command.target='hidden',g=>g.fleet.units.forEach(u=>u.command.target='hidden')]){const g=fixture();mutate(g);assert.equal(visibleStackTarget(g,g.enemies[0],[1,2]),null);}
 const g=fixture();assert.equal(visibleStackTarget(g,g.enemies[0],[]),null);
});
