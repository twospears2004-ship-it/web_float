// Built-game evidence in isolated profiles, with real time and player file UI.
// Normal-earned model saves are inputs; this is not a full real-time voyage.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true}),records=[];
try{
  for(const [label,file,chapter,full]of [
    ['partial','artifacts/atlas-fixtures/coral-partial-harbor.json','0',0],
    ['completion','artifacts/atlas-fixtures/coral-completion-result.json','0',1],
    ['advanced','artifacts/atlas-fixtures/kelp-research-harbor.json','3',4],
    ['legacy','tests/fixtures/atlas-legacy-journey.json','0',24],
  ]){
    const imported=JSON.parse(await fs.readFile(file,'utf8')).payload,expected=label==='completion'?JSON.parse(await fs.readFile('artifacts/atlas-fixtures/coral-completion-harbor.json','utf8')).payload:imported,context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],remoteRequests=[],start=Date.now();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.failure()?.errorText));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remoteRequests.push(r.url());});
    await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);
    await page.locator('#save-file').setInputFiles(file);
    if(imported.campaign.stage==='operation-result'){await expect(page.locator('#end-description')).toContainText('해도 완성 보상');await page.locator('#retry-button').click();}else await page.locator('#resume-button').click();
    await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').selectOption(chapter);await expect(page.locator('#atlas-summary')).toContainText(`${full}/24`);
    if(label==='advanced')await expect(page.locator('.atlas-chapter')).toContainText('기록보다 사람을 먼저');
    const details=page.locator('[data-atlas-chart] details').first();await details.locator('summary').click();await expect(details).toHaveAttribute('open','');await expect(details.locator('.atlas-sites')).toBeVisible();await page.screenshot({path:`artifacts/atlas-production-${label}.png`});
    const layout=await page.evaluate(()=>{const sidebar=document.querySelector('.sidebar'),tabs=[...document.querySelectorAll('.sidebar-tabs button')].filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,left:r.left,right:r.right};});return {scrollWidth:sidebar.scrollWidth,clientWidth:sidebar.clientWidth,tabs};});assert.ok(layout.scrollWidth<=layout.clientWidth+1,'Atlas overflows the sidebar');assert.equal(layout.tabs.length,5);
    let researchCost=0,productionPanel=null;
    if(label==='completion'){await page.locator('[data-tab="campaign"]').click();await page.locator('[data-research="cartography"]').click();researchCost=350;await expect(page.locator('[data-research="cartography"]')).toContainText('완성 해도 1/4');}
    if(['completion','advanced'].includes(label)){
      const f=expected.facilities.find(f=>f.type===(label==='completion'?'fishery':'laboratory'));assert.ok(f);await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator(`[data-tile="${f.x},${f.z}"]`).click();
      await expect(page.locator('#facility-panel')).toContainText(label==='completion'?`${Math.round((10+(f.level-1)*3)*(1+(expected.campaign.tech.cultivation||0)*0.2+0.1))}/회`:`${3+Math.floor((f.level-1)/3)}표본/유형`);productionPanel=await page.locator('#facility-panel .weapon-stats').innerText();await page.screenshot({path:`artifacts/atlas-production-${label}-facility.png`});
    }
    await page.locator('[data-tab="campaign"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);await download.saveAs(`artifacts/atlas-production-${label}-export.json`);const exported=JSON.parse(await fs.readFile(`artifacts/atlas-production-${label}-export.json`,'utf8')).payload;
    assert.equal(exported.resources,expected.resources-researchCost);assert.deepEqual(exported.campaign.frontier,expected.campaign.frontier);assert.deepEqual(exported.fleet,expected.fleet);
    if(expected.campaign.atlas)assert.deepEqual(exported.campaign.atlas,expected.campaign.atlas);else {assert.equal(Object.keys(exported.campaign.atlas.charts).length,24);assert.ok(Object.values(exported.campaign.atlas.charts).every(r=>r.surveyed.length===8&&r.fullRewarded));}
    if(researchCost){assert.equal(exported.campaign.tech.cartography,1);assert.equal(exported.campaign.research,expected.campaign.research-4);}
    await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();await page.waitForFunction(time=>{const g=JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload;return g.paused&&g.time>=time;},exported.time);
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload),before=await saved();await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#pause-overlay')).toBeVisible();await page.reload();const restored=await saved();
    for(const key of ['campaign','resources','facilities','fleet','sites','enemies','operation'])assert.deepEqual(restored[key],before[key],`${label}: reload changed ${key}`);
    records.push({label,source:file,build:await page.locator('script[type="module"]').getAttribute('src'),actualSeconds:(Date.now()-start)/1000,fullCharts:full,chartResearch:restored.campaign.tech.cartography||0,resources:restored.resources,productionPanel,restored:true,layout,errors,remoteRequests});assert.equal(errors.length,0);assert.equal(remoteRequests.length,0);await context.close();
  }
  const report={date:new Date().toISOString(),kind:'actual-time built atlas/research import, export, autosave and double reload',browser:browser.version(),noDevHooks:true,virtualClock:false,records};await fs.writeFile('artifacts/atlas-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
