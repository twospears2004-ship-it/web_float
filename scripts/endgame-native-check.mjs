// Public file controls, normal earned result and real native cache-loss recovery.
// No virtual clock, renderer mutation, personal profile or external request.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave,SAVE_KEY} from '../src/save.js';
import {canonicalSavedValue} from './save-comparison.mjs';
import {getSiege} from '../src/siege-content.js';
import {captureNativeOutput,recordNativeFailure,observeNativeClose} from './native-diagnostics.mjs';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const fixture=arg('fixture','tests/fixtures/endgame-earned-coral-network-result.json'),output=arg('output','artifacts/endgame-native');
assert(/^artifacts\/[a-z0-9-]+$/.test(output),'Output must be an owned artifact prefix.');
assert(/^(?:tests\/fixtures|artifacts\/)[a-zA-Z0-9_./-]+\.json$/.test(fixture)&&!fixture.includes('..'),'Use a workspace-owned earned save.');
const earned=decodeSave(await fs.readFile(fixture,'utf8'));
assert.equal(earned.phase,'mission-complete');assert(getSiege(earned.operation.id)?.endgame&&earned.operation.id.endsWith('-4'));assert.equal(earned.campaign.completed.length,72);
const nextId=earned.operation.id.replace(/-4$/,'-5');
const profile=path.resolve('artifacts','desktop-profiles',`endgame-${new Date().toISOString().replace(/[:.]/g,'-')}`),errors=[],remoteRequests=[],records=[],nativeOutput=[];let app,page;
await fs.mkdir(profile,{recursive:true});
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8'));
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:[],cwd:process.cwd(),env,timeout:60000});captureNativeOutput(app,nativeOutput);const page=await app.firstWindow();await observeNativeClose(app);await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);assert.equal(await page.evaluate(()=>typeof process!=='undefined'||typeof require!=='undefined'),false);
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.failure()?.errorText));page.on('request',r=>{if(!['tidehold://game/','blob:','data:'].some(prefix=>r.url().startsWith(prefix)))remoteRequests.push(r.url());});return page;
}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;}
function same(actual,expected){for(const key of ['resources','fleet','enemies','operation','facilities'])assert.deepEqual(canonicalSavedValue(actual[key]),canonicalSavedValue(expected[key]),key);assert.deepEqual(actual.campaign.frontier,expected.campaign.frontier);}
const start=Date.now();
try{
  page=await launch();await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles(fixture);await expect(page.locator('#end-title')).toHaveText('거점을 확보했습니다');
  await close();same(await disk(),earned);records.push({action:'normal earned remote-power result saved by native close',id:earned.operation.id,resources:earned.resources,remoteGenerators:earned.enemies.filter(e=>e.powerLink).length});
  page=await launch(true);await expect(page.locator('#save-status')).toContainText('PC 저장');await page.locator('#continue-button').click();await expect(page.locator('#end-title')).toHaveText('거점을 확보했습니다');same((await stored(page)).payload,earned);
  await page.locator('#retry-button').click();await expect(page.locator(`[data-siege="${nextId}"]`)).toBeEnabled();records.push({action:'result cache loss restores paid fleet and unlocks three-dock contract',restored:true});
  const expectedTitle=getSiege(nextId).name,expectedPower=getSiege(nextId).chapter>0?'핵 전력 서 1 · 중앙 2 · 동 1':'동력 공급 유지';
  await page.locator(`[data-siege="${nextId}"]`).click();await page.locator('#start-defense-wave').click();await page.waitForTimeout(1500);await expect(page.locator('#scene-title')).toHaveText(expectedTitle);await expect(page.locator('#mission-progress')).toContainText(expectedPower);await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
  const prior=(await stored(page)).savedAt;await page.waitForFunction(({key,prior})=>{const s=JSON.parse(localStorage.getItem(key));return s.payload.paused&&s.savedAt!==prior;},{key:SAVE_KEY,prior},{timeout:15000});
  const saved=(await stored(page)).payload;assert.equal(saved.operation.id,nextId);assert.equal(saved.enemies.filter(e=>e.type==='baseCore').length,3);assert.equal(saved.enemies.filter(e=>e.powerLink===true).length,2);
  if(getSiege(nextId).chapter>0){assert.deepEqual(saved.enemies.filter(e=>e.type==='generator').map(e=>e.powerBus).sort(),['east','west']);assert.deepEqual(saved.enemies.filter(e=>e.type==='baseCore').map(e=>e.powerBus).sort(),['east','shared','west']);}
  await close();same(await disk(),saved);records.push({action:'actual-time active three-dock autosave and native close',cores:3,generators:2,resources:saved.resources,ships:saved.fleet.units.length,displayedTitle:expectedTitle,displayedPower:expectedPower});
  page=await launch(true);await expect(page.locator('#save-status')).toContainText('PC 저장');await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();same((await stored(page)).payload,saved);
  await expect(page.locator('#scene-title')).toHaveText(expectedTitle);await expect(page.locator('#mission-progress')).toContainText(expectedPower);
  await page.screenshot({path:`${output}-cache-restored.png`});await close();records.push({action:'active remote generators and three cores survive cache loss',restored:true,displayedTitle:expectedTitle,displayedPower:expectedPower});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);const report={date:new Date().toISOString(),kind:'actual-time isolated native post-ending save, unlock and cache-loss recovery',fixture,executable:pkg.executable,gameBundle:pkg.gameBundle,profile,realSeconds:(Date.now()-start)/1000,noDevHooks:true,noVirtualClock:true,records,errors,remoteRequests,nativeOutput};await fs.writeFile(`${output}-production.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await recordNativeFailure({app,page,profile,error,errors,logs:nativeOutput,records,executable:pkg.executable});throw error;}finally{if(app)await app.close();}
