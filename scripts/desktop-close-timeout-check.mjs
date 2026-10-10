// Controlled renderer freeze in an isolated native profile. This fault check
// is not normal play, performance, or play-length evidence.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave,SAVE_KEY} from '../src/save.js';
import {captureNativeOutput,recordNativeFailure} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`close-timeout-${new Date().toISOString().replace(/[:.]/g,'-')}`),records=[],errors=[],logs=[];
await fs.mkdir(profile,{recursive:true});let app,page,cdp;
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],cwd:process.cwd(),env,timeout:60000});captureNativeOutput(app,logs);page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
}
async function requestClose(){await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await requestClose();await ended;app=null;}
const primary=path.join(profile,'saves/campaign.json'),start=Date.now();
try{
  await launch();await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tool="wall"]').click();await page.locator('[data-wall-edge="north"][data-x="-1"][data-z="-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await expect(page.locator('#save-status')).toContainText('자동 저장 완료 · 내 PC');
  await expect.poll(async()=>decodeSave(await fs.readFile(primary,'utf8')).resources).toBe(476);
  cdp=await app.context().newCDPSession(page);await cdp.send('Debugger.enable');
  let pauseTimer;const paused=new Promise((resolve,reject)=>{pauseTimer=setTimeout(()=>reject(new Error('Renderer debugger did not pause')),5000);cdp.once('Debugger.paused',()=>{clearTimeout(pauseTimer);resolve();});});
  await cdp.send('Debugger.pause');await paused;
  const before=await fs.readFile(primary,'utf8'),frozenSave=decodeSave(before);assert.equal(frozenSave.resources,476);
  const timeoutStart=Date.now();await requestClose();
  await expect.poll(()=>logs.some(l=>l.text.includes('TIDEHOLD_CLOSE_FAILED:')&&l.text.includes('응답하지')),{timeout:15000}).toBe(true);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);assert.equal(await fs.readFile(primary,'utf8'),before);
  records.push({action:'frozen renderer triggers real close deadline, window and paid save remain intact',actualSeconds:(Date.now()-timeoutStart)/1000,resources:476,primaryBytes:Buffer.byteLength(before),unchanged:true});
  await cdp.send('Debugger.resume');await expect(page.locator('#pause-overlay')).toBeVisible();
  await close();const saved=decodeSave(await fs.readFile(primary,'utf8'));assert.equal(saved.resources,476);assert.equal(saved.paused,true);assert(saved.facilities.some(f=>f.type==='farm'));assert(saved.facilities.some(f=>f.type==='wall'&&f.edge==='north'));
  records.push({action:'responsive renderer retries normal close and preserves farm and face wall',resources:476,paused:true});
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();
  const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).payload,SAVE_KEY);for(const key of ['resources','facilities','fleet','campaign'])assert.deepEqual(restored[key],saved[key]);await close();
  records.push({action:'cache loss recovers the exact paid save after timeout and retry',restored:true});assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),kind:'controlled renderer debugger pause, real native close deadline and retry',executable:pkg.executable,gameBundle:pkg.gameBundle,profile,realSeconds:(Date.now()-start)/1000,normalPlay:false,noGameMutation:true,noVirtualClock:true,records,errors,nativeOutput:logs};await fs.writeFile('artifacts/power-status-native-close-timeout.json',JSON.stringify(report,null,2));console.log(JSON.stringify({records:records.length,realSeconds:report.realSeconds,errors,controlledFault:true}));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
