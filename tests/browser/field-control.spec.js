import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {canonicalSavedValue} from '../../scripts/save-comparison.mjs';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')));
async function start(page,file){
  await page.clock.install({time:new Date('2026-10-12T03:00:00Z')});await page.clock.pauseAt(new Date('2026-10-12T04:00:00Z'));
  await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles(file);
}
async function exportSave(page,name){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await fs.writeFile(`artifacts/field-control-${name}.json`,await page.evaluate(()=>localStorage.getItem('tidehold.campaign.v1')));}

test('paid chart research, actual cold facility, extended pulse, new dock save and harbor rollback agree through public controls',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,'tests/fixtures/endgame-earned-coral-network-result.json');await page.locator('#retry-button').click();const initial=await state(page);
  await page.locator('[data-tab="campaign"]').click();const research=page.locator('[data-research="cryodynamics"]'),handle=await research.elementHandle();
  await expect(research).toContainText('현재 냉각 폭발 6m · 둔화 50% · 파동 24m');
  for(let level=1;level<=3;level++){await expect(research).toBeEnabled();await research.focus();await page.keyboard.press('Enter');await expect(research).toContainText(`${level}/3`);expect(await research.evaluate((b,old)=>b===old,handle)).toBe(true);}
  await expect(research).toBeDisabled();await expect(research).toContainText('현재 냉각 폭발 9m · 둔화 65% · 파동 30m');const paidResearch=await state(page);expect(paidResearch.resources).toBe(initial.resources-12000);expect(paidResearch.campaign.research).toBe(initial.campaign.research-21);expect((await saved(page)).version).toBe(3);
  // Reactor capacity is a loadout constraint: trade a paid mortar for control.
  const old=paidResearch.facilities.filter(f=>f.type==='mortar').sort((a,b)=>a.level-b.level||a.id-b.id)[0];await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator(`[data-tile="${old.x},${old.z}"]`).click();await page.locator('[data-action="demolish"]').click();await page.locator('[data-tool="frost"]').click();await page.locator(`[data-tile="${old.x},${old.z}"]`).click();
  const built=await state(page),tower=built.facilities.find(f=>f.type==='frost');expect(tower).toBeTruthy();expect(built.resources).toBe(paidResearch.resources+Math.floor(old.investment*.6)-150);
  await page.locator(`[data-tile="${tower.x},${tower.z}"]`).click();await expect(page.locator('#facility-panel')).toContainText('폭발 9m · 둔화 65%');await page.locator('[data-action="upgrade"]').click();await expect(page.locator('#facility-panel')).toContainText('폭발 9m · 둔화 65%');const paid=await state(page);await exportSave(page,'harbor-earned');
  await page.setViewportSize({width:720,height:900});await page.locator('[data-tab="campaign"]').click();await page.clock.runFor(300);await research.scrollIntoViewIfNeeded();await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/field-control-narrow.png'});await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-siege="siege-coral-5"]').click();expect((await state(page)).operation.siegeVersion).toBe(2);expect((await saved(page)).version).toBe(3);await expect(page.locator('[data-ability="pulse"]')).toHaveAttribute('title',/실제 범위 30m/);await exportSave(page,'waiting-earned');
  await page.locator('#start-defense-wave').click();await page.keyboard.down('w');await page.clock.runFor(4000);await page.keyboard.up('w');const before=await state(page),targets=before.enemies.filter(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-before.island.x,e.z-before.island.z)<=30),extendedTargets=targets.filter(e=>Math.hypot(e.x-before.island.x,e.z-before.island.z)>24).map(e=>({id:e.id,distance:Math.hypot(e.x-before.island.x,e.z-before.island.z)}));expect(targets.length).toBeGreaterThan(0);expect(extendedTargets.length).toBeGreaterThan(0);
  await page.locator('[data-ability="pulse"]').click();const after=await state(page);expect(after.campaign.abilityCharges.pulse).toBe(before.campaign.abilityCharges.pulse-1);
  for(const e of targets){const hit=after.enemies.find(v=>v.id===e.id);expect(hit.pendingDamage).toBeGreaterThan(0);expect(hit.slowFactor).toBe(.3);}
  for(const e of before.enemies.filter(e=>e.hp>0&&!e.captured&&Math.hypot(e.x-before.island.x,e.z-before.island.z)>30))expect(after.enemies.find(v=>v.id===e.id).pendingDamage).toBe(e.pendingDamage);
  await page.clock.runFor(100);const rings=await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo().controlBursts);expect(rings.length).toBe(1);expect(rings[0].radius).toBe(30);expect(rings[0].drawnRadius).toBeGreaterThan(1);expect(rings[0].drawnRadius).toBeLessThanOrEqual(30);await page.keyboard.press('p');await exportSave(page,'active-earned');const active=await state(page);
  await page.reload();await page.locator('#continue-button').click();const restored=await state(page);for(const key of ['campaign','operation','fleet','enemies','resources','facilities','checkpoint'])expect(canonicalSavedValue(restored[key])).toEqual(canonicalSavedValue(active[key]));expect((await saved(page)).version).toBe(4);
  await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();await page.locator('#confirm-return').click();const home=await state(page);expect(home.resources).toBe(paid.resources);expect(home.campaign.tech.cryodynamics).toBe(3);expect((await saved(page)).version).toBe(3);expect(errors).toEqual([]);
  await fs.writeFile('artifacts/field-control-ui-proof.json',JSON.stringify({initialResources:initial.resources,researchOutlay:12000,researchPoints:21,paidResources:paid.resources,activeTargets:targets.map(e=>e.id),extendedTargets,pulseRange:30,rings,activeFormat:4,harborFormat:3,errors},null,2));
});

test('earlier earned colony explains missing complete charts without charging or migrating into new research',async({page})=>{
  await start(page,'artifacts/colony-fixtures/ember-6-harbor.json');await page.locator('#resume-button').click();const before=await state(page);await page.locator('[data-tab="campaign"]').click();const research=page.locator('[data-research="cryodynamics"]');await expect(research).toBeDisabled();await expect(research).toContainText('완성 해도 0/6');await expect(research).toContainText('자료 6 · 자원 2200');expect((await state(page)).resources).toBe(before.resources);expect(Object.hasOwn((await state(page)).campaign.tech,'cryodynamics')).toBe(false);expect((await saved(page)).version).toBe(1);
  await page.locator('[data-tab="atlas"]').click();await expect(page.locator('#atlas-content')).toContainText('완성 해도6·12·18개');
});
