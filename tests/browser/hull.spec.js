import {test,expect} from '@playwright/test';
import {hullDistance} from '../../src/hull.js';
import {campaignRules} from '../../src/campaign-content.js';
import fs from 'node:fs/promises';

test('A campaign: manual steering in combat → three shores → earned resources and saved result',async({page})=>{
  test.setTimeout(180000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install();await page.goto('/');await page.locator('[data-start="direct"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  const snapshot=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());let g=await snapshot(),pressed=new Set(),movedDuringCombat=false;const shores=new Set();
  const steer=async keys=>{for(const key of pressed)if(!keys.has(key))await page.keyboard.up(key);for(const key of keys)if(!pressed.has(key))await page.keyboard.down(key);pressed=keys;};
  for(let t=0;t<180 && g.phase==='playing';t++) {
    shores.add(g.campaign.objectiveIndex);
    for(const enemy of g.enemies)if(enemy.hp>0)expect(hullDistance(g,enemy)).toBeGreaterThanOrEqual(campaignRules.enemies[enemy.type].radius-1e-6);
    if(g.campaign.pendingChoice) {await steer(new Set());await page.locator('[data-field-choice]:enabled').first().click();g=await snapshot();}
    const site=g.catalog[g.campaign.objectiveIndex],dx=site.x-g.island.x,dz=site.z-g.island.z,keys=new Set();
    const demonstrate=g.combat && !movedDuringCombat;
    if(demonstrate)keys.add('d');
    else if(Math.hypot(dx,dz)>15){if(Math.abs(dx)>5)keys.add(dx<0?'a':'d');if(Math.abs(dz)>5)keys.add(dz<0?'w':'s');}
    await steer(keys);
    if(!demonstrate && g.combat && g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))await page.keyboard.press('3');
    if(g.hull<g.maxHull*0.8)await page.keyboard.press('2');
    const before={...g.island};await page.clock.runFor(1000);g=await snapshot();
    if(demonstrate && Math.hypot(g.island.x-before.x,g.island.z-before.z)>1)movedDuringCombat=true;
  }
  await steer(new Set());expect(movedDuringCombat).toBe(true);expect(shores.size).toBe(3);expect(g.phase).toBe('mission-complete');
  expect(g.campaign.completed).toEqual(['coral-1']);expect(g.earned).toBeGreaterThan(0);expect(errors).toEqual([]);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/manual-shore-campaign.png'});
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');
});
