// JSON represents both IEEE signed zeros as 0. Normalize only that distinction;
// keep all keys, undefined values, arrays and nonzero coordinates comparable.
export function canonicalSavedValue(value){
  if(Object.is(value,-0))return 0;
  if(Array.isArray(value))return value.map(canonicalSavedValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,canonicalSavedValue(item)]));
  return value;
}

// Returning to port removes sunk hulls and resets navigation, not their paid
// identity, health or upgrades. Compare those durable values separately.
export function harborFleetValue(fleet){
  const units=fleet.units.filter(u=>u.hp>0),living=new Set(units.map(u=>u.id));
  const value={...fleet,units:units.map(({x,z,command,waypoints,repath,cooldown,...unit})=>unit)};
  if(fleet.groups)value.groups=Object.fromEntries(Object.entries(fleet.groups).map(([key,ids])=>[key,ids.filter(id=>living.has(id))]).filter(([,ids])=>ids.length));
  return canonicalSavedValue(value);
}
