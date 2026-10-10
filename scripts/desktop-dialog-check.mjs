// Real packaged keyboard input and disk recovery, in a hidden owned profile.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave,SAVE_KEY} from '../src/save.js';
import {captureNativeOutput,observeNativeClose,recordNativeFailure} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts','desktop-profiles',`dialog-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(profile,{recursive:true});
const errors=[],records=[],nativeOutput=[];let app,page;
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8'));
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],env,cwd:process.cwd(),timeout:60000});captureNativeOutput(app,nativeOutput);
  page=await app.firstWindow();await observeNativeClose(app);page.on('pageerror',error=>errors.push(error.message));await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;}
const start=Date.now();
try{
  await launch();await page.locator('[data-start="direct"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tool="wall"]').click();await page.locator('[data-wall-edge="north"][data-x="-1"][data-z="-1"]').click();
  await page.locator('#settings-button').click();await page.locator('#effects-volume').focus();
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#settings-overlay')));}
  await page.locator('#graphics-quality').focus();await page.keyboard.press('Escape');await expect(page.locator('#settings-overlay')).toBeHidden();await expect(page.locator('#settings-button')).toBeFocused();
  await page.locator('#help-button').click();await page.keyboard.press('Shift+Tab');await expect(page.locator('#close-help')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#help-overlay')).toBeHidden();
  records.push({action:'native settings input Escape and modal Tab, help Shift+Tab and Escape',passed:true});
  await page.locator('[data-tab="campaign"]').click();await page.locator('#save-button').click();await expect.poll(async()=>(await disk()).resources).toBe(476);
  await close();const saved=await disk();assert.equal(saved.resources,476);assert(saved.facilities.some(f=>f.type==='farm'));assert(saved.facilities.some(f=>f.type==='wall'&&f.edge==='north'));
  records.push({action:'actual farm and north wall remain paid after native close',resources:saved.resources});
  await launch(true);await expect(page.locator('#save-status')).toContainText('PC 저장');await page.locator('[data-start="destination"]').click();await expect(page.locator('#replace-overlay')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.locator('#cancel-new')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#replace-overlay')).toBeHidden();
  await page.locator('#continue-button').click();const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).payload,SAVE_KEY);
  for(const key of ['facilities','resources','campaign','fleet'])assert.deepEqual(restored[key],saved[key],key);
  await close();assert.equal((await disk()).resources,476);records.push({action:'cache loss plus replacement cancel restores paid campaign',passed:true});
  assert.deepEqual(errors,[]);const report={date:new Date().toISOString(),executable:pkg.executable,gameBundle:pkg.gameBundle,profile,realSeconds:(Date.now()-start)/1000,records,errors,nativeOutput,noDevHooks:true,noVirtualClock:true};
  await fs.writeFile('artifacts/dialog-keyboard-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify({records:records.length,seconds:report.realSeconds,resources:476,errors,gameBundle:pkg.gameBundle}));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
