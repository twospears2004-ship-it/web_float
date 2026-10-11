// Actual packaged UI, paid prior colony save, normal native close and fresh disk
// restore. No virtual clock, dev hooks, injected research or personal profile.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
import {captureNativeOutput,recordNativeFailure,observeNativeClose} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8')),profile=path.resolve('artifacts/desktop-profiles',`research-${Date.now()}`),errors=[],remoteRequests=[],records=[],nativeOutput=[],started=Date.now();
await fs.mkdir(profile,{recursive:true});let app,page;
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});captureNativeOutput(app,nativeOutput);page=await app.firstWindow();await observeNativeClose(app);await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(tidehold:|blob:|data:)/.test(r.url()))remoteRequests.push(r.url());});
}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10));await ended;app=null;}
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));
try{
  await launch();await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/black-6-harbor.json');await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await page.waitForTimeout(200);const before=await disk();
  const button=page.locator('[data-research="precision"]');await expect(button).toContainText('현재 크레인 회수율 +0%p');await button.focus();await page.keyboard.press('Enter');await expect(button).toBeDisabled();await expect(button).toContainText('자료 6 부족');assert.equal(await page.evaluate(()=>document.activeElement?.id==='research-points'||!!document.activeElement?.dataset.research),true);await expect(button).toContainText('다음 크레인 회수율 +20%p');
  await page.locator('#save-button').click();await page.waitForTimeout(200);const paid=await disk();assert.equal(paid.resources,before.resources-1200);assert.equal(paid.campaign.research,before.campaign.research-6);assert.equal(paid.campaign.tech.precision,1);
  await page.screenshot({path:'artifacts/research-native.png'});await close();const saved=await disk();records.push({action:'prior earned colony, keyboard research, exact paid cost, normal close',resources:saved.resources,research:saved.campaign.research,precision:1});
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();const restored=decodeSave(await page.evaluate(()=>localStorage.getItem('tidehold.campaign.v1')));
  assert.equal(restored.resources,saved.resources);assert.deepEqual(restored.campaign.tech,saved.campaign.tech);assert.deepEqual(restored.facilities,saved.facilities);records.push({action:'renderer cache cleared, exact paused disk restore retains purchased effects and materials',restored:true});
  await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();await expect(page.locator('[data-research="precision"]')).toContainText('현재 크레인 회수율 +10%p');
  // A separate earned chart save has enough data to keep this control enabled.
  await page.locator('#save-file').setInputFiles('artifacts/atlas-fixtures/kelp-completion-harbor.json');await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await page.waitForTimeout(200);const chartBefore=await disk(),chart=page.locator('[data-research="ballistics"]'),original=await chart.elementHandle();
  await chart.focus();await page.keyboard.press('Enter');await expect(chart).toBeFocused();assert.equal(await chart.evaluate((current,previous)=>current===previous,original),true);await expect(chart).toContainText('현재 무장 피해 +48%');await close();const chartAfter=await disk();assert.equal(chartAfter.resources,chartBefore.resources);assert.equal(chartAfter.campaign.research,chartBefore.campaign.research-5);assert.equal(chartAfter.campaign.tech.ballistics,4);records.push({action:'separate earned chart, still affordable keyboard research retains identical control and paid save',resources:chartAfter.resources,research:chartAfter.campaign.research,ballistics:4});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);const report={date:new Date().toISOString(),executable:pkg.executable,asarSha256:pkg.asarSha256,profile,actualSeconds:(Date.now()-started)/1000,source:'Prior earned colony fixture; not a fresh normal economy or twenty-hour combat proof.',records,errors,remoteRequests,nativeOutput};await fs.writeFile('artifacts/research-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
