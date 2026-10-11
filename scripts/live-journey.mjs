// A real-time rendered journey. Read-only development diagnostics observe the
// game; every payment, voyage, choice and fleet command uses the actual UI.
// A completed run is automated play evidence, never a human quality verdict.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {livePlayer,needsStoryDeparture} from './live-player.mjs';
import {canonicalSavedValue,harborFleetValue} from './save-comparison.mjs';
import {findResumeObservation} from './live-resume-observation.mjs';
import {atomicAuditJson} from './atomic-audit.mjs';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const project=process.cwd(),output=path.resolve(arg('output','artifacts/live-journey')),port=Number(arg('port','5192')),resuming=process.argv.includes('--resume');let limit=arg('limit','')?Number(arg('limit','')):undefined;
const relative=path.relative(path.resolve('artifacts'),output);
if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('A fresh child folder inside artifacts is required.');
if((limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>1000))||!Number.isInteger(port)||port<1024||port>65535||[4173,5173,5187,5189].includes(port))throw new Error('Invalid live-run limit/owned port.');
// A timeout is never permission to restart. Resume requires a terminal journal
// and the run's own earned, validated exports; fresh runs reject existing paths.
let previous;
if(resuming){previous=JSON.parse(await fs.readFile(path.join(output,'live-audit.json'),'utf8'));assert(['failed','stopped','limited'].includes(previous.status),'Only a terminal partial run may resume.');limit??=previous.limit;assert.equal(previous.limit,limit);}
else await fs.mkdir(output,{recursive:false});
const frozen=path.join(output,'frozen-game'),profile=path.join(output,'browser-profile'),url=`http://127.0.0.1:${port}`;
if(!resuming){await fs.mkdir(frozen);for(const name of ['src','public','index.html'])await fs.cp(path.join(project,name),path.join(frozen,name),{recursive:true});}
const priorRuns=resuming?(await fs.readdir(output)).map(name=>Number(/^run-(\d+)$/.exec(name)?.[1]||0)):[];
const archivedObservations=[];
if(resuming&&!previous.current)for(const index of priorRuns.filter(Boolean).sort((a,b)=>b-a)){
  const file=path.join(output,`run-${index}`,'prior-live-audit.json');
  try{archivedObservations.push({file,report:JSON.parse(await fs.readFile(file,'utf8'))});}catch(error){if(error.code!=='ENOENT')throw error;}
}
const resumeObservation=resuming?findResumeObservation(previous,archivedObservations):null,resumeCurrent=resumeObservation?.current;
const runIndex=Math.max(previous?.sessions?.length||Number(!!previous),...priorRuns)+1,controllerFolder=resuming?path.join(output,`run-${runIndex}`):output;
if(resuming)await fs.mkdir(controllerFolder,{recursive:false});
for(const name of ['live-journey.mjs','live-player.mjs','save-comparison.mjs','live-resume-observation.mjs','atomic-audit.mjs'])await fs.copyFile(path.join(project,'scripts',name),path.join(controllerFolder,name));
const hash=b=>createHash('sha256').update(b).digest('hex'),source=createHash('sha256');
for(const name of (await fs.readdir(path.join(frozen,'src'))).filter(n=>/\.(js|json)$/.test(n)).sort()){source.update(name);source.update(await fs.readFile(path.join(frozen,'src',name)));}
const config=path.join(output,'vite.config.mjs');await fs.writeFile(config,`export default ${JSON.stringify({root:frozen,cacheDir:path.join(frozen,'.vite-cache'),server:{host:'127.0.0.1',port,strictPort:true}})};\n`);
const importFrozen=name=>import(pathToFileURL(path.join(frozen,'src',name)).href);
const [game,campaign,content,production,fleet,decisions,frontier,walls,save,fortifications]=await Promise.all(['game.js','campaign.js','campaign-content.js','production.js','fleet-content.js','expedition-content.js','frontier-content.js','walls.js','save.js','fortifications.js'].map(importFrozen));
const itinerary=Array.from({length:content.chapters.length},(_,chapter)=>[...content.missions.filter(m=>m.chapter===chapter).map(item=>({item,kind:'story'})),...['defense','siege','explore'].flatMap(kind=>frontier.frontierOperations.filter(d=>d.chapter===chapter&&d.kind===kind).map(item=>({item,kind})))]).flat().filter(({item})=>!item.endgame).concat(frontier.frontierOperations.filter(item=>item.endgame).map(item=>({item,kind:item.kind})));limit??=itinerary.length;assert(limit<=itinerary.length,'Limit exceeds this frozen game\'s itinerary.');
const runtime={sourceHash:source.digest('hex'),htmlHash:hash(await fs.readFile(path.join(frozen,'index.html'))),cssHash:hash(await fs.readFile(path.join(frozen,'src','style.css'))),controllerHash:hash(await fs.readFile(path.join(controllerFolder,'live-player.mjs'))),runnerHash:hash(await fs.readFile(path.join(controllerFolder,'live-journey.mjs'))),comparisonHash:hash(await fs.readFile(path.join(controllerFolder,'save-comparison.mjs'))),observationHash:hash(await fs.readFile(path.join(controllerFolder,'live-resume-observation.mjs'))),frozen,profile,url,node:process.version};
if(previous)for(const key of ['sourceHash','htmlHash','cssHash'])assert.equal(runtime[key],previous.runtime[key],`Frozen ${key} changed across resume.`);
const report={kind:'real-time rendered UI journey, isolated frozen development version',date:previous?.date||new Date().toISOString(),startedAt:previous?.startedAt,status:'starting',complete:false,limit,records:[],samples:previous?.samples||[],errors:previous?.errors||[],remoteRequests:previous?.remoteRequests||[],imports:previous?.imports||0,virtualClock:false,gameMutationCalls:false,runtime,sessions:previous?.sessions||[],warning:'Automated actual-time play and read-only rendering diagnostics; not a human Steam-quality/playtime verdict.'};
// Keep historical failures visible without treating them as new-session errors.
const errorStart=report.errors.length,requestStart=report.remoteRequests.length;
const sessionHasErrors=()=>report.errors.length>errorStart||report.remoteRequests.length>requestStart;
let recoveryFile,activeResume;
const durableFacilities=fs=>canonicalSavedValue(fs.map(({cooldown,...facility})=>facility));
function recordFor(g,item,kind,realSeconds){return {id:item.id,kind,realSeconds,gameSeconds:g.campaign.missionSeconds,totalActiveSeconds:g.campaign.totalActiveSeconds,resources:g.resources,hull:g.hull,research:g.campaign.research,tiles:g.tiles.length,facilities:g.facilities.length,army:g.fleet.units.filter(u=>u.hp>0).map(u=>({id:u.id,type:u.type,hp:u.hp,level:u.level})),sourceHash:runtime.sourceHash,controllerHash:runtime.controllerHash,runnerHash:runtime.runnerHash,runIndex};}
if(previous){
  if(!report.sessions.length)report.sessions.push({runIndex:1,startedAt:previous.startedAt,endedAt:previous.updatedAt,realSeconds:previous.realElapsedSeconds,status:previous.status,failure:previous.failure,runtime:previous.runtime});
  const completed=[],cleared=[];
  for(const [index,{item,kind}]of itinerary.entries()){
    const prior=previous.records[index],uncommitted=!prior&&index===previous.records.length&&previous.failure?.startsWith(`${item.id}: harbor `);
    if(!prior&&!uncommitted)break;
    if(prior){assert.equal(prior.id,item.id);assert.equal(prior.sourceHash,runtime.sourceHash);}
    const file=path.join(output,`${item.id}-harbor.json`),g=save.decodeSave(await fs.readFile(file,'utf8'));
    assert.equal(g.campaign.stage,'harbor');assert.equal(g.phase,'playing');
    (kind==='story'?completed:cleared).push(item.id);assert.deepEqual(g.campaign.completed,completed);assert.deepEqual(g.campaign.frontier?.cleared||[],cleared);
    const evidence=prior||previous.pendingResult||resumeCurrent;
    assert.equal(g.resources,evidence.resources);assert.equal(g.campaign.missionSeconds,evidence.gameSeconds??evidence.seconds);
    if(uncommitted)await fs.access(path.join(output,`${item.id}.png`));
    report.records.push(prior?{...prior,runIndex:prior.runIndex||1,controllerHash:prior.controllerHash||previous.runtime.controllerHash,runnerHash:prior.runnerHash||previous.runtime.runnerHash}:{...recordFor(g,item,kind,previous.pendingResult?.realSeconds??null),runIndex:1,controllerHash:previous.runtime.controllerHash,runnerHash:previous.runtime.runnerHash,recoveredAfterComparisonFailure:true,timingUnavailable:!previous.pendingResult});
    recoveryFile=file;
  }
  assert(report.records.length>0&&report.records.length<=limit,'No verified earned progress to resume.');
  await fs.writeFile(path.join(controllerFolder,'prior-live-audit.json'),JSON.stringify(previous,null,2));
  report.recovery={steps:report.records.length,lastId:report.records.at(-1).id,file:recoveryFile,method:'Public UI import of this run\'s own earned harbor export; no reward or state injection.',priorFailure:previous.failure};
}
let server,browser,page,player,metrics,terminal='',serverExited=false,stopRequested=false,lastState,lastHeartbeat=0,started=Date.now();
const previousElapsed=previous?.realElapsedSeconds||0;
process.on('SIGINT',()=>{stopRequested=true;});process.on('SIGTERM',()=>{stopRequested=true;});
async function progress(){
  report.updatedAt=new Date().toISOString();report.realElapsedSeconds=previousElapsed+(Date.now()-started)/1000;
  if(report.sessions.at(-1)?.runIndex===runIndex)Object.assign(report.sessions.at(-1),{realSeconds:(Date.now()-started)/1000,status:report.status,updatedAt:report.updatedAt,errors:report.errors.slice(errorStart),remoteRequests:report.remoteRequests.slice(requestStart),...(report.failure?{failure:report.failure}:{})});
  report.completed=Object.fromEntries(['story','defense','siege','explore'].map(kind=>[kind,report.records.filter(r=>r.kind===kind).length]));
  report.complete=report.records.length===itinerary.length&&report.status==='complete';report.totalGameActiveSeconds=lastState?.campaign?.totalActiveSeconds??previous?.totalGameActiveSeconds??0;
  report.sortieSeconds=report.records.reduce((n,r)=>n+r.gameSeconds,0)+(lastState&&['mission','operation'].includes(lastState.campaign.stage)&&!report.records.some(r=>r.id===(lastState.operation?.id||lastState.campaign.missionId))?lastState.campaign.missionSeconds:0);
  report.current=lastState?.campaign?{id:lastState.operation?.id||lastState.campaign.missionId,phase:lastState.phase,paused:lastState.paused,stage:lastState.campaign.stage,objective:lastState.campaign.objectiveIndex,round:lastState.operation?.round,seconds:lastState.campaign.missionSeconds,resources:lastState.resources,hull:lastState.hull,maxHull:lastState.maxHull,ships:lastState.fleet.units.filter(u=>u.hp>0).length}:lastState?{phase:lastState.phase,hasCampaign:false}:resumeCurrent||null;
  report.currentObservation=lastState?{kind:'live',observedAt:report.updatedAt}:resumeObservation?{kind:'prior-terminal',source:resumeObservation.source,observedAt:resumeObservation.observedAt}:null;
  await atomicAuditJson(path.join(output,'live-audit.json'),report);
}
async function sample(){
  const graphics=await page.evaluate(()=>window.__TIDEHOLD__.rendererInfo()),timing=await page.evaluate(()=>({now:performance.now(),visibility:document.visibilityState}));
  const m=Object.fromEntries((await metrics.send('Performance.getMetrics')).metrics.map(v=>[v.name,v.value])),realSeconds=previousElapsed+(Date.now()-started)/1000,previous=report.samples.at(-1);
  report.samples.push({date:new Date().toISOString(),runIndex,realSeconds,activeSeconds:lastState.campaign.totalActiveSeconds,gameTime:lastState.time,...timing,...graphics,rendererHeapBytes:m.JSHeapUsedSize,rendererTaskSeconds:m.TaskDuration,rendererDrawsPerRealSecond:previous?.runIndex===runIndex&&realSeconds>previous.realSeconds?(graphics.frames-previous.frames)/(realSeconds-previous.realSeconds):null});
  await progress();console.log(JSON.stringify({status:report.status,...report.current,completed:report.records.length,activeHours:report.totalGameActiveSeconds/3600}));
}
async function exportSave(name){
  await player.tab('campaign');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-save').click()]);const file=path.join(output,name);await download.saveAs(file);
  return save.decodeSave(await fs.readFile(file,'utf8'));
}
async function finish(item,kind,begin,recovery={}){
  if(sessionHasErrors())throw new Error('Renderer/request error before saving result.');
  lastState=await player.state();assert(['mission-complete','campaign-complete'].includes(lastState.phase),`${item.id}: ${lastState.phase}`);
  await expect(page.locator('#end-overlay')).toBeVisible();await page.screenshot({path:path.join(output,`${item.id}.png`)});
  // Export is a player command on the campaign panel. The result dialog must be
  // dismissed through the normal harbor action before accessing that panel.
  const result=structuredClone(lastState);report.pendingResult={...recordFor(result,item,kind,begin===null?null:(Date.now()-begin)/1000),...recovery};await progress();
  await fs.writeFile(path.join(output,`${item.id}-result.json`),save.encodeSave(result));await page.locator('#retry-button').click();
  const restored=await exportSave(`${item.id}-harbor.json`);assert.equal(restored.campaign.stage,'harbor');
  assert.equal(restored.resources,result.resources,`${item.id}: harbor resources`);
  assert.deepEqual(harborFleetValue(restored.fleet),harborFleetValue(result.fleet),`${item.id}: harbor fleet`);
  for(const u of restored.fleet.units){assert.deepEqual(u.command,{type:'escort'});assert.deepEqual(u.waypoints,[]);assert.equal(u.repath,0);assert.equal(u.cooldown,0);assert(Math.hypot(u.x,u.z)<=fleet.fleetRules.serviceRange);}
  assert.deepEqual(durableFacilities(restored.facilities),durableFacilities(result.facilities),`${item.id}: harbor facilities`);
  assert.equal(kind==='story'?restored.campaign.completed.includes(item.id):restored.campaign.frontier.cleared.includes(item.id),true);
  if(sessionHasErrors())throw new Error('Renderer/request error while saving result.');
  report.records.push({...report.pendingResult,realSeconds:begin===null?null:(Date.now()-begin)/1000});delete report.pendingResult;
  lastState=await player.state();await progress();console.log(JSON.stringify({finished:item.id,kind,gameSeconds:result.campaign.missionSeconds,realSeconds:begin===null?null:(Date.now()-begin)/1000,resources:result.resources,...recovery}));
}
async function story(item,continuation){
  if(!continuation){
    await player.prepareColony();await player.faceTarget(content.missionSites(item,2)[0]);await player.tab('campaign');
    const button=page.locator(`[data-mission="${item.id}"]`),details=button.locator('xpath=ancestor::details[1]');if(await details.getAttribute('open')===null)await details.locator('summary').click();await button.click();
  }
  const initial=await player.state();let objective=continuation?(initial.campaign.waitingForDeparture?-1:initial.campaign.objectiveIndex):0,lastKills=initial.kills,quiet=0,lastOrder='';
  await combatLoop(item,'story',async g=>{
    if(needsStoryDeparture(g,game.balance.activationRange,objective)){
      await player.paidRefit();g=await player.state();if(g.phase!=='playing'||g.combat||g.route||g.campaign.pendingChoice)return;
      await player.faceTarget(g.catalog[g.campaign.objectiveIndex]);await player.tab('voyage');g=await player.state();
      if(g.phase!=='playing'||g.combat||g.route||g.campaign.pendingChoice)return;
      const index=g.campaign.objectiveIndex,id=g.catalog[index].id;
      if(!await player.tap(`[data-site="${id}"]`)){
        g=await player.state();if(g.phase!=='playing'||g.combat||g.route||g.campaign.pendingChoice||g.campaign.objectiveIndex!==index)return;
        throw new Error(`Next route unavailable: ${id}`);
      }
      objective=index;
      quiet=0;lastOrder='';lastKills=g.kills;return;
    }
    quiet=g.kills===lastKills?quiet+1:0;lastKills=g.kills;
    const remaining=g.enemies.filter(e=>e.hp>0&&e.active&&!e.captured);
    if(g.combat&&(remaining.length<=2||quiet>=20)){
      const target=remaining.find(e=>['tender','carrier','spitter','nest'].includes(e.type))||remaining[0],ids=g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id);
      const assigned=target&&ids.every(id=>{const command=g.fleet.units.find(u=>u.id===id).command;return command.type==='attack'&&command.target===target.id;});
      if(target&&ids.length&&(target.id!==lastOrder||!assigned)&&await player.order('attack',target,ids))lastOrder=target.id;
    }
  },continuation);
}
async function operation(item,continuation){
  if(!continuation){await player.prepareColony();await player.prepareFleet();}
  if(!continuation&&item.kind==='defense'){
    const g=await player.state();for(const t of g.tiles)for(const [edge,s]of Object.entries(walls.wallEdges)){
      const now=await player.state();if(!g.tiles.some(v=>v.x===t.x+s.dx&&v.z===t.z+s.dz)&&walls.validWallSlot(now,t.x,t.z,edge)&&now.resources>200)await player.build('wall',{...t,edge});
    }
  }
  if(!continuation){await player.tab('campaign');await page.locator(`[data-${item.kind==='defense'?'defense':item.kind==='siege'?'siege':'explore'}="${item.id}"]`).click();}
  const initial=await player.state();let lastOrder='',lastNode=continuation?initial.campaign.objectiveIndex:null,lastKills=initial.kills,quiet=0;
  await combatLoop(item,item.kind,async g=>{
    if(g.operation.waiting){
      if(item.kind==='explore'&&g.sites.every(s=>s.cleared)){await player.tab('voyage');if(!await player.tap('#extract-exploration'))throw new Error('Full chart extraction unavailable.');return;}
      if(!await player.recall())return;await player.tab('voyage');g=await player.state();if(g.phase!=='playing')return;
      if(item.kind==='explore'){
        const index=[0,2,1,4,5,3,6,7].find(i=>g.operation.visible.includes(g.catalog[i].id)&&!g.sites[i].cleared);assert.notEqual(index,undefined,'No discovered exploration route remains.');
        if(!await player.tap(`[data-site="${g.catalog[index].id}"]`))throw new Error('Exploration route unavailable.');lastNode=index;
      }else if(!await player.tap('#start-defense-wave'))throw new Error('Next wave unavailable.');
      lastOrder='';lastKills=g.kills;quiet=0;return;
    }
    quiet=g.kills===lastKills?quiet+1:0;lastKills=g.kills;const remaining=g.enemies.filter(e=>e.hp>0&&!e.captured);
    let target;
    if(item.kind==='defense'){if(remaining.length<=2||quiet>=20)target=remaining.find(e=>['spitter','tender','carrier'].includes(e.type))||remaining[0];}
    else target=item.kind==='siege'?remaining.find(e=>e.type==='generator')||remaining.find(e=>e.type==='baseCore'):remaining.find(e=>['nest','tender','bulwark','carrier'].includes(e.type))||remaining[0];
    const ids=g.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id),assigned=target&&ids.every(id=>{const command=g.fleet.units.find(u=>u.id===id).command;return command.type==='attack'&&command.target===target.id;});
    if(target&&ids.length&&(target.id!==lastOrder||!assigned)&&await player.order('attack',target,ids))lastOrder=target.id;
    if(item.kind==='explore'&&!target&&g.campaign.encounterWave+1>=g.catalog[lastNode].waves&&lastOrder!==`scan-${lastNode}`){
      if(g.fleet.units.some(u=>u.hp>0)){await player.tab('fleet');await player.tap('#select-all-units');await player.tab('voyage');await player.tap('#send-survey');}
      else {await player.tab('voyage');await player.tap(`[data-site="${g.catalog[lastNode].id}"]`);}
      lastOrder=`scan-${lastNode}`;
    }
  },continuation);
}
async function combatLoop(item,kind,actions,continuation={}){
  const begin=Date.now();let loops=0;
  while(!stopRequested){
    // Cooperative audit control: stop only this owned run, save/pause normally,
    // and let browser.close flush its profile instead of killing the process.
    try{await fs.access(path.join(output,'stop-request.txt'));stopRequested=true;await fs.rename(path.join(output,'stop-request.txt'),path.join(controllerFolder,'stop-request-observed.txt'));break;}
    catch(error){if(error.code!=='ENOENT')throw error;}
    lastState=await player.state();if(lastState.phase!=='playing')break;
    if(lastState.paused)throw new Error(`Unexpected pause: ${item.id}`);
    if(lastState.campaign.missionSeconds>(kind==='story'?2400:3600))throw new Error(`Progress limit exceeded: ${item.id}`);
    if(sessionHasErrors())throw new Error('Renderer/request error during journey.');
    await player.choose(lastState);lastState=await player.state();if(lastState.phase!=='playing')break;await actions(lastState);lastState=await player.state();
    if(lastState.phase==='playing'&&!lastState.campaign.pendingChoice)await player.abilities(lastState);
    if(Date.now()-lastHeartbeat>=60000){lastHeartbeat=Date.now();await sample();}
    if(++loops%2===0)await progress();await page.waitForTimeout(500);
  }
  if(stopRequested)throw new Error('LIVE_RUN_STOP_REQUESTED');await finish(item,kind,begin,continuation||{});
}
try{
  await progress();server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--config',config],{cwd:project,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>terminal=(terminal+d.toString()).slice(-4000));server.stderr.on('data',d=>terminal=(terminal+d.toString()).slice(-4000));server.on('exit',()=>{serverExited=true;});
  for(let n=0;!terminal.includes(url);n++){if(serverExited||n>150)throw new Error(`Owned frozen server failed: ${terminal}`);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--mute-audio']});page=browser.pages()[0]||await browser.newPage();
  metrics=await browser.newCDPSession(page);await metrics.send('Performance.enable');
  page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>report.errors.push(r.failure()?.errorText));page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))report.remoteRequests.push(r.url());});
  await page.goto(url);report.runtime.browser=browser.browser().version();
  player=livePlayer(page,{...game,...campaign,...content,...production,...fleet,...decisions,...fortifications});
  if(recoveryFile&&await page.locator('#continue-button').isVisible())await page.locator('#continue-button').click();
  else await page.locator('[data-start="destination"]').click();
  if(recoveryFile){
    lastState=await player.state();const next=itinerary[report.records.length];
    if(['mission-complete','campaign-complete'].includes(lastState.phase)){
      // A last enemy can die while a control click is in flight. Preserve the
      // normal victory saved in this run's own profile through Continue, return
      // to harbor and a public export, rather than replaying a won sortie.
      const prior=resumeCurrent;assert(next&&prior&&['mission-complete','campaign-complete'].includes(prior.phase),'Unverified completed profile state.');
      assert.equal(lastState.operation?.id||lastState.campaign.missionId,next.item.id);assert.equal(prior.id,next.item.id);
      save.decodeSave(save.encodeSave(lastState));
      for(const [key,value]of [['resources',prior.resources],['hull',prior.hull]])assert.equal(lastState[key],value,`Saved victory changed ${key}`);
      assert.equal(lastState.campaign.missionSeconds,prior.seconds);
      const expectedCampaign=report.records.filter(r=>r.kind==='story').map(r=>r.id),expectedFrontier=report.records.filter(r=>r.kind!=='story').map(r=>r.id);
      (next.kind==='story'?expectedCampaign:expectedFrontier).push(next.item.id);
      assert.deepEqual(lastState.campaign.completed,expectedCampaign);assert.deepEqual(lastState.campaign.frontier?.cleared||[],expectedFrontier);
      await finish(next.item,next.kind,null,{recoveredFromOwnProfile:true,timingUnavailable:true,runIndex:previous.sessions.at(-1).runIndex,controllerHash:previous.runtime.controllerHash,runnerHash:previous.runtime.runnerHash,recoveryControllerHash:runtime.controllerHash});
      recoveryFile=path.join(output,`${next.item.id}-harbor.json`);Object.assign(report.recovery,{steps:report.records.length,lastId:next.item.id,file:recoveryFile,recoveredWonResult:true});
    }
    lastState=await player.state();
    if(next&&lastState.phase==='playing'&&['mission','operation'].includes(lastState.campaign.stage)){
      assert.equal(lastState.operation?.id||lastState.campaign.missionId,next.item.id,'Active save is not the next earned sortie.');assert.equal(resumeCurrent?.id,next.item.id);
      assert(lastState.paused,'A terminal active profile must be paused before inspection.');save.decodeSave(save.encodeSave(lastState));
      assert.deepEqual(lastState.campaign.completed,report.records.filter(r=>r.kind==='story').map(r=>r.id));assert.deepEqual(lastState.campaign.frontier?.cleared||[],report.records.filter(r=>r.kind!=='story').map(r=>r.id));
      const interrupted=previous.terminationConfirmedAt&&previous.failure?.startsWith('Operator interrupted the audit'),rollback=resumeCurrent.seconds-lastState.campaign.missionSeconds;
      assert(rollback>=-1&&rollback<=(interrupted?60:10),'Cached active save exceeds the verified recovery window.');if(!interrupted)assert.equal(lastState.resources,resumeCurrent.resources,'Cached active costs differ from the terminal observation.');
      await fs.writeFile(path.join(controllerFolder,'active-resume.json'),save.encodeSave(lastState));
      activeResume={continuedFromActiveSave:true,timingPartial:true,savedGameSeconds:lastState.campaign.missionSeconds,priorControllerHash:previous.runtime.controllerHash,priorRunnerHash:previous.runtime.runnerHash,...(interrupted?{operatorCacheRollback:{seconds:rollback,resources:lastState.resources-resumeCurrent.resources,hull:lastState.hull-resumeCurrent.hull}}:{})};
      Object.assign(report.recovery,{method:'Normal Continue of this terminal run\'s own paused active profile, validated against the earned prefix and terminal observation.',activeId:next.item.id,activeSave:path.join(controllerFolder,'active-resume.json')});
      await page.locator('#resume-button').click();
    }else{
      const expected=save.decodeSave(await fs.readFile(recoveryFile,'utf8'));await page.locator('#save-file').setInputFiles(recoveryFile);report.imports++;await expect(page.locator('#resume-button')).toBeVisible();
      lastState=await player.state();for(const key of ['resources','hull','maxHull','fleet','campaign','facilities'])assert.deepEqual(canonicalSavedValue(lastState[key]),canonicalSavedValue(expected[key]),`UI recovery changed ${key}`);
      await page.locator('#resume-button').click();
    }
  }else{await player.build('cannon',{x:-1,z:-1});lastState=await player.state();assert.equal(lastState.resources,85);assert.equal(lastState.campaign.completed.length,0);assert.equal(lastState.fleet.units.length,0);}
  await page.locator('#settings-button').click();await page.locator('#effects-volume').fill('0');await page.locator('#music-volume').fill('0');await page.locator('#graphics-quality').selectOption('standard');await page.locator('#close-settings').click();
  started=Date.now();report.startedAt||=new Date(started).toISOString();report.sessions.push({runIndex,startedAt:new Date(started).toISOString(),runtime});report.status='running';await sample();
  for(const {item,kind}of itinerary.slice(report.records.length,limit)){if(stopRequested)throw new Error('LIVE_RUN_STOP_REQUESTED');await (kind==='story'?story(item,activeResume):operation(item,activeResume));activeResume=undefined;}
  report.status=limit===itinerary.length?'complete':'limited';lastState=await player.state();await exportSave('live-final.json');await sample();
}catch(error){
  report.status=stopRequested?'stopped':'failed';report.failure=error.message;process.exitCode=stopRequested?0:1;
  if(page&&player){try{lastState=await player.state();if(lastState.phase==='playing'&&!lastState.paused)await page.keyboard.press('p');lastState=await player.state();await fs.writeFile(path.join(controllerFolder,'failure-state.json'),save.encodeSave(lastState));await page.screenshot({path:path.join(output,'failure.png')});}catch{} }
  await progress();console.error(error);
}finally{
  if(browser)await browser.close();if(server&&!serverExited)server.kill();await progress();console.log(JSON.stringify({status:report.status,completed:report.completed,realElapsedSeconds:report.realElapsedSeconds,activeSeconds:report.totalGameActiveSeconds,failure:report.failure||null}));
}
