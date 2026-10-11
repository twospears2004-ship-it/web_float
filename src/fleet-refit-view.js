import {unitRefits,fleetRules} from './fleet-content.js';
import {unitRefitState} from './fleet.js';
const number=n=>Number(n.toFixed(1));
export function refitStatsText(stats) {
  return `내구도 ${stats.hp} · 속도 ${number(stats.speed)}m/s · 사거리 ${stats.range}m · ${stats.heal?`복구 ${number(stats.heal)}`:`피해 ${number(stats.damage)} · 관통 ${Math.round((stats.pierce||0)*100)}%${stats.splash?` · 폭발 ${stats.splash}m`:''}`}`;
}
export function renderFleetRefits(card,g,u) {
  let details=card.querySelector('[data-unit-refits]');
  if(!details){
    details=document.createElement('details');details.className='unit-refits';details.dataset.unitRefits=String(u.id);details.innerHTML='<summary></summary><p class="refit-note">개장 비용은 환급하지 않습니다. 손상 비율·현재 명령을 유지하며 수리는 별도로 합니다.</p>';
    for(const [id,refit] of [['standard',{name:'표준 장비',description:'원래 선종의 기동·방호·무장'}],...Object.entries(unitRefits).filter(([,r])=>r.type===u.type)]){
      const button=document.createElement('button');button.dataset.unitRefit=String(u.id);button.dataset.refit=id;button.innerHTML=`<strong>${refit.name}</strong><small>${refit.description}</small><small data-refit-stats></small><span data-refit-status></span>`;details.append(button);
    }
    card.append(details);
  }
  const key=JSON.stringify([u.type,u.level,u.refit,u.hp>0,g.resources,g.phase,g.paused,!!g.combat,!!g.route,!!g.operation,g.operation?.waiting,!!g.campaign.pendingChoice,Math.hypot(u.x-g.island.x,u.z-g.island.z)<=fleetRules.serviceRange,Math.max(0,...g.facilities.filter(f=>f.type==='shipyard'&&f.hp!==0).map(f=>f.level)),g.campaign.chapter,g.campaign.tech.ballistics,g.campaign.tech.navigation]);
  if(details.dataset.key===key)return;details.dataset.key=key;
  details.querySelector('summary').textContent=`개장 · ${unitRefits[u.refit]?.name||'표준 장비'}`;
  for(const button of details.querySelectorAll('[data-unit-refit]')){
    const state=unitRefitState(g,u,button.dataset.refit);button.disabled=!state.available;button.setAttribute('aria-pressed',String(state.current));
    button.querySelector('[data-refit-stats]').textContent=`현재: ${refitStatsText(state.stats)} → 개장: ${refitStatsText(state.next)}`;
    button.querySelector('[data-refit-status]').textContent=state.current?'현재 장비':`◆ ${state.cost} · ${state.reason||'개장 가능'}`;
  }
}
