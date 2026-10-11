import {test,expect} from '@playwright/test';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function depart(page){
  await page.clock.install({time:new Date('2026-10-11T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-11T00:00:01Z'));
  await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();
  const harbor=await snapshot(page);await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  await page.clock.runFor(12000);return harbor;
}
test('return confirmation pauses combat and Escape keeps the entire active expedition',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await depart(page);
  const before=await snapshot(page);await page.locator('#home-button').click();
  await expect(page.locator('#return-overlay')).toBeVisible();await expect(page.locator('#cancel-return')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#confirm-return')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('#cancel-return')).toBeFocused();
  await page.clock.runFor(5000);await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeHidden();
  const paused=await snapshot(page);expect(paused.paused).toBe(true);
  for(const key of ['time','resources','hull','facilities','fleet','enemies','campaign','route','island'])expect(paused[key]).toEqual(before[key]);
  await page.keyboard.press('Escape');await expect(page.locator('#return-overlay')).toBeHidden();await expect(page.locator('#home-button')).toBeFocused();
  const resumed=await snapshot(page);expect(resumed.paused).toBe(false);
  for(const key of ['time','resources','hull','facilities','fleet','enemies','campaign','route','island'])expect(resumed[key]).toEqual(before[key]);
  await page.screenshot({path:'artifacts/return-confirmation-cancel.png'});expect(errors).toEqual([]);
});
test('reload while confirming keeps the active save; explicit confirmation restores only the departure checkpoint',async({page})=>{
  const harbor=await depart(page);const active=await snapshot(page);await page.locator('#home-button').click();
  await page.screenshot({path:'artifacts/return-confirmation.png'});await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);
  expect(restored.campaign.missionId).toBe('coral-1');expect(restored.resources).toBe(active.resources);expect(restored.enemies).toEqual(active.enemies);expect(restored.facilities).toEqual(active.facilities);
  await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();await page.locator('#confirm-return').click();
  const back=await snapshot(page);expect(back.campaign.stage).toBe('harbor');expect(back.resources).toBe(harbor.resources);expect(back.facilities).toEqual(harbor.facilities);
  expect(back.campaign.completed).toEqual([]);expect(back.checkpoint).toBeNull();await expect(page.locator('#return-overlay')).toBeHidden();
});
