import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TileBatch} from '../src/tile-batch.js';
import {tileModel} from '../src/models.js';
import {balance} from '../src/game.js';

const square=radius=>Array.from({length:(radius*2+1)**2},(_,i)=>({x:i%(radius*2+1)-radius,z:Math.floor(i/(radius*2+1))-radius}));
const triangles=group=>{let total=0;group.traverse(mesh=>{if(mesh.isMesh)total+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);});return total;};
test('five tile batches preserve triangles, parity and bounds from one through 49 tiles',()=>{
  const batch=new TileBatch(balance.tileSize);
  for(const tiles of [[{x:0,z:0}],square(1),square(3)]){
    const original=new THREE.Group();tiles.forEach(t=>original.add(tileModel(t.x,t.z,balance.tileSize)));batch.sync(tiles);
    assert.equal(triangles(batch.group),triangles(original));assert.equal(batch.group.children.length,5);
    const expected=new THREE.Box3().setFromObject(original,true),actual=new THREE.Box3().setFromObject(batch.group,true);
    assert.ok(expected.min.distanceTo(actual.min)<1e-5);assert.ok(expected.max.distanceTo(actual.max)<1e-5);
    const even=tiles.filter(t=>Math.abs((t.x+t.z)%2)===0).length;
    assert.equal(batch.buckets.find(b=>b.parity===0).mesh.count,even);assert.equal(batch.buckets.find(b=>b.parity===1).mesh.count,tiles.length-even);
    original.traverse(mesh=>mesh.geometry?.dispose());
  }
  batch.dispose();
});
test('hidden original tile colliders still identify every tile after island movement',()=>{
  const island=new THREE.Group(),tiles=square(3),colliders=tiles.map(t=>{const g=tileModel(t.x,t.z,balance.tileSize);g.visible=false;island.add(g);return g;});
  island.position.set(73,.12,-25);island.updateMatrixWorld(true);
  for(const t of tiles){
    const ray=new THREE.Raycaster(new THREE.Vector3(73+t.x*balance.tileSize,10,-25+t.z*balance.tileSize),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(colliders,true).find(hit=>hit.object.userData.tile);
    assert.deepEqual(hit?.object.userData.tile,t);assert.ok(Math.abs(hit.point.y-(.12+.3+.23/2))<1e-6);
  }
  island.traverse(mesh=>mesh.geometry?.dispose());
});
test('expansion, reset and smaller imports reuse bounded tile buffers and reject overflow',()=>{
  const batch=new TileBatch(balance.tileSize),geometries=batch.buckets.map(b=>b.mesh.geometry),buffers=batch.buckets.map(b=>b.mesh.instanceMatrix.array);
  batch.sync(square(3));assert.equal(batch.sync(square(3)),false);batch.clear();assert(batch.buckets.every(b=>b.mesh.count===0));
  batch.sync(square(1));for(const [i,bucket]of batch.buckets.entries()){assert.equal(bucket.mesh.geometry,geometries[i]);assert.equal(bucket.mesh.instanceMatrix.array,buffers[i]);}
  assert.equal(batch.buckets.filter(b=>b.parity===null).reduce((sum,b)=>sum+b.mesh.count,0),27);
  assert.throws(()=>batch.sync(square(4)),/capacity/);batch.dispose();
});
