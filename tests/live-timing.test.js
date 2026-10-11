import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLiveTiming} from '../scripts/live-timing.mjs';
const rows=[{id:'first',gameSeconds:100,realSeconds:120},{id:'second',gameSeconds:200,realSeconds:220}];
test('completed timings can be summed only when every sortie has complete real observations',()=>{
  assert.deepEqual(summarizeLiveTiming(rows),{gameSeconds:300,observedCompletedSortieRealSeconds:340,completeCompletedSortieRealSeconds:340,partialTimingSorties:[],unknownTimingSorties:[]});
});
test('Continue timing preserves observed seconds but cannot certify a full real-time prefix',()=>{
  const input=structuredClone(rows);input[1].realSeconds=45;input[1].timingPartial=true;const before=structuredClone(input),report=summarizeLiveTiming(input);
  assert.equal(report.gameSeconds,300);assert.equal(report.observedCompletedSortieRealSeconds,165);assert.equal(report.completeCompletedSortieRealSeconds,null);assert.deepEqual(report.partialTimingSorties,['second']);assert.deepEqual(input,before);
});
test('unavailable recovery timing and malformed clocks cannot silently become zero complete time',()=>{
  const input=structuredClone(rows);input[1].realSeconds=null;input[1].timingUnavailable=true;const report=summarizeLiveTiming(input);assert.equal(report.gameSeconds,300);assert.equal(report.observedCompletedSortieRealSeconds,120);assert.equal(report.completeCompletedSortieRealSeconds,null);assert.deepEqual(report.unknownTimingSorties,['second']);
  for(const change of [r=>r.realSeconds=-1,r=>r.realSeconds=undefined,r=>r.gameSeconds=NaN]){const bad=structuredClone(rows);change(bad[0]);assert.throws(()=>summarizeLiveTiming(bad),/invalid.*timing/);}
});
