// Previous packaged EXE rejects supply doctrine format five without losing its original save.
// Only an isolated hidden profile, public controls and real native storage.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeSave} from '../src/save.js';
import {canonicalSavedValue} from './save-comparison.mjs';
import {captureNativeOutput,recordNativeFailure,observeNativeClose,closeNativeWindow} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/research-readability-package.json','utf8')),file=path.resolve('artifacts/power-targeting-native-earned.json'),earned=decodeSave(await fs.readFile(file,'utf8'));
const relative=path.relative(path.resolve('release'),pkg.executable);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.equal(JSON.parse(await fs.readFile(file,'utf8')).version,5);
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');assert.equal(await hash(pkg.executable),pkg.sha256);assert.equal(await hash(path.join(pkg.directory,'resources/app.asar')),pkg.asarSha256);
const profile=path.resolve('artifacts/desktop-profiles',`power-targeting-compat-${Date.now()}`),records=[],errors=[],remoteRequests=[],nativeOutput=[],closeProof=[],started=Date.now();await fs.mkdir(profile,{recursive:true});let app,page;
const stored=async()=>decodeSave(await page.evaluate(()=>localStorage.getItem('tidehold.campaign.v1')));
const compare=(a,b)=>assert.deepEqual(canonicalSavedValue(a),canonicalSavedValue(b));
async function launch(clear=false){const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});captureNativeOutput(app,nativeOutput);page=await app.firstWindow();await observeNativeClose(app);await page.waitForLoadState('domcontentloaded');assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(tidehold:|blob:|data:)/.test(r.url()))remoteRequests.push(r.url());});}
async function close(){closeProof.push(await closeNativeWindow(app,nativeOutput));app=null;}
try{
  await launch();await page.locator('[data-start="destination"]').click();await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const original=await stored();assert.equal(original.fleet.version,1);await page.locator('#resume-button').click();await page.locator('#save-file').setInputFiles(file);await expect(page.locator('#import-save-status')).toContainText('지원되지');const message=await page.locator('#import-save-status').textContent();compare(await stored(),original);await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();await close();compare(decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8')),original);records.push({action:'previous actual EXE rejects earned format-five supply-doctrine file and leaves original campaign/native primary exact',message,saveUntouched:true});
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();compare(await stored(),original);await close();compare(decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8')),original);records.push({action:'empty renderer cache restores original native save after rejected supply import',restored:true});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);const report={date:new Date().toISOString(),executable:pkg.executable,sha256:pkg.sha256,asarSha256:pkg.asarSha256,sourceFile:file,sourceSaveVersion:5,profile,actualSeconds:(Date.now()-started)/1000,records,errors,remoteRequests,closeProof,nativeOutput};await fs.writeFile('artifacts/power-targeting-compat-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify({actualSeconds:report.actualSeconds,records,errors,remoteRequests,profile}));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
