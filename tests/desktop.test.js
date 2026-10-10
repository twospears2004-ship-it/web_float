import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createNativeStore} from '../desktop/native-store.mjs';
import {gameFile,isGameURL} from '../desktop/protocol.mjs';
import {createDesktopBridge} from '../src/desktop-bridge.js';
import {createCampaign,build} from '../src/game.js';
import {encodeSave,decodeSave,SAVE_KEY,BACKUP_KEY} from '../src/save.js';
function saves(){const g=createCampaign(),a=encodeSave(g);build(g,'fishery',1,1);const b=encodeSave(g);build(g,'wall',1,1,'east');return [a,b,encodeSave(g)];}
async function directory(t){const root=path.resolve(os.tmpdir()),dir=await mkdtemp(path.join(root,'tidehold-native-'));t.after(async()=>{const absolute=path.resolve(dir);assert.equal(path.dirname(absolute),root);assert.ok(path.basename(absolute).startsWith('tidehold-native-'));await rm(absolute,{recursive:true,force:true});});return dir;}
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key) || null,setItem:(key,value)=>data.set(key,value)};};
function dated(text,date){const e=JSON.parse(text);e.savedAt=date;return JSON.stringify(e);}

test('native saves serialize overlapping writes and retain the preceding valid campaign',async t=>{
  const dir=await directory(t),store=createNativeStore(dir),[a,b,c]=saves();assert.equal((await store.read()).text,null);
  await Promise.all([store.write(a),store.write(b),store.write(c)]);assert.equal((await store.read()).text,c);
  assert.equal(await readFile(path.join(dir,'campaign.backup.json'),'utf8'),b);assert.equal(decodeSave(c).facilities.at(-1).edge,'east');
});
test('invalid native writes leave both durable copies byte for byte intact',async t=>{
  const dir=await directory(t),store=createNativeStore(dir),[a,b]=saves();await store.write(a);await store.write(b);
  for(const value of ['broken',null,JSON.stringify({format:'tidehold-campaign',version:1,payload:{},checksum:'bad'})])await assert.rejects(store.write(value));
  assert.equal(await readFile(path.join(dir,'campaign.json'),'utf8'),b);assert.equal(await readFile(path.join(dir,'campaign.backup.json'),'utf8'),a);
});
test('corrupt native primary recovers its backup, and a repair never backs up corrupt text',async t=>{
  const dir=await directory(t),store=createNativeStore(dir),[a,b,c]=saves();await store.write(a);await store.write(b);await writeFile(path.join(dir,'campaign.json'),'broken');
  const recovered=await store.read();assert.equal(recovered.text,a);assert.equal(recovered.recovered,true);assert.equal(recovered.errors.length,1);
  await store.write(c);assert.equal((await store.read()).text,c);assert.equal(await readFile(path.join(dir,'campaign.backup.json'),'utf8'),a);
});
test('empty renderer storage recovers the native campaign without creating a new island',async()=>{
  const local=storage(),[,b]=saves(),bridge=createDesktopBridge({version:1,readCampaign:async()=>({text:b,recovered:true})},local);
  assert.deepEqual(await bridge.restore(),{restored:true,recovered:true});assert.equal(local.getItem(SAVE_KEY),b);assert.equal(decodeSave(local.getItem(SAVE_KEY)).facilities.length,2);
});
test('newer valid browser progress wins over an older native copy and is mirrored back',async()=>{
  const local=storage(),[a,,c]=saves(),older=dated(a,'2026-01-01T00:00:00Z'),newer=dated(c,'2026-01-02T00:00:00Z');local.setItem(SAVE_KEY,newer);let mirrored;
  const bridge=createDesktopBridge({version:1,readCampaign:async()=>({text:older}),writeCampaign:async text=>{mirrored=text;return {ok:true};}},local);
  assert.equal((await bridge.restore()).restored,false);assert.equal(local.getItem(SAVE_KEY),newer);assert.equal(mirrored,newer);
});
test('newer native progress preserves the previous valid renderer backup',async()=>{
  const local=storage(),[a,b]=saves(),older=dated(a,'2026-01-01T00:00:00Z'),newer=dated(b,'2026-01-02T00:00:00Z');local.setItem(SAVE_KEY,older);
  const bridge=createDesktopBridge({version:1,readCampaign:async()=>({text:newer,recovered:false})},local);await bridge.restore();assert.equal(local.getItem(SAVE_KEY),newer);assert.equal(local.getItem(BACKUP_KEY),older);
});
test('native shutdown waits for the current write and reports a failed durable save',async()=>{
  let done;const bridge=createDesktopBridge({version:1,writeCampaign:()=>new Promise(resolve=>{done=resolve;})},storage());
  const write=bridge.write(saves()[0]);await Promise.resolve();let finished=false;const closing=bridge.flush().then(r=>{finished=true;return r;});assert.equal(finished,false);
  done({ok:false,error:'disk full'});assert.deepEqual(await write,{ok:false,error:'disk full'});assert.deepEqual(await closing,{ok:false,error:'disk full'});
});
test('bundled protocol refuses foreign origins, credentials and decoded directory escapes',()=>{
  const root=path.resolve('dist');assert.equal(gameFile(root,'tidehold://game/'),path.join(root,'index.html'));assert.equal(gameFile(root,'tidehold://game/assets/game.js'),path.join(root,'assets','game.js'));
  for(const url of ['https://example.com/','file:///C:/Windows/system.ini','tidehold://evil/','tidehold://user@game/','tidehold://game/%2f../secret.txt','tidehold://game/%FF'])assert.equal(gameFile(root,url),null,url);
  assert.equal(isGameURL('tidehold://game:1111/'),false);
});
