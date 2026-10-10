import test from 'node:test';
import assert from 'node:assert/strict';
import {findResumeObservation} from '../scripts/live-resume-observation.mjs';

const archived={status:'stopped',startedAt:'same-run',updatedAt:'last-observed',limit:192,runtime:{sourceHash:'source',htmlHash:'html',cssHash:'css'},records:[{id:'frost-5',resources:1125,gameSeconds:216.7}],current:{id:'frost-6',paused:true,seconds:75.333,resources:792}};
const failed={...structuredClone(archived),status:'failed',updatedAt:'startup-failed',current:null};
const entry=report=>({file:'run-2/prior-live-audit.json',report});

test('startup failure recovers the exact earlier terminal observation and its provenance',()=>{
  const before=structuredClone(failed);
  assert.deepEqual(findResumeObservation(failed,[entry(archived)]),{current:archived.current,source:'run-2/prior-live-audit.json',observedAt:'last-observed'});
  assert.deepEqual(failed,before);
});
test('a fresh terminal observation takes precedence over archived evidence',()=>{
  const current={...failed,current:{...archived.current,seconds:90,resources:812}};
  assert.equal(findResumeObservation(current,[entry(archived)]).current,current.current);
});
test('the same mission IDs cannot conceal different earned resources or elapsed time',()=>{
  for(const key of ['resources','gameSeconds']){
    const changed=structuredClone(archived);changed.records[0][key]++;
    assert.equal(findResumeObservation(failed,[entry(changed)]),null,key);
  }
});
test('a different frozen source, HTML, or CSS cannot supply resume evidence',()=>{
  for(const key of ['sourceHash','htmlHash','cssHash']){
    const changed=structuredClone(archived);changed.runtime[key]='other-version';
    assert.equal(findResumeObservation(failed,[entry(changed)]),null,key);
  }
});
test('a running report or another journey cannot replace a terminal checkpoint',()=>{
  for(const changed of [{...archived,status:'running'},{...archived,startedAt:'other-run'},{...archived,limit:168}])assert.equal(findResumeObservation(failed,[entry(changed)]),null);
});
test('repeated startup failures preserve the original observation time and source',()=>{
  const retained={...failed,current:archived.current,currentObservation:{kind:'prior-terminal',source:'run-2/prior-live-audit.json',observedAt:'last-observed'}};
  assert.deepEqual(findResumeObservation(retained),{current:archived.current,source:'run-2/prior-live-audit.json',observedAt:'last-observed'});
});
