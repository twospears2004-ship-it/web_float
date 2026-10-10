import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {livePlayer} from '../../scripts/live-player.mjs';

test('earned shore → stable field refit → free relocation → reload → explicit departure',async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  const snapshot=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());let g=await snapshot(),lastCombat;
  for(let t=0;t<100 && !g.campaign.pendingChoice;t++) {
    if(g.combat){lastCombat=g;await page.keyboard.press('3');}await page.clock.runFor(1000);g=await snapshot();
  }
  expect(g.campaign.pendingChoice?.kind).toBe('supplies');await page.locator('[data-field-choice="repair"]').click();g=await snapshot();
  expect(g.campaign.objectiveIndex).toBe(1);expect(g.campaign.waitingForDeparture).toBe(true);
  const shots=g.shots,hull=g.hull,enemyHp=g.enemies.map(e=>e.hp),pulseCharges=g.campaign.abilityCharges.pulse;
  // A stale combat observation must not let the real-time controller send an
  // offensive pulse into the new shore while the player is refitting.
  expect(lastCombat.combat).toBe(true);await livePlayer(page,{}).abilities(lastCombat);
  g=await snapshot();expect(g.campaign.waitingForDeparture).toBe(true);expect(g.campaign.abilityCharges.pulse).toBe(pulseCharges);
  await page.clock.runFor(20000);await expect(page.locator('#sea-state')).toHaveText('현장 정비 · 출항 준비');
  g=await snapshot();expect(g.combat).toBe(false);expect(g.shots).toBe(shots);expect(g.hull).toBe(hull);expect(g.enemies.map(e=>e.hp)).toEqual(enemyHp);
  await page.locator('[data-tab="build"]').click();const p=await page.evaluate(()=>window.__TIDEHOLD__.projectTile(0,-1));await page.mouse.click(p.x,p.y);
  await expect(page.locator('[data-action="move"]')).toBeEnabled();await page.locator('[data-action="move"]').click();await page.locator('[data-tile="1,-1"]').click();
  g=await snapshot();expect(g.facilities[0].x).toBe(1);expect(g.campaign.waitingForDeparture).toBe(true);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/field-refit.png'});
  await page.clock.resume();await page.reload();await page.locator('#continue-button').click();await page.locator('#resume-button').click();
  await page.clock.runFor(10000);g=await snapshot();expect(g.campaign.waitingForDeparture).toBe(true);expect(g.shots).toBe(shots);expect(g.facilities[0].x).toBe(1);
  await page.locator('[data-tab="voyage"]').click();await page.locator('[data-site="objective-1"]').click();
  expect((await snapshot()).campaign.waitingForDeparture).toBe(false);expect(errors).toEqual([]);
});
