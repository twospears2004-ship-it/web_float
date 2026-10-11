import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave,SAVE_KEY} from '../src/save.js';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`return-${Date.now()}`);await fs.mkdir(profile,{recursive:true});
let app,page;const errors=[];const started=Date.now();
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
}
async function capture(){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));return decodeSave(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;}
const keys=['time','resources','hull','facilities','fleet','enemies','campaign','route','island'];
try{
  await launch();await page.locator('[data-start="destination"]').click();await page.locator('[data-tab="build"]').click();
  await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();const harbor=await capture();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();await page.waitForTimeout(1000);
  await page.locator('#home-button').click();await expect(page.locator('#cancel-return')).toBeFocused();const frozen=await capture();
  await page.waitForTimeout(2000);await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeHidden();
  const still=await capture();for(const key of keys)assert.deepEqual(still[key],frozen[key],key);
  await page.keyboard.press('Tab');await expect(page.locator('#confirm-return')).toBeFocused();await page.keyboard.press('Escape');
  await expect(page.locator('#return-overlay')).toBeHidden();await expect(page.locator('#home-button')).toBeFocused();
  await page.locator('#home-button').click();const pending=await capture();await page.screenshot({path:'artifacts/return-native-dialog.png'});await close();
  const disk=decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));assert.equal(disk.campaign.missionId,'coral-1');
  for(const key of keys)assert.deepEqual(disk[key],pending[key],key);
  await launch(true);await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();
  const restored=await capture();for(const key of keys)assert.deepEqual(restored[key],disk[key],key);
  await page.locator('#resume-button').click();await page.locator('[data-tab="voyage"]').click();await page.locator('#home-button').click();await page.locator('#confirm-return').click();
  await expect(page.locator('#return-overlay')).toBeHidden();await close();const back=decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));
  assert.equal(back.campaign.stage,'harbor');assert.equal(back.resources,harbor.resources);assert.deepEqual(back.facilities,harbor.facilities);assert.deepEqual(back.campaign.completed,[]);assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),executable:pkg.executable,profile,gameBundle:pkg.gameBundle,realSeconds:(Date.now()-started)/1000,noDevHooks:true,noVirtualClock:true,resources:back.resources,errors,passed:true};
  await fs.writeFile('artifacts/return-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(app)await app.close();}
