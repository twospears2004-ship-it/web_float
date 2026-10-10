// Actual built game, isolated Chrome profiles, player file/actions and real
// autosave time. Inputs are normal-earned models, not injected game state.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeSave} from '../src/save.js';
const browser=await chromium.launch({channel:'chrome',headless:true}),records=[];
try{
  for(const [label,file]of [['early','artifacts/wall-fixtures/farm-first-growth.json'],['colony','tests/fixtures/walls-legacy-coral-harbor.json'],['legacy','tests/fixtures/atlas-legacy-journey.json']]){
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],remote=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/')&&!r.url().startsWith('data:'))remote.push(r.url());});
    const expected=decodeSave(await fs.readFile(file,'utf8')),start=Date.now();let cost=0;
    await page.goto('http://127.0.0.1:4173/');await page.locator('[data-start="destination"]').click();assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
    await page.locator('#save-file').setInputFiles(file);
    if(label==='early')await page.locator('#retry-button').click();else await page.locator('#resume-button').click();
    await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('low');await page.locator('#close-settings').click();await page.locator('[data-tab="build"]').click();
    if(label==='early'){
      await page.locator('#board-toggle').click();await page.locator('[data-tile="1,1"]').click();await expect(page.locator('#facility-panel')).toContainText('수경 농장');await expect(page.locator('[data-action="collect"]')).toContainText('18');await page.locator('[data-action="collect"]').click();cost-=18;
      for(const edge of ['north','east']){await page.locator('[data-tool="wall"]').click();await page.locator(`[data-wall-edge="${edge}"][data-x="1"][data-z="1"]`).click();cost+=35;}
      await page.locator('[data-tile="1,1"]').click();await expect(page.locator('#facility-panel')).toContainText('수경 농장');await expect(page.locator('[data-action="collect"]')).toBeDisabled();
    }else if(label==='colony'){
      await page.locator('[data-tool="farm"]').click();await page.locator('[data-tile="-1,-1"]').click();cost+=150;await page.locator('[data-action="upgrade"]').click();cost+=105;
      for(const edge of ['north','east','south','west']){await page.locator('[data-tool="wall"]').click();await page.locator(`[data-wall-edge="${edge}"][data-x="-1"][data-z="-1"]`).click();cost+=35;}
      const side=page.locator('[data-wall-edge="east"][data-x="-1"][data-z="-1"]');await side.click();await expect(page.locator('#facility-panel')).toContainText('동쪽');
      await page.locator('[data-action="move"]').click();await page.locator('[data-edge-choice="east"]').click();await page.locator('[data-tile="0,0"]').click();await expect(page.locator('#facility-panel')).toContainText('타일 (0, 0)의 동쪽 면');
      await page.locator('[data-wall-edge="south"][data-x="-1"][data-z="-1"]').click();await page.locator('[data-action="demolish"]').click();cost-=21;
      await page.locator('[data-tile="-1,-1"]').click();await expect(page.locator('#facility-panel')).toContainText('수경 농장');await expect(page.locator('#facility-panel')).toContainText('Lv.2');
    }else{
      await page.locator('#board-toggle').click();const wall=expected.facilities.find(f=>f.type==='wall');await page.locator(`[data-wall-edge="north"][data-x="${wall.x}"][data-z="${wall.z}"]`).click();await expect(page.locator('#facility-panel')).toContainText('북쪽');
    }
    await page.mouse.move(500,100);await page.screenshot({path:`artifacts/wall-production-${label}.png`});
    await page.locator('[data-tab="campaign"]').click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(`artifacts/wall-production-${label}-export.json`);
    const exported=decodeSave(await fs.readFile(`artifacts/wall-production-${label}-export.json`,'utf8'));assert.equal(exported.resources,expected.resources-cost);
    // A running harbor legitimately reduces old weapon cooldowns before export.
    if(label==='legacy'){const owned=items=>items.map(({cooldown,...f})=>f);assert.deepEqual(owned(exported.facilities),owned(expected.facilities));}
    if(label==='colony'){assert.equal(exported.facilities.find(f=>f.type==='farm').level,2);assert.equal(exported.facilities.filter(f=>f.type==='wall').length,3);assert.ok(exported.facilities.some(f=>f.type==='wall'&&f.x===0&&f.z===0&&f.edge==='east'));}
    if(label==='early'){assert.equal(exported.facilities.find(f=>f.type==='farm').stock,0);assert.equal(exported.facilities.filter(f=>f.type==='wall'&&f.x===1&&f.z===1).length,2);}
    await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
    const beforeDate=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).savedAt);
    await page.waitForFunction(old=>{const e=JSON.parse(localStorage.getItem('tidehold.campaign.v1'));return e.payload.paused&&e.savedAt!==old;},beforeDate,{timeout:10000});
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload),before=await saved();await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();await page.reload();const after=await saved();
    for(const key of ['facilities','campaign','resources','fleet','checkpoint'])assert.deepEqual(after[key],before[key],`${label} changed ${key}`);
    const layout=await page.evaluate(()=>{const el=document.querySelector('.sidebar');return {width:el.clientWidth,scrollWidth:el.scrollWidth};});assert.ok(layout.scrollWidth<=layout.width+1);assert.equal(errors.length,0);assert.equal(remote.length,0);
    records.push({label,input:file,build:await page.locator('script[type="module"]').getAttribute('src'),actualSeconds:(Date.now()-start)/1000,facilities:after.facilities.length,walls:after.facilities.filter(f=>f.type==='wall').length,resources:after.resources,restored:true,devInterface:false,virtualClock:false,errors,remote,layout});await context.close();
  }
  await fs.writeFile('artifacts/wall-production.json',JSON.stringify({date:new Date().toISOString(),type:'isolated actual built UI and autosave',records},null,2));console.log(JSON.stringify(records));
}finally{await browser.close();}
