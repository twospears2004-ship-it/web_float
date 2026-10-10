import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {decodeSave} from '../../src/save.js';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
const face=(page,x,z,edge)=>page.locator(`[data-wall-edge="${edge}"][data-x="${x}"][data-z="${z}"]`);
async function low(page){await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();}
async function saveReload(page){
  await page.keyboard.press('p');await page.clock.runFor(5100);const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();
  const restored=await snapshot(page);for(const key of ['facilities','campaign','resources','fleet','checkpoint'])expect(restored[key]).toEqual(saved[key]);return restored;
}
test('first-sea farm grows from three actual objectives, harvests once and restores its crops',async({page})=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await low(page);
  await page.locator('[data-tab="build"]').click();await expect(page.locator('[data-tool="farm"]')).toBeEnabled();await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="1,1"]').click();
  let g=await snapshot(page);expect(g.resources).toBe(0);expect(g.campaign.chapter).toBe(0);expect(g.facilities.find(f=>f.type==='farm')).toBeTruthy();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  for(let t=0;t<1800;t+=3){
    g=await snapshot(page);if(g.facilities.find(f=>f.type==='farm').stock>=18&&!g.combat&&!g.route&&!g.campaign.pendingChoice)break;
    expect(g.phase).toBe('playing');
    if(g.campaign.pendingChoice){const option={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:'recycle',salvage:'surface',signal:'shield'}[g.campaign.pendingChoice.kind];await page.locator(`[data-field-choice="${option}"]`).click();g=await snapshot(page);}
    if(!g.combat&&!g.route&&g.campaign.waitingForDeparture)await page.locator(`[data-site="objective-${g.campaign.objectiveIndex}"]`).click();
    if(g.hull<g.maxHull*0.8)await page.keyboard.press('2');if(g.enemies.some(e=>e.windup))await page.keyboard.press('1');
    if(g.combat&&g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))await page.keyboard.press('3');
    if(g.campaign.hazards.length)await page.keyboard.press('4');await page.clock.runFor(3000);
  }
  g=await snapshot(page);expect(g.facilities.find(f=>f.type==='farm').stock).toBeGreaterThanOrEqual(18);expect(g.sites.filter(s=>s.cleared).length).toBe(3);expect(g.campaign.completed).toContain('coral-1');
  await page.locator('#retry-button').click();g=await snapshot(page);
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator('[data-tile="1,1"]').click();await expect(page.locator('[data-action="collect"]')).toBeEnabled();
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/first-sea-farm-crops.png'});
  const cash=g.resources,stock=g.facilities.find(f=>f.type==='farm').stock;await page.locator('[data-action="collect"]').click();expect((await snapshot(page)).resources).toBe(cash+stock);await expect(page.locator('[data-action="collect"]')).toBeDisabled();
  // This fixture is produced through the player controls with no state injection.
  await page.locator('[data-tab="campaign"]').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/first-sea-farm-earned.json');
  await saveReload(page);expect(errors).toEqual([]);
});
test('earned farm shares all four faces with walls; shared edges, upgrades, moving and removal remain distinct',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();await low(page);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();await page.locator('[data-action="upgrade"]').click();
  let g=await snapshot(page);const farm=g.facilities.find(f=>f.type==='farm');expect(farm.level).toBe(2);
  for(const edge of ['north','east','south','west']){await page.locator('[data-tool="wall"]').click();await face(page,-1,-1,edge).click();}
  g=await snapshot(page);expect(g.facilities.filter(f=>f.type==='wall'&&f.x===-1&&f.z===-1).length).toBe(4);expect(g.facilities.find(f=>f.id===farm.id).level).toBe(2);
  await page.locator('[data-tool="wall"]').click();const cash=g.resources;await face(page,0,-1,'west').click();expect((await snapshot(page)).resources).toBe(cash);await expect(page.locator('#message')).toContainText('맞닿은 면');await page.locator('#cancel-tool').click();
  await face(page,-1,-1,'east').click();await expect(page.locator('#facility-panel')).toContainText('동쪽');await expect(page.locator('#facility-panel .weapon-stats')).toContainText('설치 면');await expect(page.locator('#facility-panel .weapon-stats')).not.toContainText('생산량');await page.locator('[data-action="upgrade"]').click();await expect(page.locator('#facility-panel')).toContainText('Lv.2');await expect(page.locator('#facility-panel .weapon-stats')).toContainText('225');
  const wall=(await snapshot(page)).facilities.find(f=>f.type==='wall'&&f.edge==='east');await page.locator('[data-action="move"]').click();await page.locator('[data-edge-choice="east"]').click();await page.locator('[data-tile="0,0"]').click();
  g=await snapshot(page);expect(g.facilities.find(f=>f.id===wall.id)).toMatchObject({x:0,z:0,edge:'east',level:2,investment:wall.investment});
  await face(page,-1,-1,'south').click();await page.locator('[data-action="demolish"]').click();g=await snapshot(page);expect(g.facilities.find(f=>f.id===farm.id)).toEqual(farm);expect(g.facilities.filter(f=>f.type==='wall').length).toBe(3);
  // Read-only projection selects the rendered wall and farm through real canvas clicks.
  await page.clock.runFor(300);const point=await page.evaluate(()=>window.__TIDEHOLD__.projectWorld({x:1.7,z:0,y:1.4}));await page.mouse.click(point.x,point.y);await expect(page.locator('#facility-panel')).toContainText('방호 성벽');await expect(page.locator('#facility-panel')).toContainText('동쪽');
  await page.screenshot({path:'artifacts/farm-edge-walls.png'});await page.locator('[data-tab="campaign"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/farm-edge-walls-earned.json');
  await saveReload(page);expect(errors).toEqual([]);
});
test('old full-campaign walls migrate without losing paid structures or progress',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  const file='tests/fixtures/atlas-legacy-journey.json',old=decodeSave(await fs.readFile(file,'utf8'));await page.locator('#save-file').setInputFiles(file);await page.locator('#resume-button').click();
  const g=await snapshot(page),owned=items=>items.map(({cooldown,...f})=>f);expect(g.resources).toBe(old.resources);expect(owned(g.facilities)).toEqual(owned(old.facilities));expect(g.campaign.frontier).toEqual(old.campaign.frontier);
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();const wall=g.facilities.find(f=>f.type==='wall');await face(page,wall.x,wall.z,'north').click();await expect(page.locator('#facility-panel')).toContainText('북쪽');
  const yard=g.facilities.find(f=>f.type==='shipyard');await page.locator(`[data-tile="${yard.x},${yard.z}"]`).click();await expect(page.locator('#facility-panel .weapon-stats')).toContainText('함대 정원');await expect(page.locator('#facility-panel .weapon-stats')).toContainText('해금 선종');await expect(page.locator('#facility-panel .weapon-stats')).not.toContainText('생산량');
  await saveReload(page);expect(errors).toEqual([]);
});
