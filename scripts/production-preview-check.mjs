import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();
  if(await page.evaluate(()=>window.__TIDEHOLD__!==undefined))throw new Error('Development interface present in production');
  await page.locator('[data-tab="build"]').click();await page.locator('[data-tool="fishery"]').click();await page.locator('[data-tile="1,-1"]').click();
  await page.locator('[data-tab="campaign"]').click();await page.locator('[data-mission="coral-1"]').click();const start=Date.now();
  while(!(await page.locator('#field-choice').isVisible()) && Date.now()-start<120000) {
    if((await page.locator('#sea-state').textContent()).includes('교전') && await page.locator('[data-ability="pulse"]').isEnabled())await page.locator('[data-ability="pulse"]').click();
    if(await page.locator('[data-ability="mend"]').isEnabled())await page.locator('[data-ability="mend"]').click();
    await page.waitForTimeout(500);
  }
  await page.locator('[data-field-choice="repair"]').click();
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  let g=await read();const catchBefore=g.facilities.find(f=>f.type==='fishery').stock;
  if(catchBefore!==10 || !g.campaign.waitingForDeparture)throw new Error('Actual sailing catch or field service missing');
  const cash=g.resources;await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();await page.locator('[data-tile="1,-1"]').click();
  await page.locator('[data-action="collect"]').click();g=await read();if(g.resources!==cash+10)throw new Error('Harvest amount changed');
  await expect(page.locator('[data-action="collect"]')).toBeDisabled();await page.locator('[data-action="upgrade"]').click();g=await read();
  if(g.facilities.find(f=>f.type==='fishery').level!==2)throw new Error('Real economic upgrade failed');
  const playedSeconds=(Date.now()-start)/1000;await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/production-economy.png'});
  await page.reload();await page.locator('#continue-button').click();await page.locator('#resume-button').click();const restored=await read();
  if(restored.resources!==g.resources || restored.facilities.find(f=>f.type==='fishery').level!==2)throw new Error('Economic save did not restore');
  const license=await page.request.get('http://127.0.0.1:4173/ASSET_LICENSES.md');if(!(await license.text()).includes('해상 연구소'))throw new Error('New original assets not documented in build');
  const report={kind:'actual-time production UI; fresh island, no clock or state injection',date:new Date().toISOString(),url:'http://127.0.0.1:4173',browser:browser.version(),playedSeconds,catchBefore,harvestedOnce:true,upgradedTo:2,restored:true,resources:restored.resources,noDevHooks:true,errors,remoteRequests};
  await fs.writeFile('artifacts/production-economy.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length || remoteRequests.length)throw new Error('Production economy check failed');
} finally {await browser.close();}
