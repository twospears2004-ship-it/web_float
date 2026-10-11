// Hidden native windows and dedicated profiles. The user's browser/PC save is
// never opened. Built renderer, real inputs, disk save, close and fresh restart.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
import {captureNativeOutput,recordNativeFailure,observeNativeClose,waitNativeCloseResult,closeNativeWindow} from './native-diagnostics.mjs';
const packaged=process.argv.find(a=>a.startsWith('--executable='))?.slice(13),id=new Date().toISOString().replace(/[:.]/g,'-');
const profile=path.resolve('artifacts','desktop-profiles',id),records=[],errors=[];await fs.mkdir(profile,{recursive:true});
let app,page;const nativeOutput=[];
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(packaged?{executablePath:path.resolve(packaged),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:60000});
  captureNativeOutput(app,nativeOutput);
  const page=await app.firstWindow();await observeNativeClose(app);page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await expect(page.locator('#start-overlay')).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);assert.deepEqual(await page.evaluate(()=>({require:typeof window.require,process:typeof window.process,desktop:window.tideholdDesktop.version})),{require:'undefined',process:'undefined',desktop:1});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);return page;
}
async function close(){await closeNativeWindow(app,nativeOutput);app=null;}
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8'));
try{
  page=await launch();const start=Date.now();await page.locator('[data-start="direct"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();
  for(const edge of ['north','west']){await page.locator('[data-tool="wall"]').click();await page.locator(`[data-wall-edge="${edge}"][data-x="-1"][data-z="-1"]`).click();}
  await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await page.waitForTimeout(200);
  const before=await disk();assert.equal(before.resources,441);assert.equal(before.facilities.filter(f=>f.type==='wall').length,2);assert.ok(before.facilities.some(f=>f.type==='farm'));
  const invalid=await page.evaluate(()=>window.tideholdDesktop.writeCampaign('broken'));assert.equal(invalid.ok,false);assert.equal((await disk()).resources,441);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="wall"]').click();await page.locator('[data-wall-edge="south"][data-x="-1"][data-z="-1"]').click();
  await page.screenshot({path:`artifacts/desktop-${packaged?'packaged':'development'}.png`});
  const runtime=await app.evaluate(()=>process.versions);await close();const saved=await disk();assert.equal(saved.resources,406);assert.equal(saved.facilities.filter(f=>f.type==='wall').length,3);assert.equal(JSON.parse(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8')).payload.paused,true);
  records.push({action:'paid farm and walls, immediate native close',resources:saved.resources,walls:3,actualSeconds:(Date.now()-start)/1000});
  page=await launch();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();
  let current=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);for(const key of ['campaign','facilities','resources','fleet'])assert.deepEqual(current[key],saved[key]);await close();records.push({action:'normal fresh restart',restored:true});
  page=await launch(true);await page.locator('#continue-button').click();current=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);for(const key of ['campaign','facilities','resources','fleet'])assert.deepEqual(current[key],saved[key]);await close();records.push({action:'renderer cache loss, durable file restores campaign',restored:true});
  // Damage only this test profile's primary. The backup and user saves remain.
  const backup=decodeSave(await fs.readFile(path.join(profile,'saves','campaign.backup.json'),'utf8'));await fs.writeFile(path.join(profile,'saves','campaign.json'),'broken');
  page=await launch(true);await expect(page.locator('#save-status')).toContainText('PC 저장 백업');await page.locator('#continue-button').click();current=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  for(const key of ['campaign','facilities','resources','fleet'])assert.deepEqual(current[key],backup[key]);await close();assert.equal((await disk()).resources,backup.resources);records.push({action:'corrupt native primary, preserved backup and repaired primary',restored:true});
  page=await launch();await page.locator('#continue-button').click();await page.locator('#resume-button').click();
  const primary=path.join(profile,'saves','campaign.json');await fs.chmod(primary,0o444);
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="wall"]').click();await page.locator('[data-wall-edge="east"][data-x="-1"][data-z="-1"]').click();
  await expect(page.locator('#save-status')).toContainText('PC 파일 저장 실패');const closeStarted=Date.now();await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});const failedClose=await waitNativeCloseResult(nativeOutput,closeStarted);assert.equal(failedClose.ok,false,'Read-only permission must remain until the actual failed close response.');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);assert.equal((await disk()).resources,406);await expect(page.locator('#pause-overlay')).toBeVisible();
  await fs.chmod(primary,0o666);await page.locator('#resume-button').click();await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await page.waitForTimeout(200);await close();assert.equal((await disk()).resources,371);
  records.push({action:'real read-only primary blocks unsafe exit, retry preserves new wall',resources:371,restored:true});
  page=await launch();await page.locator('#continue-button').click();await page.locator('#resume-button').click();
  // Isolated storage fault, not game state injection or normal-play evidence.
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('tidehold.campaign.'))throw new DOMException('test storage full','QuotaExceededError');return original.call(this,key,value);};});
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator('[data-tile="-1,-1"]').click();await page.locator('[data-action="upgrade"]').click();await close();
  const durable=await disk();assert.equal(durable.resources,266);assert.equal(durable.facilities.find(f=>f.type==='farm').level,2);
  page=await launch(true);await page.locator('#continue-button').click();current=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);assert.equal(current.resources,266);assert.equal(current.facilities.find(f=>f.type==='farm').level,2);await close();
  records.push({action:'forced renderer storage failure still saves durable farm upgrade and restarts',resources:266,restored:true});
  assert.equal(errors.length,0);const report={date:new Date().toISOString(),type:'isolated native application',packaged:!!packaged,executable:packaged || 'development Electron',profile,runtime,rendererNode:false,visibleWindows:false,records,errors,nativeOutput};await fs.writeFile(`artifacts/desktop-${packaged?'packaged':'development'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:packaged||'development Electron'});throw error;}finally{if(app)await app.close();}
