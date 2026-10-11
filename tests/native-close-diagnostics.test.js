import test from 'node:test';
import assert from 'node:assert/strict';
import {closeNativeWindow} from '../scripts/native-diagnostics.mjs';
const trace=(event,details={})=>({text:`TIDEHOLD_NATIVE_TRACE ${JSON.stringify({at:Date.now(),event,...details})}\n`});
test('native diagnostic disconnect waits for successful save, actual window close and natural quit',async()=>{
  const logs=[],events=[];let timer;
  const app={evaluate:async()=>{events.push('requested');logs.push(trace('close-ready',{ok:true}));timer=setTimeout(()=>{logs.push(trace('window-closed'),trace('will-quit'));events.push('naturally closed');},40);},close:async()=>events.push('detached')};
  const result=await closeNativeWindow(app,logs,300);clearTimeout(timer);assert.deepEqual(events,['requested','naturally closed','detached']);assert.equal(result.saved.ok,true);assert.equal(result.closed.event,'window-closed');assert.equal(result.quit.event,'will-quit');
});
test('failed save acknowledgment never triggers diagnostic disconnect or masks the failure',async()=>{
  const logs=[];let detached=false;const app={evaluate:async()=>logs.push(trace('close-ready',{ok:false,error:'read-only'})),close:async()=>{detached=true;}};await assert.rejects(closeNativeWindow(app,logs,100),/read-only/);assert.equal(detached,false);
});
test('stale quit traces cannot bypass a missing actual window close or increase the deadline',async()=>{
  const logs=[{text:'TIDEHOLD_NATIVE_TRACE {"at":0,"event":"window-closed"}\nTIDEHOLD_NATIVE_TRACE {"at":0,"event":"will-quit"}\n'}];let detached=false;const app={evaluate:async()=>logs.push(trace('close-ready',{ok:true})),close:async()=>{detached=true;}};await assert.rejects(closeNativeWindow(app,logs,50),/window-closed/);assert.equal(detached,false);
});
