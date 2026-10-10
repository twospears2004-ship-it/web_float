// Actual built-game return, export, autosave and double reload of a late defense.
// The normal-earned file enters through the player's import UI only.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeSave} from '../src/save.js';
const file='artifacts/defense-fixtures/defense-black-1-result.json',earned=decodeSave(await fs.readFile(file,'utf8'));
assert.equal(earned.campaign.encounterWave,5);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const start=Date.now(),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.failure()?.errorText));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
  const build=await page.locator('script[type="module"]').getAttribute('src');await page.locator('#save-file').setInputFiles(file);await expect(page.locator('#end-title')).toHaveText('기지를 지켰습니다');await page.locator('#retry-button').click();await expect(page.locator('#save-status')).toContainText('자동 저장 완료');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs('artifacts/late-defense-production-export.json');const exported=decodeSave(await fs.readFile('artifacts/late-defense-production-export.json','utf8'));
  // Harbor time may reduce a weapon cooldown before the pause click; all
  // owned/damaged/produced facility fields must still match the earned result.
  const persistent=facilities=>facilities.map(({cooldown,...facility})=>facility);
  assert.equal(exported.resources,earned.resources);assert.deepEqual(persistent(exported.facilities),persistent(earned.facilities));assert.deepEqual(exported.campaign.frontier,earned.campaign.frontier);assert.equal(exported.campaign.research,earned.campaign.research);assert.equal(exported.campaign.stage,'harbor');assert.equal(exported.campaign.encounterWave,0);
  await page.screenshot({path:'artifacts/late-defense-production.png'});await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload.paused===true);
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload),before=await saved();
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();await page.reload();const restored=await saved();
  for(const key of ['campaign','resources','facilities','fleet','sites','enemies','operation'])assert.deepEqual(restored[key],before[key],`Restored ${key} changed`);
  const report={date:new Date().toISOString(),kind:'actual-time built-game late defense return, export, autosave and double reload',build,browser:browser.version(),realElapsedSeconds:(Date.now()-start)/1000,story:restored.campaign.completed.length,defense:'defense-black-1',resources:restored.resources,research:restored.campaign.research,exportBytes:(await fs.stat('artifacts/late-defense-production-export.json')).size,restored:true,noDevHooks:true,errors,remoteRequests};await fs.writeFile('artifacts/late-defense-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length||remoteRequests.length)throw new Error('Built late-defense errors');
}finally{await browser.close();}
