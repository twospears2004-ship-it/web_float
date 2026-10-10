// Tile footprint geometry is independent of meshes and combat rules. Cached
// boundaries follow expansion/replaced save arrays, without entering save data.
import balance from './balance.json' with {type:'json'};
const footprints=new WeakMap();
export const TILE_SIZE=balance.tileSize;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function footprint(tiles) {
  const cached=footprints.get(tiles);if(cached?.count===tiles.length)return cached;
  const cells=new Set(tiles.map(t=>`${t.x},${t.z}`)),half=TILE_SIZE/2;
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x)),minZ=Math.min(...tiles.map(t=>t.z)),maxZ=Math.max(...tiles.map(t=>t.z));
  const bounds={left:minX*TILE_SIZE-half,right:maxX*TILE_SIZE+half,top:minZ*TILE_SIZE-half,bottom:maxZ*TILE_SIZE+half};
  const rectangle=(maxX-minX+1)*(maxZ-minZ+1)===tiles.length,edges=[];
  const edge=(x1,z1,x2,z2,nx,nz)=>edges.push({x1,z1,x2,z2,nx,nz});
  if(rectangle) {
    const {left:l,right:r,top:t,bottom:b}=bounds;
    edge(l,t,r,t,0,-1);edge(r,t,r,b,1,0);edge(l,b,r,b,0,1);edge(l,t,l,b,-1,0);
  } else for(const t of tiles) {
    const x=t.x*TILE_SIZE,z=t.z*TILE_SIZE;
    if(!cells.has(`${t.x},${t.z-1}`))edge(x-half,z-half,x+half,z-half,0,-1);
    if(!cells.has(`${t.x+1},${t.z}`))edge(x+half,z-half,x+half,z+half,1,0);
    if(!cells.has(`${t.x},${t.z+1}`))edge(x-half,z+half,x+half,z+half,0,1);
    if(!cells.has(`${t.x-1},${t.z}`))edge(x-half,z-half,x-half,z+half,-1,0);
  }
  const shape={count:tiles.length,cells,bounds,rectangle,edges};footprints.set(tiles,shape);return shape;
}
function nearestLocal(shape,x,z) {
  const b=shape.bounds;
  if(shape.rectangle) {
    const qx=clamp(x,b.left,b.right),qz=clamp(z,b.top,b.bottom);
    if(qx!==x || qz!==z)return {x:qx,z:qz,distance:Math.hypot(x-qx,z-qz),inside:false};
    const faces=[{x,z:b.top,d:z-b.top},{x:b.right,z,d:b.right-x},{x,z:b.bottom,d:b.bottom-z},{x:b.left,z,d:x-b.left}];
    const q=faces.reduce((a,b)=>a.d<=b.d?a:b);return {x:q.x,z:q.z,distance:-q.d,inside:true};
  }
  let best=null;
  for(const e of shape.edges) {
    const qx=clamp(x,e.x1,e.x2),qz=clamp(z,e.z1,e.z2),d=Math.hypot(x-qx,z-qz);
    if(!best || d<best.distance)best={x:qx,z:qz,distance:d};
  }
  const inside=shape.cells.has(`${Math.floor(x/TILE_SIZE+0.5)},${Math.floor(z/TILE_SIZE+0.5)}`);
  return {...best,distance:inside?-best.distance:best.distance,inside};
}
export function closestHullPoint(g,p) {
  const q=nearestLocal(footprint(g.tiles),p.x-g.island.x,p.z-g.island.z);
  return {...q,x:q.x+g.island.x,z:q.z+g.island.z};
}
export const hullDistance=(g,p)=>closestHullPoint(g,p).distance;
// Find a nearby water position whose whole collision circle clears the real
// tiles. A second face candidate handles concave corners and narrow water gaps.
export function separateFromHull(g,p,radius,accept=()=>true) {
  const shape=footprint(g.tiles),x=p.x-g.island.x,z=p.z-g.island.z;
  if(nearestLocal(shape,x,z).distance>=radius)return {x:p.x,z:p.z};
  let best=null,bestDistance=Infinity;const padding=radius+0.001;
  const consider=(cx,cz)=>{
    if(nearestLocal(shape,cx,cz).distance<radius-1e-8)return;
    const q={x:cx+g.island.x,z:cz+g.island.z};if(!accept(q))return;
    const d=(cx-x)**2+(cz-z)**2;if(d<bestDistance){best=q;bestDistance=d;}
  };
  for(const e of shape.edges) {
    const qx=clamp(x,e.x1,e.x2),qz=clamp(z,e.z1,e.z2),d=Math.hypot(x-qx,z-qz);
    if(d>0)consider(qx+(x-qx)/d*padding,qz+(z-qz)/d*padding);
    consider(qx+e.nx*padding,qz+e.nz*padding);
  }
  return best || {x:p.x,z:p.z};
}
