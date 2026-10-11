import {test,expect} from '@playwright/test';

test('rejected imports stay explained through autosave without replacing the earned campaign',async({page})=>{
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');
  const state=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot()),before=await state();
  await page.locator('#save-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.locator('#import-save-status')).toContainText('불러오기 실패');
  await page.clock.runFor(6000);await expect(page.locator('#save-status')).toContainText('자동 저장 완료');
  await expect(page.locator('#import-save-status')).toBeVisible();await expect(page.locator('#import-save-status')).toContainText('기존 진행은 유지');
  const after=await state();expect(after.campaign).toEqual(before.campaign);expect(after.resources).toBe(before.resources);expect(after.facilities).toEqual(before.facilities);
  const disk=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);expect(disk.resources).toBe(before.resources);expect(disk.campaign).toEqual(before.campaign);
  await page.locator('#resume-button').click();await page.locator('#dismiss-import-error').click();await expect(page.locator('#import-save-notice')).toBeHidden();
  await page.locator('#save-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.locator('#import-save-notice')).toBeVisible();
  await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await expect(page.locator('#import-save-notice')).toBeHidden();
});
