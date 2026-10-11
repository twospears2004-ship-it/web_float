import {test,expect} from '@playwright/test';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function select(page,f){await page.locator('[data-tab="build"]').click();if(!await page.locator('#placement-panel').isVisible())await page.locator('#board-toggle').click();await page.locator(`[data-tile="${f.x},${f.z}"]`).click();}

test('fresh paid weapon upgrades show actual next effects, preserve the button and move focus at the sea maximum',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('#beginner-start').click();let g=await snapshot(page);await select(page,g.facilities[0]);
  const button=page.locator('[data-action="upgrade"]'),original=await button.elementHandle();await expect(page.locator('[data-facility-growth]')).toContainText('현재 피해 16 · 범위 20m → 다음 피해 24 · 범위 22m');
  await button.focus();await page.keyboard.press('Enter');await expect(button).toBeFocused();expect(await button.evaluate((current,previous)=>current===previous,original)).toBe(true);g=await snapshot(page);expect(g.resources).toBe(104);expect(g.facilities[0].level).toBe(2);await expect(page.locator('[data-facility-growth]')).toContainText('다음 피해 32 · 범위 24m');
  await page.clock.runFor(6000);await expect(button).toBeFocused();await page.keyboard.press('Enter');g=await snapshot(page);expect(g.resources).toBe(13);expect(g.facilities[0].level).toBe(3);await expect(button).toBeDisabled();await expect(page.locator('#facility-panel')).toBeFocused();await expect(page.locator('[data-upgrade-reason]')).toHaveText('이 해역 최대 Lv.3');
  await page.clock.resume();await page.screenshot({path:'artifacts/facility-growth-early.png'});await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.reload();await page.locator('#continue-button').click();expect((await snapshot(page)).resources).toBe(13);expect((await snapshot(page)).facilities[0].level).toBe(3);expect(errors).toEqual([]);
});

test('earned colony previews paid crop growth and explains the exact power deficit for another weapon',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();let g=await snapshot(page);const farm=g.facilities.find(f=>f.type==='farm'),before=g.resources;await select(page,farm);
  await expect(page.locator('[data-facility-growth]')).toContainText('현재 목표 3개당 작물 24 → 다음 목표 3개당 작물 30');await page.locator('[data-action="upgrade"]').focus();await page.keyboard.press('Enter');g=await snapshot(page);expect(g.resources).toBe(before-210);expect(g.facilities.find(f=>f.id===farm.id).level).toBe(3);
  await select(page,g.facilities.find(f=>f.type==='cannon'));await expect(page.locator('[data-action="upgrade"]')).toBeDisabled();await expect(page.locator('[data-upgrade-reason]')).toContainText('전력 1 부족');expect((await snapshot(page)).resources).toBe(before-210);
  const target=page.locator('[data-targeting]'),original=await target.elementHandle();await target.focus();await target.selectOption('support');await expect(target).toBeFocused();expect(await target.evaluate((current,previous)=>current===previous,original)).toBe(true);await page.clock.resume();await page.screenshot({path:'artifacts/facility-growth-power.png'});expect(errors).toEqual([]);
});
