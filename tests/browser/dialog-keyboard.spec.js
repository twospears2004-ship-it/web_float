import {test,expect} from '@playwright/test';

test('settings inputs accept Escape and modal Tab navigation stays inside the dialog',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install();await page.goto('/');
  await page.locator('[data-start="direct"]').click();
  await page.locator('#settings-button').click();
  await page.locator('#effects-volume').focus();
  for(let i=0;i<8;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>!!document.activeElement.closest('#settings-overlay'))).toBe(true);
  }
  await page.locator('#close-settings').focus();await page.keyboard.press('Tab');
  await expect(page.locator('#effects-volume')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('#close-settings')).toBeFocused();
  await page.locator('#graphics-quality').focus();await page.keyboard.press('Escape');
  await expect(page.locator('#settings-overlay')).toBeHidden();
  await expect(page.locator('#settings-button')).toBeFocused();
  const game=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());expect(game.paused).toBe(false);
  const before={...game.island};await page.locator('canvas').first().click({position:{x:10,y:10}});
  await page.keyboard.down('KeyW');await page.clock.runFor(500);await page.keyboard.up('KeyW');
  expect((await page.evaluate(()=>window.__TIDEHOLD__.snapshot())).island.z).toBeLessThan(before.z);
  expect(errors).toEqual([]);
});

test('help and pause navigation stay modal while Escape restores normal play',async({page})=>{
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#help-button').click();
  await page.keyboard.press('Tab');await expect(page.locator('#close-help')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('#close-help')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
  expect((await page.evaluate(()=>window.__TIDEHOLD__.snapshot())).paused).toBe(false);
  await page.locator('#pause-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();
  for(let i=0;i<8;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>!!document.activeElement.closest('#pause-overlay'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  expect((await page.evaluate(()=>window.__TIDEHOLD__.snapshot())).paused).toBe(false);
});

test('Escape cancels a new-campaign replacement and preserves paid facilities',async({page})=>{
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('[data-tab="build"]').click();
  await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();
  const before=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());
  expect(before.resources).toBe(0);expect(before.facilities.some(f=>f.type==='farm')).toBe(true);
  await page.reload();await page.locator('[data-start="destination"]').click();
  await expect(page.locator('#replace-overlay')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.locator('#cancel-new')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#confirm-new')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#replace-overlay')).toBeHidden();
  expect(await page.evaluate(()=>!!document.activeElement.closest('#start-overlay'))).toBe(true);
  await page.locator('#continue-button').click();
  const restored=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());
  expect(restored.resources).toBe(before.resources);expect(restored.facilities).toEqual(before.facilities);
});
