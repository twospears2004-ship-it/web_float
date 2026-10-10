export const fleetRules={maximum:24,baseCapacity:4,capacityPerLevel:2,serviceRange:34,repairCostPerHull:0.18,upgradeCostScale:0.8};
export const unitTypes={
  skiff:{name:'요격정',icon:'➤',cost:45,supply:1,hp:85,speed:12,range:16,damage:7,interval:0.8,pierce:0,radius:0.85,unlock:0,yardLevel:1,description:'빠른 기동과 호위 · 약한 적과 폭발물을 차단'},
  gunboat:{name:'포격정',icon:'◉',cost:100,supply:2,hp:150,speed:7,range:22,damage:17,interval:1.9,pierce:0.2,splash:4,radius:1.15,unlock:1,yardLevel:2,description:'멀리서 범위 포격 · 밀집한 수비대를 제압'},
  torpedo:{name:'잠수정',icon:'⌁',cost:140,supply:2,hp:100,speed:9.5,range:13,damage:28,interval:2.4,pierce:0.7,radius:1,unlock:2,yardLevel:3,description:'장갑 70% 관통 · 포대와 철갑 상대에 강함'},
  tender:{name:'정비정',icon:'✚',cost:110,supply:2,hp:95,speed:9,range:12,damage:0,heal:8,interval:2,radius:1,unlock:3,yardLevel:3,description:'주변 아군·섬 중 손상 비율이 큰 대상을 복구'},
};
