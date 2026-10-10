import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {decodeSave} from '../src/save.js';

export function createNativeStore(directory){
  const primary=path.join(directory,'campaign.json'),backup=path.join(directory,'campaign.backup.json');let queue=Promise.resolve();
  async function valid(file){try{const text=await readFile(file,'utf8');decodeSave(text);return {text};}catch(error){return {error:error.code==='ENOENT'?null:error.message};}}
  async function atomic(file,text){await writeFile(`${file}.tmp`,text,{encoding:'utf8',flush:true});await rename(`${file}.tmp`,file);}
  return {
    async read(){
      await queue.catch(()=>{});const a=await valid(primary);if(a.text)return {text:a.text,recovered:false,errors:[]};
      const b=await valid(backup);return {text:b.text || null,recovered:!!b.text,errors:[a.error,b.error].filter(Boolean)};
    },
    write(text){
      // Validate before touching either durable copy. The IPC caller controls
      // content only; filenames and directories never come from the renderer.
      try{decodeSave(text);}catch(error){return Promise.reject(error);}
      const next=queue.catch(()=>{}).then(async()=>{
        await mkdir(directory,{recursive:true});const current=await valid(primary);
        if(current.text)await atomic(backup,current.text);
        await atomic(primary,text);return {ok:true};
      });queue=next;return next;
    },
    flush:()=>queue,
  };
}
