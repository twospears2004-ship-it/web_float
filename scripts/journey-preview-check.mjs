// Actual built-game import/export/reload of the fully earned continuous journey.
// The player's file UI is the only way state enters this isolated Chrome profile.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {missions} from '../src/campaign-content.js';
import {frontierOperations} from '../src/frontier-content.js';
const outputArg=process.argv.find(a=>a.startsWith('--output='));
const output=path.resolve(outputArg?.slice(9) || 'artifacts');
const relative=path.relative(path.resolve('artifacts'),output);
if(relative.startsWith('..') || path.isAbsolute(relative))throw new Error('Journey output must stay inside artifacts.');
const file=name=>path.join(output,name);
const expected=JSON.parse(await fs.readFile(file('journey-final.json'),'utf8')).payload;
if(expected.campaign.completed.length!==missions.length||expected.campaign.frontier.cleared.length!==frontierOperations.length||expected.campaign.stage!=='harbor')throw new Error('The continuous journey must finish before its built-game check.');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const start=Date.now(),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.failure()?.errorText));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();if(await page.evaluate(()=>window.__TIDEHOLD__!==undefined))throw new Error('Development diagnostics exposed');
  await page.locator('#save-file').setInputFiles(file('journey-final.json'));await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();await expect(page.locator('#campaign-progress')).toContainText('72/72');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(file('journey-export.json'));
  const exported=JSON.parse(await fs.readFile(file('journey-export.json'),'utf8')).payload;
  for(const key of ['resources','fleet'])assert.deepEqual(exported[key],expected[key],`Exported ${key} changed`);
  // Real harbor time may reduce weapon cooldowns before an export click.
  const persistent=facilities=>facilities.map(({cooldown,...facility})=>facility);assert.deepEqual(persistent(exported.facilities),persistent(expected.facilities));assert.deepEqual(exported.campaign.frontier,expected.campaign.frontier);assert.deepEqual(exported.campaign.completed,expected.campaign.completed);assert.deepEqual(exported.campaign.tech,expected.campaign.tech);
  await page.screenshot({path:file('journey-production.png')});await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  // Import itself saved a paused state. Wait for the later pause's autosave,
  // rather than accepting that old paused snapshot before the five-second tick.
  await page.waitForFunction(time=>{const g=JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload;return g.paused&&g.time>=time;},exported.time);const before=await saved();
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();await page.reload();const restored=await saved();
  for(const key of ['campaign','resources','facilities','fleet','sites','enemies','operation'])assert.deepEqual(restored[key],before[key],`Restored ${key} changed`);
  const report={date:new Date().toISOString(),kind:'actual-time built-game import/export/double reload of a continuous normal-earned journey',build:await page.locator('script[type="module"]').getAttribute('src'),browser:browser.version(),realElapsedSeconds:(Date.now()-start)/1000,story:restored.campaign.completed.length,frontier:restored.campaign.frontier.cleared.length,army:restored.fleet.units.filter(u=>u.hp>0).length,resources:restored.resources,facilities:restored.facilities.length,walls:restored.facilities.filter(f=>f.type==='wall').length,exportBytes:(await fs.stat(file('journey-export.json'))).size,restored:true,noDevHooks:true,errors,remoteRequests};await fs.writeFile(file('journey-production.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length||remoteRequests.length)throw new Error('Built journey errors');
}finally{await browser.close();}
