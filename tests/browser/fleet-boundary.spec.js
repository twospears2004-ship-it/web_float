import {test,expect} from '@playwright/test';
import {navigable} from '../../src/navigation.js';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
test('an earned large island at the world edge keeps fleet movement in water and restores its orders',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/heart-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();let g=await snapshot(page);
  for(const f of g.facilities.filter(f=>['fishery','workshop'].includes(f.type))){await page.locator(`[data-tile="${f.x},${f.z}"]`).click();await page.locator('[data-action="demolish"]').click();}
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="0,-1"]').click();await page.locator('[data-tab="fleet"]').click();for(let i=0;i<6;i++)await page.locator('[data-recruit="skiff"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-siege="siege-coral-1"]').click();await page.locator('#start-defense-wave').click();
  await page.keyboard.down('d');g=await snapshot(page);
  for(let i=0;i<30&&g.island.x<100;i++){await page.clock.runFor(500);g=await snapshot(page);}
  await page.keyboard.up('d');g=await snapshot(page);expect(g.island.x).toBeGreaterThanOrEqual(100);expect(g.island.x).toBeLessThan(108);expect(g.tiles).toHaveLength(49);
  await page.keyboard.press('f');const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),{x:109,z:0});await page.mouse.click(p.x,p.y,{button:'right'});g=await snapshot(page);
  const living=g.fleet.units.filter(u=>u.hp>0);expect(living.length).toBeGreaterThan(0);expect(living.some(u=>u.command.type==='move')).toBe(true);
  // A ship already at its projected formation slot can finish on the first
  // animation frame. Hold is valid here; escort would mean no order was issued.
  for(const u of living){expect(['move','hold']).toContain(u.command.type);expect(navigable(g,u.command.type==='move'?u.command:u,0.85)).toBe(true);}
  for(let i=0;i<45&&g.fleet.units.some(u=>u.hp>0&&u.command.type==='move');i++){await page.clock.runFor(1000);g=await snapshot(page);}
  for(const u of g.fleet.units.filter(u=>u.hp>0)){expect(navigable(g,u,0.85)).toBe(true);expect(u.command.type).toBe('hold');}
  await page.screenshot({path:'artifacts/fleet-boundary.png'});
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);await page.clock.resume();await page.reload();await page.locator('#continue-button').click();expect((await snapshot(page)).fleet).toEqual(saved.fleet);expect(errors).toEqual([]);
});
