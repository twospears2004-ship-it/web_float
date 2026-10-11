// Real-time UI transitions in a private browser and an owned development server.
// Read-only diagnostics measure graphics resources; no game state is injected.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const baseline=process.argv.includes('--baseline'),cycles=baseline?2:12;
const port=5189,url=`http://127.0.0.1:${port}`,input='artifacts/journey-wall-current/journey-final.json';
const source=createHash('sha256');for(const name of (await fs.readdir('src')).filter(n=>/\.(js|json)$/.test(n)).sort()){source.update(name);source.update(await fs.readFile(`src/${name}`));}const sourceHash=source.digest('hex');
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--config',path.resolve('scripts/vite-test.config.mjs'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,TIDEHOLD_TEST_PORT:String(port)},stdio:['ignore','pipe','pipe']});
let terminal='',serverExited=false,browser;
server.stdout.on('data',d=>terminal=(terminal+d.toString()).slice(-4000));server.stderr.on('data',d=>terminal=(terminal+d.toString()).slice(-4000));server.on('exit',()=>{serverExited=true;});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
  for(let n=0;!terminal.includes(url);n++){if(serverExited||n>=150)throw new Error(`Owned server did not start: ${terminal}`);await delay(100);}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],remoteRequests=[],samples=[],started=Date.now();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))remoteRequests.push(r.url());});
  const state=()=>page.evaluate(()=>window.__TIDEHOLD__.snapshot()),render=()=>page.evaluate(()=>window.__TIDEHOLD__.rendererInfo());
  await page.goto(url);await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles(input);await page.locator('#resume-button').click();
  await page.locator('#settings-button').click();await page.locator('#effects-volume').fill('0');await page.locator('#music-volume').fill('0');await page.locator('#graphics-quality').selectOption('standard');await page.locator('#close-settings').click();
  const initial=await state(),yard=initial.facilities.find(f=>f.type==='shipyard');assert.equal(initial.facilities.length,53);assert.equal(initial.campaign.completed.length,72);
  await page.locator('[data-tab="build"]').click();await page.locator('#board-toggle').click();
  // The earned island uses all its reactor power. Exchange two support
  // buildings for paid zero-power mines before expanding the shipyard.
  for(const type of ['crane','workshop']){const old=initial.facilities.find(f=>f.type===type);await page.locator(`[data-tile="${old.x},${old.z}"]`).click();await page.locator('[data-action="demolish"]').click();await page.locator('[data-tool="mine"]').click();await page.locator(`[data-tile="${old.x},${old.z}"]`).click();}
  await page.locator(`[data-tile="${yard.x},${yard.z}"]`).click();
  while((await state()).facilities.find(f=>f.id===yard.id).level<9)await page.locator('[data-action="upgrade"]').click();
  await page.locator('[data-tab="fleet"]').click();while(await page.locator('[data-recruit="skiff"]').isEnabled())await page.locator('[data-recruit="skiff"]').click();
  const prepared=await state();assert.equal(prepared.fleet.units.filter(u=>u.hp>0).length,19);assert.ok(prepared.resources<initial.resources);assert.equal(prepared.facilities.find(f=>f.id===yard.id).level,9);
  const kinds=['defense','siege','explore'];
  async function operation(kind,seconds){
    await page.locator('[data-tab="campaign"]').click();const prefix=kind==='explore'?'explore':kind;await page.locator(`[data-${prefix}="${prefix}-heart-${kind==='explore'?2:3}"]`).click();
    assert.equal((await state()).operation.kind,kind);await page.keyboard.press('f');
    if(kind==='explore')await page.locator('[data-site="explore-node-0"]').click();else await page.locator('#start-defense-wave').click();
    await page.waitForTimeout(seconds*1000);const inBattle=await render();
    await page.locator('#home-button').click();await page.locator('#confirm-return').click();assert.equal((await state()).campaign.stage,'harbor');await page.waitForTimeout(1000);
    samples.push({kind,inBattle,returned:await render(),resources:(await state()).resources});
  }
  // Warm all terrain, marker and unit variants before comparing like scenes.
  for(const kind of kinds)await operation(kind,2);
  const warmed=await render(),cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.collectGarbage');
  const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));const heapBefore=(await metric()).JSHeapUsedSize;
  if(!(await state()).paused)await page.keyboard.press('p');await expect(page.locator('#pause-overlay')).toBeVisible();
  const before=await render(),cpuBefore=(await metric()).TaskDuration,pauseStart=Date.now();await page.waitForTimeout(3000);const after=await render(),cpuAfter=(await metric()).TaskDuration,pauseSeconds=(Date.now()-pauseStart)/1000;
  const paused={seconds:pauseSeconds,draws:after.frames-before.frames,drawsPerSecond:(after.frames-before.frames)/pauseSeconds,cpuMsPerSecond:(cpuAfter-cpuBefore)*1000/pauseSeconds};
  await page.locator('#resume-button').click();
  for(let i=0;i<cycles;i++){
    await operation(kinds[i%3],baseline?2:8);const latest=samples.at(-1).returned;
    assert.equal(latest.geometries,warmed.geometries,`Geometry retention after cycle ${i+1}`);assert.equal(latest.textures,warmed.textures,`Texture retention after cycle ${i+1}`);assert.equal(latest.enemyMeshes,0);assert.equal(latest.enemyBars,0);assert.equal(latest.unitMeshes,19);
  }
  await cdp.send('HeapProfiler.collectGarbage');const heapAfter=(await metric()).JSHeapUsedSize,final=await state();
  const frameSample=await page.evaluate(async()=>{const stamps=[];await new Promise(resolve=>{const start=performance.now(),tick=t=>{stamps.push(t);if(t-start>=5000)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});const gaps=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b),gl=document.querySelector('#scene canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {rafFPS:(stamps.length-1)*1000/(stamps.at(-1)-stamps[0]),p95Ms:gaps[Math.floor(gaps.length*.95)],gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable'};});
  const report={date:new Date().toISOString(),sourceHash,baseline,kind:'real-time isolated development rendering lifecycle; public UI and read-only diagnostics, not a 20-hour test',browser:browser.version(),input,realSeconds:(Date.now()-started)/1000,paidPreparation:{resourcesBefore:initial.resources,resourcesAfter:prepared.resources,replacedSupport:['crane','workshop'],paidMines:2,yardLevel:9,army:19,facilities:53},warmed,paused,cycles,samples,heap:{before:heapBefore,after:heapAfter,growthBytes:heapAfter-heapBefore,diagnosticGC:true},frameSample,finalResources:final.resources,errors,remoteRequests};
  const name=baseline?'render-lifecycle-baseline':'render-lifecycle-current';await fs.writeFile(`artifacts/${name}.json`,JSON.stringify(report,null,2));await page.screenshot({path:`artifacts/${name}.png`});console.log(JSON.stringify({...report,samples:undefined}));
  assert.equal(errors.length,0);assert.equal(remoteRequests.length,0);assert.ok(heapAfter-heapBefore<8*1024*1024,'Retained heap grew more than 8 MiB');assert.equal(final.resources,prepared.resources);if(!baseline)assert.ok(paused.drawsPerSecond<=18,'Paused game still renders at display rate');
}finally{if(browser)await browser.close();if(!serverExited)server.kill();}
