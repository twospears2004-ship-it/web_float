// Authored progression and mission objectives. Time estimates are design targets,
// never wait gates and never used as evidence that a ten-hour campaign is finished.
import { expeditionSites, operationRoutes } from './expedition-content.js';
export const chapters = [
  { id: 'coral', name: '산호의 길', subtitle: '흩어진 정박지의 첫 신호', color: '#58a4aa', hazard: 'none', briefing: '밤마다 바다가 작은 섬들을 떼어 놓습니다. 서쪽 등대를 다시 켜면 흩어진 생존자들이 길을 찾을 수 있습니다.', ending: '첫 등대의 빛이 수평선을 갈랐습니다. 북쪽 얼음 바다에서 같은 신호가 돌아옵니다.', boss: '암초의 파수꾼', theme: 'coral' },
  { id: 'frost', name: '유리 해협', subtitle: '얼어붙은 항로를 열어라', color: '#85b9cf', hazard: 'frost', briefing: '유리 해협의 선단은 얼음 속에 갇혔습니다. 순찰대를 뚫고 쇄빙 신호기를 연결하세요.', ending: '얼음이 갈라지고 수송선이 움직이기 시작합니다. 그 선창에는 잊힌 증기 시설의 설계도가 있습니다.', boss: '빙하의 이빨', theme: 'ice' },
  { id: 'rust', name: '녹슨 군도', subtitle: '기계들이 지키는 잔해', color: '#ab8770', hazard: 'mines', briefing: '바다 위 조선소는 버려졌지만 포대는 여전히 움직입니다. 선체 보강 기술을 되찾아야 합니다.', ending: '조선소의 마지막 용광로가 꺼집니다. 지하 창고에서 심해의 이름이 기록된 항해일지를 찾았습니다.', boss: '철갑 감독관', theme: 'industrial' },
  { id: 'kelp', name: '해초의 미로', subtitle: '보이지 않는 추적자', color: '#6f9f7a', hazard: 'current', briefing: '수면 아래 해초 숲이 배의 엔진을 붙잡습니다. 사라진 탐사선이 남긴 표지를 따라가세요.', ending: '탐사선의 승무원들을 구했습니다. 그들이 본 것은 바다 밑을 걸어 다니는 거대한 성채였습니다.', boss: '숲의 심장', theme: 'kelp' },
  { id: 'ember', name: '불씨의 바다', subtitle: '용암과 회수선 사이', color: '#b97a62', hazard: 'eruption', briefing: '분화구의 폭발로 자원이 떠오릅니다. 회수선을 지키며 열에 견디는 장갑을 확보하세요.', ending: '분화구를 지나온 선체가 붉은 빛을 잃습니다. 붉은 함대의 깃발이 바람에 보입니다.', boss: '재의 거인', theme: 'volcanic' },
  { id: 'raider', name: '깨어진 깃발', subtitle: '흩어진 함대의 거점', color: '#7b869e', hazard: 'raids', briefing: '옛 함대의 무인 전투선이 항로를 봉쇄합니다. 기지를 하나씩 해체하고 보급망을 끊으세요.', ending: '봉쇄가 풀렸습니다. 선단이 처음으로 함께 항해합니다. 폭풍 너머에는 오래된 관측소가 있습니다.', boss: '유령 기함', theme: 'fortress' },
  { id: 'storm', name: '번개 수로', subtitle: '폭풍의 눈을 찾아서', color: '#788caf', hazard: 'storm', briefing: '관측소의 기록은 바다의 변화를 설명할 수 있습니다. 번개의 위치를 읽고 부서진 안테나를 복구하세요.', ending: '폭풍이 단순한 날씨가 아니라는 것이 드러납니다. 신호의 근원은 더 깊은 곳에 있습니다.', boss: '폭풍 전도체', theme: 'storm' },
  { id: 'pearl', name: '진주 만', subtitle: '쉬어갈 곳에도 전투는 있다', color: '#b3b993', hazard: 'tide', briefing: '생존자들은 진주 만에 새 정박지를 만들고 있습니다. 성벽을 지켜 그들이 바다로 돌아갈 시간을 버세요.', ending: '새 항구가 완성되었습니다. 첫 원정에서 구조했던 이들이 이제 새 함대를 보냅니다.', boss: '만의 포식왕', theme: 'pearl' },
  { id: 'black', name: '검은 해구', subtitle: '빛이 닿지 않는 항로', color: '#5c7185', hazard: 'fog', briefing: '깊은 바다의 포식자는 빛을 향해 모입니다. 등대를 연결하되 이곳의 수호자들을 깨우지 않도록 준비하세요.', ending: '심해의 문이 열렸습니다. 항해일지에 없던, 오래된 부유섬들이 나타납니다.', boss: '심연의 수문장', theme: 'abyss' },
  { id: 'relic', name: '침묵의 성채', subtitle: '떠도는 섬들의 기억', color: '#a49d87', hazard: 'pulse', briefing: '고대의 성채는 모든 부유섬을 하나의 해류로 묶던 장치였습니다. 무너진 방어망 사이로 핵심을 찾아가세요.', ending: '성채의 기록을 복구했습니다. 바다를 잠재울 수 있지만, 마지막 두 개의 조율기가 필요합니다.', boss: '성채의 눈', theme: 'relic' },
  { id: 'aurora', name: '오로라 외해', subtitle: '마지막 선단을 모아라', color: '#7baa9e', hazard: 'current', briefing: '수평선에 모인 선단이 마지막 항해를 기다립니다. 두 조율기를 확보해 섬들의 연결을 복원하세요.', ending: '두 조율기가 같은 리듬으로 빛납니다. 마지막 항로를 따라 바다가 시작된 곳으로 향합니다.', boss: '하늘빛 쌍둥이', theme: 'aurora' },
  { id: 'heart', name: '바다의 심장', subtitle: '집으로 돌아가는 항해', color: '#9a829f', hazard: 'maelstrom', briefing: '마지막 신호는 바다의 심장에서 옵니다. 함께 항해한 섬들의 힘으로 거대한 해류를 잠재우세요.', ending: '섬들은 더 이상 흩어지지 않습니다. 바다는 다시 길이 되고, 첫 정박지에 새로운 항해자들이 도착합니다.', boss: '영원의 해류', theme: 'heart' },
];

