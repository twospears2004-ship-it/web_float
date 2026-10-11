export const fleetFormations={
  compact:{name:'밀집 이동',spacing:3},
  spread:{name:'분산 이동',spacing:12},
};
export function fleetFormationPosition(point,count,index,formation='compact'){
  const spacing=fleetFormations[formation].spacing,width=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/width);
  const halfX=(width-1)*spacing/2,halfZ=(rows-1)*spacing/2;
  // Translate the entire wide formation at a world edge, preserving its
  // spacing before the existing shore/structure avoidance chooses safe water.
  const center=formation==='spread'?{x:Math.max(-107+halfX,Math.min(107-halfX,point.x)),z:Math.max(-107+halfZ,Math.min(107-halfZ,point.z))}:point;
  return {x:center.x+(index%width-(width-1)/2)*spacing,z:center.z+(Math.floor(index/width)-(rows-1)/2)*spacing};
}
