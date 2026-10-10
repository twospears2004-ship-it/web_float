import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
const selection=page=>page.evaluate(()=>window.__TIDEHOLD__.selection());
async function ready(page,mode='destination'){
  await page.clock.install();await page.goto('/');await page.locator(`[data-start="${mode}"]`).click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  if(mode==='direct'){await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();}
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();
  for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
  const g=await state(page);expect(g.resources).toBe(406);expect(g.fleet.units).toHaveLength(3);
}
for(const mode of ['direct','destination'])test(`paid ${mode} fleet groups → keyboard/UI selection → separate orders → export and reload`,async({page})=>{
  test.setTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,mode);
  await page.locator('[data-unit-select="1"]').click();await page.locator('[data-unit-select="2"]').click({modifiers:['Shift']});await page.keyboard.press('Control+5');
  await expect(page.locator('[data-control-group="5"]')).toContainText('2기');
  await page.locator('[data-unit-select="3"]').click();await page.keyboard.press('Control+6');await page.locator('[data-group-save="7"]').click();
  await page.locator('[data-unit-select="1"]').click();await page.locator('[data-group-save="7"]').click({modifiers:['Shift']});
  await page.locator('#scene canvas').dispatchEvent('keydown',{key:'Process',code:'Digit8',ctrlKey:true,isComposing:true,bubbles:true});
  expect((await state(page)).fleet.groups).toEqual({5:[1,2],6:[3],7:[3,1],8:[1]});
  await page.keyboard.press('5');expect((await selection(page)).units).toEqual([1,2]);await page.keyboard.press('Shift+6');expect((await selection(page)).units).toEqual([1,2,3]);
  await page.keyboard.press('5');await page.keyboard.press('5');expect((await selection(page)).focus).toBe(true);await page.keyboard.press('c');
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();await page.clock.runFor(300);
  await page.keyboard.press('5');const before=await state(page);const third=structuredClone(before.fleet.units[2].command);
  const goal={x:-20,z:-20},p=await page.evaluate(p=>window.__TIDEHOLD__.projectWorld(p),goal);await page.mouse.click(p.x,p.y,{button:'right'});
  let g=await state(page);expect(g.fleet.units.slice(0,2).every(u=>u.command.type==='move')).toBe(true);expect(g.fleet.units[2].command).toEqual(third);
  await page.clock.runFor(1000);g=await state(page);for(let i=0;i<2;i++)expect(Math.hypot(g.fleet.units[i].x-before.fleet.units[i].x,g.fleet.units[i].z-before.fleet.units[i].z)).toBeGreaterThan(1);
  const charges=g.campaign.abilityCharges.barrier;await page.keyboard.press('1');expect((await state(page)).campaign.abilityCharges.barrier).toBe(charges-1);
  await page.locator('[data-tab="fleet"]').click();await page.locator('[data-control-group="6"]').click();expect((await selection(page)).units).toEqual([3]);
  await page.keyboard.press('p');g=await state(page);await page.keyboard.press('Control+5');await page.keyboard.press('7');expect((await state(page)).fleet.groups).toEqual(g.fleet.groups);expect((await selection(page)).units).toEqual([3]);
  await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(`artifacts/groups-${mode}-export.json`);
  expect(JSON.parse(await fs.readFile(`artifacts/groups-${mode}-export.json`,'utf8')).payload.fleet.groups).toEqual(g.fleet.groups);
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.clock.resume();await page.reload();await page.locator('#continue-button').click();await page.locator('#resume-button').click();await page.keyboard.press('5');
  expect((await selection(page)).units).toEqual([1,2]);expect((await state(page)).fleet.groups).toEqual(g.fleet.groups);await page.locator('[data-tab="fleet"]').click();await page.screenshot({path:`artifacts/groups-${mode}.png`});expect(errors).toEqual([]);
});
test('group shortcuts respect focused controls and modal pause; held keys do not jump the camera',async({page})=>{
  await ready(page);await page.locator('[data-unit-select="1"]').click();await page.keyboard.press('Control+5');await page.locator('[data-unit-select="2"]').click();
  await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').focus();await page.keyboard.press('Control+5');expect((await state(page)).fleet.groups).toEqual({5:[1]});expect((await selection(page)).units).toEqual([2]);
  await page.locator('[data-tab="fleet"]').click();await page.keyboard.press('5');
  await page.keyboard.press('h');await page.keyboard.press('5');expect((await selection(page)).focus).toBe(false);
  await page.locator('#scene canvas').dispatchEvent('keydown',{key:'5',code:'Digit5',repeat:true,bubbles:true});expect((await selection(page)).focus).toBe(false);
  await page.locator('#help-button').click();await page.keyboard.press('Control+5');await page.keyboard.press('6');expect((await state(page)).fleet.groups).toEqual({5:[1]});await page.locator('#close-help').click();
  await page.locator('#settings-button').click();await page.locator('#effects-volume').focus();await page.keyboard.press('Control+5');expect((await state(page)).fleet.groups).toEqual({5:[1]});await page.locator('#close-settings').click();
  await page.keyboard.press('9');expect((await selection(page)).units).toEqual([1]);expect((await state(page)).resources).toBe(406);
});
