// Selection is transient UI state; do not change orders, groups or saved ships.
export function sameTypeUnitIds(g,id,visibleIds=null) {
  const units=g.fleet?.units||[],anchor=units.find(u=>u.id===id&&u.hp>0);
  if(!anchor)return [];
  const visible=visibleIds===null?null:new Set(visibleIds);
  // A picked ship can be partially visible even with its centre off-screen.
  return units.filter(u=>u.hp>0&&u.type===anchor.type&&(!visible||visible.has(u.id)||u.id===anchor.id)).map(u=>u.id);
}
export const visibleProjection=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=-1&&p.z<=1;
