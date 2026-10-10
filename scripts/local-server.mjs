// Read-only, loopback-only server for the built local game. No online backend.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.TIDEHOLD_PORT || 4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('TIDEHOLD_PORT must be between 1024 and 65535');
const address=`http://127.0.0.1:${port}/`;
let index;
try{index=await readFile(path.join(root,'index.html'),'utf8');}catch{console.error('게임 빌드가 없습니다. 프로젝트에서 npm run build를 실행하세요.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
function openBrowser() {
  if(!process.argv.includes('--open'))return;
  // The fixed loopback address contains no user-controlled shell syntax.
  const child=process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${address}'`],{windowsHide:true,stdio:'ignore'}):process.platform==='darwin'?spawn('open',[address],{stdio:'ignore'}):spawn('xdg-open',[address],{stdio:'ignore'});
  child.on('error',()=>console.log(`브라우저에서 ${address} 를 여세요.`));child.unref();
}
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try {
    const pathname=decodeURIComponent(new URL(req.url,address).pathname),file=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`),relative=path.relative(root,file);
    if(relative.startsWith(`..${path.sep}`)||relative==='..'||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400);res.end();}
});
server.on('error',async error=>{
  if(error.code==='EADDRINUSE') {
    try {
      const response=await fetch(`${address}index.html`,{signal:AbortSignal.timeout(2500)});
      if(response.ok && await response.text()===index){console.log(`기존 로컬 게임 서버를 사용합니다: ${address}`);openBrowser();return;}
    }catch{}
    console.error(`포트 ${port}를 다른 프로그램이 사용하고 있습니다. 기존 서버를 확인하세요.`);
  }else console.error(error.message);
  process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>{console.log(`TIDEHOLD 로컬 게임: ${address}\n이 창을 닫거나 Ctrl+C를 누르면 서버가 종료됩니다.`);openBrowser();});
