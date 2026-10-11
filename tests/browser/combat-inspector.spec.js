import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function ready(page,ships=2){
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  if(ships){await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();for(let i=0;i<ships;i++)await page.locator('[data-recruit="skiff"]').click();await page.keyboard.press('f');}
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();await page.clock.runFor(300);
  const e=(await state(page)).enemies[0],r=await page.locator('#minimap').boundingBox();await page.mouse.click(r.x+(115+e.x*0.65)/230*r.width,r.y+(100+e.z*0.65)/180*r.height);await page.clock.runFor(1000);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));return e;
}
async function contactPoint(page,e){return page.evaluate(p=>window.__TIDEHOLD__.projectWorld({...p,y:0.6}),e);}

test('enemy click retains paid formation without engaging; keyboard attack and normal reload preserve real order',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const e=await ready(page),before=await state(page),p=await contactPoint(page,e);
  await page.mouse.click(p.x,p.y);await expect(page.locator('#contact-name')).toHaveText('산호 포식자');await expect(page.locator('#contact-health')).toContainText('대기 중');await expect(page.locator('#contact-stats')).toContainText('장갑 0% · 사거리 8m');await expect(page.locator('#selection-count')).toHaveText('선택 2');expect(await state(page)).toEqual(before);
  await page.locator('[data-tab="campaign"]').click();const [idleDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await idleDownload.saveAs('artifacts/combat-inspector-idle-earned.json');
  const button=page.locator('#attack-contact'),handle=await button.elementHandle();await button.focus();await page.keyboard.press('Enter');await expect(button).toBeFocused();expect(await button.evaluate((a,b)=>a===b,handle)).toBe(true);let g=await state(page);expect(g.fleet.units.every(u=>u.command.type==='attack'&&u.command.target===e.id)).toBe(true);await expect(page.locator('#contact-orders')).toContainText('이 적 공격 2기');
  await page.clock.runFor(100);await page.screenshot({path:'artifacts/combat-inspector-selected.png'});await page.locator('[data-tab="campaign"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/combat-inspector-earned.json');const saved=JSON.parse(await fs.readFile('artifacts/combat-inspector-earned.json','utf8')).payload;expect(saved).not.toHaveProperty('inspectedEnemy');
  await page.keyboard.press('p');await page.clock.resume();await page.reload();await page.locator('#continue-button').click();expect((await state(page)).fleet).toEqual(saved.fleet);await expect(page.locator('#contact-panel')).toBeHidden();expect(errors).toEqual([]);
});
test('inspection works without a fleet, can close, and fits the narrow viewport',async({page})=>{
  const e=await ready(page,0),before=await state(page),p=await contactPoint(page,e);await page.mouse.click(p.x,p.y);await expect(page.locator('#contact-panel')).toBeVisible();await expect(page.locator('#attack-contact')).toBeDisabled();expect(await state(page)).toEqual(before);
  await page.setViewportSize({width:720,height:900});await page.clock.runFor(100);const panel=await page.locator('#contact-panel').boundingBox(),scene=await page.locator('.viewport').boundingBox();expect(panel.x).toBeGreaterThanOrEqual(scene.x);expect(panel.x+panel.width).toBeLessThanOrEqual(scene.x+scene.width);expect(panel.y+panel.height).toBeLessThanOrEqual(scene.y+scene.height);await page.screenshot({path:'artifacts/combat-inspector-narrow.png'});await page.locator('#close-contact').click();await expect(page.locator('#contact-panel')).toBeHidden();
});
test('Shift attack queues, plain attack replaces, pause blocks and defeated contact clears safely',async({page})=>{
  test.setTimeout(180000);const e=await ready(page),p=await contactPoint(page,e);await page.mouse.click(p.x,p.y);
  await page.locator('#scene canvas').click({position:{x:240,y:290},button:'right'});const moving=(await state(page)).fleet.units.map(u=>u.command);expect(moving.every(o=>o.type==='move')).toBe(true);await page.locator('#attack-contact').click({modifiers:['Shift']});let g=await state(page);expect(g.fleet.units.map(u=>u.command)).toEqual(moving);expect(g.fleet.units.every(u=>u.orders[0].target===e.id)).toBe(true);await expect(page.locator('#contact-orders')).toContainText('예약 2기');
  await page.locator('#attack-contact').click();g=await state(page);expect(g.fleet.units.every(u=>u.command.target===e.id&&!u.orders)).toBe(true);await page.keyboard.press('p');await expect(page.locator('#attack-contact')).toBeDisabled();const frozen=(await state(page)).fleet;await page.keyboard.press('h');expect((await state(page)).fleet).toEqual(frozen);await page.locator('#resume-button').click();
  await page.locator('#attack-contact').focus();for(let t=0;t<80&&(await state(page)).enemies.some(o=>o.id===e.id&&o.hp>0);t++)await page.clock.runFor(1000);expect((await state(page)).enemies.find(o=>o.id===e.id)?.hp||0).toBe(0);await expect(page.locator('#contact-panel')).toBeHidden();await expect(page.locator('#command-toggle')).toBeFocused();
});

test('repeated contact open/close reuses a fixed graphics pool without engaging enemies',async({page})=>{
  const e=await ready(page,0),before=await state(page),info=()=>page.evaluate(()=>window.__TIDEHOLD__.rendererInfo()),samples=[];
  const p=await contactPoint(page,e);await page.mouse.click(p.x,p.y);await page.clock.runFor(100);await page.locator('#close-contact').click();await page.clock.runFor(100);const baseline=await info();
  for(let cycle=0;cycle<8;cycle++){
    await page.mouse.click(p.x,p.y);await expect(page.locator('#contact-panel')).toBeVisible();await page.clock.runFor(100);const open=await info();await page.locator('#close-contact').click();await expect(page.locator('#contact-panel')).toBeHidden();await expect(page.locator('#pause-button')).toBeFocused();await page.clock.runFor(100);const closed=await info();
    expect(open.geometries).toBe(baseline.geometries);expect(closed.geometries).toBe(baseline.geometries);expect(closed.textures).toBe(baseline.textures);samples.push({cycle,open,closed});
  }
  const after=await state(page);expect(after.enemies).toEqual(before.enemies);expect(after.resources).toBe(before.resources);expect(after.fleet).toEqual(before.fleet);await fs.writeFile('artifacts/combat-inspector-graphics.json',JSON.stringify({baseline,samples,virtualClock:true,scope:'fixed inspection rings after first GPU upload, eight normally clicked open/close cycles, no enemies activated'},null,2));
});
