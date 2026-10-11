import {test,expect} from '@playwright/test';
import {getMission} from '../../src/campaign-content.js';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
test('campaign heading follows the real mission through mode change, reload and abandonment',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-start="destination"]').click();await expect(page.locator('#scene-title')).toHaveText('나의 섬, 다음 항해.');
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  const name=getMission('coral-1').name;await expect(page.locator('#scene-title')).toHaveText(name);
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();await expect(page.locator('#scene-title')).toHaveText(name);
  const g=await state(page);expect(g.mode).toBe('direct');expect(g.campaign.stage).toBe('mission');expect(g.campaign.missionId).toBe('coral-1');
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#continue-button').click();await expect(page.locator('#scene-title')).toHaveText(name);await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();await page.locator('#confirm-return').click();
  const back=await state(page);expect(back.campaign.stage).toBe('harbor');expect(back.campaign.completed).toEqual([]);expect(back.resources).toBe(g.checkpoint.resources);await expect(page.locator('#scene-title')).toHaveText('나의 섬, 다음 항해.');
  expect(errors).toEqual([]);
});
