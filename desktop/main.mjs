import {app,BrowserWindow,Menu,protocol,session,ipcMain,dialog} from 'electron';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {createNativeStore} from './native-store.mjs';
import {GAME_URL,isGameURL,gameFile,gameCSP,gameMime} from './protocol.mjs';

app.setName('TIDEHOLD');app.setAppUserModelId('com.tidehold.game');
const testing=process.env.TIDEHOLD_TEST_MODE==='1';
if(testing&&!process.env.TIDEHOLD_PROFILE_DIR)throw new Error('테스트용 저장 폴더를 지정하세요.');
const profile=testing&&process.env.TIDEHOLD_PROFILE_DIR?path.resolve(process.env.TIDEHOLD_PROFILE_DIR):path.join(app.getPath('appData'),'TIDEHOLD');
mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
protocol.registerSchemesAsPrivileged([{scheme:'tidehold',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(!app.requestSingleInstanceLock())app.quit();
else{
  let win,allowClose=false,closing=false,closeToken=0,closeTimer;
  const store=createNativeStore(path.join(profile,'saves'));
  const trusted=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&isGameURL(event.sender.getURL());
  ipcMain.handle('tidehold:read-save',async event=>{if(!trusted(event))throw new Error('잘못된 저장 요청입니다.');return store.read();});
  ipcMain.handle('tidehold:write-save',async(event,text)=>{
    if(!trusted(event))throw new Error('잘못된 저장 요청입니다.');
    try{return await store.write(text);}catch(error){return {ok:false,error:error.message};}
  });
  async function failedClose(error){
    clearTimeout(closeTimer);closing=false;
    if(testing){console.error(`TIDEHOLD_CLOSE_FAILED: ${error}`);return;}
    const result=await dialog.showMessageBox(win,{type:'warning',title:'항해 저장 확인',message:'최신 항해를 저장하지 못했습니다.',detail:`${error}\n게임 안에서 파일로 내보내거나 저장을 다시 시도할 수 있습니다.`,buttons:['게임으로 돌아가기','마지막 저장으로 종료'],defaultId:0,cancelId:0});
    if(result.response===1){allowClose=true;win.close();}
  }
  ipcMain.on('tidehold:close-ready',async(event,token,result)=>{
    if(!trusted(event)||!closing||token!==closeToken)return;
    clearTimeout(closeTimer);
    if(!result?.ok){await failedClose(result?.error || '게임 창이 저장을 완료하지 못했습니다.');return;}
    try{await store.flush();session.defaultSession.flushStorageData();allowClose=true;win.close();}catch(error){await failedClose(error.message);}
  });
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(async()=>{
    await mkdir(profile,{recursive:true});const root=path.join(app.getAppPath(),'dist');
    protocol.handle('tidehold',async request=>{
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
      const file=gameFile(root,request.url);if(!file)return new Response(null,{status:403});
      try{const data=await readFile(file);return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':gameMime[path.extname(file)] || 'application/octet-stream','Content-Security-Policy':gameCSP,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});}catch{return new Response(null,{status:404});}
    });
    const ses=session.defaultSession;
    if(testing&&process.env.TIDEHOLD_CLEAR_RENDERER_CACHE==='1')await ses.clearStorageData({storages:['localstorage']});
    ses.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));ses.setPermissionCheckHandler(()=>false);
    ses.webRequest.onBeforeRequest((request,callback)=>callback({cancel:!isGameURL(request.url)&&!request.url.startsWith('blob:tidehold://game/')&&!(request.resourceType==='image'&&request.url.startsWith('data:image/'))}));
    win=new BrowserWindow({title:'TIDEHOLD — 떠도는 섬',width:1440,height:940,minWidth:1100,minHeight:720,backgroundColor:'#102c35',show:!testing,autoHideMenuBar:true,
      webPreferences:{preload:path.join(app.getAppPath(),'desktop','preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged,backgroundThrottling:!testing}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(url!==GAME_URL)event.preventDefault();});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('before-input-event',(event,input)=>{if(input.key==='F11'&&input.type==='keyDown'&&!input.isAutoRepeat){event.preventDefault();win.setFullScreen(!win.isFullScreen());}});
    win.on('close',event=>{
      if(allowClose)return;event.preventDefault();if(closing)return;closing=true;closeToken++;
      closeTimer=setTimeout(()=>failedClose('게임 창이 응답하지 않습니다. 마지막 자동 저장은 보존되어 있습니다.'),10000);
      win.webContents.send('tidehold:prepare-close',closeToken);
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'게임',submenu:[{label:'전체 화면 (F11)',click:()=>win.setFullScreen(!win.isFullScreen())},{type:'separator'},{label:'저장하고 종료',click:()=>win.close()}]},
      {label:'도움말',submenu:[{label:'TIDEHOLD 정보',click:()=>dialog.showMessageBox(win,{type:'info',title:'TIDEHOLD',message:'TIDEHOLD — 떠도는 섬',detail:`버전 ${app.getVersion()}\n로컬 싱글플레이 · 마우스/키보드\nF11 전체 화면 · Alt 메뉴\n자동 저장과 저장 파일 내보내기는 캠페인 메뉴에서 확인하세요.\nElectron·Chromium·Three.js의 라이선스는 실행 폴더에 동봉되어 있습니다.`})}]},
    ]));
    await win.loadURL(GAME_URL);
  }).catch(error=>{console.error(error);if(!testing)dialog.showErrorBox('TIDEHOLD 실행 오류',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
