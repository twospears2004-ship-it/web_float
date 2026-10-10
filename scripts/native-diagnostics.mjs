import fs from 'node:fs/promises';
import path from 'node:path';
export function captureNativeOutput(app,logs){
  for(const name of ['stdout','stderr'])app.process()[name]?.on('data',chunk=>{logs.push({date:new Date().toISOString(),stream:name,text:chunk.toString().slice(-4096)});if(logs.length>100)logs.shift();});
}
export async function observeNativeClose(app){
  // Diagnostics only, in an explicitly isolated test process. Do not replace
  // IPC handlers, alter close tokens, pause the game, or change save contents.
  await app.evaluate(({app:mainApp,BrowserWindow,ipcMain})=>{
    if(process.env.TIDEHOLD_TEST_MODE!=='1'||!process.env.TIDEHOLD_PROFILE_DIR)throw new Error('Close tracing requires an isolated native test profile.');
    const win=BrowserWindow.getAllWindows()[0];if(!win)throw new Error('No test window to observe.');
    const windowId=win.id,contentsId=win.webContents.id;
    const trace=(event,details={})=>console.log(`TIDEHOLD_NATIVE_TRACE ${JSON.stringify({at:Date.now(),pid:process.pid,windowId,event,...details})}`);
    win.on('close',event=>trace('close-request',{prevented:event.defaultPrevented}));
    win.on('closed',()=>trace('window-closed'));
    win.on('unresponsive',()=>trace('renderer-unresponsive'));
    win.on('responsive',()=>trace('renderer-responsive'));
    win.webContents.on('render-process-gone',(_event,details)=>trace('render-process-gone',details));
    ipcMain.on('tidehold:close-ready',(event,token,result)=>{if(event.sender.id===contentsId)trace('close-ready',{token,ok:result?.ok,error:result?.error});});
    mainApp.once('before-quit',()=>trace('before-quit'));
    mainApp.once('will-quit',()=>trace('will-quit'));
    trace('observer-attached');
  });
}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('diagnostic query timed out')),2000);})]);}finally{clearTimeout(timer);}}
export async function recordNativeFailure({app,page,profile,error,errors,logs,records,executable}){
  const report={date:new Date().toISOString(),executable,profile,error:error.message,records,errors,nativeOutput:logs,pageClosed:page?.isClosed()??null,processExitCode:app?.process().exitCode??null};
  try{const s=JSON.parse(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));report.disk={savedAt:s.savedAt,phase:s.payload.phase,paused:s.payload.paused,stage:s.payload.campaign.stage,resources:s.payload.resources,operation:s.payload.operation?.id};}catch(e){report.diskError=e.message;}
  if(page&&!page.isClosed())try{report.saveStatus=await page.locator('#save-status').textContent({timeout:2000});}catch(e){report.rendererError=e.message;}
  if(app)try{report.windows=await bounded(app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({id:w.id,visible:w.isVisible(),url:w.webContents.getURL()}))));}catch(e){report.windowQueryError=e.message;}
  const file=path.join(profile,'failure.json');await fs.writeFile(file,JSON.stringify(report,null,2));console.error(`Native failure diagnostics: ${file}`);
}
