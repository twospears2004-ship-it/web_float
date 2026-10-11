// Independent effect clocks: a weaker hit neither cancels nor extends a
// stronger slow. The scalar fields always describe the strongest active one.
export const slowKinds=['legacy','frost','pulse'];
export function strongestSlow(slows) {
  let best={seconds:0,factor:1};
  for(const effect of Object.values(slows))if(effect.seconds>0&&(effect.factor<best.factor||effect.factor===best.factor&&effect.seconds>best.seconds))best=effect;
  return best;
}
function sync(enemy) {
  const effect=strongestSlow(enemy.controlSlows);
  enemy.slowSeconds=effect.seconds;enemy.slowFactor=effect.factor;
  if(!Object.keys(enemy.controlSlows).length)delete enemy.controlSlows;
}
export function applyEnemySlow(enemy,kind,seconds,factor) {
  if(!['frost','pulse'].includes(kind)||!(seconds>0&&seconds<=(kind==='frost'?3:4))||!(kind==='pulse'?factor===.3:[.5,.45,.4,.35].includes(factor))||!(enemy.hp>0)||enemy.captured)return false;
  if(!enemy.controlSlows){
    enemy.controlSlows={};
    // Old files lack the effect identity. Carry precisely the recorded effect,
    // rather than inventing an earlier pulse or resetting its remaining time.
    if(enemy.slowSeconds>0)enemy.controlSlows.legacy={seconds:enemy.slowSeconds,factor:enemy.slowFactor};
  }
  enemy.controlSlows[kind]={seconds,factor};sync(enemy);return true;
}
export function tickEnemySlow(enemy,dt) {
  if(!enemy.controlSlows){enemy.slowSeconds=Math.max(0,(enemy.slowSeconds||0)-dt);return;}
  for(const [kind,effect]of Object.entries(enemy.controlSlows)){
    effect.seconds=Math.max(0,effect.seconds-dt);
    if(!effect.seconds)delete enemy.controlSlows[kind];
  }
  sync(enemy);
}
export function validEnemySlows(enemy,frostFactor) {
  if(!Object.hasOwn(enemy,'controlSlows'))return true;
  const slows=enemy.controlSlows;
  if(!slows||typeof slows!=='object'||Array.isArray(slows))return false;
  const entries=Object.entries(slows);
  if(!entries.length||entries.length>3||entries.some(([kind,effect])=>!slowKinds.includes(kind)||!effect||typeof effect!=='object'||Array.isArray(effect)||Object.keys(effect).some(key=>!['seconds','factor'].includes(key))||!Number.isFinite(effect.seconds)||effect.seconds<=0||effect.seconds>(kind==='frost'?3:4)||!Number.isFinite(effect.factor)||effect.factor<0||effect.factor>1||kind==='pulse'&&effect.factor!==.3||kind==='frost'&&effect.factor!==frostFactor))return false;
  const best=strongestSlow(slows);
  return Math.abs(enemy.slowSeconds-best.seconds)<1e-9&&enemy.slowFactor===best.factor;
}
export function slowDescription(enemy) {
  if(!(enemy.slowSeconds>0&&enemy.slowFactor<1))return '';
  const frost=enemy.controlSlows?.frost,pulse=enemy.controlSlows?.pulse;
  const fallback=frost&&pulse&&pulse.factor===enemy.slowFactor&&frost.seconds>enemy.slowSeconds?` · 남은 냉각 ${Math.round((1-frost.factor)*100)}% ${frost.seconds.toFixed(1)}초`:'';
  return `이동 둔화 ${Math.round((1-enemy.slowFactor)*100)}% · ${enemy.slowSeconds.toFixed(1)}초${fallback}`;
}
