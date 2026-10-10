import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {tileModel,facilityModel} from '../src/models.js';
const old=JSON.parse(fs.readFileSync(new URL('./fixtures/render-model-baseline.json',import.meta.url))).models;
function profile(g){g.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(g),triangles={};let meshes=0;g.traverse(n=>{if(n.isMesh){meshes++;const count=(n.geometry.index?.count||n.geometry.attributes.position.count)/3,key=n.material.color.getHexString();triangles[key]=(triangles[key]||0)+count;}});return {min:box.min.toArray(),max:box.max.toArray(),triangles,meshes};}
function unchanged(current,expected){for(const key of ['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(current[key][i]-expected[key][i])<1e-5,`${key}[${i}] changed`);assert.deepEqual(current.triangles,expected.triangles);}
test('batched tile corners keep the original shape, material triangles and tile picking',()=>{
  const tile=tileModel(-3,2,3.4),p=profile(tile);unchanged(p,old.tile);assert.ok(p.meshes<old.tile.meshes);
  for(const [dx,dz] of [[0,0],[1.42,1.42],[-1.42,-1.42]]){const ray=new THREE.Raycaster(new THREE.Vector3(-10.2+dx,10,6.8+dz),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(tile,true).find(h=>h.object.userData.tile);assert.deepEqual(hit.object.userData.tile,{x:-3,z:2});}
});
test('batched wall and level decorations preserve every original material triangle and dimension',()=>{
  for(const type of ['wall','cannon','farm','crane','laboratory'])for(const level of [1,5,9]){const p=profile(facilityModel(type,level)),expected=old[`${type}-${level}`];unchanged(p,expected);if(type==='wall'||level>1)assert.ok(p.meshes<expected.meshes);}
});
test('crop plants, cargo and rotating turret remain separate live model objects',()=>{
  for(const type of ['farm','crane','laboratory']){const g=facilityModel(type,9),objects=new Set();g.traverse(n=>objects.add(n));assert.ok(objects.has(g.userData.turret));for(const plant of g.userData.cropPlants||[])assert.ok(objects.has(plant));if(g.userData.cargo)assert.ok(objects.has(g.userData.cargo));}
});
