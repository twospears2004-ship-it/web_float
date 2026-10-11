import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {atomicAuditJson} from '../scripts/atomic-audit.mjs';
async function locked(file,ms){
  const quoted=file.replaceAll("'","''"),code=`$taskLock=[IO.File]::Open('${quoted}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);[Console]::Out.WriteLine('locked');[Console]::Out.Flush();[Threading.Thread]::Sleep(${ms});$taskLock.Dispose()`;
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe']}),done=once(child,'exit');let output='';await new Promise((resolve,reject)=>{child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('locked'))resolve();});child.once('exit',()=>{if(!output.includes('locked'))reject(new Error('Windows journal lock was not acquired'));});});return {child,done};
}
test('actual Windows reader lock can release during atomic audit replacement without losing either record',{skip:process.platform!=='win32',timeout:10000},async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'tidehold-audit-')),file=path.join(folder,'audit.json');await atomicAuditJson(file,{sequence:1});const lock=await locked(file,220);await atomicAuditJson(file,{sequence:2,valid:true});await lock.done;assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{sequence:2,valid:true});assert.equal(await fs.access(`${file}.tmp`).then(()=>true,()=>false),false);
});
test('a persistent real Windows reader lock rejects replacement and preserves the last valid journal',{skip:process.platform!=='win32',timeout:10000},async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'tidehold-audit-')),file=path.join(folder,'audit.json');await atomicAuditJson(file,{sequence:1});const lock=await locked(file,2200);await assert.rejects(atomicAuditJson(file,{sequence:2}),error=>['EPERM','EACCES','EBUSY'].includes(error.code));await lock.done;assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{sequence:1});assert.deepEqual(JSON.parse(await fs.readFile(`${file}.tmp`,'utf8')),{sequence:2});await atomicAuditJson(file,{sequence:3});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{sequence:3});
});
