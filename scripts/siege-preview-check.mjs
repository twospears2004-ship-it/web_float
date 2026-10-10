// Separate Chromium profile on the actual built game. No virtual clock,
// direct game-state injection or changes to the user's browser save.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();
  if(await page.evaluate(()=>window.__TIDEHOLD__!==undefined))throw new Error('Development diagnostics exposed in the build');
  await page.locator('#save-file').setInputFiles('artifacts/siege-fixtures/siege-coral-1-base-0-start.json');await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  const before=await saved(),start=Date.now();await page.locator('#start-defense-wave').click();await expect(page.locator('[data-site="siege-base-0"]')).toContainText('항해 중');
  await page.waitForTimeout(12000);await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
  // Read the normal 5-second autosave after pause; reading an earlier checkpoint
  // before pagehide would incorrectly compare two different simulation ticks.
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload.paused===true);
  const battle=await saved();
  if(battle.operation.waiting||battle.operation.kind!=='siege'||battle.enemies.filter(e=>e.type==='baseCore').length!==1)throw new Error('The real raid did not start');
  if(Math.hypot(battle.island.x-before.island.x,battle.island.z-before.island.z)<15||battle.shots<=before.shots)throw new Error('Built raid navigation/combat is stalled');
  await page.screenshot({path:'artifacts/siege-production-combat.png'});await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();
  // A second real navigation persists the restored, paused runtime through
  // pagehide. Compare that state, rather than merely rereading the old save.
  await page.reload();const restored=await saved();
  if(JSON.stringify(restored.operation)!==JSON.stringify(battle.operation)||JSON.stringify(restored.enemies)!==JSON.stringify(battle.enemies)||JSON.stringify(restored.fleet)!==JSON.stringify(battle.fleet))throw new Error('Built raid reload changed targets or fleet');
  const license=await page.request.get('http://127.0.0.1:4173/ASSET_LICENSES.md');if(!(await license.text()).includes('적 지휘핵'))throw new Error('Siege assets missing from built documentation');
  const report={kind:'actual-time built siege sample, normal-earned imported fleet',date:new Date().toISOString(),browser:browser.version(),realElapsedSeconds:(Date.now()-start)/1000,moved:Math.hypot(battle.island.x-before.island.x,battle.island.z-before.island.z),shots:battle.shots-before.shots,operation:battle.operation.id,restored:true,noDevHooks:true,errors,remoteRequests};
  await fs.writeFile('artifacts/siege-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length||remoteRequests.length)throw new Error('Built siege produced browser/network errors');
}finally{await browser.close();}
