import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`onboarding-${Date.now()}`);
await fs.mkdir(profile,{recursive:true});
const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const started=Date.now();
try{
  app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await page.locator('#beginner-start').click();await page.locator('#first-voyage-action').click();
  await page.locator('[data-tile="-1,-1"]').click();await expect(page.locator('#first-voyage-action')).toHaveText('첫 임무 목록 보기');
  await page.screenshot({path:'artifacts/onboarding-native-prepared.png'});
  await page.locator('#first-voyage-action').click();await page.locator('[data-mission="coral-1"]').click();
  await expect(page.locator('#first-voyage-text')).toContainText('WASD');
  await page.locator('#first-voyage-action').click();await expect(page.locator('#voyage-panel')).toBeVisible();
  const ended=app.waitForEvent('close',{timeout:20000});
  await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;
  const save=decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));
  assert.equal(save.resources,50);assert(save.facilities.some(f=>f.type==='mortar'));
  assert.equal(save.campaign.missionId,'coral-1');assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),executable:pkg.executable,profile,gameBundle:pkg.gameBundle,realElapsedSeconds:(Date.now()-started)/1000,resources:save.resources,mission:save.campaign.missionId,errors,passed:true};
  await fs.writeFile('artifacts/onboarding-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(app)await app.close();}
