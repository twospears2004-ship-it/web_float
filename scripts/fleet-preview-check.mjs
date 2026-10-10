import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();
  if(await page.evaluate(()=>window.__TIDEHOLD__!==undefined))throw new Error('Production exposed development hooks');
  await page.locator('#save-file').setInputFiles('artifacts/colony-fixtures/coral-6-harbor.json');await page.locator('#resume-button').click();await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();await page.locator('[data-tab="fleet"]').click();await page.locator('[data-recruit="skiff"]').click();await page.locator('[data-recruit="skiff"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-defense="defense-coral-1"]').click();await page.locator('#start-defense-wave').click();const start=Date.now();let rounds=1;
  while(!(await page.locator('#end-overlay').isVisible())&&Date.now()-start<180000){
    if(await page.locator('#start-defense-wave').isEnabled()){await page.locator('#start-defense-wave').click();rounds++;}
    if(await page.locator('[data-ability="pulse"]').isEnabled())await page.locator('[data-ability="pulse"]').click();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('#end-title')).toHaveText('기지를 지켰습니다');await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/fleet-production-defense.png'});
  await page.locator('#retry-button').click();await page.locator('#save-button').click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  await page.reload();await page.locator('#continue-button').click();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  const same=JSON.stringify(saved.fleet)===JSON.stringify(restored.fleet)&&JSON.stringify(saved.campaign.frontier)===JSON.stringify(restored.campaign.frontier);if(!same)throw new Error('Production fleet or frontier record changed on reload');
  const report={kind:'actual-time production fleet and base defense sample',durationSeconds:(Date.now()-start)/1000,rounds,fleet:saved.fleet.units.filter(u=>u.hp>0).length,record:saved.campaign.frontier.records['defense-coral-1'],restored:same,errors,remoteRequests};await fs.writeFile('artifacts/fleet-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(errors.length||remoteRequests.length)throw new Error('Browser errors or external requests');
} finally {await browser.close();}
