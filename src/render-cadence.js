// Rendering is independent of the simulation clock. An unchanged paused/menu
// scene needs few draws, and a hidden window needs none. Combat keeps every RAF.
export function createRenderCadence(idleFPS=15){
  const interval=1000/idleFPS;let lastDraw=null,nextIdle=null;
  return (now,{idle=false,hidden=false}={})=>{
    if(hidden){lastDraw=null;nextIdle=null;return null;}
    if(idle&&nextIdle!==null&&now<nextIdle)return null;
    const dt=lastDraw===null?0:Math.min(Math.max((now-lastDraw)/1000,0),0.1);lastDraw=now;
    nextIdle=idle?nextIdle===null?now+interval:nextIdle+interval*(1+Math.floor(Math.max(0,now-nextIdle)/interval)):null;
    return dt;
  };
}
