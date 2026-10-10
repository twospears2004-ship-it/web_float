import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {chapters,bossPatterns,campaignRules} from '../../src/campaign-content.js';
import {hullDistance} from '../../src/hull.js';

// Checkpoints were earned by scripts/audit-campaign.mjs using normal actions.
// Import uses the same save-file UI available to players. This is a boss sample,
// not a claim that the whole campaign was played in the browser.
for(const [chapter,ch] of chapters.entries())test(`earned ${ch.name} checkpoint → ${ch.boss} → saved result`,async({page})=>{
  test.setTimeout(300000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('#save-file').setInputFiles(`artifacts/campaign-fixtures/${ch.id}-6-guardian.json`);
  await expect(page.locator('#resume-button')).toBeVisible();await page.locator('#resume-button').click();
  const snapshot=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());let g=await snapshot(),start=g.campaign.missionSeconds;
  expect(g.campaign.missionId).toBe(`${ch.id}-6`);const patterns=new Set(),variants=new Set();let phase2=false,maxBosses=0,captured=false;
  for(let t=0;t<900 && g.phase==='playing';t++) {
    for(const enemy of g.enemies)if(enemy.hp>0)expect(hullDistance(g,enemy)).toBeGreaterThanOrEqual(campaignRules.enemies[enemy.type].radius-1e-6);
    const bosses=g.enemies.filter(e=>e.type==='leviathan'&&e.hp>0);maxBosses=Math.max(maxBosses,bosses.length);
    phase2 ||= bosses.some(e=>e.bossPhase===2);
    for(const boss of bosses)if(boss.windup)patterns.add(boss.windup.pattern);
    if(!captured && bosses.some(e=>e.windup)) {
      await expect(page.locator('#boss-hud')).toBeVisible();await expect(page.locator('#boss-hud')).toContainText(ch.boss);
      for(const variant of (await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).bossVariants)variants.add(variant);
      await page.screenshot({path:`artifacts/boss-${ch.id}.png`});captured=true;
    }
    if(g.enemies.some(e=>e.windup))await page.keyboard.press('1');
    if(g.hull<g.maxHull*0.8)await page.keyboard.press('2');
    if(g.combat && g.enemies.some(e=>e.hp>0 && Math.hypot(e.x-g.island.x,e.z-g.island.z)<=24))await page.keyboard.press('3');
    if(g.campaign.hazards.some(h=>h.remaining<1.5))await page.keyboard.press('4');
    await page.clock.runFor(1000);g=await snapshot();
  }
  expect(g.phase).toBe(chapter===11?'campaign-complete':'mission-complete');
  expect(g.campaign.completed).toContain(`${ch.id}-6`);expect(maxBosses).toBe(chapter===10?2:1);
  expect([...variants]).toEqual([ch.id]);expect(patterns.has(bossPatterns[chapter])).toBe(true);
  expect((await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo())).enemyMeshes).toBe(0);
  if(chapter>=6)expect(phase2).toBe(true);
  expect(errors).toEqual([]);
  await fs.writeFile(`artifacts/boss-${ch.id}.json`,JSON.stringify({kind:'earned model checkpoint imported through browser save UI',chapter:ch.id,boss:ch.boss,modelVariants:[...variants],expectedPattern:bossPatterns[chapter],observedPatterns:[...patterns],phase2,maxBosses,simulatedBossSeconds:g.campaign.missionSeconds-start,result:g.phase,errors},null,2));
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#end-title')).toHaveText(chapter===11?'바다는 다시 길이 됩니다':'항로를 확보했습니다');
});
