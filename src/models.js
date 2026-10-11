import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// All geometry is original, generated locally. +Z is a weapon's forward axis.
const palette = {
  grass: 0x9ba97b, rock: 0x536976, darkRock: 0x344e5c, sand: 0xd5c89d,
  wood: 0x997750, metal: 0x355563, dark: 0x213d4a, brass: 0xe9bd72,
  pale: 0xe5eadc, red: 0xda7961, teal: 0x407c78,
};
const materials = new Map();
export function material(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true, ...extra }));
  return materials.get(key);
}
export function part(group, geometry, color, x = 0, y = 0, z = 0, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(x, y, z); if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
const box = (g, w, h, d, c, x = 0, y = 0, z = 0) => part(g, new THREE.BoxGeometry(w, h, d), c, x, y, z);
const cylinder = (g, top, bottom, h, c, x = 0, y = 0, z = 0, sides = 8) => part(g, new THREE.CylinderGeometry(top, bottom, h, sides), c, x, y, z);
function mergeParts(group,parts){
  if(parts.length<2)return;
  const geometries=parts.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
  const geometry=mergeGeometries(geometries);for(const temporary of geometries)temporary.dispose();
  if(!geometry)throw new Error('Static model parts could not be merged.');
  const mesh=new THREE.Mesh(geometry,parts[0].material);mesh.castShadow=parts[0].castShadow;mesh.receiveShadow=parts[0].receiveShadow;
  for(const old of parts){old.removeFromParent();old.geometry.dispose();}group.add(mesh);
}
export function tileModel(x, z, size) {
  const g = new THREE.Group(); g.position.set(x * size, 0, z * size);
  const rock = cylinder(g, size * 0.68, size * 0.4, 2.6, palette.darkRock, 0, -1.4, 0, 4); rock.rotation.y = Math.PI / 4;
  box(g, size - 0.05, 0.7, size - 0.05, palette.sand, 0, -0.15);
  const surface = box(g, size - 0.13, 0.23, size - 0.13, (x + z) % 2 ? 0x95a775 : palette.grass, 0, 0.3);
  surface.userData.tile = { x, z };
  // Brass corner brackets and inset seams make expansion slots readable.
  const brackets=[];
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) brackets.push(box(g, 0.28, 0.06, 0.28, palette.wood, dx * (size / 2 - 0.28), 0.46, dz * (size / 2 - 0.28)));
  mergeParts(g,brackets);
  return g;
}
export function coreModel() {
  const g = new THREE.Group();
  cylinder(g, 1.5, 1.6, 0.35, palette.wood, 0, 0.65);
  box(g, 1.65, 1.5, 1.6, palette.pale, 0, 1.45);
  cylinder(g, 0.75, 1.2, 0.7, palette.red, 0, 2.5, 0, 4).rotation.y = Math.PI / 4;
  cylinder(g, 0.22, 0.26, 2.3, palette.brass, -0.9, 2.8, -0.7);
  box(g, 0.9, 0.52, 0.05, palette.teal, -0.48, 3.65, -0.7);
  box(g, 0.45, 0.7, 0.12, palette.dark, 0, 1.2, 0.85);
  for (const x of [-0.55, 0.55]) box(g, 0.38, 0.4, 0.1, palette.brass, x, 1.8, 0.83);
  const fan = new THREE.Group(); fan.position.set(0.7, 2.9, 0.5);
  for (let i = 0; i < 4; i++) { const blade = box(fan, 0.18, 1.25, 0.08, palette.pale, 0, 0.52); blade.rotation.z = i * Math.PI / 2; blade.position.set(-Math.sin(i * Math.PI / 2) * 0.5, Math.cos(i * Math.PI / 2) * 0.5, 0); }
  g.add(fan); g.userData.fan = fan;
  return g;
}
export function facilityModel(type, level = 1) {
  const g = new THREE.Group(), turret = new THREE.Group(),badges=[]; turret.position.y = 1.3; g.add(turret);
  if(!['wall','wall-ruin'].includes(type)){
    cylinder(g, 1.2, 1.3, 0.25, palette.wood, 0, 0.62);
    cylinder(g, 0.62, 0.85, 0.7, palette.metal, 0, 1);
  }
  if(type==='ruin') {
    box(g,2.3,0.25,2.1,palette.dark,0,0.8);for(const x of [-0.7,0.7])box(g,0.3,0.5,0.4,palette.wood,x,1,0.5);
    box(g,1.5,0.15,0.25,palette.red,0,1,-0.3).rotation.z=0.15;
  } else if(type==='wall'||type==='wall-ruin') {
    const ruined=type==='wall-ruin';
    box(g,3.4,ruined?0.35:1.6,0.36,palette.metal,0,ruined?0.7:1.3);
    if(!ruined){for(const x of [-1.2,0,1.2])badges.push(box(g,0.45,0.6,0.36,palette.brass,x,2.2));box(g,3.4,0.15,0.38,palette.dark,0,1.4);}
  } else if(type==='mine') {
    cylinder(g,0.85,1.15,0.6,palette.dark,0,1);part(g,new THREE.OctahedronGeometry(0.45),palette.red,0,1.5);
    for(const x of [-0.8,0.8])box(g,0.3,0.25,0.7,palette.brass,x,1.2,0);
  } else if(type==='shipyard') {
    box(g,2.3,0.3,2.3,palette.metal,0,0.75);
    for(const x of [-0.95,0.95]){box(g,0.22,1.7,0.25,palette.teal,x,1.5,0.6);box(g,0.3,0.25,2.2,palette.brass,x,2.4,0);}
    box(g,2.2,0.25,0.25,palette.brass,0,2.4,0.6);box(g,1.2,0.5,1.8,palette.pale,0,1.05,0);
    cylinder(g,0.1,0.1,0.7,palette.dark,0,1.8,0.6);box(g,0.55,0.2,0.55,palette.brass,0,1.5,0.6);
  } else if(type==='crane') {
    box(g,1.6,0.8,1.3,palette.teal,0,1.1);box(turret,0.3,2,0.35,palette.brass,0,0.6);
    box(turret,0.3,0.25,2.5,palette.brass,0,1.7,0.8);cylinder(turret,0.035,0.035,1.5,palette.dark,0,0.9,1.8,5);
    box(turret,0.35,0.2,0.4,palette.dark,0,0.1,1.8);for(const x of [-0.65,0.65])box(g,0.5,0.5,0.5,palette.wood,x,0.9,-0.6);
  } else if(type==='fishery') {
    for(const x of [-0.9,0.9])for(const z of [-0.9,0.9])cylinder(g,0.08,0.08,1.1,palette.brass,x,1,z,5);
    for(const z of [-0.9,0.9])box(g,2,0.12,0.12,palette.wood,0,1.55,z);
    for(let i=0;i<5;i++)box(g,1.8,0.06,0.08,palette.teal,0,0.75,-0.75+i*0.38);
    box(g,0.5,0.6,0.7,palette.wood,1.1,0.9,0);part(g,new THREE.TorusGeometry(0.4,0.1,4,10),palette.brass,1.1,1.2,0);
    g.userData.cargo=box(g,0.5,0.25,0.5,palette.brass,1.1,1.4,0);
  } else if(type==='farm') {
    g.userData.cropPlants=[];
    for(const z of [-0.65,0.65]){box(g,2.2,0.3,0.7,palette.pale,0,0.9,z);box(g,2,0.12,0.55,palette.dark,0,1.12,z);for(const x of [-0.7,0,0.7])g.userData.cropPlants.push(part(g,new THREE.ConeGeometry(0.22,0.55,5),0x71a678,x,1.42,z));}
    cylinder(g,0.3,0.3,1.4,palette.teal,1.1,1.25,0);box(g,2.3,0.15,0.14,palette.brass,0,1.85,0);
  } else if(type==='laboratory') {
    box(g,1.8,1.2,1.6,palette.pale,0,1.3);box(g,1.2,0.2,1.2,palette.teal,0,2);
    cylinder(turret,0.12,0.15,1.3,palette.brass,0,1.1);const dish=part(turret,new THREE.SphereGeometry(0.8,10,5,0,Math.PI*2,0,Math.PI/2),0x83bdc4,0,1.6);dish.rotation.x=0.5;
    for(const x of [-0.55,0.55])box(g,0.4,0.35,0.08,0x8ec8d8,x,1.4,0.83);
  } else if (type === 'workshop') {
    box(g, 1.75, 1.3, 1.65, palette.pale, 0, 1.4);
    const roof = cylinder(g, 0.8, 1.35, 0.6, palette.red, 0, 2.3, 0, 4); roof.rotation.y = Math.PI / 4;
    box(g, 0.5, 0.18, 0.1, palette.teal, 0, 1.65, 0.86); box(g, 0.18, 0.5, 0.1, palette.teal, 0, 1.65, 0.87);
    box(g, 0.4, 0.6, 0.4, palette.dark, 1, 1.5, -0.5);
  } else if (type === 'shield') {
    cylinder(turret, 0.48, 0.7, 1.3, palette.metal, 0, 0.5);
    part(turret, new THREE.OctahedronGeometry(0.64), 0x8fc7d5, 0, 1.5);
    for (const side of [-1,1]) box(turret, 0.18, 1.4, 0.3, palette.brass, side * 0.8, 0.8);
    const dome = part(g, new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x7ebbc7, 0, 0.5);
    dome.material = material(0x7ebbc7, { transparent: true, opacity: 0.16, depthWrite: false }); dome.castShadow = false;
  } else if (type === 'frost') {
    cylinder(turret, 0.55, 0.8, 0.7, palette.dark, 0, 0.2);
    part(turret, new THREE.OctahedronGeometry(0.75), 0x8ec8d8, 0, 1.1).scale.y = 1.6;
    for (const side of [-1,1]) part(turret, new THREE.OctahedronGeometry(0.32), 0xbbd9df, side * 0.65, 0.55, 0.2);
  } else if (type === 'rail') {
    box(turret, 1.2, 0.7, 1.3, palette.metal, 0, 0.2);
    box(turret, 0.24, 0.25, 2.8, palette.dark, 0, 0.45, 1.1);
    for (let i = 0; i < 4; i++) box(turret, 0.55, 0.45, 0.12, palette.brass, 0, 0.45, 0.5 + i * 0.55);
  } else if (type === 'cannon') {
    box(turret, 1.3, 0.55, 0.9, palette.metal, 0, 0.22);
    for (const x of [-0.34, 0.34]) {
      const barrel = cylinder(turret, 0.14, 0.19, 1.65, palette.dark, x, 0.32, 0.93);
      barrel.rotation.x = Math.PI / 2;
      const tip = cylinder(turret, 0.2, 0.2, 0.2, palette.brass, x, 0.32, 1.72); tip.rotation.x = Math.PI / 2;
    }
    box(turret, 0.62, 0.2, 0.62, palette.brass, 0, 0.63, -0.2);
  } else {
    cylinder(turret, 0.8, 0.9, 0.45, palette.metal, 0, 0.04);
    const barrel = cylinder(turret, 0.38, 0.46, 1.75, palette.dark, 0, 0.85, 0.35); barrel.rotation.x = Math.PI / 5;
    const tip = cylinder(turret, 0.47, 0.47, 0.25, palette.brass, 0, 1.57, 0.85); tip.rotation.x = Math.PI / 5;
    for (const x of [-0.85, 0.85]) box(turret, 0.23, 0.7, 0.9, palette.red, x, 0.1);
  }
  for (let i = 0; i < level; i++) badges.push(box(g, 0.23, 0.16, 0.3, palette.brass, (i - (level - 1) / 2) * 0.35, 0.8, 1.05));
  mergeParts(g,badges);
  g.userData.turret = turret; return g;
}
export function unitModel(type) {
  const g=new THREE.Group(),turret=new THREE.Group();g.add(turret);turret.position.y=0.35;
  const long=type==='gunboat'?3.8:type==='ward'?3.6:type==='torpedo'?3.4:2.8,width=type==='ward'?1.65:type==='gunboat'?1.5:1.2;
  const hull=part(g,new THREE.CylinderGeometry(1,0.7,0.65,6),type==='torpedo'?palette.dark:palette.teal,0,-0.45);hull.scale.set(width,1,long/2);hull.rotation.y=Math.PI/6;
  box(g,width*1.35,0.25,long*0.55,palette.pale,0,-0.1,-0.2);
  box(g,0.7,0.6,0.8,palette.metal,0,0.25,-0.65);box(g,0.55,0.25,0.1,0x8ec8d8,0,0.43,-0.2);
  if(type==='tender'){box(turret,1,0.17,0.22,0xb3e5aa,0,0.8);box(turret,0.22,0.17,1,0xb3e5aa,0,0.8);cylinder(g,0.12,0.12,1.1,palette.brass,0,0.9,-0.6);}
  else if(type==='ward'){
    cylinder(g,0.65,0.75,0.35,0x78d9df,0,0.65,-0.5,6);for(const x of [-0.7,0.7])box(g,0.2,1.3,0.35,palette.brass,x,0.8,-0.5);box(g,1.6,0.18,0.35,palette.brass,0,1.4,-0.5);box(turret,0.18,0.18,0.9,palette.dark,0,0.15,1.1);
    const coverage=new THREE.Mesh(new THREE.RingGeometry(0.985,1,64),material(0x78d9df,{transparent:true,opacity:0.55,side:THREE.DoubleSide,depthWrite:false,depthTest:false}));coverage.rotation.x=Math.PI/2;coverage.position.y=-0.6;coverage.renderOrder=2;coverage.visible=false;coverage.raycast=()=>{};g.add(coverage);g.userData.protection=coverage;
  }
  else if(type==='torpedo'){for(const x of [-0.65,0.65]){const tube=cylinder(g,0.16,0.16,2,palette.brass,x,0,0.2);tube.rotation.x=Math.PI/2;}}
  else {cylinder(turret,0.35,0.45,0.35,palette.metal,0,0,0.65);box(turret,type==='gunboat'?0.28:0.18,0.18,type==='gunboat'?1.8:1.2,palette.dark,0,0.15,1.3);}
  const ring=part(g,new THREE.RingGeometry(1.5,1.62,32),0xb2e8b5,0,-0.65,0,[Math.PI/2,0,0]);ring.material=material(0xb2e8b5,{side:THREE.DoubleSide,depthTest:false});ring.visible=false;ring.renderOrder=3;
  g.userData.selection=ring;g.userData.turret=turret;return g;
}
export function enemyModel(type, bossVariant = null, twinIndex = 0) {
  if (type === 'leviathan' && bossVariant) return bossModel(bossVariant, twinIndex);
  const g = new THREE.Group();
  if(['baseCore','gunTower','generator','seaWall','supplyDepot'].includes(type)) {
    const radius=type==='baseCore'?3:type==='gunTower'?2.2:type==='seaWall'?2.2:1.7;
    cylinder(g,radius,radius*0.8,0.9,palette.darkRock,0,-0.2,0,6);
    cylinder(g,radius*0.9,radius,0.3,palette.wood,0,0.35,0,6);
    if(type==='seaWall') {
      box(g,4.2,1.7,1.2,palette.metal,0,1.25);for(const x of [-1.6,0,1.6])box(g,0.6,0.6,1.4,palette.dark,x,2.35);
    }else if(type==='supplyDepot') {
      for(const x of [-0.65,0.65]){box(g,1,1,1.2,palette.wood,x,1);box(g,0.12,1.08,1.25,palette.brass,x,1);}
      box(g,2.3,0.18,1.7,palette.red,0,1.7);
    }else if(type==='gunTower') {
      cylinder(g,1.1,1.3,2,palette.metal,0,1.35,0,6);
      const turret=new THREE.Group();turret.position.y=2.45;g.add(turret);g.userData.turret=turret;
      cylinder(turret,0.7,0.9,0.65,palette.red,0,0,0,6);
      for(const x of [-0.35,0.35]){const barrel=cylinder(turret,0.16,0.2,2,palette.dark,x,0.15,1.1);barrel.rotation.x=Math.PI/2;}
    }else if(type==='generator') {
      cylinder(g,0.9,1.2,1.7,palette.metal,0,1.3,0,6);
      for(const side of [-1,1])box(g,0.4,1.8,0.5,palette.brass,side*1.2,1.4);
    }else {
      box(g,2.7,2.5,2.7,palette.dark,0,1.75);cylinder(g,1.7,2,0.5,palette.red,0,3.2,0,6);
      for(const side of [-1,1]){cylinder(g,0.14,0.14,2.5,palette.brass,side*1.8,2.7);part(g,new THREE.OctahedronGeometry(0.35),palette.pale,side*1.8,4);}
    }
    if(['generator','baseCore','gunTower'].includes(type)) {
      const indicator=part(g,new THREE.OctahedronGeometry(type==='baseCore'?0.85:0.45),0x97dccc,0,type==='generator'?2.5:type==='baseCore'?3.9:3.2);
      indicator.material=indicator.material.clone();indicator.material.emissive.setHex(0x97dccc);indicator.userData.ownedMaterial=true;g.userData.powerIndicator=indicator;
    }
    g.userData.barHeight=type==='baseCore'?5:type==='seaWall'?3:type==='supplyDepot'?2.5:4;
  }else if (type === 'bomber') {
    const bell = part(g, new THREE.SphereGeometry(1.35, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), 0xdc8d88, 0, 0.8);
    bell.material = material(0xdc8d88, { transparent: true, opacity: 0.72 });
    part(g, new THREE.OctahedronGeometry(0.55), palette.brass, 0, 0.55);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const leg = cylinder(g, 0.07, 0.05, 1.5, palette.red, Math.sin(a) * 0.8, -0.05, Math.cos(a) * 0.8, 5); leg.rotation.z = Math.sin(a) * 0.3; }
  } else if (type === 'skimmer') {
    part(g, new THREE.IcosahedronGeometry(1), palette.teal, 0, 0.45).scale.set(0.6, 0.4, 1.9);
    for (const side of [-1,1]) { const fin = part(g, new THREE.ConeGeometry(1, 0.18, 3), palette.pale, side * 1, 0.35, -0.4); fin.rotation.y = side * 0.3; }
    for (const x of [-0.26, 0.26]) part(g, new THREE.SphereGeometry(0.12, 5, 4), palette.brass, x, 0.55, 1.45);
  } else if (type === 'spitter') {
    part(g, new THREE.DodecahedronGeometry(1.2), palette.teal, 0, 0.25).scale.set(1, 0.6, 1.2);
    cylinder(g, 0.3, 0.6, 1.8, palette.red, 0, 1.1, 0.1);
    const mouth = cylinder(g, 0.32, 0.5, 1.4, palette.dark, 0, 2.05, 0.6); mouth.rotation.x = Math.PI / 3;
    for (const x of [-0.5,0.5]) part(g, new THREE.SphereGeometry(0.18, 6, 5), palette.brass, x, 1.6, 0.6);
  } else if (['tender','bulwark','carrier'].includes(type)) {
    const color=type==='tender'?0x87b7a1:type==='bulwark'?0x828aa9:0xa085b4;
    part(g,new THREE.DodecahedronGeometry(type==='bulwark'?2.3:1.9),color,0,0.6).scale.set(1,0.7,1.2);
    if(type==='tender') {
      cylinder(g,0.15,0.2,3, palette.brass,0,2,0);
      box(g,1.7,0.3,0.35,0xc9e2b0,0,3.1,0);box(g,0.3,1.3,0.35,0xc9e2b0,0,3.1,0);
      for(const x of [-1,1])part(g,new THREE.SphereGeometry(0.45,8,6),0xb4d6c4,x,1.3,0.5);
    } else if(type==='bulwark') {
      for(const x of [-1,1]){box(g,0.4,2.4,3.3, palette.metal,x*2,1.4,0);box(g,0.12,1.5,2.7,0xafc7e2,x*2.25,1.4,0);}
      cylinder(g,1.1,1.4,0.7,palette.brass,0,2,0,6);
    } else {
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;part(g,new THREE.SphereGeometry(0.65,8,6),0xd5afd9,Math.sin(a)*1.8,1.5,Math.cos(a)*1.8);}
      for(const x of [-1,1])box(g,0.2,2.4,0.2,0x76618b,x,-0.5,0);
    }
  } else if (type === 'armored') {
    part(g, new THREE.DodecahedronGeometry(1.9), palette.metal, 0, 0.4).scale.set(1, 0.62, 1.2);
    cylinder(g, 1.3, 1.6, 0.5, palette.dark, 0, 1.15, 0, 6);
    for (const side of [-1,1]) for (let i = 0; i < 3; i++) box(g, 0.9, 0.24, 0.34, palette.brass, side * 1.9, 0.1, (i - 1) * 0.8);
    for (const x of [-0.55,0.55]) box(g, 0.3, 0.15, 0.25, palette.red, x, 0.7, 1.65);
  } else if (type === 'nest') {
    cylinder(g, 3.5, 2.5, 1.7, palette.darkRock, 0, -0.35, 0, 6);
    cylinder(g, 2.8, 3.2, 0.5, palette.wood, 0, 0.6, 0, 6);
    box(g, 2.2, 2, 2.2, palette.dark, 0, 1.7);
    cylinder(g, 1.25, 1.7, 0.65, palette.red, 0, 3, 0, 4).rotation.y = Math.PI / 4;
    for (const x of [-1, 1]) { const barrel = cylinder(g, 0.25, 0.33, 2.7, palette.dark, x, 2, 1.5); barrel.rotation.x = Math.PI / 2; }
    for (const x of [-0.6, 0.6]) box(g, 0.22, 0.65, 0.1, palette.brass, x, 1.8, 1.15);
  } else {
    const huge = type === 'leviathan', scale = huge ? 1.9 : 1;
    part(g, new THREE.IcosahedronGeometry(1.6, 0), huge ? 0x3e5e74 : palette.teal, 0, 0.35).scale.set(1, 0.65, 1.35);
    part(g, new THREE.IcosahedronGeometry(1.1, 0), palette.red, 0, 0.9, -0.5).scale.set(1, 0.55, 1.2);
    for (const x of [-0.6, 0.6]) {
      part(g, new THREE.SphereGeometry(0.23, 6, 5), palette.brass, x, 0.65, 1.43);
      box(g, 0.08, 0.21, 0.1, palette.dark, x, 0.68, 1.63);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const leg = box(g, 1.25, 0.2, 0.3, palette.dark, side * 1.6, 0.05, (i - 1) * 0.85); leg.rotation.y = side * (i - 1) * 0.4;
      part(g, new THREE.ConeGeometry(0.28, 0.95, 4), palette.red, side * 2.1, 0.2, (i - 1) * 0.9, [0, 0, side * -1]);
    }
    if (huge) for (let i = 0; i < 4; i++) part(g, new THREE.ConeGeometry(0.35, 1.2, 4), palette.brass, 0, 1.2, -1.3 + i * 0.6);
    g.scale.setScalar(scale);
  }
  return g;
}
// Each guardian has its own silhouette. These rigs are visual only: the common
// combat radius, telegraphs and damage remain in the game rules.
export function bossModel(variant, twinIndex = 0) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const moving = [], orbiting = [];
  const crystal = (group, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const p = part(group, new THREE.OctahedronGeometry(1), color, x, y, z); p.scale.set(sx, sy, sz); return p;
  };
  const glow = (group, color, radius, x = 0, y = 1, z = 0) => {
    const p = part(group, new THREE.IcosahedronGeometry(radius, 1), color, x, y, z);
    p.material = material(color, { emissive: color, emissiveIntensity: 0.55 }); return p;
  };
  const ring = (group, color, radius, y, tilt = 0) => {
    const p = part(group, new THREE.TorusGeometry(radius, 0.16, 4, 16), color, 0, y, 0, [Math.PI / 2, tilt, 0]); return p;
  };
  const body = (color, sx = 1, sy = 1, sz = 1) => {
    const p = part(rig, new THREE.DodecahedronGeometry(2.7), color, 0, 1, 0); p.scale.set(sx, sy, sz); return p;
  };
  const eyes = (color, x = 1, y = 1.8, z = 2.6) => {
    for (const side of [-1,1]) glow(rig,color,0.24,side*x,y,z);
  };
  if (variant === 'coral') {
    body(0x427f83,1.25,0.65,1.05); eyes(0xffd291,1.2,1.3,2.6);
    for(const side of [-1,1]) {
      const claw=new THREE.Group();claw.position.set(side*2.4,0.8,1.6);rig.add(claw);moving.push(claw);
      box(claw,2.5,0.7,0.7,0x31555d,side*0.9,0,0);
      crystal(claw,0xe28b71,side*2.1,0.1,0.5,0.9,0.7,1.3);
      crystal(claw,0xffc69a,side*2.1,0.1,-0.55,0.8,0.55,0.9);
      for(let i=0;i<3;i++){const leg=box(rig,2.3,0.24,0.35,0x29474f,side*3,0,(i-1)*1.2);leg.rotation.y=side*(i-1)*0.45;}
    }
    for(let i=0;i<5;i++)crystal(rig,0xd78e79,(i-2)*0.65,2.8-Math.abs(i-2)*0.25,-0.5,0.35,0.9,0.45);
  } else if (variant === 'frost') {
    for(let i=0;i<6;i++) {
      const segment=new THREE.Group();segment.position.set(0,0.5,-i*1.4+1.5);rig.add(segment);moving.push(segment);
      const p=part(segment,new THREE.IcosahedronGeometry(1.6-i*0.15),0x548fa4);p.scale.set(1,0.6,1.1);
      crystal(segment,0xc3edf0,0,1.2,0,0.45,1.6-i*0.1,0.45);
    }
    for(const side of [-1,1]){crystal(rig,0xa6d6e2,side*1.3,0.4,1.4,1.3,0.2,1.2);crystal(rig,0xe2f5e8,side*0.7,0.7,3,0.25,0.6,0.7);}
    eyes(0xffdbb1,0.6,1.1,2.8);
  } else if (variant === 'rust') {
    cylinder(rig,2.5,3.2,1.1,0x4b5960,0,0.4,0,6);
    cylinder(rig,2.2,2.6,2.3,0x87684e,0,2.1,0,6);
    cylinder(rig,1.5,2.1,0.7,0xb2a486,0,3.6,0,6);glow(rig,0xf1b267,0.65,0,2.3,2.2);
    for(const side of [-1,1]) {
      box(rig,1.5,1.3,3,0x39454e,side*2.8,1.6,0.8);
      for(let i=0;i<3;i++)box(rig,0.22,0.35,2.7,0xc29465,side*(2.3+i*0.45),2.4,0.8);
      cylinder(rig,0.4,0.5,3.6,0x343d42,side*1.5,3.1,-1.1);
    }
    ring(rig,0xb99e6c,2.8,0.1);
  } else if (variant === 'kelp') {
    body(0x56766d,0.8,0.85,0.8);glow(rig,0xc3d78d,0.85,0,2,0);
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,root=new THREE.Group();root.position.set(Math.sin(a)*1.5,0.6,Math.cos(a)*1.5);root.rotation.y=a;rig.add(root);moving.push(root);
      for(let j=0;j<3;j++){const p=box(root,0.36,0.4,1.8-j*0.2,j%2?0x99a46c:0x345d52,0,Math.sin(j)*0.4,1+j*1.2);p.rotation.x=(j-1)*0.25;}
      crystal(root,0xa1c087,0,0.7,2,0.2,1,0.5);
    }
    for(const side of [-1,1])crystal(rig,0x799857,side*1.5,2.6,-0.4,0.55,1.8,0.4);
  } else if (variant === 'ember') {
    body(0x594b4c,1.4,0.5,1.25);
    cylinder(rig,1.1,2.6,2.5,0x6a4c45,0,2.4,-0.3,7);
    cylinder(rig,1.04,1.04,0.15,0xf19459,0,3.7,-0.3,7);glow(rig,0xffba65,0.7,0,3.9,-0.3);
    for(const side of [-1,1])for(let i=0;i<3;i++){const p=crystal(rig,0x8a6450,side*(2.5+i*0.2),0.35,(i-1)*1.8,1.2,0.5,0.6);p.rotation.z=side*0.2;}
    for(let i=0;i<5;i++)box(rig,0.18,0.15,2.8,0xdb8d55,(i-2)*0.8,1.65,0.2).rotation.y=(i-2)*0.12;
    eyes(0xffbf6e,1.1,0.9,3);
  } else if (variant === 'raider') {
    const hull=body(0x344759,0.95,0.45,2);hull.rotation.z=0.02;
    box(rig,3.6,0.35,8,0x625f57,0,1.5,-0.6);box(rig,2.4,2.5,2,0x76818a,0,2.7,-1.8);
    cylinder(rig,0.15,0.25,6.7,0xbda780,0,4.6,0);
    for(let i=0;i<2;i++){const sail=box(rig,3.6-i,1.4,0.12,0xbed0c7,0,4.5+i*1.8,0);sail.rotation.y=-0.18;}
    for(const side of [-1,1])for(let i=0;i<4;i++){const barrel=cylinder(rig,0.22,0.3,1.8,0xa9b7b7,side*2.1,1.5,(i-1.5)*1.55);barrel.rotation.z=Math.PI/2;}
    glow(rig,0xa5dfd7,0.4,0,2.2,4.6);
  } else if (variant === 'storm') {
    crystal(rig,0x6888aa,0,2.4,0,1.6,2.2,1.6);glow(rig,0xb4e4ec,0.8,0,2.4,0);
    const halo=new THREE.Group();halo.position.y=2.4;rig.add(halo);orbiting.push(halo);ring(halo,0xa6c1dc,3.3,0,0.5);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;crystal(halo,0xd2edf4,Math.sin(a)*3.4,0,Math.cos(a)*3.4,0.45,1.1,0.45);}
    for(const side of [-1,1]){box(rig,0.3,3.8,0.3,0x456071,side*2.8,1.7,0);box(rig,1.3,0.25,0.25,0xe2cfa0,side*2.8,3.4,0);}
  } else if (variant === 'pearl') {
    body(0x768d84,0.9,0.55,1.5);
    for(const side of [-1,1]) {
      const wing=new THREE.Group();wing.position.set(side*1.6,0.7,0);rig.add(wing);moving.push(wing);
      const fin=part(wing,new THREE.ConeGeometry(2.7,0.38,3),0xc6c5a1,side*2,0,-0.8);fin.rotation.y=side*0.5;
      crystal(wing,0x55796e,side*1.7,0.25,-0.6,1.6,0.2,1.7);
    }
    crystal(rig,0x446456,0,0.2,-4,0.3,0.25,2.6);
    for(let i=0;i<5;i++)crystal(rig,0xe8dec0,(i-2)*0.4,0.65,3.7,0.17,0.35,0.3);
    eyes(0xe9c57a,0.7,1.4,2.7);
  } else if (variant === 'black') {
    body(0x253e55,0.8,0.9,1.15);
    for(const side of [-1,1])for(let i=0;i<3;i++){const p=box(rig,0.25,3.6,0.3,0x3c576e,side*(2+i*0.4),0.3,(i-1)*1.3);p.rotation.z=side*0.55;}
    const lure=new THREE.Group();rig.add(lure);moving.push(lure);
    cylinder(lure,0.09,0.13,3.8,0x699baf,0,4,0);box(lure,0.2,0.2,2.3,0x699baf,0,5.8,1);glow(lure,0xa4ece8,0.6,0,5.5,2.1);
    for(let i=0;i<7;i++)crystal(rig,0xaac2c7,(i-3)*0.4,0.6,2.4,0.14,0.7,0.3);
    eyes(0xbed8ed,0.8,2.1,2);
  } else if (variant === 'relic') {
    const eye=new THREE.Group();eye.position.y=2.5;rig.add(eye);
    const frame=ring(eye,0xb7a47d,2.7,0);frame.rotation.x=0;
    part(eye,new THREE.SphereGeometry(1.85,12,8),0x617d82,0,0,0).scale.z=0.4;
    glow(eye,0xe4d393,0.7,0,0,0.85);box(eye,0.23,1.1,0.12,0x263d46,0,0,1.4);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,p=box(eye,0.8,0.8,1.2,0x5d6868,Math.sin(a)*3.1,Math.cos(a)*3.1,0);p.rotation.z=-a;}
    const halo=new THREE.Group();rig.add(halo);orbiting.push(halo);ring(halo,0xcbbb8c,3.8,0.1);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;crystal(halo,0xb4c4b5,Math.sin(a)*3.8,0.5,Math.cos(a)*3.8,0.4,0.6,0.4);}
  } else if (variant === 'aurora') {
    const color=twinIndex%2?0x9a8dbb:0x76b7ab,accent=twinIndex%2?0xd8c7ed:0xbcebdd;
    crystal(rig,color,0,1,0,1.5,0.8,3);eyes(accent,0.6,1.4,2.1);
    for(const side of [-1,1]) {
      const wing=new THREE.Group();wing.position.set(side*1.2,1,0);rig.add(wing);moving.push(wing);
      for(let i=0;i<3;i++){const p=crystal(wing,i%2?accent:color,side*(1.2+i*0.6),i*0.18,-i*1.3,1.3,0.22,1.8);p.rotation.y=side*0.65;}
    }
    const halo=new THREE.Group();rig.add(halo);orbiting.push(halo);ring(halo,accent,2.7,2.4,0.35);
  } else {
    body(0x725c87,0.8,0.8,0.8);glow(rig,0xe6bde2,1.3,0,2,0);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,p=crystal(rig,i%2?0xb2a2c9:0x557e93,Math.sin(a)*3.4,0.7,Math.cos(a)*3.4,0.6,0.55,1.7);p.rotation.y=a;}
    for(let i=0;i<3;i++){const halo=new THREE.Group();halo.position.y=2;halo.rotation.x=i*0.65;rig.add(halo);orbiting.push(halo);ring(halo,[0xd1b4d7,0x9cc7d1,0xbccba5][i],3.2+i*0.45,0,i*0.4);}
  }
  const bounds=new THREE.Box3().setFromObject(g);
  g.userData.boss={variant,rig,moving,orbiting,height:bounds.max.y+0.6};
  return g;
}
export function animateBoss(model, time, phase = 1, warning = false) {
  const b=model.userData.boss;if(!b)return;
  const tempo=phase===2?1.6:1;
  b.rig.position.y=Math.sin(time*1.4*tempo)*0.15;
  b.rig.scale.setScalar(warning?1.035+Math.sin(time*11)*0.018:1);
  b.moving.forEach((p,i)=>{p.rotation.z=Math.sin(time*2*tempo+i*0.9)*(b.variant==='frost'?0.08:0.13);});
  b.orbiting.forEach((p,i)=>{p.rotation.y=time*(i%2?-1:1)*0.25*tempo;});
}
export function terrainModel(theme, seed = 0) {
  const g = new THREE.Group();
  const colors = { ice: 0xb8d9d9, industrial: 0x676b62, kelp: 0x628675, volcanic: 0x69544d, fortress: 0x777b79, abyss: 0x4c6373, relic: 0xa8a185, aurora: 0x799d94, heart: 0x89778a };
  const color = colors[theme] || palette.sand;
  cylinder(g, 4.3, 2.3, 3, palette.darkRock, 0, -1, 0, 6);
  cylinder(g, 4.2, 4.4, 0.5, color, 0, 0.7, 0, 6);
  if (theme === 'volcanic') {
    cylinder(g, 0.9, 3.5, 3.7, 0x5b4745, 0, 2.5, 0, 7); cylinder(g, 0.85, 0.85, 0.15, 0xdf8661, 0, 4.35, 0, 7);
  } else if (theme === 'ice') {
    for (let i = 0; i < 5; i++) part(g, new THREE.ConeGeometry(0.8, 2.3 + i * 0.4, 4), 0xc7e5e3, Math.sin(i * 2) * 2, 1.7, Math.cos(i * 2) * 2);
  } else if (['industrial','fortress','relic'].includes(theme)) {
    for (let i = 0; i < 3; i++) box(g, 0.8, 2 + i * 0.7, 1, palette.dark, (i-1)*1.8, 1.8 + i*0.3, 0);
    cylinder(g, 0.1, 0.2, 4, palette.brass, 0.9, 2.8, -1.2);
  } else {
    for (let i = 0; i < 4; i++) { const tree = decorationModel(seed + i); tree.position.set(Math.sin(i * 2.6) * 2.5, 0.7, Math.cos(i * 2.6) * 2.5); tree.scale.setScalar(1.1); g.add(tree); }
  }
  return g;
}
export function decorationModel(seed) {
  const g = new THREE.Group();
  cylinder(g, 0.1, 0.14, 1.1, palette.wood, 0, 0.9);
  part(g, new THREE.ConeGeometry(0.65, 1.6, 5), seed % 2 ? 0x577f6c : 0x6f8d66, 0, 1.7);
  part(g, new THREE.DodecahedronGeometry(0.35, 0), palette.rock, 0.7, 0.55, 0.1);
  return g;
}
