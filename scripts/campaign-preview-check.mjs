import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[], remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:http://127.0.0.1:4173'))remoteRequests.push(r.url());});
  const started=Date.now();await page.goto('http://127.0.0.1:4173');
  await page.locator('[data-start="destination"]').click();await page.locator('[data-tab="build"]').click();
  await page.locator('[data-tool="mortar"]').click();await page.locator('[data-tile="-1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();
  while(!(await page.locator('#end-overlay').isVisible()) && Date.now()-started<180000) {
    if(await page.locator('#field-choice').isVisible())await page.locator('[data-field-choice]:enabled').first().click();
    const next=page.locator('[data-site]:visible:enabled');if(await next.count())await next.first().click();
    if(await page.locator('[data-ability="mend"]').isEnabled())await page.locator('[data-ability="mend"]').click();
    if(await page.locator('[data-ability="pulse"]').isEnabled())await page.locator('[data-ability="pulse"]').click();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');
  const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  if(profile.campaign.completed.length!==1 || profile.facilities.length!==2)throw new Error('Durable first mission progress missing');
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#end-title')).toHaveText('항로를 확보했습니다');
  await page.locator('#retry-button').click();await page.locator('[data-tab="campaign"]').click();
  await fs.mkdir('artifacts',{recursive:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-save').click();const download=await downloadPromise;await download.saveAs('artifacts/test-campaign-export.json');
  await page.locator('#save-file').setInputFiles('artifacts/test-campaign-export.json');await expect(page.locator('#resume-button')).toBeVisible();await page.locator('#resume-button').click();
  await page.screenshot({path:'artifacts/campaign-production.png'});
  const report={browser:browser.version(),url:'http://127.0.0.1:4173',realElapsedSeconds:(Date.now()-started)/1000,completed:['coral-1'],persistentFacilities:profile.facilities.length,exportImport:true,errors,remoteRequests};
  await fs.writeFile('artifacts/campaign-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length||remoteRequests.length)throw new Error('Campaign production check failed');
}finally{await browser.close();}
