// Authored sea approaches, not extra waves, health multipliers or time gates.
// Bearings are clockwise from north. Each rank has its own entry lanes.
export const defenseRegions=[
  {name:'등대 앞 수로',lanes:[[0],[35,215],[0,90,180,270]],tactics:['vanguard','skirmish','vanguard']},
  {name:'갈라진 얼음길',lanes:[[25],[90,270],[25,135,245]],tactics:['skirmish','vanguard','skirmish']},
  {name:'도크의 외벽',lanes:[[270],[315,135],[0,120,240]],tactics:['vanguard','bombard','vanguard']},
  {name:'해초의 숨은 틈',lanes:[[135],[45,225],[45,135,225,315]],tactics:['skirmish','bombard','skirmish']},
  {name:'분화구 사잇길',lanes:[[180],[70,250],[10,130,250]],tactics:['sapper','vanguard','sapper']},
  {name:'검문선의 측면',lanes:[[315],[0,180],[60,180,300]],tactics:['support','skirmish','bombard']},
  {name:'축전 부두의 사각',lanes:[[60],[120,300],[30,150,270]],tactics:['bombard','sapper','support']},
  {name:'양식장의 바깥물길',lanes:[[225],[25,205],[15,105,195,285]],tactics:['brood','skirmish','sapper']},
  {name:'검은 봉화의 뒤편',lanes:[[300],[150,330],[75,195,315]],tactics:['bombard','brood','support']},
  {name:'성채의 갈라진 입구',lanes:[[30],[60,240],[20,140,260]],tactics:['support','sapper','bombard']},
  {name:'쌍둥이 수문의 교차로',lanes:[[120],[30,210],[0,110,220]],tactics:['skirmish','support','brood']},
  {name:'마지막 등대의 둘레',lanes:[[240],[110,290],[40,130,220,310]],tactics:['brood','bombard','sapper']},
];
const tactics={
  vanguard:{name:'방호 선봉',hint:'앞줄을 관통 무장으로 뚫고 후방 복구 해수를 먼저 끊으세요.'},
  skirmish:{name:'기동 협공',hint:'빠른 적을 성벽 쪽으로 유도하고 함대를 진입로에 나누어 배치하세요.'},
  bombard:{name:'사격 지원선',hint:'사수 쪽으로 요격정을 압박하거나 장거리 무장으로 후방부터 제압하세요.'},
  sapper:{name:'폭파 돌파',hint:'폭발 해파리가 생산 시설에 닿기 전에 연사포·냉각탑·요격정으로 차단하세요.'},
  support:{name:'지원 호위망',hint:'방호 해수의 경감과 복구 해수의 회복을 먼저 끊고 철갑 선봉을 제압하세요.'},
  brood:{name:'증원 엄호',hint:'후방 모체를 우선 공격하고 새 해파리는 범위 무장으로 정리하세요.'},
};
const compass=['북','북동','동','남동','남','남서','서','북서'];
export const defenseBearing=degrees=>compass[Math.round(((degrees%360+360)%360)/45)%8];

export function defenseWavePlan(def,round) {
  const region=defenseRegions[def.chapter],requested=region.tactics[(round+def.rank)%region.tactics.length];
  const tactic=requested==='bombard'&&def.chapter<3?'vanguard':requested==='sapper'&&def.chapter<4?'skirmish':requested==='support'&&def.chapter<5?'vanguard':requested==='brood'&&def.chapter<7?'skirmish':requested;
  const bearings=region.lanes[def.rank],count=4+Math.min(8,def.chapter)+def.rank*2+round;
  // Rotate which lane leads, keeping the shown routes stable and giving the
  // player a concrete next-wave reason to move guns and surviving ships.
  const lead=round%bearings.length,lanes=bearings.map((bearing,index)=>({bearing,direction:defenseBearing(bearing),count:0,lead:index===lead}));
  const pool=['crawler',...(def.chapter>=1?['skimmer']:[]),...(def.chapter>=2?['armored']:[]),...(def.chapter>=3?['spitter']:[]),...(def.chapter>=4?['bomber']:[])];
  const enemies=[];
  for(let i=0;i<count;i++){
    const weighted=count>=lanes.length*2+2&&lanes.length>1,lane=(weighted&&i<2?lead:(i-(weighted?2:0)+lead)%lanes.length),slot=lanes[lane].count++;
    let type=pool[(i+round)%pool.length];
    if(slot<2){
      if(['vanguard','support'].includes(tactic))type=def.chapter>=2?'armored':'crawler';
      if(tactic==='skirmish')type=def.chapter>=1?'skimmer':'crawler';
      if(tactic==='bombard')type=slot===0?'crawler':'spitter';
      if(tactic==='sapper')type=slot===0?'bomber':'skimmer';
    }
    if(def.chapter>=3&&i===count-1)type='tender';
    if(def.chapter>=5&&i===count-2)type='bulwark';
    if(def.chapter>=7&&(round%2===1||tactic==='brood')&&i===count-3)type='carrier';
    const rear=['tender','carrier','spitter'].includes(type),spread=tactic==='skirmish'||tactic==='sapper'?0.22:0.11;
    const angle=bearings[lane]*Math.PI/180+(slot%3-1)*spread+Math.floor(slot/3)*0.045;
    const radius=rear?52+slot%2*3+Math.floor(slot/3):(tactic==='vanguard'||tactic==='support'?36:42)+slot%3*3+Math.floor(slot/3)*2;
    enemies.push({type,lane,x:Math.sin(angle)*radius,z:-Math.cos(angle)*radius});
  }
  const hint=def.chapter===0&&tactic==='skirmish'?'갈라지는 접근 방향에 무장과 함대를 나누거나 성벽 뒤로 적을 모으세요.':def.chapter<2&&tactic==='vanguard'?'앞줄에 성벽과 무장을 모으고 범위 포격으로 밀집한 적을 제압하세요.':def.chapter<3&&tactic==='vanguard'?'관통 무장으로 철갑 앞줄을 뚫거나 둔화와 범위 포격을 함께 사용하세요.':tactics[tactic].hint;
  return {name:region.name,tactic,title:tactics[tactic].name,hint,lanes,enemies,count};
}
