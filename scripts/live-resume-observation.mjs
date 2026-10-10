import {isDeepStrictEqual} from 'node:util';

// An unsuccessful browser startup has no fresh game observation. Carry forward
// a terminal observation only from the same frozen run and exact earned ledger.
// This selects audit evidence; it never changes or imports a game save.
export function findResumeObservation(previous, archives=[]){
  if(previous.current)return {current:previous.current,source:previous.currentObservation?.source||'previous-report',observedAt:previous.currentObservation?.observedAt||previous.updatedAt};
  for(const {file,report} of archives){
    if(!['failed','stopped','limited'].includes(report.status)||!report.current)continue;
    if(report.startedAt!==previous.startedAt||report.limit!==previous.limit)continue;
    if(['sourceHash','htmlHash','cssHash'].some(key=>!previous.runtime?.[key]||report.runtime?.[key]!==previous.runtime[key]))continue;
    if(!isDeepStrictEqual(report.records,previous.records))continue;
    return {current:report.current,source:file,observedAt:report.currentObservation?.observedAt||report.updatedAt};
  }
  return null;
}
