// Real-time, packaged Windows UI only. Read-only exported saves observe orders;
// no development hooks, virtual clock, injected money or personal profiles.
import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`orders-${Date.now()}`),errors=[],remoteRequests=[],records=[],started=Date.now();
await fs.mkdir(profile,{recursive:true});let app;
async function launch(clear=false){
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:pkg.executable,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],env,timeout:60000});const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(tidehold:|blob:|data:)/.test(r.url()))remoteRequests.push(r.url());});return page;
}
async function close(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10));await ended;app=null;}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));
try{
  let page=await launch();await page.locator('[data-start="direct"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();
  await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();
  for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
  await page.locator('[data-unit-select="1"]').click();await page.locator('[data-unit-select="2"]').click({modifiers:['Shift']});await page.keyboard.press('Control+5');
  assert.equal((await stored(page)).resources,406);
  await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();
  const box=await page.locator('#scene canvas').boundingBox();
  async function click(x,y,queue=false){const point={x:box.x+box.width*x,y:box.y+box.height*y};assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,point),'CANVAS','an overlay covers the intended sea point');if(queue)await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y,{button:'right'});if(queue)await page.keyboard.up('Shift');}
  await page.mouse.move(box.x+box.width*0.4,box.y+box.height*0.4);await page.mouse.wheel(0,600);
  await click(0.18,0.38);const active=(await stored(page)).fleet.units.slice(0,2).map(u=>u.command);assert(active.every(o=>o.type==='move'));
  await click(0.35,0.32,true);await page.keyboard.press('x');await click(0.62,0.46,true);
  await page.keyboard.press('p');const queued=await stored(page);for(const u of queued.fleet.units.slice(0,2))assert.deepEqual(u.orders.map(o=>o.type),['move','attackMove']);
  assert.deepEqual(queued.fleet.units.slice(0,2).map(u=>u.command),active);await page.screenshot({path:'artifacts/fleet-orders-native-route.png'});await close();
  const saved=await disk();assert.deepEqual(saved.fleet.units.slice(0,2).map(u=>u.orders),queued.fleet.units.slice(0,2).map(u=>u.orders));records.push({action:'paid three ships, two selected, ordered two queued legs, normal close',resources:saved.resources,orders:saved.fleet.units.slice(0,2).map(u=>u.orders)});
  page=await launch(true);await page.locator('#continue-button').click();const restored=await stored(page);assert.deepEqual(restored.fleet,saved.fleet);assert.equal(restored.resources,406);
  await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await expect(page.locator('#import-save-status')).toContainText('불러오기 실패');
  await page.waitForTimeout(6000);await expect(page.locator('#save-status')).toContainText('자동 저장 완료');await expect(page.locator('#import-save-status')).toContainText('기존 진행은 유지');
  assert.deepEqual((await stored(page)).fleet,saved.fleet);records.push({action:'clear renderer cache, native restore, invalid import survives real autosave',seconds:6});
  await page.locator('#resume-button').click();await page.locator('#dismiss-import-error').click();await expect(page.locator('#import-save-notice')).toBeHidden();await page.keyboard.press('5');
  console.log(JSON.stringify({action:'restored route resumed',visibility:await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()})),paused:await page.locator('#pause-overlay').isVisible(),savedSeconds:(await stored(page)).campaign.missionSeconds}));
  const progress=[],deadline=Date.now()+240000;
  while(true){
    const g=await stored(page),paused=await page.locator('#pause-overlay').isVisible();
    progress.push({at:new Date().toISOString(),savedSeconds:g.campaign.missionSeconds,paused,units:g.fleet.units.slice(0,2).map(u=>({x:u.x,z:u.z,command:u.command.type,queued:u.orders?.length||0}))});
    if(progress.length%5===1)console.log(JSON.stringify(progress.at(-1)));
    if(g.fleet.units.slice(0,2).every(u=>u.command.type==='hold'&&!u.orders))break;
    assert.equal(paused,false,'the restored native route paused unexpectedly');assert(Date.now()<deadline,'restored native route did not finish within real-time observation');await page.waitForTimeout(1000);
  }
  records.push({action:'actual-time route observations',graphics:'low',progress});
  await page.keyboard.press('p');await close();const finished=await disk();
  for(const [i,u] of finished.fleet.units.slice(0,2).entries()){assert.equal(u.orders,undefined);const goal=saved.fleet.units[i].orders.at(-1);assert(Math.hypot(u.x-goal.x,u.z-goal.z)<0.6);}
  records.push({action:'restored ships executed queued route to completion',positions:finished.fleet.units.slice(0,2).map(u=>({x:u.x,z:u.z})),resources:finished.resources});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);
  const report={date:new Date().toISOString(),passed:true,executable:pkg.executable,bundle:pkg.gameBundle,profile,noDevHooks:true,noVirtualClock:true,realSeconds:(Date.now()-started)/1000,records,errors,remoteRequests};await fs.writeFile('artifacts/fleet-orders-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await fs.writeFile('artifacts/fleet-orders-native-failure.json',JSON.stringify({date:new Date().toISOString(),executable:pkg.executable,profile,records,errors,error:error.stack},null,2));throw error;}
finally{if(app)await app.close();}
