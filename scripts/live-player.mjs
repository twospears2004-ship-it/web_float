// The controller observes a read-only development snapshot and acts exclusively
// through visible player controls. It never calls game mutation/tick functions.
export function needsStoryDeparture(g,activationRange,observedObjective){
  if(g.phase!=='playing'||g.paused||g.combat||g.route||g.campaign?.pendingChoice||g.campaign?.stage!=='mission')return false;
  const site=g.catalog[g.campaign.objectiveIndex],living=g.enemies.filter(e=>e.hp>0&&!e.captured);
  return !!site&&(g.campaign.objectiveIndex!==observedObjective||g.campaign.waitingForDeparture===true||!!(living.length&&living.every(e=>!e.active)&&Math.hypot(g.island.x-site.x,g.island.z-site.z)>activationRange));
}
export function livePlayer(page,rules){
  const {rulesFor,canManage,expansionSlots,upgradeCost,facilityPosition,powerUsed,powerCapacity,facilityPower,researchCost,technologies,productionTypes,atShore,fieldDecisions,fleetRules,structureHull}=rules;
  const state=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
  const tap=async selector=>{
    if((await state()).phase!=='playing')return false;
    const b=page.locator(selector);if(!await b.isVisible()||!await b.isEnabled())return false;
    try{await b.click({timeout:30000});return true;}
    catch(error){
      // Choices, pauses and completed surveys can disable a control after the
      // initial readiness check. Return the same unavailable result as above.
      const current=await state();if(current.phase!=='playing'||current.paused||!await b.isVisible()||!await b.isEnabled())return false;
      throw error;
    }
  };
  const tab=async name=>{
    const button=page.locator(`[data-tab="${name}"]`);
    if(await button.isVisible()&&await button.evaluate(element=>element.classList.contains('active')))return true;
    return tap(`[data-tab="${name}"]`);
  };
  async function board(){await tab('build');if(await page.locator('#board-toggle').getAttribute('aria-expanded')!=='true')await tap('#board-toggle');}
  async function facility(id){
    const f=(await state()).facilities.find(f=>f.id===id);if(!f)return false;await board();
    return tap(f.type==='wall'?`[data-wall-edge="${f.edge||'north'}"][data-x="${f.x}"][data-z="${f.z}"]`:`[data-tile="${f.x},${f.z}"]`);
  }
  async function action(id,type){if(!await facility(id))return false;return tap(`[data-action="${type}"]`);}
  async function build(type,tile){
    await tab('build');if(!await tap(`[data-tool="${type}"]`))return false;
    const ok=await tap(type==='wall'?`[data-wall-edge="${tile.edge}"][data-x="${tile.x}"][data-z="${tile.z}"]`:`[data-tile="${tile.x},${tile.z}"]`);
    if(!ok)await tap('#cancel-tool');return ok;
  }
  const vacant=g=>g.tiles.find(t=>(t.x||t.z)&&!g.facilities.some(f=>f.type!=='wall'&&f.x===t.x&&f.z===t.z));
  async function move(id,tile){if(!await facility(id)||!await tap('[data-action="move"]'))return false;return tap(`[data-tile="${tile.x},${tile.z}"]`);}
  async function addFacility(type,limit=1){
    let g=await state();const w=rulesFor(g).weapons[type];
    if(g.facilities.filter(f=>f.type===type).length>=limit||w.unlock>g.campaign.chapter||g.resources<w.cost+100||powerUsed(g)+w.power>powerCapacity(g))return;
    let tile=vacant(g);if(!tile){tile=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!tile||!await build('expand',tile))return;}
    if(!await build(type,tile))throw new Error(`Visible build failed: ${type}`);
  }
  async function paidRefit(){
    let g=await state();if(!canManage(g)||g.paused)return;
    for(const f of g.facilities){if(f.stock>0)await action(f.id,'collect');if(f.hp!==undefined&&(!structureHull||f.hp<structureHull(f)))await action(f.id,'restore');}
    await tab('fleet');await tap('#repair-fleet');await tab('build');
    while((g=await state()).hull<g.maxHull&&g.resources>=rulesFor(g).repairCost){if(!await tap('#repair-button'))break;}
    await tab('voyage');
    while((g=await state()).campaign.allyPosition&&g.campaign.allyHull<g.campaign.allyMaxHull*.9&&g.resources>=40){if(!await tap('#escort-repair'))break;}
    g=await state();if(g.resources>300&&g.campaign.abilityCharges.mend<2)await tap('#field-resupply');
  }
  async function prepareColony(){
    await paidRefit();await tab('campaign');let changed=true;
    while(changed){changed=false;for(const id of ['reactor','ballistics','bulkhead','logistics','navigation','cultivation','distributed','precision','cartography']){
      const g=await state(),tech=technologies.find(t=>t.id===id);
      if(g.campaign.chapter>=(tech.unlock||0)&&(!tech.materials||g.resources>=researchCost(g,tech).materials+150)&&await tap(`[data-research="${id}"]`))changed=true;
    }}
    let g=await state();if(g.campaign.chapter>=2&&!g.facilities.some(f=>f.type==='rail')&&g.resources>300){
      const old=g.facilities.find(f=>f.type==='cannon');if(old&&powerUsed(g)-facilityPower(old)+3<=powerCapacity(g)){await action(old.id,'demolish');if(!await build('rail',old))throw new Error('Paid rail replacement failed.');}
    }
    await addFacility('mortar',g.campaign.chapter>=2?2:1);for(const type of ['fishery','crane','laboratory','shield','farm','workshop'])await addFacility(type);
    g=await state();const targets={cannon:2,mortar:Math.min(8,2+g.campaign.chapter),rail:6,shield:(g.campaign.tech.distributed||0)>=2?4:2,workshop:2,fishery:2,crane:3,farm:2,laboratory:(g.campaign.tech.distributed||0)>=3&&g.campaign.chapter>=9?7:g.campaign.chapter>=3?4:2};
    changed=true;while(changed){changed=false;for(const f of (await state()).facilities){
      g=await state();if(f.level<Math.min(targets[f.type]||f.level,rulesFor(g).maxLevel)&&g.resources>=upgradeCost(f,g)+200&&await action(f.id,'upgrade'))changed=true;
      if(rulesFor(g).weapons[f.type].damage>0&&await facility(f.id))await page.locator('[data-targeting]').selectOption(f.type==='rail'?'armored':'support');
    }}
    while((g=await state()).resources>700&&g.tiles.length<49){const t=expansionSlots(g).sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z))[0];if(!t||!await build('expand',t))break;}
    g=await state();const weapons=g.facilities.filter(f=>rulesFor(g).weapons[f.type].damage>0),radius=Math.max(...g.tiles.map(t=>Math.max(Math.abs(t.x),Math.abs(t.z))));
    for(const [i,f]of weapons.entries()){
      g=await state();const angle=i*Math.PI*2/weapons.length,scale=radius/Math.max(Math.abs(Math.sin(angle)),Math.abs(Math.cos(angle))),desired={x:Math.round(Math.sin(angle)*scale),z:-Math.round(Math.cos(angle)*scale)};
      const t=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(other=>other.type!=='wall'&&other.id!==f.id&&other.x===t.x&&other.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];
      if(t&&(t.x!==f.x||t.z!==f.z))await move(f.id,t);
    }
  }
  async function prepareFleet(){
    await paidRefit();let g=await state();if(!g.facilities.some(f=>f.type==='shipyard')){
      if(powerUsed(g)+1>powerCapacity(g)){const old=g.facilities.find(f=>f.type==='workshop');if(old)await action(old.id,'demolish');}await addFacility('shipyard');
    }
    let yard=(await state()).facilities.find(f=>f.type==='shipyard');while(yard&&yard.level<3&&(await state()).resources>500&&await action(yard.id,'upgrade'))yard=(await state()).facilities.find(f=>f.id===yard.id);
    g=await state();const c=g.campaign.chapter,types=c>=3?['torpedo','gunboat','tender','skiff']:c>=2?['torpedo','gunboat','skiff']:c>=1?['gunboat','skiff','skiff']:['skiff','skiff'];await tab('fleet');
    for(const type of types){g=await state();if(g.resources>180&&g.fleet.units.filter(u=>u.hp>0&&u.type===type).length<(type==='skiff'?2:1))await tap(`[data-recruit="${type}"]`);}
    for(const u of (await state()).fleet.units)while((await state()).resources>400&&await tap(`[data-unit-upgrade="${u.id}"]`)){}
  }
  async function faceTarget(site){
    let g=await state();if(!canManage(g)||!site)return;
    const dx=site.x-g.island.x,dz=site.z-g.island.z,desired=Math.abs(dx)>Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)};
    for(const f of g.facilities.filter(f=>f.type==='shield')){
      g=await state();const t=g.tiles.filter(t=>(t.x||t.z)&&Math.abs(t.x)<=1&&Math.abs(t.z)<=1&&!g.facilities.some(v=>v.type!=='wall'&&v.id!==f.id&&v.x===t.x&&v.z===t.z)).sort((a,b)=>(a.x-desired.x)**2+(a.z-desired.z)**2-(b.x-desired.x)**2-(b.z-desired.z)**2)[0];if(t&&(t.x!==f.x||t.z!==f.z))await move(f.id,t);
    }
    for(const f of (await state()).facilities.filter(f=>productionTypes.includes(f.type)&&f.type!=='farm')){
      g=await state();const t=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(v=>v.type!=='wall'&&v.id!==f.id&&v.x===t.x&&v.z===t.z)&&(f.type!=='fishery'||atShore(g,t))).sort((a,b)=>Math.hypot(facilityPosition(g,a).x-site.x,facilityPosition(g,a).z-site.z)-Math.hypot(facilityPosition(g,b).x-site.x,facilityPosition(g,b).z-site.z))[0];if(t&&(t.x!==f.x||t.z!==f.z))await move(f.id,t);
    }
  }
  async function choose(g){
    if(!g.campaign.pendingChoice)return;
    await tab('voyage');const kind=g.campaign.pendingChoice.kind,pref={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:g.resources>180?'calibrate':'recycle',salvage:'surface',signal:'shield'},options=fieldDecisions[kind].options;
    for(const o of [...options.filter(o=>o.id===pref[kind]),...options.filter(o=>!o.elite)])if(await tap(`[data-field-choice="${o.id}"]`))return;
    throw new Error('No visible affordable field choice.');
  }
  async function abilities(g){
    // A victory can open its dialog between observation and input. Keyboard
    // abilities safely follow the game's own phase/focus checks in that race.
    g=await state();if(!canCommand(g))return;
    if(g.hull<g.maxHull*.8||(g.campaign.allyPosition&&g.campaign.allyHull<g.campaign.allyMaxHull*.8))await page.keyboard.press('2');
    if(g.combat||g.enemies.some(e=>e.windup))await page.keyboard.press('1');
    // A prior observation may describe the last enemies of the previous shore.
    // Recheck before an offensive pulse so the controller cannot accidentally
    // close the next shore's refit window after that fight has ended.
    g=await state();if(!canCommand(g)||g.campaign.waitingForDeparture)return;
    if(g.combat&&g.enemies.some(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))await page.keyboard.press('3');
    if(g.campaign.hazards.some(h=>h.remaining<1.5))await page.keyboard.press('4');
  }
  const canCommand=g=>g.phase==='playing'&&!g.paused&&!g.campaign?.pendingChoice;
  async function commandAction(action){
    if(!canCommand(await state()))return false;
    try{await action();return canCommand(await state());}
    catch(error){if(!canCommand(await state()))return false;throw error;}
  }
  async function selectFleet(ids){
    if(!await commandAction(()=>tab('fleet')))return false;
    let selected=0;
    for(const id of ids){
      if(!(await state()).fleet.units.some(u=>u.id===id&&u.hp>0))continue;
      try{if(!await commandAction(()=>page.locator(`[data-unit-select="${id}"]`).click({modifiers:selected?['Shift']:[],timeout:30000})))return false;selected++;}
      catch(error){if((await state()).fleet.units.some(u=>u.id===id&&u.hp>0))throw error;}
    }
    return selected>0;
  }
  async function order(type,target,ids){
    let g=await state();if(!canCommand(g))return false;ids||=g.fleet.units.filter(u=>u.hp>0).map(u=>u.id);if(!ids.length)return false;
    if(!await selectFleet(ids))return false;
    if(['escort','hold'].includes(type)){if(!await commandAction(async()=>{if(!await tap(`[data-order="${type}"]`))throw new Error(`Fleet ${type} button unavailable.`);}))return false;return true;}
    if(!canCommand(await state()))return false;
    const r=await page.locator('#minimap').boundingBox();await page.mouse.click(r.x+(115+target.x*.65)/230*r.width,r.y+(100+target.z*.65)/180*r.height);await page.waitForTimeout(800);
    for(const y of [.6,1.5,2.5]){
      g=await state();if(!canCommand(g))return false;const current=type==='attack'?g.enemies.find(e=>e.id===target.id&&e.hp>0&&!e.captured):target;if(!current)return false;
      const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),{...current,y});const canvas=await page.locator('#scene canvas').boundingBox();
      if(p.x<=canvas.x||p.x>=canvas.x+canvas.width||p.y<=canvas.y||p.y>=canvas.y+canvas.height)continue;
      await page.mouse.click(p.x,p.y,{button:'right'});g=await state();if(!canCommand(g))return false;
      const living=ids.filter(id=>g.fleet.units.some(u=>u.id===id&&u.hp>0));if(!living.length)return false;
      if(living.every(id=>{const c=g.fleet.units.find(u=>u.id===id).command;return c?.type===type&&(type!=='attack'||c.target===target.id);}))return true;
    }
    g=await state();throw new Error(`Rendered pointer could not issue ${type} to ${target.id||'water'}: ${JSON.stringify({target:g.enemies.find(e=>e.id===target.id),units:g.fleet.units.filter(u=>ids.includes(u.id)).map(u=>({id:u.id,hp:u.hp,command:u.command}))})}`);
  }
  async function recall(){
    const g=await state();if(!canCommand(g))return false;if(g.fleet.units.some(u=>u.hp>0)){
      if(!await order('escort'))return false;
      await page.waitForFunction(range=>{const g=window.__TIDEHOLD__.snapshot();return g.phase!=='playing'||g.fleet.units.filter(u=>u.hp>0).every(u=>Math.hypot(u.x-g.island.x,u.z-g.island.z)<=range);},fleetRules.serviceRange,{timeout:17000});
    }
    if(!canCommand(await state()))return false;await paidRefit();await prepareFleet();return true;
  }
  return {state,tap,tab,build,action,paidRefit,prepareColony,prepareFleet,faceTarget,choose,abilities,order,recall};
}
