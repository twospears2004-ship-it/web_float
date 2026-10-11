import {technologies} from './campaign-content.js';
import {researchStatus} from './campaign.js';
import {coolingStats} from './field-control.js';

export function researchEffect(id,level) {
  switch(id){
    case 'ballistics':return `무장 피해 +${level*12}%`;
    case 'bulkhead':return `최대 내구 +${level*80} · 피해 감소 ${level*6}%`;
    case 'navigation':return `섬 이동 속도 +${level*8}%`;
    case 'logistics':return `처치 자원 +${level*10}%`;
    case 'reactor':return `전력 용량 +${level*2}`;
    case 'distributed':return `전력 용량 +${level}`;
    case 'cultivation':return `어획·작물 생산량 +${level*20}%`;
    case 'precision':return `크레인 회수율 +${level*10}%p · 범위 +${level*3}m (회수율 상한 80%)`;
    case 'cartography':return `연구소 표본 +${level} · 어획·작물 생산량 +${level*10}%`;
    case 'cryodynamics':{const control=coolingStats(level);return `냉각 폭발 ${control.frostSplash}m · 둔화 ${Math.round((1-control.frostSlow)*100)}% · 파동 ${control.pulseRange}m`;}
    default:return '';
  }
}
export function renderResearch(list,g,charts) {
  for(const tech of technologies){
    let button=list.querySelector(`[data-research="${tech.id}"]`);
    if(!button){
      button=document.createElement('button');button.dataset.research=tech.id;button.className='research-card';
      button.innerHTML='<strong></strong><small class="research-description"></small><small class="research-effect"></small><b></b><small class="research-reason"></small>';
      list.append(button);
    }
    const state=researchStatus(g,tech,charts),current=researchEffect(tech.id,state.level),next=researchEffect(tech.id,state.level+1);
    button.disabled=!state.available;
    button.querySelector('strong').textContent=`${tech.name} ${state.level}/${tech.max}`;
    button.querySelector('.research-description').textContent=tech.description;
    button.querySelector('.research-effect').textContent=`연구 효과 · 현재 ${current}${state.level<tech.max?` → 다음 ${next}`:''}`;
    button.querySelector('b').textContent=state.level>=tech.max?'완료':`자료 ${state.cost.points}${state.cost.materials?` · 자원 ${state.cost.materials}`:''}`;
    button.querySelector('.research-reason').textContent=state.reason||'연구 가능';
  }
}
