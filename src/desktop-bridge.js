import {SAVE_KEY,BACKUP_KEY,decodeSave} from './save.js';
function valid(text){try{decodeSave(text);return {text,date:Date.parse(JSON.parse(text).savedAt)||0};}catch{return null;}}
export function createDesktopBridge(api,storage){
  let pending=Promise.resolve({ok:true});
  const enabled=api?.version===1;
  function write(text){
    if(!enabled)return Promise.resolve({ok:true});
    pending=Promise.resolve().then(()=>api.writeCampaign(text)).then(r=>r?.ok?{ok:true}:{ok:false,error:r?.error || '독립 실행 저장을 기록하지 못했습니다.'},error=>({ok:false,error:error.message}));return pending;
  }
  return {
    enabled,write,flush:()=>pending,
    async restore(){
      if(!enabled)return {restored:false};
      try{
        const native=await api.readCampaign(),remote=valid(native?.text),local=valid(storage.getItem(SAVE_KEY)) || valid(storage.getItem(BACKUP_KEY));
        if(remote&&(!local||remote.date>local.date)){
          if(local)storage.setItem(BACKUP_KEY,local.text);storage.setItem(SAVE_KEY,remote.text);
          return {restored:true,recovered:!!native.recovered};
        }
        if(local){const result=await write(local.text);if(!result.ok)return {restored:false,error:result.error};}
        return {restored:false,...(native?.errors?.length&&!local&&!remote?{error:'독립 실행 저장을 읽지 못했습니다. 원본은 보존했습니다.'}:{})};
      }catch(error){return {restored:false,error:error.message};}
    },
    onBeforeClose:handler=>{if(enabled)api.onBeforeClose(handler);},
  };
}