const definitions = [
  { kind: 'hunt', name: '항로의 포식자', verb: '추적하는 적의 무리를 제거', hint: '여러 방향에서 다가오는 적을 한쪽으로 모으세요.', waves: 3 },
  { kind: 'salvage', name: '가라앉은 기록', verb: '회수 지점을 확보하고 잔해 수색', hint: '세 회수 지점의 수비대를 제거하고 가까이 정박하세요.', waves: 3 },
  { kind: 'defend', name: '정박지의 밤', verb: '동맹 정박지를 지키며 적의 공세 격퇴', hint: '적이 섬보다 정박지를 노립니다. 앞쪽 무장의 배치를 점검하세요.', waves: 5 },
  { kind: 'siege', name: '해상 봉쇄', verb: '장거리 포대와 호위 무장을 파괴', hint: '고정 포대에 정면으로 접근하기 전에 긴 사거리 무장을 준비하세요.', waves: 4 },
  { kind: 'relay', name: '빛의 연결', verb: '신호기를 순서대로 확보', hint: '전투 후 신호기 안쪽에서 신호 복구를 시작하세요.', waves: 4 },
  { kind: 'boss', name: '수평선의 수호자', verb: '해역의 수호자를 격파', hint: '강한 공격에는 예고가 있습니다. 보호막과 긴급 수리를 아껴 두세요.', waves: 4 },
];
const adjectives = ['첫', '흰', '녹슨', '초록', '붉은', '깨어진', '울리는', '고요한', '검은', '오래된', '빛나는', '마지막'];
export const missions = chapters.flatMap((chapter, c) => definitions.map((d, i) => ({
  id: `${chapter.id}-${i + 1}`, index: c * definitions.length + i, chapter: c, order: i,
  kind: d.kind, name: operationRoutes[c][i][0], description: d.verb,
  briefing: operationRoutes[c][i][2],
  hint: d.hint, waves: d.waves + Math.floor(c / 3),
  reward: 65 + c * 12 + i * 8, research: i === 5 ? 3 : 1,
  estimatedMinutes: 5 + Math.floor(c / 2) + (i === 5 ? 4 : 0),
  hazard: c === 0 ? 'none' : chapter.hazard,
}))); // 72 chapter/goal combinations. Count does not prove play length or variety.

