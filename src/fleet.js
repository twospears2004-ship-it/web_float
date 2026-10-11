import {fleetRules,unitTypes,unitRefits} from './fleet-content.js';
import {waterPoint,waterPath,navigable,clearLine} from './navigation.js';
import {hullDistance} from './hull.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),emit=(g,e)=>{g.events.push(e);if(g.events.length>180)g.events.shift();};
export const emptyFleet=()=>({version:1,nextId:1,units:[]});
export const controlGroupNumbers=[5,6,7,8,9];
export function controlGroupUnits(g,number) {
  if(!controlGroupNumbers.includes(number))return [];
  const living=new Set((g.fleet?.units||[]).filter(u=>u.hp>0).map(u=>u.id));
  return (g.fleet?.groups?.[number]||[]).filter(id=>living.has(id));
}
export function assignControlGroup(g,number,ids,append=false) {
  if(!g.campaign||!g.fleet||g.phase!=='playing'||g.paused||g.campaign.pendingChoice||!controlGroupNumbers.includes(number)||!Array.isArray(ids))return false;
  const living=new Set(g.fleet.units.filter(u=>u.hp>0).map(u=>u.id));
  const members=[...new Set([...(append?controlGroupUnits(g,number):[]),...ids.filter(id=>living.has(id))])];
  if(!members.length&&!g.fleet.groups?.[number])return false;
  g.fleet.groups||={};if(members.length)g.fleet.groups[number]=members;else delete g.fleet.groups[number];
  g.message=members.length?`전대 ${number}: 함대 ${members.length}기를 등록했습니다.`:`전대 ${number}의 편성을 비웠습니다.`;
  return true;
}
function pruneControlGroups(fleet) {
  if(!fleet.groups)return;
  const present=new Set(fleet.units.map(u=>u.id));
  for(const number of controlGroupNumbers)if(fleet.groups[number]){
    fleet.groups[number]=fleet.groups[number].filter(id=>present.has(id));
    if(!fleet.groups[number].length)delete fleet.groups[number];
  }
}
export function unitStats(g,u) {
  const base=unitTypes[u.type],level=u.level || 1,damage=(1+(level-1)*0.3)*(1+(g.campaign?.tech.ballistics || 0)*0.12);
  const stats={...base,hp:Math.round(base.hp*(1+(level-1)*0.3)),damage:base.damage*damage,heal:base.heal?base.heal*(1+(level-1)*0.2):0,range:base.range+(level-1),speed:base.speed*(1+(g.campaign?.tech.navigation || 0)*0.04)},refit=unitRefits[u.refit];
  if(!refit||refit.type!==u.type)return stats;
  return {...stats,hp:Math.round(stats.hp*(refit.hp||1)),damage:stats.damage*(refit.damage||1),heal:stats.heal*(refit.heal||1),range:stats.range+(refit.range||0),speed:stats.speed*(refit.speed||1),pierce:Math.min(1,(stats.pierce||0)+(refit.pierce||0)),splash:(stats.splash||0)+(refit.splash||0)};
}
export function fleetCapacity(g) {const yard=Math.max(0,...g.facilities.filter(f=>f.type==='shipyard'&&f.hp!==0).map(f=>f.level));return yard?Math.min(fleetRules.maximum,fleetRules.baseCapacity+yard*fleetRules.capacityPerLevel):0;}
export function fleetSupply(g) {return (g.fleet?.units || []).filter(u=>u.hp>0).reduce((n,u)=>n+unitTypes[u.type].supply,0);}
const manageable=g=>g.campaign&&g.phase==='playing'&&!g.paused&&!g.combat&&!g.route&&(!g.operation||g.operation.waiting);
const deny=(g,message)=>{g.message=message;return false;};
function anchor(g,index,count,occupied=[]) {
  const radius=Math.max(...g.tiles.map(t=>Math.max(Math.abs(t.x),Math.abs(t.z))))*3.4+7,angle=(index+0.5)*Math.PI*2/Math.max(1,count);
  return waterPoint(g,{x:g.island.x+Math.sin(angle)*radius,z:g.island.z+Math.cos(angle)*radius},1.2,occupied);
}
export function recruitUnit(g,type) {
  const stats=unitTypes[type],yard=g.facilities.filter(f=>f.type==='shipyard'&&f.hp!==0).sort((a,b)=>b.level-a.level)[0];
  if(!manageable(g))return deny(g,'함대 생산은 항해·교전이 끝난 정비 중 가능합니다.');
  if(!stats||!yard||yard.level<stats.yardLevel||g.campaign.chapter<stats.unlock)return deny(g,'조선소 단계와 해역 설계도를 확인하세요.');
  if(fleetSupply(g)+stats.supply>fleetCapacity(g))return deny(g,'함대 정원이 부족합니다. 조선소를 강화하거나 편성을 바꾸세요.');
  if(g.resources<stats.cost)return deny(g,'함대 생산 자원이 부족합니다.');
  g.fleet ||= emptyFleet();g.fleet.units=g.fleet.units.filter(u=>u.hp>0);pruneControlGroups(g.fleet);g.resources-=stats.cost;
  const occupied=g.fleet.units.map(other=>({...other,radius:unitTypes[other.type].radius}));
  const u={id:g.fleet.nextId++,type,level:1,hp:stats.hp,maxHp:stats.hp,...anchor(g,g.fleet.units.length,g.fleet.units.length+1,occupied),heading:0,aim:0,cooldown:0,command:{type:'escort'},waypoints:[],repath:0};
  g.fleet.units.push(u);emit(g,{type:'build',x:u.x,z:u.z});g.message=`${stats.name} 출동 준비. 클릭·드래그로 선택하고 우클릭으로 지휘하세요.`;return true;
}
export function unitUpgradeCost(u) {return Math.round(unitTypes[u.type].cost*fleetRules.upgradeCostScale*u.level);}
export function unitRefitState(g,u,id) {
  const refit=unitRefits[id],valid=id==='standard'||!!refit&&refit.type===u.type;
  const cost=valid?Math.round(unitTypes[u.type].cost*(id==='standard'?1:2+u.level*0.5)):0,current=(u.refit||'standard')===id;
  let reason='';
  if(!valid)reason='이 선종의 개장을 선택하세요.';
  else if(current)reason='현재 장비';
  else if(!(u.hp>0))reason='살아 있는 함선만 개장할 수 있습니다.';
  else if(!manageable(g)||g.campaign.pendingChoice)reason='정박지 또는 교전이 끝난 현장 정비에서 개장하세요.';
  else if(dist(u,g.island)>fleetRules.serviceRange)reason='함선을 섬의 정비 범위 34m 안으로 이동하세요.';
  else if(!g.facilities.some(f=>f.type==='shipyard'&&f.hp!==0&&f.level>=3))reason='정상 조선소 3단계가 필요합니다.';
  else if(refit&&(g.campaign.chapter<refit.unlock||u.level<refit.level))reason=`${refit.unlock+1}번째 해역 · 함선 ${refit.level}단계 필요`;
  else if(g.resources<cost)reason=`자원 ${cost-g.resources} 부족`;
  const candidate={...u};if(id==='standard')delete candidate.refit;else if(valid)candidate.refit=id;
  return {id,name:refit?.name||'표준 장비',cost,current,available:valid&&!reason,reason,stats:unitStats(g,u),next:unitStats(g,candidate)};
}
export function refitUnit(g,id,refit) {
  const u=g.fleet?.units.find(u=>u.id===id&&u.hp>0);if(!u)return false;
  const state=unitRefitState(g,u,refit);if(!state.available)return deny(g,state.reason);
  // Keep damage ratio, cooldown, movement orders and formation. Switching roles
  // cannot repair a ship, refund equipment or reset a weapon's firing timer.
  const ratio=u.hp/u.maxHp;g.resources-=state.cost;
  if(refit==='standard')delete u.refit;else {u.refit=refit;g.fleet.version=2;}
  u.maxHp=state.next.hp;u.hp=u.maxHp*ratio;
  g.message=`${unitTypes[u.type].name} #${u.id}: ${state.name} 개장. 손상 비율을 유지했습니다.`;return true;
}
export function upgradeUnit(g,id) {
  const u=g.fleet?.units.find(u=>u.id===id&&u.hp>0),maximum=Math.min(6,2+Math.floor((g.campaign?.chapter || 0)/2));
  if(!manageable(g)||!u||dist(u,g.island)>fleetRules.serviceRange)return deny(g,'조선소 주변 정비 중인 함대만 강화할 수 있습니다.');
  if(u.level>=maximum||g.resources<unitUpgradeCost(u))return deny(g,'함대 강화 한도 또는 자원을 확인하세요.');
  const old=u.maxHp;g.resources-=unitUpgradeCost(u);u.level++;u.maxHp=unitStats(g,u).hp;u.hp+=u.maxHp-old;g.message=`${unitTypes[u.type].name} ${u.level}단계. 실제 내구도와 전투 효율이 증가했습니다.`;return true;
}
export function fleetRepairCost(g) {return (g.fleet?.units || []).filter(u=>u.hp>0&&dist(u,g.island)<=fleetRules.serviceRange).reduce((n,u)=>n+Math.ceil((u.maxHp-u.hp)*fleetRules.repairCostPerHull),0);}
export function repairFleet(g) {
  const cost=fleetRepairCost(g);if(!manageable(g)||!cost||g.resources<cost)return false;
  g.resources-=cost;for(const u of g.fleet.units)if(u.hp>0&&dist(u,g.island)<=fleetRules.serviceRange)u.hp=u.maxHp;g.message=`근처 함대 수리 완료. 자원 ${cost} 사용.`;return true;
}
export function dismissUnit(g,id) {
  const u=g.fleet?.units.find(u=>u.id===id&&u.hp>0);if(!manageable(g)||!u||dist(u,g.island)>fleetRules.serviceRange)return false;
  g.fleet.units=g.fleet.units.filter(other=>other!==u);pruneControlGroups(g.fleet);g.message='함대를 편성에서 해제했습니다.';return true;
}
export function guardCycle(fleet,ids,targetId) {
  const seen=new Set(ids);let ward=fleet?.units.find(u=>u.id===targetId&&u.hp>0);
  while(ward){if(seen.has(ward.id))return true;seen.add(ward.id);ward=ward.command?.type==='guard'?fleet.units.find(u=>u.id===ward.command.target&&u.hp>0):null;}
  return false;
}
export function orderUnits(g,ids,type,point,append=false) {
  if(!g.campaign||!['mission','operation'].includes(g.campaign.stage)||g.phase!=='playing'||g.paused||g.campaign.pendingChoice||!['move','attackMove','attack','hold','escort','guard'].includes(type))return false;
  const ward=type==='guard'?g.fleet?.units.find(u=>u.id===point?.id&&u.hp>0):null;
  if(type==='guard'&&!ward)return deny(g,'호위할 살아 있는 아군 함선을 선택하세요.');
  const units=(g.fleet?.units || []).filter(u=>u.hp>0&&ids.includes(u.id)&&u!==ward);if(!units.length)return false;
  if(ward&&guardCycle(g.fleet,units.map(u=>u.id),ward.id))return deny(g,'서로를 따라가는 호위는 지정할 수 없습니다. 한 함선에 이동 명령을 먼저 내리세요.');
  const enemy=type==='attack'?g.enemies.find(e=>e.id===point?.id&&e.hp>0&&!e.captured):null;
  if(type==='attack'&&!enemy)return false;
  if(['move','attackMove'].includes(type)&&(!Number.isFinite(point?.x)||!Number.isFinite(point?.z)||Math.abs(point.x)>110||Math.abs(point.z)>110))return false;
  const queued=append&&['move','attackMove','attack'].includes(type);
  // A formation receives the entire order or none of it, even if only one
  // selected ship has reached the queue limit.
  if(queued&&units.some(u=>['move','attackMove','attack'].includes(u.command.type)&&(u.orders?.length||0)>=fleetRules.maximumQueuedOrders))return deny(g,`예약 명령은 함선당 ${fleetRules.maximumQueuedOrders}개까지 가능합니다. 새 우클릭이나 H로 다시 지휘하세요.`);
  const width=Math.ceil(Math.sqrt(units.length)),destinations=(g.fleet?.units||[]).filter(u=>u.hp>0&&!ids.includes(u.id)&&u.command?.type==='hold').map(u=>({x:u.x,z:u.z,radius:unitTypes[u.type].radius}));
  for(const [i,u] of units.entries()) {
    const destination=['move','attackMove'].includes(type)?waterPoint(g,{x:point.x+(i%width-(width-1)/2)*3,z:point.z+(Math.floor(i/width)-(Math.ceil(units.length/width)-1)/2)*3},unitTypes[u.type].radius,destinations):null;
    if(destination)destinations.push({...destination,radius:unitTypes[u.type].radius});
    const command=enemy?{type,target:enemy.id}:ward?{type,target:ward.id}:destination?{type,...destination}:{type};
    if(queued&&['move','attackMove','attack'].includes(u.command.type)){
      u.orders||=[];u.orders.push(command);
    }else {u.command=command;delete u.orders;u.waypoints=[];u.repath=0;}
  }
  if(['move','attackMove','attack'].includes(type))g.campaign.waitingForDeparture=false;
  g.message=`함대 ${units.length}기: ${{move:'이동',attackMove:'공격 이동',attack:'집중 공격',hold:'위치 사수',escort:'섬 호위',guard:`아군 #${ward?.id} 호위`}[type]} ${queued?'예약':'명령'}.`;return true;
}
function finishOrder(g,u) {
  let next;
  // Destroyed or captured targets cannot strand the remainder of a route.
  while(u.orders?.length){const order=u.orders.shift();if(order.type!=='attack'||g.enemies.some(e=>e.id===order.target&&e.hp>0&&!e.captured)){next=order;break;}}
  if(!u.orders?.length)delete u.orders;
  u.command=next||{type:'hold'};u.waypoints=[];u.repath=0;
}
export function deployFleet(g) {
  if(!g.fleet)return;g.fleet.units=g.fleet.units.filter(u=>u.hp>0);pruneControlGroups(g.fleet);
  for(const [i,u] of g.fleet.units.entries()){delete u.orders;Object.assign(u,anchor(g,i,g.fleet.units.length),{command:{type:'escort'},waypoints:[],repath:0,cooldown:0});}
}
export function threatenedUnit(g,e,base,stats) {
  if(!g.fleet?.units.length)return base;
  const unit=g.fleet.units.filter(u=>u.hp>0&&dist(u,e)<=stats.range+14).sort((a,b)=>dist(a,e)-dist(b,e)||a.id-b.id)[0];
  if(!unit)return base;
  const baseDistance=base===g.island?hullDistance(g,e):dist(base,e);
  return dist(unit,e)<baseDistance+4?unit:base;
}
function sail(g,u,target,dt,speed,radius) {
  if(dist(u,target)<0.5){u.waypoints=[];return true;}
  u.repath=Math.max(0,(u.repath || 0)-dt);
  // Shore separation can leave peers touching. Treating their starting overlap
  // as an impassable grid cell denies both ships every escape path. Local
  // steering below still forbids moving closer and checks the physical shore.
  const blockers=g.fleet.units.filter(other=>other!==u&&other.hp>0&&dist(u,other)>radius+unitTypes[other.type].radius+0.1).map(other=>({x:other.x,z:other.z,radius:unitTypes[other.type].radius}));
  // A failed search also observes the retry delay. Repeating an unreachable
  // A* search every frame can consume several seconds for one simulated second.
  if(u.repath<=0 && (!u.waypoints.length||!navigable(g,u.waypoints[0],radius,blockers)||dist(u.waypoints.at(-1),target)>3)) {u.waypoints=waterPath(g,u,target,radius,blockers);u.repath=0.75;}
  // Grid waypoints guide turns around the hull, but a reachable later point
  // takes precedence when a stopped ally occupies an intermediate cell.
  while(u.waypoints.length>1&&clearLine(g,u,u.waypoints[1],radius,blockers))u.waypoints.shift();
  let next=u.waypoints[0];if(!next)return false;
  // A moving ally can temporarily displace the navigation endpoint. Exhausting
  // that path is not arrival at the ordered destination; retry after it clears.
  if(dist(u,next)<0.35){u.waypoints.shift();next=u.waypoints[0];if(!next)return dist(u,target)<0.5;}
  const d=dist(u,next),amount=Math.min(d,speed*dt),dx=(next.x-u.x)/d,dz=(next.z-u.z)/d;
  const peers=g.fleet.units.filter(other=>other!==u&&other.hp>0&&dist(u,other)<radius+unitTypes[other.type].radius+1);
  // Keep to the right around another ship; symmetric separation alone can
  // leave two opposing orders pushing forever against each other.
  for(const angle of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,3*Math.PI/4,-3*Math.PI/4]) {
    const cos=Math.cos(angle),sin=Math.sin(angle),point={x:u.x+(dx*cos+dz*sin)*amount,z:u.z+(dz*cos-dx*sin)*amount};
    if(!navigable(g,point,radius)||peers.some(other=>dist(point,other)<Math.min(radius+unitTypes[other.type].radius+0.2,dist(u,other))-1e-6))continue;
    u.heading=Math.atan2(point.x-u.x,point.z-u.z);u.x=point.x;u.z=point.z;return false;
  }
  if(!navigable(g,{x:u.x+dx*amount,z:u.z+dz*amount},radius)){u.waypoints=[];u.repath=0;}
  return false;
}
export function tickFleet(g,dt,damageEnemy,enemyStats) {
  if(!g.fleet?.units.length||!['mission','operation'].includes(g.campaign?.stage))return;
  const living=g.fleet.units.filter(u=>u.hp>0);
  for(const [index,u] of living.entries()) {
    if(!navigable(g,u,unitTypes[u.type].radius)){Object.assign(u,waterPoint(g,u,unitTypes[u.type].radius));u.waypoints=[];u.repath=0;}
    if(u.command?.type==='attack'&&!g.enemies.some(e=>e.id===u.command.target&&e.hp>0&&!e.captured)||u.command?.type==='guard'&&!living.some(other=>other.id===u.command.target&&other.hp>0))finishOrder(g,u);
    const stats=unitStats(g,u),command=u.command || {type:'escort'};u.cooldown=Math.max(0,u.cooldown-dt);
    const automatic=!g.campaign.waitingForDeparture && ['escort','hold','attackMove','guard'].includes(command.type);
    // Passive defense reacts to an existing engagement. Only a deliberate
    // attack or attack-move may open fire on an undiscovered opponent.
    let target=command.type==='attack'?g.enemies.find(e=>e.id===command.target&&e.hp>0&&!e.captured):automatic?g.enemies.filter(e=>e.hp>0&&!e.captured&&(e.active||command.type==='attackMove')&&dist(u,e)<=stats.range+(['hold','guard'].includes(command.type)?0:9)).sort((a,b)=>(['bomber','tender','carrier'].includes(a.type)?0:1)-(['bomber','tender','carrier'].includes(b.type)?0:1)||dist(u,a)-dist(u,b))[0]:null;
    if(stats.heal) {
      const candidates=living.filter(other=>other.hp<other.maxHp&&dist(u,other)<=stats.range);
      if(g.hull<g.maxHull&&hullDistance(g,u)<=stats.range)candidates.push({ship:true,hp:g.hull,maxHp:g.maxHull});
      const patient=candidates.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(patient&&u.cooldown<=0){if(patient.ship)g.hull=Math.min(g.maxHull,g.hull+stats.heal);else patient.hp=Math.min(patient.maxHp,patient.hp+stats.heal);u.cooldown=stats.interval;emit(g,{type:'build',x:u.x,z:u.z});}
      // A shared attack order still moves support ships into repair range.
      if(command.type==='attack'&&target&&dist(u,target)>stats.range) {
        const d=dist(u,target),point={x:target.x+(u.x-target.x)/d*(stats.range-0.5),z:target.z+(u.z-target.z)/d*(stats.range-0.5)};
        sail(g,u,point,dt,stats.speed,stats.radius);
      }
      target=null;
    }
    if(target) {
      target.active=true;
      if(dist(u,target)>stats.range && command.type!=='hold') {
        const d=dist(u,target),point={x:target.x+(u.x-target.x)/d*(stats.range-0.5),z:target.z+(u.z-target.z)/d*(stats.range-0.5)};sail(g,u,point,dt,stats.speed,stats.radius);
      }
      if(dist(u,target)<=stats.range && u.cooldown<=0 && stats.damage>0) {
        u.aim=Math.atan2(target.x-u.x,target.z-u.z);u.cooldown=stats.interval;g.shots++;emit(g,{type:'shot',weapon:u.type,x:u.x,z:u.z,tx:target.x,tz:target.z,splash:stats.splash || 0});
        for(const e of g.enemies)if(e.hp>0&&(e===target || (stats.splash&&dist(e,target)<=stats.splash)))damageEnemy(g,e,stats.damage*(1-(enemyStats(g,e).armor || 0)*(1-(stats.pierce || 0))));
      }
    }else if(['move','attackMove'].includes(command.type)){if(sail(g,u,command,dt,stats.speed,stats.radius))finishOrder(g,u);}
    else if(command.type==='escort')sail(g,u,anchor(g,index,living.length),dt,stats.speed,stats.radius);
    if(command.type==='guard'){
      const ward=living.find(other=>other.id===command.target),guards=living.filter(other=>other.command?.type==='guard'&&other.command.target===ward.id),slot=guards.indexOf(u),width=Math.min(3,guards.length),side=(slot%width-(width-1)/2)*3,trail=6+Math.floor(slot/width)*3;
      const point={x:ward.x-Math.sin(ward.heading)*trail+Math.cos(ward.heading)*side,z:ward.z-Math.cos(ward.heading)*trail-Math.sin(ward.heading)*side};
      // Guards keep formation while firing at already active contacts. Repair
      // ships therefore stay behind the protected ship instead of chasing an
      // enemy or returning to their independent island escort anchor.
      sail(g,u,navigable(g,point,stats.radius)?point:waterPoint(g,point,stats.radius),dt,stats.speed,stats.radius);
    }
  }
  // Prevent stacked silhouettes while respecting the same water navigation.
  for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++) {
    const a=living[i],b=living[j],d=dist(a,b),r=unitTypes[a.type].radius+unitTypes[b.type].radius+0.2;if(d>=r)continue;
    const dx=d?(b.x-a.x)/d:1,dz=d?(b.z-a.z)/d:0,amount=(r-d)*0.5;
    for(const [u,sign] of [[a,-1],[b,1]]){const p={x:u.x+dx*amount*sign,z:u.z+dz*amount*sign};if(navigable(g,p,unitTypes[u.type].radius)){u.x=p.x;u.z=p.z;}}
  }
}
