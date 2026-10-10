import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function low(page) {await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();}
async function playUntil(page,stop) {
  for(let t=0;t<1000;t+=3) {
    let g=await snapshot(page);if(stop(g))return g;
    expect(g.phase).toBe('playing');
    if(g.campaign.pendingChoice){const id={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:'recycle',salvage:'surface',signal:'shield'}[g.campaign.pendingChoice.kind];await page.locator(`[data-field-choice="${id}"]`).click();g=await snapshot(page);}
    if(!g.combat&&!g.route && g.campaign.waitingForDeparture)await page.locator(`[data-site="objective-${g.campaign.objectiveIndex}"]`).click();
    if(g.hull<g.maxHull*0.8)await page.keyboard.press('2');if(g.enemies.some(e=>e.windup))await page.keyboard.press('1');
    if(g.combat && g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))await page.keyboard.press('3');
    if(g.campaign.hazards.length)await page.keyboard.press('4');await page.clock.runFor(3000);
  }
  throw new Error('Production flow did not reach a checkpoint');
}
test('new island fishery → real sailing catch → harvest once → upgrade → saved growth',async({page})=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await low(page);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="fishery"]').click();await page.locator('[data-tile="1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  let g=await playUntil(page,g=>!!g.campaign.pendingChoice);await page.locator('[data-field-choice="repair"]').click();g=await snapshot(page);
  expect(g.facilities.find(f=>f.type==='fishery').stock).toBe(10);const money=g.resources;
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator('[data-tile="1,-1"]').click();
  await expect(page.locator('[data-action="collect"]')).toBeEnabled();await page.locator('[data-action="collect"]').click();
  expect((await snapshot(page)).resources).toBe(money+10);await expect(page.locator('[data-action="collect"]')).toBeDisabled();
  await page.locator('[data-action="upgrade"]').click();g=await snapshot(page);expect(g.facilities.find(f=>f.type==='fishery').level).toBe(2);
  await expect(page.locator('#facility-panel')).toContainText('13/회');await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/fishery-growth.png'});
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();await page.locator('#resume-button').click();
  const restored=await snapshot(page);expect(restored.facilities.find(f=>f.type==='fishery').level).toBe(2);expect(restored.resources).toBe(g.resources);expect(errors).toEqual([]);
});
test('earned late ship → replace workshop with farm/lab → three real objectives → crops and research',async({page})=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/campaign-fixtures/heart-6-guardian.json');await page.locator('#resume-button').click();await low(page);await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();
  let g=await snapshot(page);expect(g.campaign.stage).toBe('harbor');const old=g.facilities.find(f=>f.type==='workshop');
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator(`[data-tile="${old.x},${old.z}"]`).click();await page.locator('[data-action="demolish"]').click();
  await page.locator('[data-tool="farm"]').click();await page.locator(`[data-tile="${old.x},${old.z}"]`).click();
  g=await snapshot(page);const tile=g.tiles.filter(t=>(t.x||t.z)&&!g.facilities.some(f=>f.x===t.x&&f.z===t.z)).sort((a,b)=>(a.x+1)**2+(a.z+1)**2-(b.x+1)**2-(b.z+1)**2)[0];
  await page.locator('[data-tool="laboratory"]').click();await page.locator(`[data-tile="${tile.x},${tile.z}"]`).click();
  for(let i=0;i<3;i++)await page.locator('[data-action="upgrade"]').click();g=await snapshot(page);expect(g.facilities.find(f=>f.type==='laboratory').level).toBe(4);
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="heart-6"]').click();
  await playUntil(page,g=>g.campaign.objectiveIndex>=3);g=await snapshot(page);
  expect(g.facilities.find(f=>f.type==='farm').stock).toBeGreaterThanOrEqual(18);expect(g.campaign.surveyedTasks.length).toBeGreaterThanOrEqual(2);expect(g.campaign.bonusResearch).toBeGreaterThanOrEqual(1);
  await page.locator('[data-tab="build"]').click();await page.clock.runFor(250);await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/colony-research.png'});await page.keyboard.press('p');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);
  expect(restored.facilities).toEqual(saved.facilities);expect(restored.campaign.surveyedTasks).toEqual(saved.campaign.surveyedTasks);expect(restored.campaign.surveyProgress).toBe(saved.campaign.surveyProgress);expect(errors).toEqual([]);
});
test('earned colony → late research spends data and materials → real crane stats → save/reload',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/black-6-harbor.json');await page.locator('#resume-button').click();await low(page);
  const before=await snapshot(page);expect(before.campaign.chapter).toBe(9);expect(before.campaign.tech.precision || 0).toBe(0);
  await page.locator('[data-tab="campaign"]').click();await expect(page.locator('[data-research="precision"]')).toContainText('자원 1200');await page.locator('[data-research="precision"]').click();
  let g=await snapshot(page);expect(g.resources).toBe(before.resources-1200);expect(g.campaign.research).toBe(before.campaign.research-6);expect(g.campaign.tech.precision).toBe(1);
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();const crane=g.facilities.find(f=>f.type==='crane');await page.locator(`[data-tile="${crane.x},${crane.z}"]`).click();
  await expect(page.locator('#facility-panel')).toContainText('45%');await expect(page.locator('#facility-panel')).toContainText('29m');await page.clock.runFor(250);await page.screenshot({path:'artifacts/colony-crane-research.png'});
  const farm=g.facilities.find(f=>f.type==='farm');await page.locator(`[data-tile="${farm.x},${farm.z}"]`).click();await page.clock.runFor(250);await page.screenshot({path:'artifacts/colony-growth-farm.png'});
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));g=await snapshot(page);await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);
  expect(restored.resources).toBe(g.resources);expect(restored.campaign.tech.precision).toBe(1);expect(restored.facilities).toEqual(g.facilities);expect(errors).toEqual([]);
});
