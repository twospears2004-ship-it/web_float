import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function exportSave(page,file){await page.locator('[data-tab="campaign"]').click();const download=page.waitForEvent('download');await page.locator('#export-save').click();await(await download).saveAs(file);}
async function ready(page,mode='destination'){
  await page.clock.install({time:new Date('2026-10-11T14:00:00Z')});await page.clock.pauseAt(new Date('2026-10-11T15:00:00Z'));await page.goto('/');await page.locator(`[data-start="${mode}"]`).click();
  // Normally earned colony checkpoint; construction/recruitment pay through UI.
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();if(mode==='direct'){await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();}
  const earned=await state(page);await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();for(let i=0;i<2;i++)await page.locator('[data-recruit="skiff"]').click();expect((await state(page)).resources).toBe(earned.resources-210);
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();await page.clock.runFor(300);await page.locator('[data-tab="fleet"]').click();await page.locator('#select-all-units').click();
}
async function rightClick(page,point,queued=false){const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),point);if(queued)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y,{button:'right'});if(queued)await page.keyboard.up('Shift');}
for(const mode of ['direct','destination'])test(`earned ${mode} fleet chooses a stable wide control and sails to separate destinations`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,mode);const before=await state(page),button=page.locator('#spread-formation'),handle=await button.elementHandle();await expect(button).toHaveAttribute('aria-pressed','false');
  if(mode==='destination'){await exportSave(page,'artifacts/fleet-formations-ready-earned.json');await page.locator('[data-tab="fleet"]').click();}
  await button.focus();await page.keyboard.press('Enter');await expect(button).toBeFocused();await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toHaveText('분산 이동 · 12m');expect(await button.evaluate((a,b)=>a===b,handle)).toBe(true);expect((await state(page)).fleet).toEqual(before.fleet);
  await rightClick(page,{x:-25,z:-20});let g=await state(page);expect(g.resources).toBe(before.resources);expect(g.fleet.units.every(u=>u.command.type==='move')).toBe(true);expect(Math.abs(g.fleet.units[0].command.x-g.fleet.units[1].command.x)).toBeCloseTo(12,8);expect(g.fleet.units[0].command.z).toBeCloseTo(g.fleet.units[1].command.z,8);expect(g.checkpoint).toEqual(before.checkpoint);
  const destinations=g.fleet.units.map(u=>({...u.command}));await page.clock.runFor(7000);g=await state(page);for(let i=0;i<2;i++){expect(g.fleet.units[i].command.type).toBe('hold');expect(Math.hypot(g.fleet.units[i].x-destinations[i].x,g.fleet.units[i].z-destinations[i].z)).toBeLessThan(.65);}
  if(mode==='destination'){await page.setViewportSize({width:720,height:900});await page.clock.runFor(100);const box=await page.locator('#fleet-toolbar').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(720);await expect(button).toBeVisible();await page.screenshot({path:'artifacts/fleet-formations-narrow.png'});}
  expect(errors).toEqual([]);
});
test('wide then compact attack-move reservation survives export/reload, while pause and a single ship disable the control',async({page})=>{
  // Keep this transport/reload route away from the first assault. Attack-move
  // may legitimately stop to fight if a route passes an undiscovered defender.
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);const before=await state(page),button=page.locator('#spread-formation');await button.click();await rightClick(page,{x:25,z:-18});const first=(await state(page)).fleet.units.map(u=>({...u.command}));await button.click();await page.locator('#attack-move').click();await rightClick(page,{x:30,z:-18},true);
  const queued=await state(page);expect(queued.fleet.units.map(u=>u.command)).toEqual(first);expect(queued.fleet.units.every(u=>u.orders?.length===1&&u.orders[0].type==='attackMove')).toBe(true);expect(Math.abs(queued.fleet.units[0].orders[0].x-queued.fleet.units[1].orders[0].x)).toBeCloseTo(3,8);expect(queued.resources).toBe(before.resources);expect(queued.checkpoint).toEqual(before.checkpoint);
  await exportSave(page,'artifacts/fleet-formations-queued-earned.json');await page.keyboard.press('p');await expect(button).toBeDisabled();await page.reload();await page.locator('#continue-button').click();expect((await state(page)).fleet).toEqual(queued.fleet);await expect(button).toHaveAttribute('aria-pressed','false');await page.locator('#resume-button').click();await page.clock.runFor(20000);const final=await state(page);await fs.writeFile('artifacts/fleet-formations-reservation-observation.json',JSON.stringify({queued,final},null,2));expect(final.fleet.units.every(u=>u.command.type==='hold'&&!u.orders)).toBe(true);
  await page.locator('[data-tab="fleet"]').click();await page.locator('[data-unit-select="1"]').click();await expect(button).toBeDisabled();expect(errors).toEqual([]);
});
