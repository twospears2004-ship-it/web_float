import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function load(page,file){await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();await page.locator('#save-file').setInputFiles(file);await page.locator('#resume-button').click();}
async function resumeSaved(page){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const before=await snapshot(page);await page.reload();await page.locator('#continue-button').click();const after=await snapshot(page);expect(after.campaign.atlas).toEqual(before.campaign.atlas);expect(after.resources).toBe(before.resources);return after;}
async function survey(page,index){
  await page.locator('[data-tab="voyage"]').click();await page.keyboard.press('f');await page.keyboard.press('g');await page.clock.runFor(15000);
  await page.locator('[data-tab="fleet"]').click();if(await page.locator('#repair-fleet').isEnabled())await page.locator('#repair-fleet').click();
  await page.locator('[data-tab="voyage"]').click();if(await page.locator('#field-repair').isEnabled())await page.locator('#field-repair').click();
  await page.locator(`[data-site="explore-node-${index}"]`).click();let g=await snapshot(page),sent=false;
  for(let i=0;i<240&&!g.campaign.pendingChoice;i++){
    if(g.combat){if(g.campaign.abilityCooldowns.barrier<=0&&g.campaign.abilityCharges.barrier>0)await page.keyboard.press('1');if(g.campaign.abilityCooldowns.pulse<=0&&g.campaign.abilityCharges.pulse>0)await page.keyboard.press('3');if(g.hull<g.maxHull*0.8&&g.campaign.abilityCooldowns.mend<=0&&g.campaign.abilityCharges.mend>0)await page.keyboard.press('2');}
    if(!sent&&g.enemies.every(e=>e.hp<=0)&&g.campaign.encounterWave+1>=g.catalog[index].waves&&await page.locator('#send-survey').isEnabled()){await page.locator('#send-survey').click();sent=true;}
    await page.clock.runFor(1000);g=await snapshot(page);expect(g.phase).toBe('playing');
  }
  expect(g.campaign.pendingChoice?.site).toBe(index);expect(g.sites[index].cleared).toBe(true);
  // A choice may be created in the last frame of runFor. The UI refreshes
  // every 120ms; let that real refresh occur before clicking with a frozen clock.
  await page.clock.runFor(150);
  if([1,7].includes(index))await expect(page.locator('[data-field-choice="study"]')).toBeDisabled();
  await page.locator('[data-field-choice]:enabled').first().click();return snapshot(page);
}

test('earned partial return → saved chart → seven-site replay → one full bonus → paid production research',async({page})=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,'artifacts/atlas-fixtures/coral-partial-harbor.json');
  await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').selectOption('0');await expect(page.locator('#atlas-summary')).toContainText('0/24');const card=page.locator('[data-atlas-chart="explore-coral-1"]');await expect(card).toContainText('4/8');await expect(card.locator('.surveyed')).toHaveCount(4);await card.locator('summary').click();await expect(card).toContainText('자료 보존');
  await page.locator('[data-tab="campaign"]').click();await expect(page.locator('[data-research="cartography"]')).toBeDisabled();await expect(page.locator('[data-research="cartography"]')).toContainText('완성 해도 0/1');
  await page.keyboard.press('p');await resumeSaved(page);await page.keyboard.press('p');await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').selectOption('0');await expect(card.locator('.surveyed')).toHaveCount(4);await page.screenshot({path:'artifacts/atlas-partial.png'});
  await page.locator('[data-atlas-launch="explore-coral-1"]').click();let g=await snapshot(page);expect(g.operation.visible).toEqual(g.campaign.atlas.charts['explore-coral-1'].seen);
  for(const i of [2,3,5,6,1,4,7])g=await survey(page,i);
  const cash=g.resources,points=g.campaign.research;await page.locator('#extract-exploration').click();g=await snapshot(page);expect(g.operation.result).toMatchObject({surveyed:7,full:false,chartSurveyed:8,newSurveys:4,chartReward:true});expect(g.resources).toBe(cash+248);expect(g.campaign.research).toBe(points+2);await expect(page.locator('#end-description')).toContainText('해도 완성 보상');await page.screenshot({path:'artifacts/atlas-completion.png'});
  await page.locator('#retry-button').click();await page.locator('[data-tab="atlas"]').click();await expect(page.locator('#atlas-summary')).toContainText('1/24');await expect(card.locator('.surveyed')).toHaveCount(8);await expect(card).toContainText('해도 완성 보상 확보');
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();const fish=g.facilities.find(f=>f.type==='fishery');await page.locator(`[data-tile="${fish.x},${fish.z}"]`).click();const production=await page.locator('#facility-panel .weapon-stats').innerText();
  await page.locator('[data-tab="campaign"]').click();const before=await snapshot(page);await expect(page.locator('[data-research="cartography"]')).toBeEnabled();await page.locator('[data-research="cartography"]').click();g=await snapshot(page);expect(g.resources).toBe(before.resources-350);expect(g.campaign.research).toBe(before.campaign.research-4);expect(g.campaign.tech.cartography).toBe(1);await expect(page.locator('[data-research="cartography"]')).toContainText('완성 해도 1/4');await expect(page.locator('[data-research="cartography"]')).toBeDisabled();
  await page.locator('[data-tab="build"]').click();await page.locator(`[data-tile="${fish.x},${fish.z}"]`).click();expect(await page.locator('#facility-panel .weapon-stats').innerText()).not.toBe(production);await expect(page.locator('#facility-panel')).toContainText(`${Math.round((10+(fish.level-1)*3)*1.1)}/회`);
  await page.keyboard.press('p');const restored=await resumeSaved(page);expect(restored.campaign.tech.cartography).toBe(1);expect(restored.campaign.atlas.charts['explore-coral-1'].fullRewarded).toBe(true);expect(errors).toEqual([]);
});

