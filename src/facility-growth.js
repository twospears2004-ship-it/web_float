import {weaponStats,upgradeStatus} from './game.js';
import {productionStats} from './production.js';
import {structureHull} from './fortifications.js';
import {fleetCapacity} from './fleet.js';
import {unitTypes} from './fleet-content.js';
const number=value=>String(Math.round(value*10)/10);

// Use the same rules and all currently active modifiers as the real facility.
// Reading a preview never modifies its paid level, health, power or inventory.
export function facilityEffect(g,f) {
  const w=weaponStats(f,g),p=productionStats(f,g);
  if(g.campaign){
    switch(f.type){
      case 'wall':return `최대 내구도 ${structureHull(f)}`;
      case 'shield':return `방호 ${30+(f.level-1)*4}% · 범위 ${number(w.range)}m`;
      case 'workshop':return `교전 밖 섬 수리 ${f.level*2}/초`;
      case 'crane':return `추가 회수 ${number(p.recovery*100)}% · 범위 ${number(p.range)}m`;
      case 'fishery':return `어획 ${p.catchValue}/50m · 원정 한도 ${p.catchCap}`;
      case 'farm':return `목표 3개당 작물 ${p.cropValue}`;
      case 'laboratory':return `유형당 ${p.samples}표본 · 범위 ${number(p.range)}m`;
      case 'shipyard':{
        const ship=f.id,facilities=g.facilities.map(other=>other.id===ship?f:other),yard=Math.max(...facilities.filter(other=>other.type==='shipyard'&&other.hp!==0).map(other=>other.level),0);
        return `함대 정원 ${fleetCapacity({...g,facilities})} · 생산 선종 ${Object.values(unitTypes).filter(u=>u.unlock<=g.campaign.chapter&&u.yardLevel<=yard).length}종`;
      }
    }
  }
  return `피해 ${number(w.damage)} · 범위 ${number(w.range)}m${w.splash?` · 폭발 ${number(w.splash)}m`:''}${w.slow?` · 둔화 ${Math.round((1-w.slow)*100)}%`:''}`;
}
export function facilityGrowth(g,f) {
  const state=upgradeStatus(g,f.id),current=facilityEffect(g,f);
  const next=f.level<state.maximum?facilityEffect(g,{...f,level:state.nextLevel}):null;
  return {...state,current,next};
}
