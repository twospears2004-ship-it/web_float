const {contextBridge,ipcRenderer}=require('electron');
let beforeClose=async()=>({ok:true});
contextBridge.exposeInMainWorld('tideholdDesktop',Object.freeze({
  version:1,
  readCampaign:()=>ipcRenderer.invoke('tidehold:read-save'),
  writeCampaign:text=>ipcRenderer.invoke('tidehold:write-save',text),
  onBeforeClose:handler=>{if(typeof handler==='function')beforeClose=handler;},
}));
ipcRenderer.on('tidehold:prepare-close',async(_event,token)=>{
  let result;try{result=await beforeClose();}catch(error){result={ok:false,error:error.message};}
  ipcRenderer.send('tidehold:close-ready',token,result);
});
