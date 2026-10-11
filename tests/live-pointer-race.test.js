import test from 'node:test';
import assert from 'node:assert/strict';
import {livePlayer} from '../scripts/live-player.mjs';

function rendered(onRight){
  const g={phase:'playing',paused:false,campaign:{},enemies:[{id:'moving-enemy',hp:10,x:20,z:-12}],fleet:{units:[{id:1,hp:20,command:{type:'escort'}}]}},clicks=[];
  const page={
    evaluate:async(_fn,arg)=>arg?{x:100,y:100}:structuredClone(g),
    locator:selector=>({isVisible:async()=>true,evaluate:async()=>true,click:async()=>{},boundingBox:async()=>selector==='#minimap'?{x:0,y:0,width:230,height:180}:{x:0,y:0,width:400,height:300}}),
    waitForTimeout:async()=>{},mouse:{click:async(x,y,options)=>{if(options?.button==='right'){clicks.push({x,y});onRight?.(g,clicks.length);}}},
  };
  return {g,clicks,player:livePlayer(page,{})};
}
test('an enemy dying during any rendered attack attempt is unavailable, not a pointer failure',async()=>{
  for(const attempt of [1,2,3]){
    const r=rendered((g,n)=>{if(n===attempt)g.enemies[0].hp=0;});
    assert.equal(await r.player.order('attack',r.g.enemies[0]),false);assert.equal(r.clicks.length,attempt);
    assert.deepEqual(r.g.fleet.units[0].command,{type:'escort'});
  }
});
test('capture or a phase transition during a pointer attempt safely stops input',async()=>{
  for(const change of [g=>{g.enemies[0].captured=true;},g=>{g.phase='mission-complete';},g=>{g.paused=true;}]){
    const r=rendered(change);assert.equal(await r.player.order('attack',r.g.enemies[0]),false);assert.equal(r.clicks.length,1);
  }
});
test('a living missed target remains a genuine failure and successful input remains successful',async()=>{
  const missed=rendered();await assert.rejects(missed.player.order('attack',missed.g.enemies[0]),/Rendered pointer could not issue attack/);assert.equal(missed.clicks.length,3);
  const hit=rendered(g=>{g.fleet.units[0].command={type:'attack',target:g.enemies[0].id};});
  assert.equal(await hit.player.order('attack',hit.g.enemies[0]),true);assert.equal(hit.clicks.length,1);
});
