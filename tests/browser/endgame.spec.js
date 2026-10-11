import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {livePlayer} from '../../scripts/live-player.mjs';
import * as game from '../../src/game.js';
import * as campaign from '../../src/campaign.js';
import * as content from '../../src/campaign-content.js';
import * as production from '../../src/production.js';
import * as fleet from '../../src/fleet-content.js';
import * as decisions from '../../src/expedition-content.js';
import {decodeSave} from '../../src/save.js';
import {canonicalSavedValue} from '../../scripts/save-comparison.mjs';
import {basePower,getSiege} from '../../src/siege-content.js';

async function saveReloadRollback(page,player,departure,prefix,expectedPower){
  // Freeze only the test clock while exercising the real export button. The
  // game's pause dialog intentionally blocks controls behind it.
  // Date reading and clock pausing cross separate browser round trips.
  // Leave a generous margin under concurrent model/native validation, then
  // capture the actual paused state used by all export/reload assertions.
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+60000));
  const g=await player.state();
  await player.tab('campaign');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(`artifacts/${prefix}-active-save.json`);
  const exported=decodeSave(await fs.readFile(`artifacts/${prefix}-active-save.json`,'utf8'));expect(canonicalSavedValue(exported.enemies)).toEqual(canonicalSavedValue(g.enemies));expect(exported.fleet.groups).toEqual(g.fleet.groups);
  await page.keyboard.press('p');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.clock.resume();await page.reload({waitUntil:'domcontentloaded'});await page.locator('#continue-button').click();
  expect(canonicalSavedValue((await player.state()).enemies)).toEqual(canonicalSavedValue(g.enemies));expect((await player.state()).fleet.groups).toEqual(g.fleet.groups);await expect(page.locator('#scene-title')).toHaveText(getSiege(g.operation.id).name);if(expectedPower)await expect(page.locator('#mission-progress')).toContainText(expectedPower);await page.screenshot({path:`artifacts/${prefix}-reload.png`});
  await page.locator('#resume-button').click();await player.tab('voyage');await page.locator('#home-button').click();await page.locator('#confirm-return').click();const back=await player.state();
  expect(back.campaign.stage).toBe('harbor');expect(back.resources).toBe(departure.resources);expect(back.fleet.units.map(u=>({id:u.id,hp:u.hp,level:u.level}))).toEqual(departure.fleet.units.map(u=>({id:u.id,hp:u.hp,level:u.level})));expect(back.fleet.groups).toEqual(departure.fleet.groups);
  await expect(page.locator('#scene-title')).toHaveText('나의 섬, 다음 항해.');
}

test('earned frost result → distinct split supply → flank cutoff → saved topology',async({page})=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('[data-start="destination"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/endgame-variety-earned-frost-network-result.json');await page.locator('#retry-button').click();
  const player=livePlayer(page,{...game,...campaign,...content,...production,...fleet,...decisions});
  await player.paidRefit();await player.tab('fleet');
  for(const type of ['torpedo','gunboat','skiff'])if((await player.state()).fleet.units.filter(u=>u.hp>0&&u.type===type).length<2)await player.tap(`[data-recruit="${type}"]`);
  for(const u of (await player.state()).fleet.units)while(await player.tap(`[data-unit-upgrade="${u.id}"]`)){}
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  await player.tab('campaign');await expect(page.locator('[data-siege="siege-frost-5"]')).toBeEnabled();await page.locator('[data-siege="siege-frost-5"]').click();
  const departure=await player.state();await page.locator('#start-defense-wave').click();await page.clock.runFor(100);let g=await player.state();
  await expect(page.locator('#scene-title')).toHaveText(getSiege('siege-frost-5').name);
  const west=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='west'),east=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='east');
  const westCore=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='west'),eastCore=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='east'),shared=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='shared');
  expect(basePower(g,westCore)).toBe(1);expect(basePower(g,eastCore)).toBe(1);expect(basePower(g,shared)).toBe(2);
  await expect(page.locator('#mission-progress')).toBeVisible();await expect(page.locator('#mission-progress')).toContainText('핵 전력 서 1 · 중앙 2 · 동 1');
  await expect(page.locator('#enemy-intel')).toContainText('서부 회로는 금색, 동부 회로는 청록색');
  expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).powerLinks).toBe(8);
  const site=g.catalog[0];expect(Math.round(west.x-site.x)).toBe(-30);expect(Math.round(west.z-site.z)).toBe(-26);
  const ids=g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id);expect(ids.length).toBeGreaterThanOrEqual(3);
  expect(await player.order('attack',west,ids)).toBe(true);
  for(let t=0;t<100&&g.enemies.find(e=>e.id===west.id).hp>0&&g.phase==='playing';t+=2){await page.clock.runFor(2000);g=await player.state();}
  expect(g.phase).toBe('playing');expect(g.enemies.find(e=>e.id===west.id).hp).toBe(0);expect(g.enemies.find(e=>e.id===east.id).hp).toBeGreaterThan(0);
  expect(basePower(g,g.enemies.find(e=>e.id===westCore.id))).toBe(0);expect(basePower(g,g.enemies.find(e=>e.id===eastCore.id))).toBe(1);expect(basePower(g,g.enemies.find(e=>e.id===shared.id))).toBe(1);
  await expect(page.locator('#mission-progress')).toContainText('핵 전력 서 0 · 중앙 1 · 동 1');
  await page.screenshot({path:'artifacts/power-status-split-flank-cutoff.png'});await saveReloadRollback(page,player,departure,'power-status-split','핵 전력 서 0 · 중앙 1 · 동 1');expect(errors).toEqual([]);
});

