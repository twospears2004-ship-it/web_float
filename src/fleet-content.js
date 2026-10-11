export const fleetRules={maximum:24,baseCapacity:4,capacityPerLevel:2,serviceRange:34,repairCostPerHull:0.18,upgradeCostScale:0.8,maximumQueuedOrders:8};
export const unitTypes={
  skiff:{name:'요격정',icon:'➤',cost:45,supply:1,hp:85,speed:12,range:16,damage:7,interval:0.8,pierce:0,radius:0.85,unlock:0,yardLevel:1,description:'빠른 기동과 호위 · 약한 적과 폭발물을 차단'},
  gunboat:{name:'포격정',icon:'◉',cost:100,supply:2,hp:150,speed:7,range:22,damage:17,interval:1.9,pierce:0.2,splash:4,radius:1.15,unlock:1,yardLevel:2,description:'멀리서 범위 포격 · 밀집한 수비대를 제압'},
  torpedo:{name:'잠수정',icon:'⌁',cost:140,supply:2,hp:100,speed:9.5,range:13,damage:28,interval:2.4,pierce:0.7,radius:1,unlock:2,yardLevel:3,description:'장갑 70% 관통 · 포대와 철갑 상대에 강함'},
  tender:{name:'정비정',icon:'✚',cost:110,supply:2,hp:95,speed:9,range:12,damage:0,heal:8,interval:2,radius:1,unlock:3,yardLevel:3,description:'주변 아군·섬 중 손상 비율이 큰 대상을 복구'},
};
// Optional, paid role choices. The standard equipment and all earlier saves
// retain their original stats; every refit exchanges a strength for a weakness.
export const unitRefits={
  scout:{type:'skiff',name:'수색 추진기',unlock:4,level:3,speed:1.25,hp:0.9,range:-3,description:'속도 +25% · 내구도 -10% · 사거리 -3m'},
  screen:{type:'skiff',name:'호위 격벽',unlock:8,level:5,hp:1.25,speed:0.88,damage:0.9,description:'내구도 +25% · 속도 -12% · 피해 -10%'},
  artillery:{type:'gunboat',name:'장거리 탄도',unlock:4,level:3,range:5,damage:0.82,speed:0.9,description:'사거리 +5m · 피해 -18% · 속도 -10%'},
  barrage:{type:'gunboat',name:'집속 포격',unlock:8,level:5,splash:2,damage:1.15,range:-4,speed:0.9,description:'폭발 반경 +2m · 피해 +15% · 사거리 -4m · 속도 -10%'},
  penetrator:{type:'torpedo',name:'철갑 탄두',unlock:4,level:3,pierce:0.2,damage:0.88,range:-2,description:'장갑 관통 +20%p · 피해 -12% · 사거리 -2m'},
  evasion:{type:'torpedo',name:'회피 추진기',unlock:8,level:5,speed:1.2,hp:0.85,damage:0.9,description:'속도 +20% · 내구도 -15% · 피해 -10%'},
  remote:{type:'tender',name:'원격 수리',unlock:4,level:3,range:5,heal:0.8,speed:0.9,description:'수리 범위 +5m · 회당 복구 -20% · 속도 -10%'},
  intensive:{type:'tender',name:'집중 정비',unlock:8,level:5,heal:1.25,range:-3,hp:0.9,description:'회당 복구 +25% · 수리 범위 -3m · 내구도 -10%'},
};
