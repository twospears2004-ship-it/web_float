// Compare only the identical completed itinerary prefix. Different controllers
// and army/economy choices are preserved; partial timings are not extrapolated.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const owned=file=>{const absolute=path.resolve(file),relative=path.relative(path.resolve('artifacts'),absolute);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&absolute.endsWith('.json'),'Use JSON files inside artifacts.');return absolute;};
const modelFile=owned(arg('model','artifacts/endgame-variety-prototype-20261011/artifacts/journey-variety-current/journey-audit.json')),liveFile=owned(arg('live','artifacts/live-current-instancing-full-20261011/live-audit.json')),output=owned(arg('output','artifacts/live-current-instancing-prefix-comparison.json'));
assert(output!==modelFile&&output!==liveFile,'Never replace the original journals.');
const model=JSON.parse(await fs.readFile(modelFile,'utf8')),live=JSON.parse(await fs.readFile(liveFile,'utf8'));assert.equal(model.records.length,192);assert(live.records.length>0&&live.records.length<=model.records.length);
const records=live.records.map((r,i)=>{const m=model.records[i];assert.equal(r.id,m.id);assert.equal(r.kind,m.kind);assert(Number.isFinite(m.seconds)&&Number.isFinite(r.gameSeconds)&&Number.isFinite(r.realSeconds));return {id:r.id,kind:r.kind,modelGameSeconds:m.seconds,actualGameSeconds:r.gameSeconds,actualRealSeconds:r.realSeconds,modelResources:m.resources,actualResources:r.resources,modelArmy:m.army.filter(u=>u.hp>0).length,actualArmy:r.army.filter(u=>u.hp>0).length};});
const sum=key=>records.reduce((n,r)=>n+r[key],0);
const report={date:new Date().toISOString(),kind:'completed prefix comparison, not a full-run duration or projection',modelFile,liveFile,completed:records.length,modelSourceHashes:[...new Set(model.records.map(r=>r.sourceHash))],liveSourceHashes:[...new Set(live.records.map(r=>r.sourceHash))],modelControllerHashes:[...new Set(model.records.map(r=>r.controllerHash))],liveControllerHashes:[...new Set(live.records.map(r=>r.controllerHash))],modelPrefixGameSeconds:sum('modelGameSeconds'),actualPrefixGameSeconds:sum('actualGameSeconds'),actualPrefixRealSeconds:sum('actualRealSeconds'),liveStatus:live.status,liveWholeElapsedSeconds:live.realElapsedSeconds,records,projectedFullRunSeconds:null};
await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,modelGameSeconds:report.modelPrefixGameSeconds,actualGameSeconds:report.actualPrefixGameSeconds,actualRealSeconds:report.actualPrefixRealSeconds,projection:false}));
