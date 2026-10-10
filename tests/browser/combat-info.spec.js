import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test('earned storm encounter exposes enemy counters and the live guardian warning',async({page})=>{
  test.setTimeout(120000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('#save-file').setInputFiles('artifacts/campaign-fixtures/storm-6-guardian.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="voyage"]').click();await expect(page.locator('#enemy-intel')).toBeVisible();
  await expect(page.locator('#enemy-intel')).toContainText('폭풍 전도체');await expect(page.locator('#enemy-intel')).toContainText('대각선의 빈틈');
  await expect(page.locator('#enemy-intel')).toContainText('장갑');await expect(page.locator('#enemy-intel')).toContainText('사거리');
  for(let t=0;t<40;t++) {
    const g=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());if(g.enemies.some(e=>e.windup))break;
    await page.clock.runFor(1000);
  }
  await expect(page.locator('#boss-hud')).toBeVisible();await expect(page.locator('#boss-hud')).toContainText('십자 낙뢰');
  await expect(page.locator('#boss-hud')).toContainText('초');
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/combat-information.png'});
  expect(errors).toEqual([]);
});
