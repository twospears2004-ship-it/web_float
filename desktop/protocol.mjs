import path from 'node:path';
export const GAME_URL='tidehold://game/';
export function isGameURL(value){try{const u=new URL(value);return u.protocol==='tidehold:'&&u.hostname==='game'&&!u.port&&!u.username&&!u.password;}catch{return false;}}
export function gameFile(root,value){
  if(!isGameURL(value))return null;
  try{
    const url=new URL(value),name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,`.${name}`),relative=path.relative(root,file);
    return relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)?null:file;
  }catch{return null;}
}
export const gameCSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
export const gameMime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
