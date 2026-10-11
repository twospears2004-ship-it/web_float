import {structureRepairPlan} from './fortifications.js';
export function renderStructureService(button,note,g){
  const plan=structureRepairPlan(g);button.disabled=!plan.available;
  button.textContent=`전체 시설 복구 · ◆ ${plan.cost}`;
  note.textContent=`${plan.count}개 · 전력 ${plan.usedPower} → ${plan.restoredPower} / ${plan.capacity}. ${plan.reason||'개별 복구와 같은 비용이며 섬·함대 수리와 수확은 따로 진행합니다.'}`;
}
