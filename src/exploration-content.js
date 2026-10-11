import {chapters} from './campaign-content.js';
import {explorationRegions,regionLinks,explorationFormations} from './exploration-regions.js';
import {reconstructionRoutes,reconstructionLocations,reconstructionLinks} from './reconstruction-content.js';
const titles=[['등대 너머의 부표','산호 수로의 지도'],['얼음 밑의 신호','쇄빙선의 마지막 좌표'],['침수된 작업장','조선소의 잃어버린 항로'],['탐사선의 흔적','숲에 묻힌 관측망'],['재 아래의 기록','분화구의 회수 항로'],['깃발 없는 보급선','선단의 사라진 지도'],['끊어진 기상망','폭풍을 건너는 신호'],['새 항구의 터','진주의 잃어버린 선창'],['심해의 구명등','검은 해구의 기록망'],['성채의 옛 길','부유섬의 기억 지도'],['쌍둥이 조율선','오로라의 합류 항로'],['처음 떠났던 사람들','바다의 마지막 지도']];
const locations=['입구 부표','침수 기록함','순찰 수로','구명정 계류장','관측 중계기','봉쇄 포대','수송선 잔해','항로 보관소'];
const points=[[-12,-24],[-52,-37],[46,-32],[-73,-63],[0,-60],[73,-61],[-42,-87],[40,-87]];
const links=[[1,2],[0,3,4],[0,4,5],[1,6],[1,2,6,7],[2,7],[3,4,7],[4,5,6]];
export const classicExplorations=chapters.flatMap((ch,chapter)=>titles[chapter].map((name,rank)=>({id:`explore-${ch.id}-${rank+1}`,name,chapter,rank,kind:'explore',waves:8,reward:220+chapter*60+rank*90,research:2+Math.floor(chapter/4),description:'함대로 미지의 신호를 찾고 조사 순서를 선택하세요. 기록함·중계기·보관소를 조사하면 귀환할 수 있고, 모든 지점 조사에는 추가 보상이 있습니다.'})));
export const reconstructionExplorations=chapters.map((ch,chapter)=>({id:`explore-${ch.id}-3`,name:reconstructionRoutes[chapter].name,chapter,combatChapter:11,rank:2,endgame:true,kind:'explore',waves:8,reward:1000+chapter*40,research:4,description:'엔딩과 이 해역의 두 번째 탐험을 완료하면 열립니다. 재건 회랑의 강한 수비대와 지원선 추격대를 상대하고, 중계소·봉쇄 포대 조사로 다음 전투를 유리하게 만드세요.'}));
export const explorations=[...classicExplorations,...reconstructionExplorations];
export const getExploration=id=>explorations.find(d=>d.id===id);
export function explorationSites(d,layoutVersion=d.endgame?3:2){
  const rebuilt=d.endgame&&layoutVersion===3,modern=[2,3].includes(layoutVersion),region=explorationRegions[d.chapter];
  if(d.endgame&&!rebuilt||!d.endgame&&layoutVersion===3)throw new Error('탐험 지도 버전이 올바르지 않습니다.');
  const positions=rebuilt?reconstructionRoutes[d.chapter].points:modern?region.routes[d.rank]:points.map(([x,z])=>[d.rank?-x:x,z]),neighbors=rebuilt?reconstructionLinks(d.chapter):modern?regionLinks(d.chapter,d.rank):links;
  return positions.map(([x,z],i)=>{
    const formation=modern?(i===5||i===7?'battery':rebuilt?['screen','hunt','crossfire','pincer','screen','battery','hunt','battery'][(i+d.chapter%2)%8]:region.patterns[(i+d.rank*2)%8]):null,role=explorationFormations[formation];
    const roleName=!rebuilt&&formation==='crossfire'&&d.chapter<3?'좌우 수비선':!rebuilt&&formation==='swarm'&&d.chapter===0?'밀집 돌파대':role?.name;
    const roleHint=!rebuilt&&formation==='screen'&&d.chapter<3?'앞줄을 집중 공격하거나 범위 포격으로 호위 무리를 함께 제압하세요.':!rebuilt&&formation==='swarm'&&d.chapter<4?'연사포와 범위 포격으로 접근하는 무리를 빠르게 제압하세요.':role?.hint;
    return {id:`explore-node-${i}`,x,z,name:`${chapters[d.chapter].name} · ${(rebuilt?reconstructionLocations:locations)[i]}`,label:String(i+1),tier:i===7?3:2,danger:roleName||(i===5||i===7?'고정 포대':'수비대'),reward:d.reward,summary:['첫 신호로 주변 항로를 찾습니다.','기록 보존과 즉시 복구 중 선택합니다.','순찰대를 차단하고 탄약을 확보합니다.','표류자를 구하거나 구조 항로를 전송합니다.',modern?'중계기 조사로 연결된 후속 수비대의 공격 피해를20% 줄입니다.':'신호를 복구해 다음 좌표를 발견합니다.',modern?'봉쇄 포대 조사로 연결된 후속 모체의 해파리 증원을 차단합니다.':'고정 포대를 제거하고 위험 회수품을 선택합니다.','수송선 잔해의 보급품을 되찾습니다.','보관소가 마지막 조사 자료를 지킵니다.'][i],hint:`${roleHint?`${roleHint} `:''}수비대를 격파한 뒤 함선이6m 안에 접근하거나 섬의 물가를4m 안에 대세요. 조사에2초가 걸립니다.`,task:['beacon','recovery','patrol','escort','beacon','battery','ambush','guardian'][i],decision:['supplies','archive','ammunition','rescue','signal','salvage','supplies','archive'][i],waves:(rebuilt?3:2+d.rank)+(i===7?1:0),neighbors:neighbors[i].map(n=>`explore-node-${n}`),landmark:[1,4,7].includes(i),...(modern?{formation}:{})};
  });
}
export function explorationInterference(g,e){
  if(g.operation?.kind!=='explore'||![2,3].includes(g.operation.layoutVersion))return {damage:1,spawn:true};
  const connected=index=>g.sites[index]?.cleared&&g.catalog[index].neighbors.includes(e.siteId);
  return {damage:connected(4)?0.8:1,spawn:!connected(5)};
}
