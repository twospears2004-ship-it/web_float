// Actual built UI pixels in an isolated profile. No virtual clock or style/state
// injection. PNG decoding uses the already installed, pinned Playwright utility.
import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {PNG}=createRequire(import.meta.url)('../node_modules/playwright-core/lib/utilsBundle.js');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');assert.equal(await page.evaluate(()=>window.__TIDEHOLD__!==undefined),false);await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('artifacts/atlas-fixtures/kelp-research-harbor.json');await page.locator('#resume-button').click();await page.locator('[data-tab="atlas"]').click();await page.locator('#atlas-chapter').selectOption('3');
  // Selecting an option leaves the mouse over the previously clicked tab.
  // Remove that hover brightness before comparing the unchanged navigation.
  await page.mouse.move(500,100);
  const card=page.locator('[data-atlas-chart="explore-kelp-1"]'),details=card.locator('details'),before=PNG.sync.read(await page.screenshot({path:'artifacts/atlas-layout-final-before-open.png'}));
  await details.locator('summary').click();await expect(details).toHaveAttribute('open','');await expect(details.locator('.atlas-sites')).toBeVisible();await page.waitForFunction(t=>performance.now()>t,await page.evaluate(()=>performance.now()+700));
  const circles=await card.locator('circle').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON())),tabs=await page.locator('.sidebar-tabs').boundingBox(),after=PNG.sync.read(await page.screenshot({path:'artifacts/atlas-layout-final-after-open.png'}));
  const painted=img=>circles.filter(c=>{const x=Math.round(c.x+c.width/2),y=Math.round(c.y+c.height/4),i=(y*img.width+x)*4;return img.data[i]>180&&img.data[i+1]>145&&img.data[i+2]<180;}).length;
  assert.equal(painted(before),8);assert.equal(painted(after),8);
  let changedTabPixels=0;for(let y=Math.ceil(tabs.y);y<Math.floor(tabs.y+tabs.height);y++)for(let x=Math.ceil(tabs.x);x<Math.floor(tabs.x+tabs.width);x++){const i=(y*before.width+x)*4;if(before.data[i]!==after.data[i]||before.data[i+1]!==after.data[i+1]||before.data[i+2]!==after.data[i+2])changedTabPixels++;}assert.equal(changedTabPixels,0);
  await details.locator('.atlas-sites li').last().scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/atlas-layout-final-choices.png'});await card.locator('svg').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/atlas-layout-final-scrolled-map.png'});
  const report={date:new Date().toISOString(),kind:'actual-time built disclosure pixel check',build:await page.locator('script[type="module"]').getAttribute('src'),browser:browser.version(),beforeRenderedSurveyPoints:painted(before),afterRenderedSurveyPoints:painted(after),changedTabPixels,open:true,noDevHooks:true,virtualClock:false,diagnosticStyles:false,errors};await fs.writeFile('artifacts/atlas-layout-final.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(errors.length,0);
}finally{await browser.close();}
