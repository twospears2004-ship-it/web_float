import {chapters,campaignRules} from './campaign-content.js';

const names=[
  ['암초의 검문소','산호 동력망','갈라진 선창'],['얼음 포대','빙하 송전소','쌍둥이 쇄빙 도크'],
  ['철문을 우회하라','도크의 축전기','두 개의 조선소'],['뿌리의 방파제','숲의 발전소','탐사로의 봉쇄'],
  ['재의 성벽','냉각 회로','분화구의 두 관문'],['깃발의 요새','무인 공급망','선단의 양익'],
  ['번개 장벽','폭풍 송전망','쌍둥이 관측소'],['진주의 포대','양식장의 봉쇄망','두 항구의 해방'],
  ['심해의 철문','검은 동력핵','어둠의 양갈래'],['성채의 방파제','유적의 공급망','서쪽과 동쪽의 눈'],
  ['북극의 포대','공명의 회로','쌍둥이 조율기'],['마지막 방벽','심장의 동력망','두 신호의 해방'],
];
export const siegePatterns={
  breakwater:{name:'방벽 우회',description:'정면 성벽 뒤에 지휘핵이 있습니다. 뒤쪽의 동력기를 끊거나 성벽을 뚫고 진입하세요.'},
  grid:{name:'동력망 차단',description:'양측 동력기가 포탑 화력과 지휘핵 방호를 공급합니다. 함대를 나누어 공급망을 먼저 끊으세요.'},
  fork:{name:'양익 공략',description:'두 지휘핵을 모두 파괴해야 합니다. 분산 공격과 한쪽씩 집중 공격 중 함대에 맞는 전술을 고르세요.'},
  network:{name:'원격 송전망',description:'양쪽 외곽 동력기가 기지 전체에 전력을 보냅니다. 밝은 송전선을 따라 함대를 보내 방호와 포탑 화력을 끊으세요.'},
  citadel:{name:'세 도크 탈환',description:'세 지휘핵과 외곽 송전망을 모두 공략합니다. 성벽의 틈으로 전대를 나누거나 외곽 동력기부터 집중 공격하세요.'},
};
const standardContracts=chapters.flatMap((ch,chapter)=>names[chapter].map((name,rank)=>({
  id:`siege-${ch.id}-${rank+1}`,name,kind:'siege',chapter,rank,pattern:['breakwater','grid','fork'][rank],waves:3,
  reward:220+chapter*80+rank*100,research:1+Math.floor(chapter/4),description:siegePatterns[['breakwater','grid','fork'][rank]].description,
})));
// Each sea has a different approach and supply topology. The first sea keeps
// the original network, including the topology carried by older saved raids.
export const endgameLayouts=[
  {name:'산호의 잔존망',span:32,depth:20,docks:18,front:16,rotation:0},
  {name:'빙하의 좁은 도크',span:30,depth:26,docks:14,front:20,rotation:1},
  {name:'철문 뒤쪽의 공급선',span:36,depth:18,docks:20,front:15,rotation:2},
  {name:'뿌리 사이의 갈림길',span:32,depth:30,docks:16,front:23,rotation:3},
  {name:'분화구의 깊은 회로',span:34,depth:32,docks:18,front:18,rotation:4},
  {name:'선단의 넓은 양익',span:36,depth:24,docks:20,front:21,rotation:5},
  {name:'폭풍 속의 전진 포대',span:30,depth:18,docks:16,front:25,rotation:2},
  {name:'진주 항구의 우회로',span:34,depth:26,docks:14,front:17,rotation:4},
  {name:'심해의 후방 송전소',span:36,depth:32,docks:18,front:24,rotation:1},
  {name:'유적의 세 갈래 길',span:32,depth:24,docks:20,front:22,rotation:5},
  {name:'북극의 교차 공급선',span:34,depth:18,docks:14,front:19,rotation:3},
  {name:'심장의 최후 공급망',span:36,depth:28,docks:16,front:25,rotation:0},
];
// Post-ending contracts retain the final sea's combat tier. Existing campaigns,
// paid upgrades and 36 original contract identities are unchanged.
export const endgameSieges=chapters.flatMap((ch,chapter)=>[
  {rank:3,pattern:'network',name:`${ch.name} · 잔존 송전망`,combatRank:1},
  {rank:4,pattern:'citadel',name:`${ch.name} · 선단의 세 도크`,combatRank:2},
].map(d=>({...d,id:`siege-${ch.id}-${d.rank+1}`,kind:'siege',chapter,endgame:true,combatChapter:11,waves:3,reward:1300+d.rank*100,research:3,description:`엔딩 이후 · 심장 해역 수준. ${endgameLayouts[chapter].name}. ${chapter?'금빛·청록빛 송전선이 각 측면을 공급하고 중앙 지휘핵에는 양쪽 전력이 들어갑니다. ':''}${siegePatterns[d.pattern].description}`})));
export const siegeContracts=[...standardContracts,...endgameSieges];
export const getSiege=id=>siegeContracts.find(d=>d.id===id);
export const enemyStructureTypes=['baseCore','gunTower','generator','seaWall','supplyDepot'];
export const isEnemyStructure=type=>enemyStructureTypes.includes(type);
export const fixedEnemyRadius=e=>e.type==='nest'?3.3:isEnemyStructure(e.type)?campaignRules.enemies[e.type].radius:0;
export function siegeSites(d) {
  return [{x:-38,z:-37,angle:0},{x:38,z:-62,angle:Math.PI/2},{x:-22,z:-82,angle:Math.PI}].map((p,i)=>({
    ...p,id:`siege-base-${i}`,name:`${d.name} · ${['전초 기지','동력 기지','지휘 기지'][i]}`,label:String(i+1),tier:1+Math.floor(d.rank/2),
    danger:siegePatterns[d.pattern].name,reward:d.reward,summary:d.description,hint:'동력기: 주변 포탑 화력·지휘핵 장갑과 수리 공급. 지휘핵 파괴로 거점 확보. 보급 창고와 포탑 파괴는 추가 자원.',waves:1,task:['battery','beacon','recovery'][i],
  }));
}
export function basePower(g,e) {
  if(!['baseCore','gunTower'].includes(e.type)||e.captured)return 0;
  return g.enemies.filter(other=>generatorPowers(other,e)).length;
}
export const generatorPowers=(generator,target)=>generator.type==='generator'&&generator.hp>0&&!generator.captured&&target.hp>0&&!target.captured&&['baseCore','gunTower'].includes(target.type)&&generator.siteId===target.siteId&&(generator.powerLink===true?(generator.powerBus===undefined||target.powerBus===undefined||target.powerBus==='shared'||generator.powerBus===target.powerBus):Math.hypot(generator.x-target.x,generator.z-target.z)<=28);
export function powerConnections(g){return g.enemies.filter(e=>e.powerLink===true).flatMap(generator=>g.enemies.filter(target=>generatorPowers(generator,target)).map(target=>({generator,target})));}
export function poweredEnemyStats(g,e,stats) {
  const power=basePower(g,e);
  return power?{...stats,armor:Math.min(0.8,(stats.armor || 0)+(e.type==='baseCore'?0.4:0.1)),damage:stats.damage*(1+Math.min(2,power)*0.35),range:stats.range+(e.type==='gunTower'?3:0)}:stats;
}
export function spawnSiegeBase(g,d) {
  const site=g.catalog[g.operation.round],layout=[];
  const add=(type,x,z,powerBus)=>layout.push({type,x,z,...(powerBus?{powerBus}:{})});
  if(d.pattern==='network'||d.pattern==='citadel'){
    const p=endgameLayouts[d.chapter],split=d.chapter>0;
    if(d.pattern==='citadel'){
      for(const side of [-1,1])add('baseCore',side*p.docks,0,split?(side<0?'west':'east'):undefined);
      add('baseCore',0,-16,split?'shared':undefined);
    }else add('baseCore',0,0,split?'shared':undefined);
    for(const side of [-1,1]){const bus=split?(side<0?'west':'east'):undefined;add('generator',side*p.span,-p.depth,bus);add('gunTower',side*(p.span-2),10-p.depth,bus);add('supplyDepot',side*p.span,-p.depth-10);}
    add('gunTower',0,d.pattern==='citadel'?-p.depth-10:22,split?'shared':undefined);
    for(const x of [-8,0,8])add('seaWall',x,d.pattern==='citadel'?p.front:11);
    if(d.pattern==='citadel')for(const side of [-1,1])add('seaWall',side*(p.span-4),0);
  }else if(d.pattern==='fork') {
    for(const side of [-1,1]){add('baseCore',side*10,0);add('generator',side*14,-10);add('gunTower',side*15,10);}
  }else {
    add('baseCore',0,0);
    if(d.pattern==='grid'){for(const side of [-1,1]){add('generator',side*14,0);add('gunTower',side*8,2);}add('gunTower',0,-12);}
    else {add('generator',0,-10);add('gunTower',-12,0);add('gunTower',12,0);}
  }
  if(!d.endgame){for(const x of [-8,0,8])add('seaWall',x,11);add('supplyDepot',0,-20);}
  const combatChapter=d.combatChapter??d.chapter,combatRank=d.combatRank??d.rank;
  const guards=['crawler',combatChapter>=1?'skimmer':'crawler',...(combatChapter>=2?['armored']:[]),...(combatChapter>=3?['tender']:[]),...(combatChapter>=5?['spitter']:[]),...(combatChapter>=7?['carrier']:[])];
  const rotation=d.endgame?endgameLayouts[d.chapter].rotation:0;
  guards.forEach((_,i)=>{const type=guards[(i+rotation)%guards.length],raider=d.pattern==='citadel'&&g.operation.siegeVersion===2&&['skimmer','spitter'].includes(type);add(raider?'raider':type,(i%2?1:-1)*(18+Math.floor(i/2)*3),17-Math.floor(i/2)*5);});
  const scale=(1+combatChapter*0.7)**1.35*(1+combatRank*0.18+g.operation.round*0.12);
  return layout.map((p,i)=>{
    const stats=campaignRules.enemies[p.type],hp=Math.round(stats.hp*scale),sin=Math.sin(site.angle),cos=Math.cos(site.angle);
    return {id:`${g.operation.id}-${g.operation.round}-${i}`,siteId:site.id,type:p.type,x:site.x+p.x*cos-p.z*sin,z:site.z+p.x*sin+p.z*cos,
      hp,maxHp:hp,active:false,rewarded:false,cooldown:0,slowSeconds:0,slowFactor:1,windup:null,bossPhase:1,spawnCount:0,spawnTimer:10,...(d.endgame&&p.type==='generator'?{powerLink:true}:{}),...(p.powerBus?{powerBus:p.powerBus}:{})};
  });
}