test('earned ending unlocks remote power raids, fleet groups, WASD and saved rollback',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Virtual rendering time is a UI regression tool, never play-length evidence.
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/atlas-legacy-journey.json');await page.locator('#resume-button').click();
  const player=livePlayer(page,{...game,...campaign,...content,...production,...fleet,...decisions});
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  async function select(ids){await player.tab('fleet');for(const [i,id]of ids.entries())await page.locator(`[data-unit-select="${id}"]`).click({modifiers:i?['Shift']:[]});}
  async function refit(){
    await player.tab('fleet');await player.tap('#repair-fleet');
    for(const type of ['gunboat','tender','torpedo','skiff'])if(!(await player.state()).fleet.units.some(u=>u.hp>0&&u.type===type))await player.tap(`[data-recruit="${type}"]`);
    for(const u of (await player.state()).fleet.units)while(await player.tap(`[data-unit-upgrade="${u.id}"]`)){}
    await player.tab('build');while((await player.state()).hull<(await player.state()).maxHull&&await player.tap('#repair-button')){}
  }
  await refit();
  // A remains a normal movement preference; stop the island's automatic route
  // so the first generator's destruction comes from the commanded fleet.
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  await player.tab('campaign');await expect(page.locator('[data-siege="siege-coral-4"]')).toBeEnabled();await expect(page.locator('[data-siege="siege-coral-5"]')).toBeDisabled();
  let g=await player.state();const ids=g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id);expect(ids.length).toBeGreaterThanOrEqual(3);
  await select(ids.slice(0,2));await page.keyboard.press('Control+5');await select(ids.slice(2));await page.keyboard.press('Control+6');
  await player.tab('campaign');await page.locator('[data-siege="siege-coral-4"]').click();const departure=await player.state();await page.locator('#start-defense-wave').click();await page.clock.runFor(100);
  g=await player.state();const first=g.enemies.find(e=>e.type==='generator');expect(g.enemies.filter(e=>e.powerLink)).toHaveLength(2);expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).powerLinks).toBe(8);
  await expect(page.locator('#mission-progress')).toContainText('동력 공급 유지');await expect(page.locator('#mission-progress')).not.toContainText('핵 전력 서');
  await page.keyboard.press('6');await page.keyboard.press('h');await player.order('attack',first,ids.slice(0,2));
  expect((await player.state()).fleet.units.filter(u=>ids.slice(2).includes(u.id)).every(u=>u.command.type==='hold')).toBe(true);
  await page.clock.runFor(2000);await player.order('attack',first,(await player.state()).fleet.units.filter(u=>u.hp>0).map(u=>u.id));
  for(let t=0;t<180;t+=2){g=await player.state();if(!g.enemies.some(e=>e.id===first.id&&e.hp>0))break;await page.clock.runFor(2000);await player.abilities(await player.state());}
  g=await player.state();expect(g.enemies.find(e=>e.id===first.id).hp).toBe(0);expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).powerLinks).toBeLessThanOrEqual(4);
  await page.screenshot({path:'artifacts/power-status-legacy-remote.png'});
  // WASD still moves the island while fleet commands and saved groups are in use.
  // Five seconds is a movement assertion, not a promise to reach the distant base.
  const before={...g.island},beforeDistance=Math.hypot(before.x-g.catalog[0].x,before.z-g.catalog[0].z);
  await page.keyboard.down('a');await page.keyboard.down('w');await page.clock.runFor(5000);await page.keyboard.up('w');await page.keyboard.up('a');
  g=await player.state();expect(Math.hypot(g.island.x-before.x,g.island.z-before.z)).toBeGreaterThan(20);expect(Math.hypot(g.island.x-g.catalog[0].x,g.island.z-g.catalog[0].z)).toBeLessThan(beforeDistance);
  await saveReloadRollback(page,player,departure,'power-status-network');expect(errors).toEqual([]);
});

test('normally earned remote-power result unlocks three dock cores and preserves active save',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Recorded by the normal-resource 192-operation model run. This public import
  // is result/save regression evidence, never a timed UI completion claim.
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/endgame-earned-coral-network-result.json');await expect(page.locator('#end-title')).toHaveText('거점을 확보했습니다');
  const player=livePlayer(page,{...game,...campaign,...content,...production,...fleet,...decisions});await page.locator('#retry-button').click();
  await player.tab('campaign');await expect(page.locator('[data-siege="siege-coral-5"]')).toBeEnabled();
  await page.locator('[data-siege="siege-coral-5"]').click();const departure=await player.state();await page.locator('#start-defense-wave').click();await page.clock.runFor(100);
  const g=await player.state();expect(g.enemies.filter(e=>e.type==='baseCore')).toHaveLength(3);expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).powerLinks).toBe(12);
  const gen=g.enemies.find(e=>e.type==='generator');await player.order('attack',gen,g.fleet.units.filter(u=>u.hp>0).map(u=>u.id));await page.clock.runFor(2000);
  await saveReloadRollback(page,player,departure,'power-status-citadel');expect(errors).toEqual([]);
});
