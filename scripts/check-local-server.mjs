import {spawn} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const start=port=>spawn(process.execPath,['scripts/local-server.mjs'],{env:{...process.env,TIDEHOLD_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
const server=start(4181);let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
const finished=child=>new Promise(resolve=>child.once('exit',code=>resolve(code)));
const report={date:new Date().toISOString(),checks:[]};
let other;
try {
  for(let attempt=0;attempt<40 && !output.includes('TIDEHOLD 로컬 게임:');attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(output.includes('TIDEHOLD 로컬 게임:'),output);
  const root=await fetch('http://127.0.0.1:4181/'),html=await root.text();assert.equal(root.status,200);assert.ok(html.includes('<title>TIDEHOLD'));report.checks.push('built index served');
  const js=html.match(/src="([^"]+\.js)"/)[1],head=await fetch(`http://127.0.0.1:4181${js}`,{method:'HEAD'});assert.equal(head.status,200);assert.ok(Number(head.headers.get('content-length'))>0);assert.equal(await head.text(),'');report.checks.push('built module served with correct HEAD');
  assert.equal((await fetch('http://127.0.0.1:4181/src/main.js')).status,404);assert.equal((await fetch('http://127.0.0.1:4181/%2e%2e%5cpackage.json')).status,403);assert.equal((await fetch('http://127.0.0.1:4181/',{method:'POST'})).status,405);report.checks.push('source/traversal/writes rejected');
  const reused=start(4181);assert.equal(await finished(reused),0);report.checks.push('matching server reused without another listener');
  other=http.createServer((req,res)=>res.end('another local app'));await new Promise(resolve=>other.listen(4182,'127.0.0.1',resolve));const blocked=start(4182);assert.equal(await finished(blocked),1);report.checks.push('other application port preserved');
  await fs.writeFile('artifacts/local-launcher-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{server.kill();if(other)await new Promise(resolve=>other.close(resolve));}