export const campaignRules = {
  maxLevel: 9, maxTileRadius: 3, worldLimit: 110,
  initialResources: 150, initialHull: 360, moveSpeed: 8.5,
  expansionCost: 75, expansionCostPerTile:15, expansionHull: 35, repairCost: 35, repairAmount: 130,
  production:{catchDistance:50,recoveryBase:0.2,recoveryPerLevel:0.075,recoveryMax:0.8,catchBase:10,catchPerLevel:3,catchCapBase:70,catchCapPerLevel:20,cropBase:18,cropPerLevel:6,cropObjectives:3,studyBatch:4},
  weapons: {
    cannon: { name: '연사포', icon: '↗', cost: 65, power: 1, damage: 16, range: 20, interval: 0.7, splash: 0, role: '단일', unlock: 0, description: '빠른 단일 공격 · 근거리 호위' },
    mortar: { name: '박격포', icon: '◉', cost: 100, power: 2, damage: 36, range: 25, interval: 2.1, splash: 7, pierce: 0.25, role: '범위', unlock: 0, description: '범위 공격 · 장갑 25% 관통 · 밀집한 적 제압' },
    rail: { name: '장거리 관통포', icon: '⌁', cost: 190, power: 3, damage: 84, range: 36, interval: 2.5, splash: 0, pierce: 0.8, role: '장갑', unlock: 2, description: '긴 사거리 · 적의 장갑 80% 관통' },
    frost: { name: '냉각탑', icon: '❄', cost: 150, power: 2, damage: 9, range: 22, interval: 1.1, splash: 6, slow: 0.5, role: '제어', unlock: 1, description: '범위 둔화 · 가까운 적의 접근 저지' },
    shield: { name: '방호 발생기', icon: '◇', cost: 210, power: 2, damage: 0, range: 9, interval: 1, splash: 0, role: '방어', unlock: 3, description: '배치한 쪽에서 오는 공격을 30% 경감' },
    workshop: { name: '복구 공방', icon: '✚', cost: 180, power: 2, damage: 0, range: 0, interval: 1, splash: 0, role: '복구', unlock: 4, description: '교전 밖에서 섬을 천천히 자동 수리' },
    crane: { name:'회수 크레인',icon:'⚒',cost:80,power:1,damage:0,range:22,interval:1,splash:0,role:'회수',unlock:0,description:'범위 안의 적 잔해에서 추가 자원 회수 · 강화로 회수율 증가' },
    fishery: { name:'해상 어업장',icon:'≈',cost:95,power:1,damage:0,range:0,interval:1,splash:0,role:'생산',unlock:0,description:'섬 가장자리에 배치 · 원정 항해 50m마다 어획 · 정비 중 수확' },
    farm: { name:'수경 농장',icon:'♧',cost:150,power:1,damage:0,range:0,interval:1,splash:0,role:'생산',unlock:0,description:'원정 목표 3개 확보마다 작물 생산 · 정비 중 수확 · 강화로 증산' },
    laboratory: { name:'해상 연구소',icon:'⚗',cost:180,power:1,damage:0,range:25,interval:1,splash:0,role:'연구',unlock:1,description:'범위 안에서 새로운 목표 유형 조사 · 표본 4개로 연구 자료 1개' },
    shipyard: { name:'함대 조선소',icon:'⚓',cost:120,power:1,damage:0,range:0,interval:1,splash:0,role:'함대',unlock:0,description:'요격정·포격정·잠수정·정비정 생산 · 강화로 함대 정원과 선종 해금' },
    wall: { name:'방호 성벽',icon:'▥',cost:35,power:0,damage:0,range:0,interval:1,splash:0,role:'방어',unlock:0,description:'타일의 북·동·남·서 한 면에 건설 · 같은 타일의 시설과 공존 · 기지 공세의 사격 경로 차단' },
    mine: { name:'접근 감응 기뢰',icon:'✹',cost:60,power:0,damage:90,range:6,interval:1,splash:8,pierce:0.3,role:'함정',unlock:1,description:'접근한 적 무리에 한 번 폭발 · 사용 후 정비 중 자원으로 재무장' },
  },
  enemies: {
    baseCore:{name:'지휘핵',hp:600,speed:0,damage:0,range:0,interval:1,reward:100,armor:0.2,radius:3},
    gunTower:{name:'기지 방어탑',hp:200,speed:0,damage:22,range:22,interval:1.5,reward:40,armor:0.15,radius:2.2},
    generator:{name:'동력기',hp:160,speed:0,damage:0,range:0,interval:1,reward:30,armor:0,radius:1.7,repair:1.2},
    seaWall:{name:'해상 성벽',hp:200,speed:0,damage:0,range:0,interval:1,reward:15,armor:0.45,radius:2.2},
    supplyDepot:{name:'보급 창고',hp:130,speed:0,damage:0,range:0,interval:1,reward:90,armor:0,radius:1.8},
    crawler: { name: '산호 포식자', hp: 80, speed: 3.1, damage: 9, range: 8, interval: 1.4, reward: 13, radius: 1.8, armor: 0 },
    nest: { name: '침식 포대', hp: 210, speed: 0, damage: 14, range: 31, interval: 2, reward: 23, radius: 3.3, armor: 0.55 },
    leviathan: { name: '해역 수호자', hp: 580, speed: 1.8, damage: 18, range: 10, interval: 2, reward: 70, radius: 3.5, armor: 0.4 },
    skimmer: { name: '해류 사냥꾼', hp: 48, speed: 5.8, damage: 8, range: 8, interval: 1.7, reward: 12, radius: 1.3, armor: 0 },
    armored: { name: '철갑 해수', hp: 170, speed: 1.9, damage: 16, range: 9, interval: 1.9, reward: 20, radius: 2.3, armor: 0.7 },
    spitter: { name: '독침 사수', hp: 95, speed: 2.2, damage: 11, range: 25, standoff:12, interval: 2.1, reward: 17, radius: 1.8, armor: 0 },
    bomber: { name: '폭발 해파리', hp: 55, speed: 3.6, damage: 48, range: 7, interval: 4, reward: 15, radius: 1.6, armor: 0, suicide: true },
    tender: { name: '복구 해수', hp: 100, speed: 2.3, damage: 0, range: 17, interval: 3, reward: 18, radius: 1.7, armor: 0, repair: 12 },
    bulwark: { name: '방호 해수', hp: 240, speed: 1.6, damage: 10, range: 10, interval: 2.4, reward: 24, radius: 2.5, armor: 0.5, protection: 0.35 },
    carrier: { name: '해파리 모체', hp: 290, speed: 1.2, damage: 7, range: 24, interval: 3, reward: 28, radius: 2.8, armor: 0.35, spawn: true },
  },
};

