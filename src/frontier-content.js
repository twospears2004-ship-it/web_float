import {chapters} from './campaign-content.js';
import {siegeContracts,getSiege,siegeSites} from './siege-content.js';
import {explorations,getExploration,explorationSites} from './exploration-content.js';
const names=[['등대 방벽','산호 수문','첫 항구의 공세'],['얼음 방파제','쇄빙 선창','균열의 협공'],['철의 창고','도크의 봉쇄','기계 함대의 밤'],['숲의 계류장','뿌리 방어선','탐사대의 귀환'],['재의 부두','냉각 저장고','분화구의 공성'],['흩어진 선단','무인 검문소','깃발 없는 협공'],['번개 방벽','축전 부두','폭풍의 장벽'],['진주 양식장','생존자의 성벽','항구의 마지막 밤'],['심해의 닻','검은 봉화','어둠의 포위'],['관측 방벽','성채 외곽','유적의 반격'],['북쪽 계류장','쌍둥이 수문','선단의 방패'],['마지막 등대','심장의 방벽','연결된 섬들의 밤']];
export const defensePatterns={
  spear:{name:'집중 돌파',description:'한 방향의 철갑 선봉과 빠른 후속대를 집중 방어하세요.'},
  pincer:{name:'양면 협공',description:'반대편 두 진입로에서 공격합니다. 성벽과 함대를 나누세요.'},
  ring:{name:'포위 공세',description:'사방에서 생산 시설을 노립니다. 지원 적을 먼저 끊으세요.'},
};
export const defenseContracts=chapters.flatMap((ch,chapter)=>names[chapter].map((name,rank)=>({id:`defense-${ch.id}-${rank+1}`,name,kind:'defense',chapter,rank,pattern:['spear','pincer','ring'][rank],waves:4+rank+Math.floor(chapter/4),reward:120+chapter*60+rank*80,research:1+Math.floor(chapter/4),description:defensePatterns[['spear','pincer','ring'][rank]].description})));
export const getDefense=id=>defenseContracts.find(d=>d.id===id);
export const frontierOperations=[...defenseContracts,...siegeContracts,...explorations];
export const getOperation=id=>getDefense(id)||getSiege(id)||getExploration(id);
export function operationSites(id,layoutVersion) {
  const d=getOperation(id);if(d?.kind==='explore')return explorationSites(d,layoutVersion??(d.endgame?3:1));if(d?.kind==='siege')return siegeSites(d);return d?[{id:'defense-base',x:0,z:0,name:d.name,label:'⚑',tier:1+Math.floor(d.rank/2),danger:defensePatterns[d.pattern].name,reward:d.reward,summary:d.description,hint:'시설에 개별 내구도가 있습니다. 공세 사이에 성벽·함정·함대를 정비하고 다음 공격을 시작하세요.',waves:d.waves,task:'defense'}]:[];
}
