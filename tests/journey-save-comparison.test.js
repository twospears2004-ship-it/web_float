import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSavedValue,harborFleetValue} from '../scripts/save-comparison.mjs';

test('JSON signed zero compares as the same coordinate without masking other differences',()=>{
  assert.deepEqual(canonicalSavedValue({route:[{x:34,z:-0}]}),{route:[{x:34,z:0}]});
  assert.notDeepEqual(canonicalSavedValue({x:34.001,z:0}),canonicalSavedValue({x:34,z:-0}));
  assert.notDeepEqual(canonicalSavedValue({x:undefined}),canonicalSavedValue({}));
});

const result={nextId:3,groups:{5:[1,2],9:[2]},units:[
  {id:1,type:'skiff',level:2,hp:76,maxHp:116,x:80,z:-0,heading:1,aim:2,command:{type:'attack',id:'enemy'},waypoints:[{x:90,z:2}],repath:.2,cooldown:.7},
  {id:2,type:'skiff',level:1,hp:0,maxHp:85,x:60,z:3,command:{type:'escort'},waypoints:[],repath:0,cooldown:0}
]};
const harbor={nextId:3,groups:{5:[1]},units:[{...result.units[0],x:10.4,z:0,command:{type:'escort'},waypoints:[],repath:0,cooldown:0}]};
test('harbor comparison permits redeployment and sunk-member pruning while preserving the living ship',()=>{
  assert.deepEqual(harborFleetValue(harbor),harborFleetValue(result));
  assert.deepEqual(result.groups,{5:[1,2],9:[2]});assert.equal(result.units.length,2);
});
test('harbor comparison detects health, upgrade, identity, group and recruitment-counter loss',()=>{
  for(const key of ['hp','level','id','maxHp']){const changed=structuredClone(harbor);changed.units[0][key]++;assert.notDeepEqual(harborFleetValue(changed),harborFleetValue(result),key);}
  const missingGroup=structuredClone(harbor);missingGroup.groups={};assert.notDeepEqual(harborFleetValue(missingGroup),harborFleetValue(result));
  assert.notDeepEqual(harborFleetValue({...harbor,nextId:4}),harborFleetValue(result));
});