test('four earned charts keep level-two laboratory output, unlock the sea story and reject malformed choices',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,'artifacts/atlas-fixtures/kelp-research-harbor.json');let g=await snapshot(page);expect(g.campaign.tech.cartography).toBe(2);
  await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').selectOption('3');await expect(page.locator('#atlas-summary')).toContainText('4/24');await expect(page.locator('.atlas-chapter')).toContainText('기록보다 사람을 먼저');await expect(page.locator('#atlas-chapter option[value="5"]')).toHaveAttribute('disabled','');await page.locator('#atlas-chapter').selectOption('0');await expect(page.locator('.atlas-chapter')).toContainText('두 항로의 모든 지점');await expect(page.locator('[data-atlas-chart]')).toHaveCount(2);
  await page.locator('#atlas-chapter').selectOption('3');const details=page.locator('[data-atlas-chart="explore-kelp-1"] details');await details.locator('summary').click();await expect(details).toHaveAttribute('open','');await expect(details.locator('.atlas-sites')).toBeVisible();await page.screenshot({path:'artifacts/atlas-story.png'});
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();const lab=g.facilities.find(f=>f.type==='laboratory');await page.locator(`[data-tile="${lab.x},${lab.z}"]`).click();await expect(page.locator('#facility-panel')).toContainText(`${3+Math.floor((lab.level-1)/3)}표본/유형`);
  await page.keyboard.press('p');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const before=await snapshot(page),saved=await page.evaluate(()=>localStorage.getItem('tidehold.campaign.v1'));
  const envelope=JSON.parse(await fs.readFile('artifacts/atlas-fixtures/kelp-research-harbor.json','utf8'));envelope.payload.campaign.atlas.charts['explore-kelp-1'].choices['explore-node-1']='<img src=x onerror=alert(1)>';let hash=2166136261;for(const ch of JSON.stringify(envelope.payload))hash=Math.imul(hash^ch.charCodeAt(0),16777619);envelope.checksum=(hash>>>0).toString(16);
  await page.locator('#save-file').setInputFiles({name:'bad-atlas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope))});await expect(page.locator('#import-save-status')).toContainText('보관한 회수품 선택');g=await snapshot(page);expect(g.campaign).toEqual(before.campaign);expect(g.resources).toBe(before.resources);
  // A normal periodic save can refresh only the envelope timestamp while the
  // rejected import is read. Compare every saved game field and its checksum.
  const current=JSON.parse(await page.evaluate(()=>localStorage.getItem('tidehold.campaign.v1'))),prior=JSON.parse(saved);expect(current.payload).toEqual(prior.payload);expect(current.checksum).toBe(prior.checksum);expect(current.format).toBe(prior.format);expect(current.version).toBe(prior.version);await expect(page.locator('img[src="x"]')).toHaveCount(0);expect(errors).toEqual([]);
});

test('pre-atlas earned full journey migrates all charts without adding cash and saves their known locations',async({page})=>{
  const original=JSON.parse(await fs.readFile('tests/fixtures/atlas-legacy-journey.json','utf8')).payload;expect(original.campaign.atlas).toBeUndefined();await load(page,'tests/fixtures/atlas-legacy-journey.json');const g=await snapshot(page);expect(g.resources).toBe(original.resources);expect(g.campaign.research).toBe(original.campaign.research);expect(Object.keys(g.campaign.atlas.charts)).toHaveLength(24);
  await page.locator('[data-tab="atlas"]').click();await expect(page.locator('#atlas-summary')).toContainText('24/24');await expect(page.locator('#atlas-summary')).toContainText('192/192');await page.locator('#atlas-chapter').selectOption('0');const card=page.locator('[data-atlas-chart="explore-coral-1"]');await expect(card.locator('.surveyed')).toHaveCount(8);await card.locator('summary').click();await expect(card).toContainText('보관한 조사');await expect(card).toContainText('해도 완성 보상 확보');await page.screenshot({path:'artifacts/atlas-legacy.png'});
  await page.keyboard.press('p');const restored=await resumeSaved(page);expect(restored.campaign.atlas).toEqual(g.campaign.atlas);expect(restored.campaign.frontier).toEqual(original.campaign.frontier);
});
