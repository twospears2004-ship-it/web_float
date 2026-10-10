import {test,expect} from '@playwright/test';
import {needsStoryDeparture} from '../../scripts/live-player.mjs';
import {balance} from '../../src/game.js';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());

test('earned resumed partial engagement can depart for the remaining inactive guards',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/live-earned-frost-route-gap.json');await page.locator('#resume-button').click();
  let g=await snapshot(page);const observed=g.campaign.objectiveIndex,before={...g.island},cash=g.resources;
  expect(g.campaign.missionId).toBe('frost-3');expect(g.combat).toBe(false);expect(g.campaign.waitingForDeparture).toBe(false);
  expect(g.enemies.filter(e=>e.hp>0)).toHaveLength(2);expect(needsStoryDeparture(g,balance.activationRange,observed)).toBe(true);
  await page.locator('[data-tab="voyage"]').click();await page.locator('[data-site="objective-7"]').click();
  g=await snapshot(page);expect(g.route?.id).toBe('objective-7');expect(needsStoryDeparture(g,balance.activationRange,observed)).toBe(false);
  await page.clock.runFor(2000);g=await snapshot(page);expect(Math.hypot(g.island.x-before.x,g.island.z-before.z)).toBeGreaterThan(1);expect(g.resources).toBe(cash);
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();g=await snapshot(page);
  expect(g.route).toEqual(saved.route);expect(g.fleet).toEqual(saved.fleet);expect(g.enemies).toEqual(saved.enemies);expect(errors).toEqual([]);
});
