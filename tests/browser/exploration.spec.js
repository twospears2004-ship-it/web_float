import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function setup(page,mode){await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('artifacts/exploration-fixtures/explore-coral-1-node-0-start.json');await page.locator('#resume-button').click();if(mode==='direct'){await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();}await page.locator('[data-tab="voyage"]').click();return snapshot(page);}
async function sailDirect(page,site){for(let i=0;i<60;i++){const g=await snapshot(page),dx=site.x-g.island.x,dz=site.z-g.island.z;if(Math.hypot(dx,dz)<6)break;const keys=[];if(Math.abs(dx)>3)keys.push(dx>0?'d':'a');if(Math.abs(dz)>3)keys.push(dz>0?'s':'w');for(const key of keys)await page.keyboard.down(key);await page.clock.runFor(400);for(const key of keys)await page.keyboard.up(key);}}
async function survey(page,index,mode){await page.locator(`[data-site="explore-node-${index}"]`).click();let g=await snapshot(page);expect(g.operation.round).toBe(index);expect(g.operation.waiting).toBe(false);if(mode==='direct')await sailDirect(page,g.catalog[index]);let sent=false;
  for(let i=0;i<240&&!g.campaign.pendingChoice;i++){
    if(g.combat){if(g.campaign.abilityCooldowns.barrier<=0&&g.campaign.abilityCharges.barrier>0)await page.keyboard.press('1');if(g.campaign.abilityCooldowns.pulse<=0&&g.campaign.abilityCharges.pulse>0)await page.keyboard.press('3');if(g.hull<g.maxHull*0.8&&g.campaign.abilityCooldowns.mend<=0&&g.campaign.abilityCharges.mend>0)await page.keyboard.press('2');}
    if(!sent&&g.enemies.every(e=>e.hp<=0)&&g.campaign.encounterWave+1>=g.catalog[index].waves){if(await page.locator('#send-survey').isEnabled()){await page.locator('#send-survey').click();sent=true;}}
    await page.clock.runFor(1000);g=await snapshot(page);expect(g.phase).toBe('playing');
  }
  expect(g.sites[index].cleared).toBe(true);expect(g.campaign.pendingChoice.site).toBe(index);await expect(page.locator('#field-choice')).toBeVisible();return g;
}
async function choose(page){await page.locator('[data-field-choice]:enabled').first().click();expect((await snapshot(page)).campaign.pendingChoice).toBeNull();}

test('earned destination exploration discovers branches, restores a choice and banks the complete chart',async({page})=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let g=await setup(page,'destination');expect(g.operation.visible).toEqual(['explore-node-0']);await expect(page.locator('[data-site-card="explore-node-7"]')).toBeHidden();await expect(page.locator('#extract-exploration')).toBeDisabled();
  g=await survey(page,0,'destination');expect(g.operation.visible).toContain('explore-node-2');await page.screenshot({path:'artifacts/exploration-choice.png'});
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.clock.resume();await page.reload();await page.locator('#continue-button').click();const restored=await snapshot(page);expect(restored.operation).toEqual(g.operation);expect(restored.campaign.pendingChoice).toEqual(g.campaign.pendingChoice);await page.keyboard.press('p');await choose(page);
  for(const index of [2,1,4,5,3,6,7]){await survey(page,index,'destination');await choose(page);}await expect(page.locator('#extract-exploration')).toBeEnabled();await page.locator('#extract-exploration').click();
  g=await snapshot(page);expect(g.operation.result.surveyed).toBe(8);expect(g.operation.result.full).toBe(true);expect(g.campaign.frontier.cleared).toContain('explore-coral-1');await expect(page.locator('#end-title')).toHaveText('미지의 항로를 기록했습니다');await expect(page.locator('#end-stats')).toContainText('조사 8/8');await page.screenshot({path:'artifacts/exploration-victory.png'});
  await page.locator('#retry-button').click();await expect(page.locator('[data-explore="explore-coral-2"]')).toBeEnabled();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const before=await snapshot(page);await page.clock.resume();await page.reload();await page.locator('#continue-button').click();g=await snapshot(page);expect(g.campaign.frontier).toEqual(before.campaign.frontier);expect(g.resources).toBe(before.resources);expect(errors).toEqual([]);
});
test('earned direct exploration can choose a branch and abandon without retaining its unbanked loot',async({page})=>{
  test.setTimeout(360000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const initial=await setup(page,'direct'),checkpoint=initial.checkpoint;
  await survey(page,0,'direct');await choose(page);await survey(page,2,'direct');await choose(page);const g=await snapshot(page);expect(g.campaign.decisions.map(d=>d.site)).toEqual([0,2]);await page.screenshot({path:'artifacts/exploration-direct.png'});
  await page.locator('#home-button').click();await page.locator('#confirm-return').click();const harbor=await snapshot(page);expect(harbor.campaign.stage).toBe('harbor');expect(harbor.resources).toBe(checkpoint.resources);expect(harbor.fleet.units.map(u=>[u.id,u.hp])).toEqual(checkpoint.fleet.units.map(u=>[u.id,u.hp]));expect(harbor.campaign.frontier.cleared).not.toContain('explore-coral-1');expect(errors).toEqual([]);
});
test('banked exploration rejects malformed record imports and keeps the objective clear of its HUD',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('/');await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('artifacts/exploration-fixtures/explore-coral-1-result.json');await expect(page.locator('#end-title')).toHaveText('미지의 항로를 기록했습니다');await page.locator('#retry-button').click();
  await page.locator('[data-explore="explore-coral-1"]').click();await expect(page.locator('#mission-hud')).toBeVisible();
  const layout=await page.evaluate(()=>{const objective=document.querySelector('#objective').getBoundingClientRect(),hud=document.querySelector('#mission-hud').getBoundingClientRect();return {objectiveRight:objective.right,hudLeft:hud.left};});
  expect(layout.objectiveRight).toBeLessThanOrEqual(layout.hudLeft-12);await page.screenshot({path:'artifacts/exploration-layout.png'});
  await page.keyboard.press('p');const before=await snapshot(page),saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  const envelope=JSON.parse(await fs.readFile('artifacts/exploration-fixtures/explore-coral-1-result.json','utf8'));
  envelope.payload.campaign.frontier.records['explore-coral-1'].surveyed='<img src=x onerror=alert(1)>';
  let hash=2166136261;for(const ch of JSON.stringify(envelope.payload))hash=Math.imul(hash^ch.charCodeAt(0),16777619);envelope.checksum=(hash>>>0).toString(16);
  await page.locator('#save-file').setInputFiles({name:'invalid-record.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope))});await expect(page.locator('#save-status')).toContainText('탐험 기록의 조사 수');
  const after=await snapshot(page);for(const key of ['campaign','operation','resources','fleet','sites','enemies'])expect(after[key]).toEqual(before[key]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload)).toEqual(saved);await expect(page.locator('img[src="x"]')).toHaveCount(0);expect(errors).toEqual([]);
});
