import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function colony(page,fixture='artifacts/colony-fixtures/black-6-harbor.json'){
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  // Paid, normally earned earlier colony audit; importing it tests the late UI,
  // not a fresh twenty-hour journey or the new combat source.
  await page.locator('#save-file').setInputFiles(fixture);await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();
}
test('earned chart research shows current/next effects and affordable keyboard purchase retains the same control, cost and saved level',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await colony(page,'artifacts/atlas-fixtures/kelp-completion-harbor.json');const before=await snapshot(page),button=page.locator('[data-research="ballistics"]'),original=await button.elementHandle();
  await expect(button).toContainText('현재 무장 피해 +36%');await expect(button).toContainText('다음 무장 피해 +48%');await expect(button).toContainText('연구 가능');
  await button.focus();await page.keyboard.press('Enter');await expect(button).toBeFocused();expect(await button.evaluate((current,previous)=>current===previous,original)).toBe(true);await expect(button).toContainText('4/5');await expect(button).toContainText('현재 무장 피해 +48%');await expect(button).toContainText('다음 무장 피해 +60%');
  const after=await snapshot(page);expect(after.resources).toBe(before.resources);expect(after.campaign.research).toBe(before.campaign.research-5);await expect(page.locator('#research-points')).toContainText(`자원 ${after.resources}`);
  await page.clock.runFor(250);await page.clock.resume();await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/research-growth.png'});await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.reload();await page.locator('#continue-button').click();
  expect((await snapshot(page)).campaign.tech.ballistics).toBe(4);expect((await snapshot(page)).resources).toBe(after.resources);expect(errors).toEqual([]);
});
test('last affordable research keeps keyboard navigation usable and material spending refreshes the real blocker',async({page})=>{
  await colony(page);const button=page.locator('[data-research="precision"]');await button.focus();
  for(let count=0;count<3&&await button.isEnabled();count++){await button.focus();await page.keyboard.press('Enter');}
  await expect(button).toBeDisabled();await expect(button).toContainText(/최대 단계 완료|자원 \d+ 부족|자료 \d+ 부족/);
  expect(await page.evaluate(()=>document.activeElement?.id==='research-points'||!!document.activeElement?.dataset.research)).toBe(true);
  const state=await snapshot(page);await page.locator('[data-tab="build"]').click();await page.locator('[data-tab="campaign"]').click();expect((await snapshot(page)).resources).toBe(state.resources);
  await expect(page.locator('[data-research="cartography"]')).toContainText(/완성 해도|최대 단계 완료|연구 가능|부족/);
});
