// Inspection links are temporary view controls, never commands or save data.
export function renderCombatLinks(details,list,contact){
  const links=contact?.powerLinks||[],focused=list.contains(document.activeElement);
  details.hidden=!links.length;
  const key=contact?.enemy.id||'';
  if(details.dataset.contact!==key){details.open=false;details.dataset.contact=key;}
  if(!links.length){details.open=false;list.replaceChildren();return focused;}
  const providers=contact.enemy.type!=='generator';
  details.querySelector('summary').textContent=`${providers?'공급 동력기':'송전받는 기지'} ${links.length}${providers?'곳':'기'} 보기`;
  const buttons=new Map([...list.children].map(b=>[b.dataset.contactLink,b])),live=new Set(links.map(e=>e.id));
  let removedFocused=false;for(const [id,b]of buttons)if(!live.has(id)){if(b===document.activeElement)removedFocused=true;b.remove();}
  const counts={};for(const e of links){let b=buttons.get(e.id);if(!b){b=document.createElement('button');b.type='button';b.dataset.contactLink=e.id;list.append(b);}const ordinal=counts[e.type]=(counts[e.type]||0)+1,name={generator:'동력기',baseCore:'지휘핵',gunTower:'방어탑'}[e.type],bus=e.powerBus==='west'?'금빛 회선':e.powerBus==='east'?'청록 회선':e.powerBus==='shared'?'공유 회선':'',meters=Math.round(Math.hypot(e.x-contact.enemy.x,e.z-contact.enemy.z));
    b.textContent=`${name} ${ordinal}${bus?` · ${bus}`:''} · ${meters}m`;b.title='연결된 적의 정보와 시점 보기 · 함대 명령은 유지됩니다.';
  }
  return removedFocused;
}
