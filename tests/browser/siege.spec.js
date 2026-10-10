import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function openRaid(page) {
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();
  await page.locator('[data-tab="fleet"]').click();for(let i=0;i<4;i++)await page.locator('[data-recruit="skiff"]').click();
  for(let i=1;i<=4;i++)await page.locator(`[data-unit-upgrade="${i}"]`).click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-siege="siege-coral-1"]').click();
  const earned=JSON.parse(await fs.readFile('artifacts/colony-fixtures/coral-6-harbor.json','utf8')).payload;
  const g=await snapshot(page);expect(g.operation.kind).toBe('siege');expect(g.operation.waiting).toBe(true);expect(g.resources).toBe(earned.resources-120-4*45-4*36);return g;
}
async function targetEnemy(page,e) {
  const r=await page.locator('#minimap').boundingBox();await page.mouse.click(r.x+(115+e.x*0.65)/230*r.width,r.y+(100+e.z*0.65)/180*r.height);await page.clock.runFor(800);
  const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld({...p,y:0.6}),e);await page.mouse.click(p.x,p.y,{button:'right'});
}
test('paid fleet raids three bases, cuts generator power and saves the earned result',async({page})=>{
  test.setTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await openRaid(page);
  for(let base=0;base<3;base++) {
    await page.locator('[data-tab="voyage"]').click();await page.locator('#start-defense-wave').click();
    expect((await snapshot(page)).route?.id).toBe(`siege-base-${base}`);await page.keyboard.press('f');
    let g=await snapshot(page);const generator=g.enemies.find(e=>e.type==='generator');await targetEnemy(page,generator);
    expect((await snapshot(page)).fleet.units.filter(u=>u.hp>0).every(u=>u.command.type==='attack'&&u.command.target===generator.id)).toBe(true);
    for(let t=0;t<90&&g.enemies.some(e=>e.id===generator.id&&e.hp>0)&&!g.operation.waiting;t+=2){await page.clock.runFor(2000);g=await snapshot(page);if(g.hull<g.maxHull*0.78)await page.keyboard.press('2');}
    expect(g.enemies.find(e=>e.id===generator.id).hp).toBe(0);
    await page.keyboard.press('g');
    for(let t=0;t<120&&g.phase==='playing'&&!g.operation.waiting;t+=2){await page.clock.runFor(2000);g=await snapshot(page);if(g.hull<g.maxHull*0.78)await page.keyboard.press('2');if(g.enemies.some(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<24))await page.keyboard.press('3');}
    expect(g.phase).not.toBe('defeat');expect(g.sites[base].cleared).toBe(true);
    if(base<2){expect(g.operation.waiting).toBe(true);expect(g.operation.round).toBe(base+1);await page.clock.runFor(12000);await page.locator('[data-tab="fleet"]').click();if(await page.locator('#repair-fleet').isEnabled())await page.locator('#repair-fleet').click();}
  }
  const g=await snapshot(page);expect(g.phase).toBe('mission-complete');expect(g.campaign.frontier.cleared).toContain('siege-coral-1');await expect(page.locator('#end-title')).toHaveText('거점을 확보했습니다');
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/siege-victory.png'});
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);await page.clock.resume();await page.reload();await page.locator('#continue-button').click();
  expect((await snapshot(page)).operation).toEqual(saved.operation);await page.locator('#retry-button').click();await expect(page.locator('[data-siege="siege-coral-2"]')).toBeEnabled();expect(errors).toEqual([]);
});
test('active raid reload preserves physical targets and orders; abandon restores the paid fleet',async({page})=>{
  test.setTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const departure=await openRaid(page);
  await page.locator('#start-defense-wave').click();await page.keyboard.press('f');const generator=(await snapshot(page)).enemies.find(e=>e.type==='generator');await targetEnemy(page,generator);await page.clock.runFor(5000);
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const saved=await snapshot(page);
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);
  expect(restored.operation).toEqual(saved.operation);expect(restored.enemies).toEqual(saved.enemies);expect(restored.fleet).toEqual(saved.fleet);
  await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();const harbor=await snapshot(page);
  expect(harbor.campaign.stage).toBe('harbor');expect(harbor.resources).toBe(departure.resources);expect(harbor.fleet.units.map(u=>u.hp)).toEqual(departure.fleet.units.map(u=>u.hp));expect(harbor.campaign.frontier.cleared).not.toContain('siege-coral-1');expect(errors).toEqual([]);
});
