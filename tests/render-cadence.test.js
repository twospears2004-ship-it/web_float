import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderCadence} from '../src/render-cadence.js';
test('paused scenes draw about 15 times per second across a 144 Hz display clock',()=>{
  const draw=createRenderCadence(),samples=[];
  for(let frame=0;frame<288;frame++){const dt=draw(frame*1000/144,{idle:true});if(dt!==null)samples.push(dt);}
  assert.ok(samples.length>=29&&samples.length<=31);assert.ok(samples.slice(1).every(dt=>dt>0&&dt<=.1));
});
test('combat resumes rendering immediately and keeps every display frame',()=>{
  const draw=createRenderCadence();assert.equal(draw(0,{idle:true}),0);assert.equal(draw(10,{idle:true}),null);
  for(let frame=0;frame<100;frame++)assert.notEqual(draw(11+frame*1000/144),null);
  assert.equal(draw(10000),.1);
});
test('hidden windows draw nothing and returning cannot fast-forward visual effects',()=>{
  const draw=createRenderCadence();draw(0);assert.equal(draw(10,{hidden:true}),null);assert.equal(draw(3600000,{hidden:true}),null);
  assert.equal(draw(3600001,{idle:true}),0);assert.equal(draw(3600010,{idle:true}),null);assert.notEqual(draw(3600011),null);
});
