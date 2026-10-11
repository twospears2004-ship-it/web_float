// Two surveyed routes per sea. Node identities keep their recorded meaning;
// coordinates and additional connections create different approaches.
export const explorationRegions=[
  {name:'산호 갈림길',routes:[[[0,-24],[-36,-38],[40,-30],[-62,-60],[-12,-60],[65,-54],[-44,-88],[24,-92]],[[12,-26],[-44,-30],[38,-48],[-70,-54],[0,-70],[70,-72],[-32,-88],[34,-92]]],shortcuts:[[[2,4],[4,6],[5,7]],[[2,3],[4,5],[6,7]]],patterns:['screen','screen','pincer','swarm','crossfire','battery','pincer','battery']},
  {name:'쇄빙 우회로',routes:[[[-12,-24],[-48,-28],[32,-46],[-68,-58],[-28,-64],[64,-58],[-58,-90],[10,-92]],[[0,-24],[-30,-46],[50,-28],[-64,-72],[8,-64],[72,-54],[-34,-94],[42,-90]]],shortcuts:[[[2,4],[3,4],[6,7]],[[1,5],[4,6],[5,7]]],patterns:['pincer','screen','swarm','crossfire','screen','battery','pincer','battery']},
  {name:'침수 도크',routes:[[[8,-24],[-42,-38],[50,-42],[-70,-62],[0,-58],[72,-72],[-40,-94],[28,-88]],[[0,-26],[-56,-28],[34,-36],[-72,-64],[-16,-72],[66,-58],[-48,-92],[34,-94]]],shortcuts:[[[2,4],[4,5],[6,7]],[[2,6],[3,4],[5,7]]],patterns:['screen','battery','pincer','screen','crossfire','battery','swarm','battery']},
  {name:'해초의 굽이',routes:[[[-8,-24],[-50,-42],[32,-30],[-68,-76],[-12,-66],[68,-52],[-42,-96],[24,-92]],[[14,-24],[-34,-30],[54,-48],[-70,-54],[0,-60],[70,-78],[-48,-90],[32,-94]]],shortcuts:[[[2,3],[4,6],[5,7]],[[2,4],[3,5],[6,7]]],patterns:['pincer','screen','crossfire','swarm','screen','battery','crossfire','battery']},
  {name:'분화구 양안',routes:[[[0,-24],[-44,-32],[46,-32],[-72,-58],[0,-58],[72,-64],[-40,-90],[38,-94]],[[10,-24],[-50,-44],[50,-28],[-72,-76],[-12,-70],[72,-52],[-42,-96],[32,-92]]],shortcuts:[[[2,4],[3,4],[5,7]],[[1,5],[4,6],[6,7]]],patterns:['swarm','crossfire','pincer','swarm','screen','battery','pincer','battery']},
  {name:'갈라진 검문선',routes:[[[-14,-24],[-46,-40],[34,-34],[-70,-66],[-4,-62],[64,-66],[-42,-94],[32,-94]],[[8,-26],[-32,-32],[52,-44],[-66,-60],[6,-70],[72,-72],[-34,-92],[42,-96]]],shortcuts:[[[2,6],[4,5],[5,7]],[[2,4],[3,4],[6,7]]],patterns:['pincer','crossfire','screen','swarm','crossfire','battery','screen','battery']},
  {name:'폭풍의 빈틈',routes:[[[0,-24],[-38,-44],[48,-30],[-68,-72],[-8,-68],[72,-54],[-42,-96],[30,-90]],[[12,-26],[-54,-28],[34,-46],[-72,-56],[0,-60],[64,-78],[-48,-90],[24,-94]]],shortcuts:[[[1,5],[4,6],[6,7]],[[2,4],[3,5],[5,7]]],patterns:['crossfire','pincer','swarm','screen','crossfire','battery','pincer','battery']},
  {name:'항구의 바깥길',routes:[[[-8,-24],[-48,-34],[42,-40],[-72,-62],[0,-64],[68,-68],[-40,-92],[34,-94]],[[8,-24],[-34,-46],[56,-28],[-62,-74],[-8,-70],[72,-54],[-32,-96],[42,-92]]],shortcuts:[[[2,4],[3,4],[4,5]],[[2,6],[4,5],[6,7]]],patterns:['screen','swarm','crossfire','pincer','screen','battery','swarm','battery']},
  {name:'심해의 연결등',routes:[[[0,-24],[-52,-30],[36,-46],[-72,-58],[-12,-68],[66,-72],[-48,-94],[28,-96]],[[14,-24],[-40,-40],[52,-30],[-70,-74],[0,-62],[72,-62],[-34,-96],[38,-92]]],shortcuts:[[[2,3],[4,6],[5,7]],[[1,5],[3,4],[6,7]]],patterns:['crossfire','screen','pincer','swarm','crossfire','battery','screen','battery']},
  {name:'성채의 회랑',routes:[[[-10,-24],[-40,-42],[44,-32],[-68,-68],[8,-66],[72,-58],[-38,-94],[38,-96]],[[8,-24],[-56,-28],[32,-44],[-72,-60],[-10,-72],[68,-76],[-48,-94],[28,-96]]],shortcuts:[[[2,4],[3,5],[6,7]],[[2,6],[3,4],[5,7]]],patterns:['screen','crossfire','screen','pincer','crossfire','battery','swarm','battery']},
  {name:'쌍둥이 합류점',routes:[[[0,-24],[-48,-38],[48,-38],[-72,-66],[0,-66],[72,-66],[-36,-96],[36,-96]],[[12,-26],[-34,-42],[54,-30],[-64,-72],[-8,-64],[72,-58],[-28,-96],[44,-94]]],shortcuts:[[[2,4],[4,5],[6,7]],[[1,5],[4,6],[5,7]]],patterns:['pincer','screen','crossfire','swarm','screen','battery','crossfire','battery']},
  {name:'귀환의 갈림길',routes:[[[-12,-24],[-42,-34],[38,-46],[-70,-60],[-8,-66],[66,-76],[-44,-92],[26,-96]],[[0,-24],[-54,-40],[48,-30],[-72,-72],[8,-60],[72,-60],[-36,-96],[42,-92]]],shortcuts:[[[2,6],[3,4],[5,7]],[[2,3],[4,5],[6,7]]],patterns:['swarm','crossfire','screen','pincer','crossfire','battery','screen','battery']},
];
const trunk=[[0,1],[0,2],[1,3],[1,4],[2,5],[3,6],[4,7],[5,7]];
export function regionLinks(chapter,rank){
  const links=Array.from({length:8},()=>[]);
  for(const [a,b] of [...trunk,...explorationRegions[chapter].shortcuts[rank]])if(!links[a].includes(b)){links[a].push(b);links[b].push(a);}
  return links;
}
export const explorationFormations={
  hunt:{name:'지원선 추격대',hint:'측면 추적자는24m 안의 정비정·방호정을 노립니다. 지원선을 전투선 뒤에 두고 냉각·요격으로 추격을 끊으세요.'},
  screen:{name:'방호 선봉',hint:'철갑 선봉 뒤의 복구 해수를 끊거나 관통포로 앞줄을 뚫으세요.'},
  crossfire:{name:'좌우 사격선',hint:'양쪽 사격선을 동시에 깨우지 않고 한쪽씩 압박하거나 긴 사거리로 제압하세요.'},
  pincer:{name:'갈라진 추격대',hint:'두 접근 방향에 함대를 나누거나 섬 뒤로 모아 범위 무장으로 제압하세요.'},
  swarm:{name:'고속 돌파대',hint:'빠른 접근과 폭발 해파리에 냉각탑·연사포·범위 포격을 준비하세요.'},
  battery:{name:'포대 호위망',hint:'고정 포대를 긴 사거리로 해체하고 후방의 지원 적을 따로 제압하세요.'},
};
