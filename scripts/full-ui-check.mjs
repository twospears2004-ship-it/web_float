// Versioned, isolated full regression run. Model fixtures and virtual UI time
// are never counted as the separate real-time journey's playtime evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const project=process.cwd(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(project,'artifacts',`full-ui-${stamp}`),frozen=path.join(output,'project');
const port=Number(process.env.TIDEHOLD_TEST_PORT||5203);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid isolated test port');
await fs.mkdir(frozen,{recursive:true});
const report={date:new Date().toISOString(),status:'preparing',output,frozen,port,node:process.version,fixtureOnly:true,uiClockDoesNotProvePlaytime:true,stages:[]};
const write=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await write();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(folder,relative=''){
  const rows=[];
  for(const name of (await fs.readdir(folder)).sort()){
    const full=path.join(folder,name),key=path.join(relative,name),stat=await fs.stat(full);
    if(stat.isDirectory())rows.push(...await inventory(full,key));else rows.push({file:key,sha256:hash(await fs.readFile(full))});
  }
  return rows;
}
async function run(name,args){
  report.status=name;await write();const started=Date.now(),logFile=path.join(output,`${name}.log`);
  const log=createWriteStream(logFile);
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:frozen,env:{...process.env,TIDEHOLD_TEST_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    child.once('error',reject);child.once('close',resolve);
  });
  await new Promise(resolve=>log.end(resolve));
  report.stages.push({name,args,exitCode:code,seconds:(Date.now()-started)/1000,logFile});await write();
  if(code!==0)throw new Error(`${name} failed with exit code ${code}; preserve ${logFile}`);
}
try{
  for(const name of ['src','public','desktop','tests','scripts','index.html','package.json','package-lock.json','playwright.config.js'])await fs.cp(path.join(project,name),path.join(frozen,name),{recursive:true});
  // Reuse only installed dependencies. No package download or personal profile.
  await fs.symlink(path.join(project,'node_modules'),path.join(frozen,'node_modules'),'junction');
  await fs.mkdir(path.join(frozen,'artifacts'),{recursive:true});
  for(const name of ['campaign-fixtures','colony-fixtures','exploration-fixtures','atlas-fixtures','defense-fixtures'])await fs.cp(path.join(project,'artifacts',name),path.join(frozen,'artifacts',name),{recursive:true});
  await fs.mkdir(path.join(frozen,'artifacts/journey-wall-current'),{recursive:true});await fs.cp(path.join(project,'artifacts/journey-wall-current/journey-final.json'),path.join(frozen,'artifacts/journey-wall-current/journey-final.json'));report.wardEarnedInputSha256=hash(await fs.readFile(path.join(frozen,'artifacts/journey-wall-current/journey-final.json')));
  report.source=await inventory(path.join(frozen,'src'));report.tests=await inventory(path.join(frozen,'tests'));report.sourceTreeHash=hash(JSON.stringify(report.source));report.testTreeHash=hash(JSON.stringify(report.tests));
  report.runnerSha256=hash(await fs.readFile(new URL(import.meta.url)));await write();
  console.log(JSON.stringify({output,frozen,port,sourceTreeHash:report.sourceTreeHash,testTreeHash:report.testTreeHash}));
  await run('rules',['--test','tests/*.test.js']);
  await run('browser',[path.join('node_modules','@playwright','test','cli.js'),'test','--reporter=list','--output=artifacts/browser-results']);
  const afterSource=await inventory(path.join(frozen,'src')),afterTests=await inventory(path.join(frozen,'tests'));
  report.sourceUnchanged=hash(JSON.stringify(afterSource))===report.sourceTreeHash;report.testsUnchanged=hash(JSON.stringify(afterTests))===report.testTreeHash;
  if(!report.sourceUnchanged||!report.testsUnchanged)throw new Error('Copied source or tests changed during validation');
  report.status='passed';await write();console.log(JSON.stringify({output,status:report.status,stages:report.stages}));
}catch(error){report.status='failed';report.error=error.stack;await write();throw error;}
