// Actual-time built game, public controls and isolated profiles only. Native
// runs read the fixed test-profile save and perform a real close/restart.
import {chromium,_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
const executable=process.argv.find(a=>a.startsWith('--executable='))?.slice(13);
const label=executable?'native':'web',records=[],errors=[],remoteRequests=[];
const id=new Date().toISOString().replace(/[:.]/g,'-'),profile=path.resolve('artifacts','desktop-profiles',`groups-${id}`);
let browser,app;
async function nativePage(clear=false){
  await fs.mkdir(profile,{recursive:true});
  const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile,TIDEHOLD_CLEAR_RENDERER_CACHE:clear?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:path.resolve(executable),args:[],cwd:process.cwd(),env,timeout:60000});
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);return page;
}
async function nativeClose(){const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;}
const disk=async()=>decodeSave(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8'));
function observe(page){
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.failure()?.errorText));
  page.on('request',r=>{const u=r.url();if(!u.startsWith('http://127.0.0.1:4173/')&&!u.startsWith('tidehold://game/')&&!u.startsWith('blob:')&&!u.startsWith('data:'))remoteRequests.push(u);});
}
async function selected(page,ids){
  await expect(page.locator('#selection-count')).toHaveText(`선택 ${ids.length}`);
  for(const id of [1,2,3])await expect(page.locator(`[data-unit-select="${id}"]`)).toHaveAttribute('aria-pressed',String(ids.includes(id)));
}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')));
try{
  if(!executable)browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  for(const mode of executable?['destination']:['direct','destination']){
    const start=Date.now(),context=browser&&await browser.newContext({viewport:{width:1440,height:900}}),page=executable?await nativePage():await context.newPage();observe(page);
    if(!executable)await page.goto('http://127.0.0.1:4173/');
    assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
    assert.deepEqual(await page.evaluate(()=>({require:typeof window.require,process:typeof window.process})),{require:'undefined',process:'undefined'});
    await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
    if(mode==='direct'){await page.locator('#mode-button').click();await page.locator('[data-start="direct"]').click();}
    await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#effects-volume').fill('0');await page.locator('#music-volume').fill('0');await page.locator('#close-settings').click();
    await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();
    for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
    await page.locator('[data-unit-select="1"]').click();await page.locator('[data-unit-select="2"]').click({modifiers:['Shift']});await page.keyboard.press('Control+5');
    await page.locator('[data-unit-select="3"]').click();await page.locator('[data-group-save="6"]').click();
    const groups={5:[1,2],6:[3]};assert.deepEqual((await stored(page)).payload.fleet.groups,groups);assert.equal((await stored(page)).payload.resources,406);
    await page.keyboard.press('5');await selected(page,[1,2]);await page.keyboard.press('5');await expect(page.locator('#fleet-focus')).toHaveText('섬 시점');
    await page.locator('[data-tab="campaign"]').click();await page.locator('.chapter-list').first().locator('summary').click();await page.locator('[data-mission="coral-1"]').click();
    await page.keyboard.press('5');await page.keyboard.press('h');const commanded=(await stored(page)).payload;
    assert.deepEqual(commanded.fleet.units.map(u=>u.command.type),['hold','hold','escort']);assert.deepEqual(commanded.fleet.groups,groups);
    const charges=commanded.campaign.abilityCharges.barrier;await page.keyboard.press('1');assert.equal((await stored(page)).payload.campaign.abilityCharges.barrier,charges-1);
    await page.locator('[data-tab="fleet"]').click();await page.locator('[data-control-group="6"]').click();await selected(page,[3]);
    await page.mouse.move(500,200);await page.screenshot({path:`artifacts/groups-${label}-${mode}.png`});
    const prior=(await stored(page)).savedAt;await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
    // An actual five-second autosave tick, never pagehide or a virtual clock.
    await page.waitForFunction(prior=>{const s=JSON.parse(localStorage.getItem('tidehold.campaign.v1'));return s.payload.paused&&s.savedAt!==prior;},prior);
    const saved=(await stored(page)).payload;assert.deepEqual(saved.fleet.groups,groups);assert.equal(saved.resources,406);
    let restored;
    if(executable){
      await nativeClose();assert.deepEqual((await disk()).fleet,saved.fleet);assert.equal(JSON.parse(await fs.readFile(path.join(profile,'saves','campaign.json'),'utf8')).payload.paused,true);
      const restarted=await nativePage(true);observe(restarted);await expect(restarted.locator('#save-status')).toContainText('PC 저장');await restarted.locator('#continue-button').click();await expect(restarted.locator('#pause-overlay')).toBeVisible();
      restored=(await stored(restarted)).payload;assert.deepEqual(restored.fleet,saved.fleet);assert.equal(restored.resources,406);
      await restarted.locator('#resume-button').click();await restarted.keyboard.press('5');await selected(restarted,[1,2]);await nativeClose();
    }else{
      await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();await page.reload();await page.locator('#continue-button').click();
      restored=(await stored(page)).payload;assert.deepEqual(restored.fleet,saved.fleet);assert.equal(restored.resources,406);await page.locator('#resume-button').click();await page.keyboard.press('5');await selected(page,[1,2]);
      await page.locator('[data-tab="campaign"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(`artifacts/groups-${label}-${mode}-export.json`);
      const exported=decodeSave(await fs.readFile(`artifacts/groups-${label}-${mode}-export.json`,'utf8'));assert.deepEqual(exported.fleet.groups,groups);await context.close();
    }
    records.push({mode,realSeconds:(Date.now()-start)/1000,paidResources:661,resources:406,ships:3,groups,commands:['hold','hold','escort'],actualAutosave:true,restored:true,cacheCleared:!!executable});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);
  const report={date:new Date().toISOString(),kind:'actual-time production group controls and persistence; not full campaign play',executable:executable||null,browser:browser?.version(),profile:executable?profile:null,noDevHooks:true,noVirtualClock:true,records,errors,remoteRequests};await fs.writeFile(`artifacts/groups-${label}-production.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(app)await app.close();if(browser)await browser.close();}
