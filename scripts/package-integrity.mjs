import * as asar from '@electron/asar';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8')),archive=path.join(pkg.directory,'resources','app.asar'),hash=b=>createHash('sha256').update(b).digest('hex');
const html=await fs.readFile('dist/index.html','utf8'),css=html.match(/<link[^>]*href="([^"]+\.css)"/)?.[1];assert(css);
const files=['dist/index.html',path.join('dist',pkg.gameBundle.replace(/^\/+/,'')),path.join('dist',css.replace(/^\/+/,'')),...(await fs.readdir('desktop')).filter(n=>/\.(mjs|cjs)$/.test(n)).map(n=>path.join('desktop',n)),...(await fs.readdir('src')).filter(n=>/\.(js|json)$/.test(n)).map(n=>path.join('src',n))],records=[];
for(const file of files){const current=await fs.readFile(file),packed=asar.extractFile(archive,path.normalize(file));assert.equal(hash(packed),hash(current),file);records.push({file,sha256:hash(current)});}
assert.equal(hash(await fs.readFile(archive)),pkg.asarSha256);assert.equal(hash(await fs.readFile(pkg.executable)),pkg.sha256);assert.equal(hash(await fs.readFile(path.join('dist',pkg.gameBundle.replace(/^\/+/,'')))),pkg.gameBundleSha256);
const inventory=asar.listPackage(archive),excluded=inventory.filter(n=>/(^|[\\/])(artifacts|tests|test-results|desktop-profiles|browser-profile|\.git)([\\/]|$)/.test(n));assert.deepEqual(excluded,[],'Packaged application contains development or private profile files.');
const report={date:new Date().toISOString(),executable:pkg.executable,asarSha256:pkg.asarSha256,gameBundle:pkg.gameBundle,files:records,asarEntries:inventory.length,excludedProfileEntries:excluded.length,allMatch:true};await fs.writeFile('artifacts/network-package-integrity.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:records.length,asarEntries:inventory.length,excludedProfileEntries:excluded.length,allMatch:true,gameBundle:pkg.gameBundle}));
