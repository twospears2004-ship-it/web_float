// Isolated actual-time rendering comparison. All game state enters through
// public earned-save controls; diagnostics are read-only and clocks are real.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const output=path.resolve('artifacts/island-instancing-render-audit'),records=[];
const fixture=path.resolve('artifacts/endgame-variety-prototype-20261011/artifacts/journey-variety-current/journey-final.json');
await fs.mkdir(output,{recursive:true});
for(const [name,root,port]of [['baseline','artifacts/endgame-variety-prototype-20261011',5200],['instanced','artifacts/island-instancing-prototype-20261011',5201]]){
  const config=path.join(output,`vite-${name}.mjs`),url=`http://127.0.0.1:${port}`,errors=[],external=[];let server,browser,log='',exited=false;
  await fs.writeFile(config,`export default ${JSON.stringify({root:path.resolve(root),cacheDir:path.join(output,`cache-${name}`),server:{host:'127.0.0.1',port,strictPort:true}})};\n`);
  try{
    server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--config',config],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',d=>log=(log+d.toString()).slice(-3000));server.stderr.on('data',d=>log=(log+d.toString()).slice(-3000));server.on('exit',()=>exited=true);
    for(let n=0;!log.includes(url);n++){if(exited||n>150)throw new Error(`Owned renderer server failed: ${log}`);await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.failure()?.errorText));page.on('request',r=>{if(![url,'blob:','data:'].some(p=>r.url().startsWith(p)))external.push(r.url());});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('[data-start="destination"]').click();
    await page.locator('#settings-button').click();await page.locator('#graphics-quality').selectOption('standard');await page.locator('#effects-volume').fill('0');await page.locator('#music-volume').fill('0');await page.locator('#close-settings').click();
    await page.locator('#save-file').setInputFiles(fixture);await page.locator('#resume-button').click();await page.keyboard.press('c');
    const state=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());assert.equal(state.tiles.length,49);assert.equal(state.resources,23649);assert.equal(state.campaign.stage,'harbor');
    await page.waitForTimeout(3000);const before=await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo()),start=Date.now();
    await page.waitForTimeout(15000);const after=await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo()),seconds=(Date.now()-start)/1000;
    await page.screenshot({path:path.join(output,`${name}.png`)});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    records.push({name,root:path.resolve(root),fixture,browser:browser.version(),seconds,tiles:49,facilities:state.facilities.length,before,after,renderInvocationsPerSecond:(after.frames-before.frames)/seconds,errors,external});
    console.log(JSON.stringify({name,seconds,calls:after.calls,triangles:after.triangles,renderInvocationsPerSecond:records.at(-1).renderInvocationsPerSecond}));
  }finally{if(browser)await browser.close();if(server&&!exited){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}}
}
assert(records[1].after.calls<records[0].after.calls*.8,'Rendering reduction must be measured in the actual scene.');
assert.equal(records[1].after.triangles,records[0].after.triangles,'Visible geometry must remain unchanged.');
const report={date:new Date().toISOString(),kind:'actual-time isolated rendering comparison, not gameplay length evidence',records,noVirtualClock:true,noGameMutations:true,drawCallReduction:1-records[1].after.calls/records[0].after.calls};
await fs.writeFile(path.join(output,'render-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({drawCallReduction:report.drawCallReduction,passed:true}));
