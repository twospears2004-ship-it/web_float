import balance from './balance.json' with {type:'json'};

export const wallEdges={north:{name:'북쪽',dx:0,dz:-1,rotation:0},east:{name:'동쪽',dx:1,dz:0,rotation:Math.PI/2},south:{name:'남쪽',dx:0,dz:1,rotation:0},west:{name:'서쪽',dx:-1,dz:0,rotation:Math.PI/2}};
export const wallEdge=f=>f.edge ?? 'north';
// Opposite faces of adjacent tiles describe the same physical boundary.
export function wallKey(x,z,edge){
  return edge==='north'?`h:${x},${z}`:edge==='south'?`h:${x},${z+1}`:edge==='west'?`v:${x},${z}`:`v:${x+1},${z}`;
}
export function wallAt(g,x,z,edge,exclude){
  const key=wallKey(x,z,edge);
  return g.facilities.find(f=>f.type==='wall'&&f.id!==exclude&&wallKey(f.x,f.z,wallEdge(f))===key);
}
export function validWallSlot(g,x,z,edge,exclude){
  return Object.hasOwn(wallEdges,edge)&&g.tiles.some(t=>t.x===x&&t.z===z)&&!wallAt(g,x,z,edge,exclude);
}
export function structurePosition(g,f){
  const side=f.type==='wall'?wallEdges[wallEdge(f)]:null,size=balance.tileSize;
  return {x:g.island.x+f.x*size+(side?.dx || 0)*size/2,z:g.island.z+f.z*size+(side?.dz || 0)*size/2};
}
// Clip a firing segment against the actual thin wall, including corner joins.
export function wallIntersection(g,f,from,to){
  const p=structurePosition(g,f),vertical=wallEdges[wallEdge(f)].dx!==0;
  const halfX=vertical?0.18:balance.tileSize/2,halfZ=vertical?balance.tileSize/2:0.18;
  let enter=0,leave=1;
  for(const [axis,half]of [['x',halfX],['z',halfZ]]){
    const delta=to[axis]-from[axis],low=p[axis]-half,high=p[axis]+half;
    if(Math.abs(delta)<1e-10){if(from[axis]<low||from[axis]>high)return null;continue;}
    const a=(low-from[axis])/delta,b=(high-from[axis])/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave)return null;
  }
  if(leave<=0||enter>=1)return null;
  return {t:enter,x:from.x+(to.x-from.x)*enter,z:from.z+(to.z-from.z)*enter};
}
export function migrateWalls(g){
  for(const f of g.facilities)if(f.type==='wall'&&f.edge===undefined)f.edge='north';
  if(g.checkpoint)migrateWalls(g.checkpoint);
}