export const technologies = [
  { id: 'ballistics', name: '탄도학', description: '모든 무장 피해 +12% / 단계', cost: 2, max: 5 },
  { id: 'bulkhead', name: '격벽 보강', description: '최대 내구도 +80 · 섬·호위선 피해 -6% / 단계', cost: 2, max: 5 },
  { id: 'navigation', name: '항해 장치', description: '이동 속도 +8% / 단계', cost: 2, max: 3 },
  { id: 'logistics', name: '회수 기술', description: '적 처치 자원 +10% / 단계', cost: 2, max: 4 },
  { id: 'reactor', name: '동력 확장', description: '시설 전력 용량 +2 / 단계', cost: 2, max: 5 },
  { id:'cultivation',name:'해양 순환',description:'어업장의 어획량·원정 한도와 재배장 수확량 +20% / 단계',cost:3,max:4,unlock:5,materials:600,materialsStep:400 },
  { id:'distributed',name:'분산 전력망',description:'시설 전력 용량 +1 / 단계 · 더 높은 시설 조합을 유지',cost:4,max:3,unlock:7,materials:1500,materialsStep:1000 },
  { id:'precision',name:'정밀 회수',description:'크레인 회수율 +10%p · 회수 범위 +3m / 단계 · 회수율 상한 80%',cost:6,max:3,unlock:9,materials:1200,materialsStep:800 },
  { id:'cartography',name:'항로 측량',description:'연구소 표본 +1 · 어획·작물 생산량 +10% / 단계',cost:4,max:2,materials:350,materialsStep:200,charts:[1,4] },
];
export const abilityDefinitions = {
  barrier: { name: '비상 보호막', key: '1', duration: 6, cooldown: 35, description: '6초 동안 섬과 호위선 피해 65% 감소' },
  mend: { name: '긴급 수리', key: '2', cooldown: 50, heal: 90, description: '섬·호위선 중 내구도 비율이 낮은 쪽 +90' },
  pulse: { name: '충격 파동', key: '3', cooldown: 28, range: 24, damage: 28, description: '주변 적 피해와 4초 둔화' },
  brace: { name: '정박 방호', key: '4', duration: 3, cooldown: 8, description: '예고 중 사용 · 3초 이동 정지 · 환경 피해 85% 경감' },
};

