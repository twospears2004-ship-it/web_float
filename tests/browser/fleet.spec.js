import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function fleetReady(page,mode) {
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));await page.goto('/');await page.locator(`[data-start="${mode}"]`).click();
  // Normal-earned colony checkpoint. No direct state injections or free units.
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();
  if(mode==='direct'){await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();}
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('[data-recruit="skiff"]').click();await page.locator('[data-recruit="skiff"]').click();
  const earned=JSON.parse(await fs.readFile('artifacts/colony-fixtures/coral-6-harbor.json','utf8')).payload;
  const g=await snapshot(page);expect(g.fleet.units).toHaveLength(2);expect(g.resources).toBe(earned.resources-120-2*45);
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();await page.clock.runFor(300);
  return snapshot(page);
}
for(const mode of ['direct','destination'])test(`earned ${mode} fleet → click/drag → formation move → saved order and hull`,async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await fleetReady(page,mode);
  if(await page.locator('#command-toggle').getAttribute('aria-pressed')==='false')await page.locator('#command-toggle').click();let g=await snapshot(page);
  const points=await page.evaluate(units=>units.map(u=>window.__TIDEHOLD__.projectWorld(u)),g.fleet.units);
  await page.mouse.move(Math.min(...points.map(p=>p.x))-18,Math.min(...points.map(p=>p.y))-18);await page.mouse.down();await page.mouse.move(Math.max(...points.map(p=>p.x))+18,Math.max(...points.map(p=>p.y))+18,{steps:6});await page.mouse.up();
  expect(await page.evaluate(()=>window.__TIDEHOLD__.selection().units)).toEqual([1,2]);await expect(page.locator('#selection-count')).toHaveText('선택 2');
  const destination={x:-20,z:-20},p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),destination);await page.mouse.click(p.x,p.y,{button:'right'});
  g=await snapshot(page);expect(g.fleet.units.every(u=>u.command.type==='move')).toBe(true);const issued=g.fleet.units.map(u=>({id:u.id,x:u.x,z:u.z,command:{...u.command}}));await page.clock.runFor(7000);
  g=await snapshot(page);await fs.writeFile(`artifacts/fleet-${mode}-formation-observation.json`,JSON.stringify({mode,destination,issued,island:g.island,time:g.time,units:g.fleet.units},null,2));for(const u of g.fleet.units)expect(Math.hypot(u.x-destination.x,u.z-destination.z)).toBeLessThan(3);
  await page.locator('[data-tab="fleet"]').click();await expect(page.locator('#fleet-capacity')).toContainText('2 / 6');await page.locator('#fleet-focus').click();await page.clock.runFor(500);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/fleet-${mode}.png`});
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);await page.reload();await page.locator('#continue-button').click();
  expect((await snapshot(page)).fleet).toEqual(saved.fleet);expect(errors).toEqual([]);
});
test('selected fleet right-click attacks a real enemy and hands off to hold after death',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let g=await fleetReady(page,'direct');
  await page.keyboard.press('f');const e=g.enemies[0];
  // The map moves the camera, then the pointer targets the rendered opponent.
  const r=await page.locator('#minimap').boundingBox();await page.mouse.click(r.x+(115+e.x*0.65)/230*r.width,r.y+(100+e.z*0.65)/180*r.height);await page.clock.runFor(1000);
  const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld({...p,y:0.6}),e);await page.mouse.click(p.x,p.y,{button:'right'});
  g=await snapshot(page);expect(g.fleet.units.every(u=>u.command.type==='attack'&&u.command.target===e.id)).toBe(true);
  const initialKills=g.kills;for(let t=0;t<80&&g.enemies.some(o=>o.id===e.id&&o.hp>0);t++){await page.clock.runFor(1000);g=await snapshot(page);}
  expect(g.kills).toBeGreaterThan(initialKills);expect(g.enemies.find(o=>o.id===e.id)?.hp || 0).toBe(0);expect(g.fleet.units.some(u=>u.command.type==='hold')).toBe(true);expect(errors).toEqual([]);
});
