import * as THREE from 'three';
import {tileModel} from './models.js';

// Visible decks share five bounded draw batches. The original tile groups stay
// in the view as hidden raycast colliders, retaining their precise tile/edge
// identity and the same world transforms when the island sails.
export class TileBatch {
  constructor(size,capacity=49){
    this.size=size;this.capacity=capacity;this.group=new THREE.Group();this.buckets=[];this.key='';
    const even=tileModel(0,0,size),odd=tileModel(1,0,size);
    const surface=even.children.find(mesh=>mesh.userData.tile),oddSurface=odd.children.find(mesh=>mesh.userData.tile);
    for(const part of even.children)this.add(part,part===surface?0:null);
    this.add(oddSurface,1);
    for(const template of [even,odd])template.traverse(mesh=>mesh.geometry?.dispose());
    this.matrix=new THREE.Matrix4();
  }
  add(part,parity){
    part.updateMatrix();const geometry=part.geometry.clone().applyMatrix4(part.matrix);
    const mesh=new THREE.InstancedMesh(geometry,part.material,this.capacity);
    mesh.castShadow=part.castShadow;mesh.receiveShadow=part.receiveShadow;mesh.count=0;
    this.buckets.push({mesh,parity});this.group.add(mesh);
  }
  sync(tiles){
    if(tiles.length>this.capacity)throw new Error('Island tiles exceed the bounded renderer capacity.');
    const key=tiles.map(t=>`${t.x},${t.z}`).join('|');if(key===this.key)return false;this.key=key;
    for(const {mesh,parity}of this.buckets){
      mesh.count=0;
      for(const tile of tiles){
        if(parity!==null&&Math.abs((tile.x+tile.z)%2)!==parity)continue;
        this.matrix.makeTranslation(tile.x*this.size,0,tile.z*this.size);mesh.setMatrixAt(mesh.count++,this.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();
    }
    return true;
  }
  clear(){this.key='';for(const {mesh}of this.buckets){mesh.count=0;mesh.boundingBox=null;mesh.boundingSphere=null;}}
  dispose(){for(const {mesh}of this.buckets){mesh.geometry.dispose();mesh.dispose();}this.group.removeFromParent();}
}
