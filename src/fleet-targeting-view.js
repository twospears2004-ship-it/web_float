import {armedUnit,fleetTargetingModes} from './fleet-targeting.js';
export function renderFleetTargeting(select,note,g,ids){
  const units=(g.fleet?.units||[]).filter(u=>u.hp>0&&armedUnit(u)&&ids.includes(u.id)),values=new Set(units.map(u=>u.targeting||'auto'));
  select.value=values.size>1?'mixed':values.values().next().value||'auto';
  select.disabled=!units.length||g.phase!=='playing'||g.paused||!!g.campaign.pendingChoice;
  note.textContent=!units.length?'공격 함선을 선택하세요. 정비정의 수리 대상은 바꾸지 않습니다.':`${units.length}기 선택 · ${values.size>1?'서로 다른 우선순위':fleetTargetingModes[select.value].hint} 자동 사격에만 적용하며 직접 지정한 공격·예약과 호위 대상은 유지합니다.`;
}
