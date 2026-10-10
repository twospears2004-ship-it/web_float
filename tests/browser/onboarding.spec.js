import {test,expect} from '@playwright/test';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());

test('recommended entry explains the loop and connects paid construction to the first mission',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');
  await expect(page.locator('.start-loop li')).toHaveCount(3);
  await expect(page.locator('#continue-button')).toBeHidden();
  await page.screenshot({path:'artifacts/onboarding-entry.png'});
  await page.setViewportSize({width:1100,height:720});
  await page.locator('#beginner-start').click();
  let g=await snapshot(page);expect(g.mode).toBe('direct');expect(g.campaign.completed).toEqual([]);
  await expect(page.locator('#first-voyage-title')).toContainText('1 ·');
  const before=g.resources;await page.locator('#first-voyage-action').click();
  await expect(page.locator('#placement-panel')).toBeVisible();
  await page.locator('[data-tile="-1,-1"]').click();
  g=await snapshot(page);expect(g.resources).toBe(before-100);expect(g.facilities.some(f=>f.type==='mortar')).toBe(true);
  await expect(page.locator('#first-voyage-action')).toHaveText('첫 임무 목록 보기');
  await page.screenshot({path:'artifacts/onboarding-prepared-720.png'});
  await page.locator('#first-voyage-action').click();await page.locator('[data-mission="coral-1"]').click();
  await expect(page.locator('#first-voyage-title')).toContainText('2 ·');
  await expect(page.locator('#first-voyage-text')).toContainText('WASD');
  await page.locator('#first-voyage-action').click();await expect(page.locator('#voyage-panel')).toBeVisible();
  expect((await snapshot(page)).campaign.missionId).toBe('coral-1');expect(errors).toEqual([]);
});

test('recommended new campaign still protects a paid save and mode switching keeps its progress',async({page})=>{
  await page.clock.install();await page.goto('/');await page.locator('#beginner-start').click();
  await page.locator('#first-voyage-action').click();await page.locator('[data-tile="-1,-1"]').click();
  const paid=await snapshot(page);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.reload();await expect(page.locator('#continue-button')).toBeVisible();
  await page.locator('#beginner-start').click();await expect(page.locator('#replace-overlay')).toBeVisible();
  await page.locator('#cancel-new').click();await page.locator('#continue-button').click();
  let g=await snapshot(page);expect(g.resources).toBe(paid.resources);expect(g.facilities).toEqual(paid.facilities);
  await page.locator('#resume-button').click();await page.locator('#mode-button').click();
  await expect(page.locator('#beginner-start')).toBeHidden();await page.locator('[data-start="destination"]').click();
  g=await snapshot(page);expect(g.mode).toBe('destination');expect(g.resources).toBe(paid.resources);expect(g.facilities).toEqual(paid.facilities);
});

test('training keeps its existing rules without campaign onboarding',async({page})=>{
  await page.clock.install();await page.goto('/');await page.locator('[data-experience="training"]').click();
  await page.locator('[data-start="destination"]').click();
  expect((await snapshot(page)).campaign).toBeFalsy();await expect(page.locator('#first-voyage')).toBeHidden();
});
