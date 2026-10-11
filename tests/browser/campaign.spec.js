import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function start(page,mode='destination') {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install();await page.goto('/');await page.locator(`[data-start="${mode}"]`).click();await page.clock.runFor(200);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();return errors;
}
async function playMission(page,limit=900) {
  let routed=-1;
  for(let elapsed=0;elapsed<limit;elapsed+=3) {
    let g=await snapshot(page);if(g.phase!=='playing')return g;
    if(g.campaign.pendingChoice) {
      const preferred={supplies:'repair',rescue:'rescue',archive:'parts',ammunition:'recycle',salvage:'surface',signal:'shield'}[g.campaign.pendingChoice.kind];
      await page.locator(`[data-field-choice="${preferred}"]`).click();g=await snapshot(page);
    }
    if(!g.combat&&!g.route) {
      if(await page.locator('#field-repair').isEnabled() && g.hull<g.maxHull*0.8)await page.locator('#field-repair').click();
      if(await page.locator('#escort-repair').isVisible() && await page.locator('#escort-repair').isEnabled() && g.campaign.allyHull<g.campaign.allyMaxHull*0.8)await page.locator('#escort-repair').click();
      if(routed!==g.campaign.objectiveIndex) {await page.locator(`[data-site="objective-${g.campaign.objectiveIndex}"]`).click();routed=g.campaign.objectiveIndex;}
    }
    if(g.hull<g.maxHull*0.8 || (g.campaign.allyPosition && g.campaign.allyHull<g.campaign.allyMaxHull*0.8))await page.keyboard.press('2');
    if(g.enemies.some(e=>e.windup))await page.keyboard.press('1');
    if(g.combat)await page.keyboard.press('3');
    if(g.campaign.hazards.length)await page.keyboard.press('4');
    await page.clock.runFor(3000);
  }
  throw new Error(`Mission timed out: ${JSON.stringify((await snapshot(page)).campaign)}`);
}
test('campaign mission → save in battle → reload → same enemies → finish → persistent growth → recovery mission',async({page})=>{
  test.setTimeout(300000);const errors=await start(page);
  await page.locator('[data-mission="coral-1"]').click();await page.clock.runFor(7800);
  let g=await snapshot(page);expect(g.combat).toBe(true);expect(g.campaign.missionId).toBe('coral-1');
  await page.keyboard.press('1');expect((await snapshot(page)).campaign.barrierSeconds).toBeGreaterThan(5);
  await page.keyboard.press('p');await page.locator('#resume-button').click();await page.keyboard.press('p');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));g=await snapshot(page);
  await page.reload();await expect(page.locator('#continue-button')).toBeVisible();await page.locator('#continue-button').click();
  const restored=await snapshot(page);expect(restored.enemies).toEqual(g.enemies);expect(restored.resources).toBe(g.resources);expect(restored.facilities).toEqual(g.facilities);
  await page.locator('#resume-button').click();await playMission(page);await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');
  expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).enemyMeshes).toBe(0);
  expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).enemyBars).toBe(0);
  await page.locator('#retry-button').click();expect((await snapshot(page)).facilities).toHaveLength(2);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="expand"]').click();await page.locator('[data-tile="0,-2"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-2"]').click();
  await playMission(page);
  await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');
  expect((await snapshot(page)).campaign.completed).toEqual(['coral-1','coral-2']);await page.locator('#retry-button').click();
  await page.locator('[data-research="ballistics"]').click();expect((await snapshot(page)).campaign.tech.ballistics).toBe(1);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/campaign-harbor.png'});
  expect(errors).toEqual([]);
});
test('campaign progress survives mode switching; settings pause combat; bad import preserves ship',async({page})=>{
  const errors=await start(page,'direct');await page.locator('[data-mission="coral-1"]').click();
  await page.keyboard.down('w');await page.clock.runFor(2200);await page.keyboard.up('w');
  await page.locator('#settings-button').click();const paused=await snapshot(page);await page.clock.runFor(2000);expect((await snapshot(page)).time).toBe(paused.time);
  await expect(page.locator('#effects-volume')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#music-volume')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#graphics-quality')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#close-settings')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('#graphics-quality')).toBeFocused();
  await page.locator('#music-volume').fill('0');await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('#mode-button').click();await page.locator('[data-start="destination"]').click();let g=await snapshot(page);expect(g.mode).toBe('destination');expect(g.facilities).toHaveLength(2);expect(g.campaign.missionId).toBe('coral-1');
  await page.locator('[data-tab="campaign"]').click();await page.keyboard.press('p');
  await page.locator('#resume-button').click();g=await snapshot(page);
  await page.locator('#save-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.locator('#import-save-status')).toContainText('불러오기 실패');expect((await snapshot(page)).resources).toBe(g.resources);
  await page.screenshot({path:'artifacts/campaign-combat.png'});expect(errors).toEqual([]);
});
test('first chapter completes all six objective types through real UI and unlocks frost designs',async({page})=>{
  test.setTimeout(600000);const errors=await start(page);
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  for(let mission=1;mission<=6;mission++) {
    if(mission>1) {
      await page.locator('[data-tab="build"]').click();
      if(await page.locator('#repair-button').isEnabled())await page.locator('#repair-button').click();
      const p=await page.evaluate(()=>window.__TIDEHOLD__.projectTile(0,-1));await page.mouse.click(p.x,p.y);await page.clock.runFor(200);
      if(await page.locator('[data-action="upgrade"]').isEnabled())await page.locator('[data-action="upgrade"]').click();
      const q=await page.evaluate(()=>window.__TIDEHOLD__.projectTile(-1,-1));await page.mouse.click(q.x,q.y);await page.clock.runFor(200);
      if(await page.locator('[data-action="upgrade"]').isEnabled())await page.locator('[data-action="upgrade"]').click();
      await page.locator('[data-tab="campaign"]').click();
    }
    await page.locator(`[data-mission="coral-${mission}"]`).click();await playMission(page);
    await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');await page.locator('#retry-button').click();
  }
  const g=await snapshot(page);expect(g.campaign.completed).toHaveLength(6);expect(g.campaign.chapter).toBe(1);
  await page.locator('[data-tab="build"]').click();await expect(page.locator('[data-tool="frost"]')).toBeVisible();
  await expect(page.locator('[data-tool="frost"] small')).not.toContainText('해금');
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-research="reactor"]').click();
  await page.locator('[data-tab="build"]').click();await expect(page.locator('[data-tool="frost"]')).toBeEnabled();
  await page.screenshot({path:'artifacts/campaign-chapter-two.png'});expect(errors).toEqual([]);
});
