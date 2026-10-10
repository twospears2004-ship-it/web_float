import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/audio.js';
const gain=automation=>({gain:{value:0,setTargetAtTime:value=>automation.push(value)},connect:()=>{}});
test('unchanged volume and pause state do not add hundreds of audio automation events',()=>{
  const audio=new GameAudio({effects:.6,music:0}),automation=[];
  audio.context={state:'running',currentTime:0};audio.master=gain(automation);audio.sfx=gain([]);audio.music=gain([]);
  for(let frame=0;frame<600;frame++){audio.context.currentTime=frame/144;audio.update(false);}
  assert.deepEqual(automation,[.42]);assert.equal(audio.sfx.gain.value,.6);
  for(let frame=0;frame<600;frame++)audio.update(true);assert.deepEqual(automation,[.42,0]);
  audio.settings.effects=.2;audio.apply();assert.equal(audio.sfx.gain.value,.2);assert.equal(automation.at(-1),0);
});
test('audio unlocked after the game starts still applies the current volume and pause state',async()=>{
  const previous=globalThis.window,automation=[];
  class Context{constructor(){this.state='running';this.currentTime=0;this.destination={};}createGain(){return gain(automation);}async resume(){}}
  globalThis.window={AudioContext:Context};
  try{const audio=new GameAudio({effects:.4,music:0});audio.update(false);await audio.unlock();assert.equal(audio.sfx.gain.value,.4);assert.equal(automation.at(-1),.42);audio.update(true);assert.equal(automation.at(-1),0);}
  finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
