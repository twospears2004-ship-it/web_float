import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {structureHull} from '../../src/fortifications.js';
import {decodeSave} from '../../src/save.js';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
test('earned base → walls and defense waves → field repair → record → saved victory',async({page})=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="wall"]').click();await page.locator('[data-tile="0,2"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-defense="defense-coral-1"]').click();let g=await snapshot(page);expect(g.operation.waiting).toBe(true);expect(g.facilities.every(f=>f.hp>0)).toBe(true);
  for(let wave=0;wave<4;wave++) {
    await page.locator('[data-tab="voyage"]').click();await page.locator('#start-defense-wave').click();
    for(let t=0;t<180;t+=3){await page.clock.runFor(3000);g=await snapshot(page);if(g.phase!=='playing'||g.operation.waiting)break;if(g.hull<g.maxHull*0.75)await page.keyboard.press('2');}
    expect(g.phase).not.toBe('defeat');
    if(wave<3){expect(g.operation.waiting).toBe(true);const damaged=g.facilities.find(f=>f.hp<structureHull(f));if(damaged){await page.locator('[data-tab="build"]').click();if(await page.locator('#placement-panel').isHidden())await page.locator('#board-toggle').click();await page.locator(`[data-tile="${damaged.x},${damaged.z}"]`).click();if(await page.locator('[data-action="restore"]').isEnabled())await page.locator('[data-action="restore"]').click();}}
  }
  expect(g.phase).toBe('mission-complete');expect(g.campaign.frontier.cleared).toContain('defense-coral-1');await expect(page.locator('#end-title')).toHaveText('기지를 지켰습니다');
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/defense-victory.png'});await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);await page.clock.resume();await page.reload();await page.locator('#continue-button').click();expect((await snapshot(page)).operation).toEqual(saved.operation);
  await page.locator('#retry-button').click();await expect(page.locator('[data-defense="defense-coral-2"]')).toBeEnabled();expect(errors).toEqual([]);
});
test('live defense autosave keeps attackers, facility damage and the wave on reload',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-defense="defense-coral-1"]').click();await page.locator('#start-defense-wave').click();await page.clock.runFor(12000);await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);expect(restored.enemies).toEqual(saved.enemies);expect(restored.facilities).toEqual(saved.facilities);expect(restored.operation).toEqual(saved.operation);expect(restored.campaign.completed).toEqual(saved.campaign.completed);expect(errors).toEqual([]);
});

test('earned late defense returns to a saveable harbor and restores its banked progress',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  const file='artifacts/defense-fixtures/defense-black-1-result.json',earned=decodeSave(await fs.readFile(file,'utf8'));
  await page.locator('#save-file').setInputFiles(file);await expect(page.locator('#end-title')).toHaveText('기지를 지켰습니다');expect((await snapshot(page)).campaign.encounterWave).toBe(5);
  await page.locator('#retry-button').click();await expect(page.locator('#save-status')).toContainText('자동 저장 완료');
  const facilities=items=>items.map(({cooldown,...owned})=>owned),campaign=({totalActiveSeconds,...progress})=>progress;
  const harbor=await snapshot(page);expect(harbor.campaign.stage).toBe('harbor');expect(harbor.resources).toBe(earned.resources);expect(harbor.campaign.frontier).toEqual(earned.campaign.frontier);expect(harbor.campaign.research).toBe(earned.campaign.research);expect(facilities(harbor.facilities)).toEqual(facilities(earned.facilities));
  // Unpaused harbor time can advance total time and reduce weapon cooldowns.
  // Ownership and earned progress must stay unchanged; paused reload is exact.
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/late-defense-harbor-export.json');const exported=decodeSave(await fs.readFile('artifacts/late-defense-harbor-export.json','utf8'));expect(exported.resources).toBe(harbor.resources);expect(campaign(exported.campaign)).toEqual(campaign(harbor.campaign));expect(exported.fleet).toEqual(harbor.fleet);
  await page.screenshot({path:'artifacts/late-defense-harbor.png'});await page.keyboard.press('p');await page.clock.runFor(5100);const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);
  for(const key of ['campaign','resources','facilities','fleet'])expect(restored[key]).toEqual(saved[key]);await expect(page.locator('#pause-overlay')).toBeVisible();expect(errors).toEqual([]);
});
