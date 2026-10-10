import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1060}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/scripts/model-gallery.html');await page.waitForFunction(()=>window.__galleryReady);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/guardian-gallery.png'});
  const report={kind:'local procedural guardian model visual review',date:new Date().toISOString(),browser:browser.version(),models:await page.locator('article h2').allTextContents(),errors};
  await fs.writeFile('artifacts/guardian-gallery.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length)process.exitCode=1;
} finally {await browser.close();}
