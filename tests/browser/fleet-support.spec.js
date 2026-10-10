import {test,expect} from '@playwright/test';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
test('all four paid ship types render and the repair ship follows the attack command',async({page})=>{
  test.setTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/heart-6-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();
  let g=await snapshot(page);const producers=g.facilities.filter(f=>['fishery','workshop'].includes(f.type));
  for(const f of producers){await page.locator(`[data-tile="${f.x},${f.z}"]`).click();await page.locator('[data-action="demolish"]').click();}
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="0,-1"]').click();await page.locator('[data-action="upgrade"]').click();await page.locator('[data-action="upgrade"]').click();
  await page.locator('[data-tab="fleet"]').click();for(const type of ['skiff','gunboat','torpedo','tender'])await page.locator(`[data-recruit="${type}"]`).click();
  g=await snapshot(page);expect(g.fleet.units.map(u=>u.type)).toEqual(['skiff','gunboat','torpedo','tender']);
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-siege="siege-heart-1"]').click();await page.locator('#start-defense-wave').click();await page.keyboard.press('f');
  g=await snapshot(page);const generator=g.enemies.find(e=>e.type==='generator'),tender=g.fleet.units.find(u=>u.type==='tender');
  const r=await page.locator('#minimap').boundingBox();await page.mouse.click(r.x+(115+generator.x*0.65)/230*r.width,r.y+(100+generator.z*0.65)/180*r.height);await page.clock.runFor(800);
  const p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld({...p,y:0.6}),generator);await page.mouse.click(p.x,p.y,{button:'right'});
  expect((await snapshot(page)).fleet.units.every(u=>u.command.type==='attack'&&u.command.target===generator.id)).toBe(true);
  await page.clock.runFor(2500);g=await snapshot(page);const support=g.fleet.units.find(u=>u.type==='tender');expect(Math.hypot(support.x-tender.x,support.z-tender.z)).toBeGreaterThan(5);
  expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).unitMeshes).toBe(4);expect(errors).toEqual([]);
});
