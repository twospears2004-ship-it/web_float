import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {decodeSave,encodeSave} from '../../src/save.js';
import {structureHull,structureRepairCost} from '../../src/fortifications.js';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());

test('refit overview selects damaged and stocked facilities without charging, then uses normal repair and harvest',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Explicit validation fixture, not an earned journey or playtime result.
  const fixture=decodeSave(await fs.readFile('tests/fixtures/walls-legacy-coral-harbor.json','utf8'));
  const cannon=fixture.facilities[0],fishery=fixture.facilities.find(f=>f.type==='fishery');
  cannon.hp=structureHull(cannon)-75;fishery.stock=26;
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles({name:'refit-validation.json',mimeType:'application/json',buffer:Buffer.from(encodeSave(fixture))});
  await page.locator('#resume-button').click();await page.locator('[data-tab="build"]').click();
  await expect(page.locator('#refit-count')).toHaveText('복구 필요 1개 · 수확 가능 ◆ 26');
  const before=await snapshot(page);await page.locator(`[data-refit="${cannon.id}"]`).click();
  await expect(page.locator('#facility-panel')).toBeFocused();
  expect((await snapshot(page)).resources).toBe(before.resources);
  await expect(page.locator('[data-action="restore"]')).toHaveText(`시설 복구 · ◆ ${structureRepairCost(cannon)}`);
  await page.locator('[data-action="restore"]').click();
  let g=await snapshot(page);expect(g.resources).toBe(before.resources-structureRepairCost(cannon));
  expect(g.facilities.find(f=>f.id===cannon.id).hp).toBe(structureHull(cannon));
  await expect(page.locator(`[data-refit="${cannon.id}"]`)).toHaveCount(0);
  await page.locator(`[data-refit="${fishery.id}"]`).click();const money=g.resources;
  await page.locator('[data-action="collect"]').click();g=await snapshot(page);
  expect(g.resources).toBe(money+26);await expect(page.locator('#refit-summary')).toBeHidden();
  expect(g.facilities.find(f=>f.id===fishery.id).stock).toBe(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.reload();
  await page.locator('#continue-button').click();await page.locator('#resume-button').click();await page.locator('[data-tab="build"]').click();
  expect((await snapshot(page)).resources).toBe(g.resources);await expect(page.locator('#refit-summary')).toBeHidden();expect(errors).toEqual([]);
});

test('destroyed walls show their tile face and remain selectable when recovery is unaffordable',async({page})=>{
  const fixture=decodeSave(await fs.readFile('tests/fixtures/walls-legacy-coral-harbor.json','utf8'));
  fixture.resources=0;const id=fixture.nextId++;
  fixture.facilities.push({id,type:'wall',x:-1,z:-1,edge:'north',level:1,hp:0,cooldown:0,aim:0,investment:35,targeting:'nearest'});
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles({name:'wall-refit-validation.json',mimeType:'application/json',buffer:Buffer.from(encodeSave(fixture))});
  await page.locator('#resume-button').click();await page.locator('[data-tab="build"]').click();
  const row=page.locator(`[data-refit="${id}"]`);await expect(row).toContainText('북쪽 면');await expect(row).toContainText('파괴');
  await row.click();await expect(page.locator('[data-action="restore"]')).toBeDisabled();
  expect((await snapshot(page)).resources).toBe(0);
  await page.locator('#board-toggle').click();await page.screenshot({path:'artifacts/refit-destroyed-wall.png'});
});
