import {unitStats} from './fleet.js';
import {hullDistance} from './hull.js';
export function fleetProtector(g,target){
  if(!g.campaign)return null;
  let cover=null;
  for(const unit of g.fleet?.units||[]){
    if(unit.type!=='ward'||unit.hp<=0||unit===target)continue;
    const stats=unitStats(g,unit),distance=target===g.island?hullDistance(g,unit):Math.hypot(unit.x-target.x,unit.z-target.z);
    if(distance<=stats.shieldRange&&(!cover||stats.protection>cover.protection||stats.protection===cover.protection&&unit.id<cover.unit.id))cover={unit,protection:stats.protection,range:stats.shieldRange};
  }
  return cover;
}
