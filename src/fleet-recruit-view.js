import {unitTypes} from './fleet-content.js';
import {unitRecruitState} from './fleet.js';
export function renderRecruitment(list,g){
  for(const button of list.querySelectorAll('[data-recruit]')){
    const unit=unitTypes[button.dataset.recruit],state=unitRecruitState(g,button.dataset.recruit);button.disabled=!state.available;
    button.title=`${unit.description} · 정원 ${unit.supply} · 조선소 ${unit.yardLevel}단계 · ${unit.unlock+1}번째 해역${state.reason?` · ${state.reason}`:''}`;
    if(unit.charts){let note=button.querySelector('[data-recruit-reason]');if(!note){note=document.createElement('small');note.dataset.recruitReason='';button.querySelector('strong').parentElement.append(note);}note.textContent=`${unit.unlock+1}번째 해역 · 조선소 ${unit.yardLevel}단계 · 완성 해도 ${state.charts}개(필요 ${unit.charts}) · ${state.reason||'생산 가능'}`;}
  }
}
