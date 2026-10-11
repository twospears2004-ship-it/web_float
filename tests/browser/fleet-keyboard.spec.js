import {test,expect} from '@playwright/test';
import {unitUpgradeCost} from '../../src/fleet.js';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
const selection=page=>page.evaluate(()=>window.__TIDEHOLD__.selection());

test('keyboard fleet selection and paid upgrade preserve focus and selected units',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();
  await page.locator('[data-tab="fleet"]').click();for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
  expect((await state(page)).resources).toBe(406);
  const first=page.locator('[data-unit-select="1"]');await first.focus();await page.keyboard.press('Enter');
  await expect(first).toBeFocused();expect((await selection(page)).units).toEqual([1]);
  const second=page.locator('[data-unit-select="2"]');await second.focus();await page.keyboard.press('Shift+Enter');
  await expect(second).toBeFocused();expect((await selection(page)).units).toEqual([1,2]);
  const before=await state(page),cost=unitUpgradeCost(before.fleet.units[0]);
  const upgrade=page.locator('[data-unit-upgrade="1"]');await upgrade.focus();await page.keyboard.press('Enter');
  await expect(upgrade).toBeDisabled();await expect(first).toBeFocused();const upgraded=await state(page);
  expect(upgraded.resources).toBe(before.resources-cost);expect(upgraded.fleet.units[0].level).toBe(2);
  expect(upgraded.fleet.units[1].level).toBe(1);expect((await selection(page)).units).toEqual([1,2]);
  await expect(first).toContainText('2단계');await expect(upgrade).toContainText(String(unitUpgradeCost(upgraded.fleet.units[0])));
  await page.keyboard.press('Control+5');expect((await state(page)).fleet.groups['5']).toEqual([1,2]);
  await page.screenshot({path:'artifacts/fleet-keyboard-focus.png'});
  await page.locator('[data-unit-dismiss="2"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-unit-select="2"]')).toHaveCount(0);await expect(first).toBeFocused();
  expect((await state(page)).fleet.units.map(u=>u.id)).toEqual([1,3]);
  expect((await selection(page)).units).toEqual([1]);expect((await state(page)).fleet.groups['5']).toEqual([1]);
  expect(errors).toEqual([]);
});

