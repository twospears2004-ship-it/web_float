import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const project=process.cwd(),pkg=JSON.parse(await fs.readFile('package.json','utf8')),electronVersion=pkg.devDependencies.electron;
const id=new Date().toISOString().replace(/[:.]/g,'-'),stage=path.resolve('artifacts','desktop-stage',id),out=path.resolve('release',id);
await fs.mkdir(stage,{recursive:true});
for(const name of ['dist','desktop','src'])await fs.cp(path.join(project,name),path.join(stage,name),{recursive:true});
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'tidehold',productName:'TIDEHOLD',version:pkg.version,type:'module',main:'desktop/main.mjs',private:true},null,2));
// Only bundled game files and the pure save validators enter the archive.
// node_modules, tooling, test saves and personal profiles are never copied.
const archive=`electron-v${electronVersion}-win32-x64.zip`;
let zipDirectory;
for(const entry of await fs.readdir('.electron-cache',{withFileTypes:true})){if(!entry.isDirectory())continue;const dir=path.resolve('.electron-cache',entry.name);try{await fs.access(path.join(dir,archive));zipDirectory=dir;break;}catch{}}
if(!zipDirectory)throw new Error('Electron 런타임 캐시가 없습니다. electron_config_cache=.electron-cache로 npm run setup:desktop을 실행하세요.');
const bundles=await packager({dir:stage,name:'TIDEHOLD',platform:'win32',arch:'x64',electronVersion,electronZipDir:zipDirectory,asar:true,out,overwrite:false,prune:false,win32metadata:{FileDescription:'TIDEHOLD — 떠도는 섬',ProductName:'TIDEHOLD','requested-execution-level':'asInvoker'}});
const directory=bundles[0];await fs.copyFile('ASSET_LICENSES.md',path.join(directory,'ASSET_LICENSES.md'));await fs.cp('public/licenses',path.join(directory,'licenses'),{recursive:true});
await fs.copyFile('PLAY_GUIDE.md',path.join(directory,'PLAY_GUIDE.md'));
await fs.writeFile(path.join(directory,'시작하기.txt'),'TIDEHOLD — 떠도는 섬\r\n\r\nTIDEHOLD.exe를 실행하세요. Node와 브라우저 설치, 인터넷 연결이 필요하지 않습니다.\r\nF11: 전체 화면 · Alt: 메뉴\r\n자동 저장: 현재 Windows 계정의 AppData\\Roaming\\TIDEHOLD\r\n기존 웹판 항해: 캠페인에서 저장 파일 내보내기 → 실행판에서 저장 파일 불러오기\r\n폴더 전체를 함께 보관하세요. 실행 파일만 따로 이동하면 실행되지 않습니다.\r\n현재 개발판이며 Steam 출시 인증 또는 사람의20시간 플레이 검증을 완료한 상태가 아닙니다.\r\n');
const executable=path.join(directory,'TIDEHOLD.exe'),digest=createHash('sha256').update(await fs.readFile(executable)).digest('hex');
const asarSha256=createHash('sha256').update(await fs.readFile(path.join(directory,'resources','app.asar'))).digest('hex');
const gameBundle=(await fs.readFile(path.join(stage,'dist','index.html'),'utf8')).match(/<script[^>]*src="([^"]+)"/)?.[1];
if(!gameBundle)throw new Error('Packaged game entry is missing.');
const gameBundleSha256=createHash('sha256').update(await fs.readFile(path.join(stage,'dist',gameBundle))).digest('hex');
const report={date:new Date().toISOString(),version:pkg.version,electronVersion,platform:'win32',arch:'x64',directory,executable,sha256:digest,asarSha256,gameBundle,gameBundleSha256};await fs.writeFile('artifacts/desktop-package.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
