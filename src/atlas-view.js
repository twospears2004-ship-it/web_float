import {chapters} from './campaign-content.js';
import {explorations,explorationSites} from './exploration-content.js';
import {fieldDecisions} from './expedition-content.js';
import {atlasChart,atlasSummary} from './atlas.js';
import {availableExplorations} from './frontier.js';
const stories=[
  '미라의 등대는 혼자 남은 섬을 부르는 신호였습니다. 되찾은 두 지도에는 서로 다른 필체로 같은 약속이 적혀 있습니다. 다음 사람이 건널 수 있도록 불빛을 남길 것.',
  '쇄빙선들은 가장 짧은 길 대신 가장 많은 사람을 태울 길을 골랐습니다. 얼음 아래 두 신호를 겹쳐 놓자, 그들이 마지막까지 지키려던 열린 물길이 보입니다.',
  '조선소의 기계는 전쟁을 끝내라는 명령을 받지 못했습니다. 잠긴 기록함에는 새로운 배의 도면과 작업자들의 귀환 명부가 함께 남아 있습니다.',
  '탐사선은 해초 숲을 지나 돌아오지 못했지만 표류자들은 살아남았습니다. 두 지도의 구조 좌표를 이어 놓으면 기록보다 사람을 먼저 옮긴 흔적이 나타납니다.',
  '분화구의 관측망은 파괴된 것이 아니라 마지막 구조선을 통과시키려고 꺼져 있었습니다. 다시 연결한 신호는 재 아래 작은 정박지가 남아 있음을 알려 줍니다.',
  '깃발 없는 선단은 서로 다른 항구에서 떠난 사람들이었습니다. 보급선과 잔해의 기록을 함께 보니, 그들을 묶은 것은 함장이 아니라 돌아갈 집의 좌표였습니다.',
  '기상망은 폭풍을 멈추지 못했습니다. 대신 항해자들이 피할 틈을 남겼습니다. 두 항로를 합친 기록은 다음 선단에게 위험을 견딜 장비보다 먼저 물길을 전합니다.',
  '진주의 옛 선창 아래에는 새 항구의 기초가 놓여 있습니다. 수송선이 가져온 것은 귀중한 물자가 아니라 다른 섬에서 나누어 준 흙과 씨앗이었습니다.',
  '심해의 구명등은 더 이상 구조 요청을 보내지 않습니다. 아직 건널 사람이 있을까 기다리는 표지입니다. 이제 남긴 해도가 그 불빛의 역할을 이어갑니다.',
  '성채의 옛 지도는 방어선을 그리지 않았습니다. 사람들이 오가던 길을 그렸습니다. 두 기록을 완성한 뒤에야 이 거대한 시설도 한때 섬의 집이었음을 알게 됩니다.',
  '쌍둥이 조율선은 서로의 신호가 끊길 때마다 반대편으로 돌아갔습니다. 마지막 합류 좌표에는 단 한 척을 위한 안전한 항로가 아니라 함께 돌아올 경로가 남아 있습니다.',
  '처음 떠났던 사람들의 지도와 마지막 기록이 연결되었습니다. 바다를 건넌 섬들은 하나의 큰 땅이 되지 않았습니다. 서로의 길을 알고, 다음 항해자를 기다리는 이웃이 되었습니다.',
];
function mapMarkup(sites,chart){
  const point=s=>({x:(s.x+80)*1.35+7,y:(s.z+100)*1.5+5}),known=new Set(chart.seen),surveyed=new Set(chart.surveyed);
  const edges=sites.flatMap((s,i)=>s.neighbors.filter(id=>sites.findIndex(v=>v.id===id)>i).map(id=>{const a=point(s),b=point(sites.find(v=>v.id===id));return `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" class="${known.has(s.id)&&known.has(id)?'known':''}"/>`;})).join('');
  return `<svg class="atlas-map" viewBox="0 0 230 145" role="img" aria-label="보관한 조사 지도 · 금색은 조사 완료, 빈 원은 발견한 지점"><g>${edges}</g>${sites.map(s=>{const p=point(s);return `<g class="${surveyed.has(s.id)?'surveyed':known.has(s.id)?'seen':'unknown'}"><circle cx="${p.x}" cy="${p.y}" r="8"/><text x="${p.x}" y="${p.y+3}">${known.has(s.id)?s.label:'?'}</text></g>`;}).join('')}</svg>`;
}
export function atlasMarkup(g,chapter){
  const c=g.campaign,stats=atlasSummary(c),available=new Set(availableExplorations(g).map(d=>d.id)),maps=explorations.filter(d=>d.chapter===chapter),complete=maps.every(d=>atlasChart(c,d.id).surveyed.length===8);
  return `<div class="atlas-summary" id="atlas-summary"><strong>${stats.full}/24 완성 해도</strong><span>조사 기록 ${stats.surveyed}/192</span><p>발견·조사·회수품 선택은 귀환할 때 보관됩니다. 빠진 지점을 재탐사해 해도를 완성하세요.</p></div><div class="atlas-chapter"><h3>${chapters[chapter].name}</h3><p>${complete?stories[chapter]:'두 항로의 모든 지점을 조사하면 이 해역의 항해 기록이 연결됩니다.'}</p></div>${maps.map(d=>{
    const chart=atlasChart(c,d.id),recorded=!!c.atlas?.charts[d.id]||!!c.frontier?.records[d.id],sites=explorationSites(d,recorded?chart.layoutVersion||1:2),count=Math.max(chart.surveyed.length,chart.legacySurveyed),canLaunch=c.stage==='harbor'&&!g.paused&&available.has(d.id),missing=8-count;
    return `<article class="atlas-chart" data-atlas-chart="${d.id}"><div class="atlas-chart-heading"><h3>${d.name}</h3><span>${count}/8 ${count===8?'완성':'조사'}</span></div>${mapMarkup(sites,chart)}<p class="atlas-legend">● 조사 완료 · ○ 발견 · ? 미발견</p>${chart.legacySurveyed&&chart.legacySurveyed<8?'<p class="board-help">이전 저장은 조사 수만 남아 있습니다. 필수 지점 외의 상세 위치는 다음 귀환부터 기록합니다.</p>':''}<details><summary>조사 지점과 회수품</summary><ol class="atlas-sites">${sites.map(s=>{const known=chart.seen.includes(s.id),done=chart.surveyed.includes(s.id),option=fieldDecisions[s.decision].options.find(o=>o.id===chart.choices[s.id]);return `<li><span>${s.label}</span><div><strong>${known?s.name.split(' · ')[1]:'미발견 신호'} ${done?'✓':''}</strong><small>${done?option?option.name:'보관한 조사':known?'발견 · 다음 원정에서 조사 가능':'함대나 섬으로 신호를 발견하세요.'}${s.landmark?' · 필수 기록':''}</small></div></li>`;}).join('')}</ol></details><p class="atlas-reward">${chart.fullRewarded?count===8?'해도 완성 보상 확보 · 새 항로의 기록을 찾아보세요.':'이전 귀환 보상 정산 완료 · 빠진 조사를 기록할 수 있습니다.':`해도 완성까지 ${missing}곳 · 추가 ◆ ${160+d.chapter*20} · 연구 +2`}</p><button data-atlas-launch="${d.id}" class="secondary-button" ${canLaunch?'':'disabled'}>${count===8?'이 항로 다시 탐험':count?'빠진 기록 재탐사':'이 항로 탐험'}</button></article>`;
  }).join('')}<p class="board-help">완성 해도1개/4개로 항로 측량 연구1/2단계를 엽니다. 연구하면 실제 어업장·재배장 생산량과 연구소 조사 표본이 늘어납니다.</p><p class="board-help">완성 해도2개를 보관하면5번째 해역·조선소4단계에서 방호정을 생산할 수 있습니다. 주변 아군 피해를22% 줄이지만 정원3을 쓰고 화력이 낮습니다. 함대에서 생산·개장 조건과 실제 방호 범위를 확인하세요.</p>`;
}
