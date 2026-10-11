// Actual packaged research contrast and exact paid harbor recovery. Only
// public controls, native window sizes and an isolated hidden profile.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
import {canonicalSavedValue} from './save-comparison.mjs';
import {researchContrast} from './research-contrast.mjs';
import {captureNativeOutput,recordNativeFailure,observeNativeClose,closeNativeWindow} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/research-readability-package.json','utf8')),file='tests/fixtures/field-control-earned-harbor.json',earned=decodeSave(await fs.readFile(file,'utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`research-readability-${Date.now()}`),records=[],samples=[],errors=[],remoteRequests=[],nativeOutput=[],closeProof=[],started=Date.now();await fs.mkdir(profile,{recursive:true});let app,page;
const compare=(a,b)=>assert.deepEqual(canonicalSavedValue(a),canonicalSavedValue(b));
function unchangedHarbor(a,b){
  // Real native observation advances the legitimate cumulative play clock.
  // Check normal weapon cooldown expiry against that same elapsed clock;
  // verify every other paid harbor field exactly.
  // close/restart comparisons below retain exact complete saved states.
  assert(a.campaign.totalActiveSeconds>=b.campaign.totalActiveSeconds);
  const elapsed=a.campaign.totalActiveSeconds-b.campaign.totalActiveSeconds;
  for(const key of ['resources','hull','maxHull','campaign','operation','enemies','facilities','fleet','checkpoint']){
    let before=key==='campaign'?{...b.campaign,totalActiveSeconds:a.campaign.totalActiveSeconds}:b[key];
    if(key==='facilities')before=b.facilities.map((f,i)=>{const now=a.facilities[i];assert.equal(now.id,f.id);assert(Math.abs(now.cooldown-(f.hp===0?f.cooldown:Math.max(0,f.cooldown-elapsed)))<1e-7,`normal cooldown #${f.id}`);return {...f,cooldown:now.cooldown};});
    assert.deepEqual(canonicalSavedValue(a[key]),canonicalSavedValue(before),key);
  }
}
async function stored(){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));return page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);}
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});captureNativeOutput(app,nativeOutput);page=await app.firstWindow();await observeNativeClose(app);await page.waitForLoadState('domcontentloaded');assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(tidehold:|blob:|data:)/.test(r.url()))remoteRequests.push(r.url());});
}
async function close(expected){closeProof.push(await closeNativeWindow(app,nativeOutput));app=null;compare(decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8')),expected);}
async function sample(kind){
  const card=page.locator('[data-research="cryodynamics"]');await expect(card).toBeDisabled();await expect(card).toContainText(kind==='locked'?'자료 6 · 자원 2200':'완료');
  for(const requestedWidth of [1440,1100]){
    await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,900),requestedWidth);await card.scrollIntoViewIfNeeded();const width=await page.evaluate(()=>innerWidth),rows=await card.evaluate(researchContrast);
    for(const row of rows){assert(row.contrast>=4.5,row.text);assert.equal(row.opacity,1,row.text);assert(row.inside&&row.wrapped,row.text);}
    samples.push({kind,requestedWidth,width,rows});await page.screenshot({path:`artifacts/research-readability-native-${kind}-${width}.png`});
  }
}
try{
  await launch();await page.locator('[data-start="destination"]').click();await page.locator('[data-tab="campaign"]').click();const initial=await stored();await sample('locked');const observed=await stored();unchangedHarbor(observed,initial);await page.keyboard.press('p');const unchanged=await stored();unchangedHarbor(unchanged,observed);await close(unchanged);records.push({action:'actual EXE locked research shows readable effects, prices and unlock reason at normal native sizes; disabled research does not charge and paused normal close preserves the complete initial save',resources:unchanged.resources,activeSecondsDuringObservation:unchanged.campaign.totalActiveSeconds-initial.campaign.totalActiveSeconds});
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();compare(await stored(),unchanged);await page.locator('#resume-button').click();await page.locator('#save-file').setInputFiles(file);await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();const imported=await stored();unchangedHarbor(imported,earned);await sample('completed');const viewed=await stored();unchangedHarbor(viewed,imported);assert.equal(viewed.campaign.tech.cryodynamics,3);await page.keyboard.press('p');const paid=await stored();unchangedHarbor(paid,viewed);await close(paid);records.push({action:'actual EXE unchanged public paid harbor import shows completed research and current effects without a new payment; paused native close preserves the complete paid save',resources:paid.resources,level:3,activeSecondsDuringObservation:paid.campaign.totalActiveSeconds-imported.campaign.totalActiveSeconds});
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();compare(await stored(),paid);await close(paid);records.push({action:'empty renderer cache restart restores exact normally paid harbor from native save',restored:true});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);const report={date:new Date().toISOString(),executable:pkg.executable,sha256:pkg.sha256,asarSha256:pkg.asarSha256,profile,actualSeconds:(Date.now()-started)/1000,records,samples,errors,remoteRequests,closeProof,nativeOutput};await fs.writeFile('artifacts/research-readability-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify({actualSeconds:report.actualSeconds,records,minimumContrast:Math.min(...samples.flatMap(s=>s.rows.map(r=>r.contrast))),errors,remoteRequests}));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
