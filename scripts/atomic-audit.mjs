import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
// Windows readers can briefly deny rename/delete sharing. Keep the last valid
// journal intact and retry only transient replacement errors for a bounded time.
// Never delete the destination or continue an audit without a durable journal.
export async function atomicAuditJson(file,value){
  const temp=`${file}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2));
  for(let attempt=0;;attempt++){
    try{await fs.rename(temp,file);return;}
    catch(error){if(attempt>=11||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await delay(Math.min(100,(attempt+1)*25));}
  }
}
