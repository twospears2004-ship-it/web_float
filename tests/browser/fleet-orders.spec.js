import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function ready(page){
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();
  await page.locator('[data-tab="fleet"]').click();for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
  await page.locator('[data-unit-select="1"]').click();await page.locator('[data-unit-select="2"]').click({modifiers:['Shift']});
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));
}
async function rightClick(page,point,queued=false){
  const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),point);
  if(queued)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y,{button:'right'});if(queued)await page.keyboard.up('Shift');
}

test('paid fleet queues visible routes with Shift, preserves them on reload and executes both legs',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  const before=await state(page),third=before.fleet.units[2].command;
  await rightClick(page,{x:-18,z:-18});const first=(await state(page)).fleet.units.slice(0,2).map(u=>u.command);
  await rightClick(page,{x:-27,z:8},true);await page.keyboard.press('x');await rightClick(page,{x:-35,z:8},true);
  let g=await state(page);expect(g.fleet.units.slice(0,2).map(u=>u.command)).toEqual(first);expect(g.fleet.units[0].orders.map(o=>o.type)).toEqual(['move','attackMove']);expect(g.fleet.units[2].command).toEqual(third);expect(g.resources).toBe(406);
  await page.locator('[data-tab="fleet"]').click();await expect(page.locator('[data-unit-card="1"] [data-unit-command]')).toContainText('예약 2');
  await page.clock.runFor(100);const info=await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo());expect(info.commandMarkers).toBe(8);
  await page.clock.resume();await page.screenshot({path:'artifacts/fleet-orders-route.png'});await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));
  await page.locator('[data-tab="campaign"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/fleet-orders-export.json');
  const saved=JSON.parse(await fs.readFile('artifacts/fleet-orders-export.json','utf8')).payload;expect(saved.fleet.units[0].orders).toHaveLength(2);
  await page.keyboard.press('p');await page.clock.resume();await page.reload();await page.locator('#continue-button').click();expect((await state(page)).fleet).toEqual(saved.fleet);await page.locator('#resume-button').click();
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));await page.keyboard.press('f');
  for(let i=0;i<25;i++)await page.clock.runFor(1000);g=await state(page);
  for(const u of g.fleet.units.slice(0,2)){expect(u.command.type).toBe('hold');expect(u.orders).toBeUndefined();expect(Math.hypot(u.x+35,u.z-8)).toBeLessThan(3);}
  expect(g.campaign.missionId).toBe('coral-1');expect(errors).toEqual([]);
});

test('plain orders and H/G cancel reservations; paused Shift input cannot change them',async({page})=>{
  await ready(page);await rightClick(page,{x:-18,z:-18});await rightClick(page,{x:-27,z:8},true);
  await page.keyboard.press('p');const frozen=(await state(page)).fleet;await rightClick(page,{x:-35,z:8},true);expect((await state(page)).fleet).toEqual(frozen);
  await page.locator('#resume-button').click();await rightClick(page,{x:-30,z:-15});let g=await state(page);for(const u of g.fleet.units.slice(0,2))expect(u.orders).toBeUndefined();
  await rightClick(page,{x:-27,z:8},true);await page.keyboard.press('h');g=await state(page);for(const u of g.fleet.units.slice(0,2)){expect(u.command.type).toBe('hold');expect(u.orders).toBeUndefined();}
  await rightClick(page,{x:-18,z:-18},true);await rightClick(page,{x:-27,z:8},true);await page.keyboard.press('g');g=await state(page);for(const u of g.fleet.units.slice(0,2)){expect(u.command.type).toBe('escort');expect(u.orders).toBeUndefined();}
  await page.clock.runFor(100);expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).commandMarkers).toBe(0);
});

test('full reservations remain bounded and clearing routes releases their graphics repeatedly',async({page})=>{
  await ready(page);await page.keyboard.press('h');await page.clock.runFor(100);
  const info=()=>page.evaluate(()=>window.__TIDEHOLD__.rendererInfo()),baseline=await info(),samples=[];
  for(let cycle=0;cycle<6;cycle++){
    await rightClick(page,{x:-18,z:-18});for(let i=0;i<8;i++)await rightClick(page,{x:-27,z:8},true);
    const full=(await state(page)).fleet;await rightClick(page,{x:-35,z:8},true);expect((await state(page)).fleet).toEqual(full);
    await page.clock.runFor(100);const queued=await info();expect(queued.commandMarkers).toBe(20);expect(queued.geometries).toBeLessThanOrEqual(baseline.geometries+20);
    await page.keyboard.press('h');await page.clock.runFor(100);const cleared=await info();expect(cleared.commandMarkers).toBe(0);expect(cleared.geometries).toBe(baseline.geometries);expect(cleared.textures).toBe(baseline.textures);samples.push({cycle,queued,cleared});
  }
  await fs.writeFile('artifacts/fleet-orders-render.json',JSON.stringify({baseline,samples,virtualClock:true,scope:'two normally purchased selected ships, repeated full reservation graphics lifecycle'},null,2));
});
