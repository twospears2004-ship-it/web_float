// Inspect only a confirmed terminal audit's own private profile. No simulation
// setters, clock manipulation, replacement saves, or player profile access.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const output=path.resolve(process.argv[2]),artifacts=path.resolve('artifacts'),relative=path.relative(artifacts,output);
assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
const prior=JSON.parse(await fs.readFile(path.join(output,'live-audit.json'),'utf8'));assert(['failed','stopped','limited'].includes(prior.status));
assert.equal(path.resolve(prior.runtime.profile),path.join(output,'browser-profile'));
const save=await import(pathToFileURL(path.join(output,'frozen-game/src/save.js')).href);
let server,browser,log='',exited=false;
try{
  server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--config',path.join(output,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>log=(log+d).slice(-4000));server.stderr.on('data',d=>log=(log+d).slice(-4000));server.on('exit',()=>{exited=true;});
  for(let i=0;!log.includes(prior.runtime.url);i++){assert(!exited&&i<150,log);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launchPersistentContext(prior.runtime.profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--mute-audio']});
  const page=browser.pages()[0]||await browser.newPage();await page.goto(prior.runtime.url,{waitUntil:'domcontentloaded'});await page.locator('#continue-button').click();
  const g=await page.evaluate(()=>window.__TIDEHOLD__.snapshot());assert(g.paused||g.phase!=='playing','Inspection requires an already paused or completed save.');
  const encoded=save.encodeSave(g);save.decodeSave(encoded);await fs.writeFile(path.join(output,'failure-state-own-profile.json'),encoded);
  const enemy=g.enemies.find(e=>prior.failure?.includes(e.id)),points=enemy?await page.evaluate(e=>[.6,1.5,2.5,4,6].map(y=>({y,...window.__TIDEHOLD__.projectWorld({...e,y})})),enemy):[];
  const report={sourceHash:prior.runtime.sourceHash,priorObservation:prior.current,state:{id:g.operation?.id||g.campaign.missionId,phase:g.phase,paused:g.paused,seconds:g.campaign.missionSeconds,resources:g.resources,island:g.island},target:enemy,points,canvas:await page.locator('#scene canvas').boundingBox(),selection:await page.evaluate(()=>window.__TIDEHOLD__.selection()),units:g.fleet.units.map(u=>({id:u.id,type:u.type,hp:u.hp,x:u.x,z:u.z,command:u.command}))};
  await fs.writeFile(path.join(output,'failure-inspection.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server&&!exited)server.kill();}
