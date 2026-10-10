import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))remoteRequests.push(r.url());});
  await page.goto('http://127.0.0.1:4173');await page.locator('[data-start="destination"]').click();
  if(await page.evaluate(()=>window.__TIDEHOLD__!==undefined))throw new Error('Development interface present in production');
  await page.locator('#save-file').setInputFiles('artifacts/campaign-fixtures/heart-6-guardian.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="voyage"]').click();
  const start=Date.now();let sample=null;
  while(!(await page.locator('#end-overlay').isVisible()) && Date.now()-start<180000) {
    if(await page.locator('#boss-hud .warning').count()) {
      if(await page.locator('[data-ability="barrier"]').isEnabled())await page.locator('[data-ability="barrier"]').click();
      if(!sample) {
        sample=await page.evaluate(async()=>{
          const stamps=[];await new Promise(resolve=>{const start=performance.now();const tick=t=>{stamps.push(t);if(t-start>=5000)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
          const gaps=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);
          const gl=document.querySelector('#scene canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
          return {kind:'actual five-second render sample during final guardian combat',frames:stamps.length,fps:(stamps.length-1)*1000/(stamps.at(-1)-stamps[0]),p95FrameMs:gaps[Math.floor(gaps.length*0.95)],gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable'};
        });
        await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/guardian-production-combat.png'});
      }
    }
    for(const id of ['mend','pulse','brace'])if(await page.locator(`[data-ability="${id}"]`).isEnabled())await page.locator(`[data-ability="${id}"]`).click();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('#end-title')).toHaveText('바다는 다시 길이 됩니다');
  const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('tidehold.campaign.v1')).payload);
  if(profile.phase!=='campaign-complete' || profile.campaign.completed.length!==72 || !sample)throw new Error('Final campaign result or combat sample missing');
  const combatSeconds=(Date.now()-start)/1000;
  await page.reload();await page.locator('#continue-button').click();await expect(page.locator('#end-title')).toHaveText('바다는 다시 길이 됩니다');
  await page.screenshot({path:'artifacts/guardian-production-ending.png'});
  const report={kind:'normal earned checkpoint imported through production UI; final encounter only, not full real-time campaign',date:new Date().toISOString(),browser:browser.version(),url:'http://127.0.0.1:4173',realEncounterSeconds:combatSeconds,graphics:'standard',result:profile.phase,completedMissions:profile.campaign.completed.length,restoredEnding:true,sample,errors,remoteRequests};
  await fs.writeFile('artifacts/guardian-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length || remoteRequests.length)throw new Error('Production guardian check failed');
} finally {await browser.close();}