export const getMission = id => missions.find(m => m.id === id);
export const getChapter = g => chapters[g.operation?.chapter ?? getMission(g.campaign?.missionId)?.chapter ?? g.campaign?.chapter ?? 0];
export const bossPatterns = ['slam','fan','battery','roots','eruption','broadside','storm','charge','darkness','pulse','twin','maelstrom'];
export const bossTactics = {
  slam: { attack:'암초 분쇄', hint:'정면의 단일 영역을 내려칩니다. 기동하거나 보호막을 맞춰 쓰세요.' },
  fan: { attack:'빙하 부채', hint:'좌우까지 세 영역을 얼립니다. 부채 바깥으로 이동하세요.' },
  battery: { attack:'포대 일제사격', hint:'남북으로 포격이 퍼집니다. 동서 방향으로 피하세요.' },
  roots: { attack:'뿌리 속박', hint:'맞으면 이동이 느려집니다. 예고가 끝나기 전에 영역을 벗어나세요.' },
  eruption: { attack:'화산 분출', hint:'넓은 범위를 덮칩니다. 보호막을 남기고 긴 사거리로 교전하세요.' },
  broadside: { attack:'현측 포격', hint:'좌우 세 영역을 쏩니다. 남북으로 기동하면 피하기 쉽습니다.' },
  storm: { attack:'십자 낙뢰', hint:'십자 형태 다섯 영역을 덮칩니다. 대각선의 빈틈을 찾으세요.' },
  charge: { attack:'포식 돌진', hint:'예고한 위치로 돌진합니다. 옆으로 움직이고 가까운 호위 무장을 준비하세요.' },
  darkness: { attack:'심연 장막', hint:'맞으면 무장 사거리가 줄어듭니다. 긴 사거리 무장과 보호막이 유리합니다.' },
  pulse: { attack:'성채 과부하', hint:'맞으면 무장 재사용이 늦어집니다. 예고를 피하고 수리 물자를 남기세요.' },
  twin: { attack:'쌍둥이 공명', hint:'두 수호자가 각각 공격합니다. 한쪽을 먼저 쓰러뜨려 공세를 줄이세요.' },
  maelstrom: { attack:'영원의 소용돌이', hint:'넓은 공격과 해류가 겹칩니다. 수호자에는 보호막, 환경에는 정박 방호를 쓰세요.' },
};
export const enemyTactics = {
  crawler:'접근해 물어뜯습니다. 빠른 연사포로 제압하세요.',
  skimmer:'빠르게 접근합니다. 냉각탑과 가까운 호위 무장이 효과적입니다.',
  armored:'두꺼운 장갑을 관통포로 뚫으세요.',
  nest:'고정 장거리 포대입니다. 관통포와 포대 해체로 방호망을 약화하세요.',
  spitter:'12m 안으로 접근하면 뒤로 물러나며 사격합니다. 더 빠른 요격정·섬으로 압박하거나 냉각탑과 긴 사거리 무장으로 잡으세요.',
  bomber:'가까이 오면 자폭합니다. 둔화와 집중 공격으로 접근을 막으세요.',
  tender:'같은 공세의 부상 아군을 따라가 17m 안에서 복구합니다. 지원 적 우선 공격으로 끊거나 함대로 분리하세요.',
  bulwark:'같은 공세의 복구 해수·모체 앞을 엄호하며 14m 안 아군의 피해를35% 줄입니다. 방호 해수를 집중 공격하거나 빠른 함대로 지원 적을 방호 범위 밖으로 분리하세요.',
  carrier:'폭발 해파리를 최대 3번 부릅니다. 서리포·충격 파동의 둔화 중에는 증원 준비가 멈춥니다. 준비 시간을 보고 억제하거나 지원 적 우선 공격으로 먼저 잡으세요.',
};
export function missionSites(mission, expeditionVersion = 1) {
  if (expeditionVersion === 2) return expeditionSites(mission);
  const names = mission.kind === 'salvage' ? ['회수 잔해 A', '회수 잔해 B', '회수 잔해 C'] : mission.kind === 'relay' ? ['서쪽 신호기', '북쪽 신호기', '동쪽 신호기'] : mission.kind === 'siege' ? ['방호 중계기','보급 포대','성채 핵심'] : mission.kind === 'hunt' && mission.chapter>0 ? ['서쪽 순찰 해역','먼 바다의 무리','동쪽 항로'] : [mission.name];
  const points = names.length === 1 ? [{ x: 0, z: -45 }] : [{ x: -28, z: -32 }, { x: 0, z: -62 }, { x: 30, z: -36 }];
  return names.map((name, i) => ({ id: `objective-${i}`, name, label: `${i + 1}`.padStart(2, '0'), tier: Math.min(3, Math.floor(mission.chapter / 4) + 1), danger: ['낮음', '보통', '높음'][Math.min(2, Math.floor(mission.chapter / 4))], ...points[i], reward: mission.reward, summary: mission.description, hint: mission.hint, enemies: [] }));
}
