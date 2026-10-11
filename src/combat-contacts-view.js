import {enemyStats} from './game.js';

// Current contacts are view data. Do not reveal the next unopened siege dock,
// activate a waiting enemy or change any fleet order while browsing the list.
export function battleContacts(g){
  const c=g.campaign;if(!c||g.phase!=='playing'||!['mission','operation'].includes(c.stage))return [];
  const site=g.catalog[c.objectiveIndex]?.id;
  return g.enemies.flatMap((enemy,index)=>enemy.hp>0&&!enemy.captured&&(!enemy.siteId||enemy.siteId===site||enemy.active)?[{enemy,number:index+1,stats:enemyStats(g,enemy)}]:[]);
}
const roles={raider:'지원선 추격',tender:'복구',carrier:'증원',bulwark:'방호',generator:'송전',baseCore:'지휘핵',gunTower:'포탑',nest:'고정 포대'};
export function renderBattleContacts(details,list,g){
  const contacts=battleContacts(g),focused=list.contains(document.activeElement),c=g.campaign,context=c&&g.phase==='playing'&&['mission','operation'].includes(c.stage)?[c.missionId,g.operation?.id,g.operation?.round,c.objectiveIndex].join('|'):'';
  details.hidden=!contacts.length;
  if(details.dataset.context!==context){details.open=false;details.dataset.context=context;}
  details.querySelector('summary').textContent=`현재 적 ${contacts.length}기 보기`;
  const buttons=new Map([...list.children].map(b=>[b.dataset.battleContact,b])),live=new Set(contacts.map(c=>c.enemy.id));let lostFocus=false;
  for(const [id,b]of buttons)if(!live.has(id)){if(b===document.activeElement)lostFocus=true;b.remove();}
  for(const {enemy,number,stats}of contacts){let b=buttons.get(enemy.id);if(!b){b=document.createElement('button');b.type='button';b.dataset.battleContact=enemy.id;list.append(b);}
    const hp=Math.max(0,Math.min(100,Math.ceil(enemy.hp/enemy.maxHp*100)));
    b.textContent=`${number}. ${stats.name}${roles[enemy.type]?` · ${roles[enemy.type]}`:''} · 내구 ${hp}% · ${enemy.active?'교전':'대기'}`;
    b.title='적 정보와 시점 보기 · 함대를 선택한 뒤 정보창의 집중 공격으로 지휘하세요.';
  }
  return lostFocus||focused&&details.hidden;
}
