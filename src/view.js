import * as THREE from 'three';
import {visibleProjection} from './fleet-selection.js';
import { balance, facilityPosition, weaponStats, keyOf, expansionSlots, sitesFor } from './game.js';
import {wallEdges,wallEdge} from './walls.js';
import { getChapter, getMission } from './campaign-content.js';
import {structureHull} from './fortifications.js';
import {fixedEnemyRadius,basePower,powerConnections} from './siege-content.js';
import { material, tileModel, coreModel, facilityModel, unitModel, enemyModel, animateBoss, decorationModel, terrainModel } from './models.js';
import {TileBatch} from './tile-batch.js';
import {inspectedContact} from './combat-inspector.js';
import {enemyProtectionRadius} from './enemy-ai.js';
const oceanColor=new THREE.Color(0x276a84);

export class GameView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x689ca0); container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D 바다와 부유섬. 시설은 타일을 클릭해 배치합니다.');
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x689ca0, 110, 270);
    this.camera = new THREE.OrthographicCamera(-30, 30, 24, -24, 0.1, 450);
    this.zoom = 29; this.yaw = 0.52; this.target = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight(0xe5f3eb, 0x537782, 2.6));
    const sun = new THREE.DirectionalLight(0xffe6b5, 3.2); sun.position.set(-30, 65, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 200 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; this.scene.add(sun); this.sun = sun; this.scene.add(sun.target);
    const seaGeo = new THREE.PlaneGeometry(600, 600, 100, 100); seaGeo.rotateX(-Math.PI / 2);
    this.waterTime = { value: 0 };
    const seaMaterial = new THREE.MeshStandardMaterial({ color: 0x337f91, roughness: 0.45, metalness: 0.18, flatShading: true });
    seaMaterial.onBeforeCompile = shader => {
      shader.uniforms.waterTime = this.waterTime;
      shader.vertexShader = 'varying vec2 oceanXZ;\nuniform float waterTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\noceanXZ = position.xz;\ntransformed.y += sin(position.x * 0.17 + waterTime * 0.8) * cos(position.z * 0.16 + waterTime * 0.4) * 0.17;');
      shader.fragmentShader = 'varying vec2 oceanXZ;\nuniform float waterTime;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float swell = sin(oceanXZ.x * 0.09 + waterTime * 0.25) * cos(oceanXZ.y * 0.13 + waterTime * 0.18);
        float crest = smoothstep(0.94, 1.0, sin(oceanXZ.x * 0.38 + oceanXZ.y * 0.47 + waterTime * 0.8 + sin(oceanXZ.y * 0.25) * 1.2));
        diffuseColor.rgb *= 0.9 + swell * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.77, 0.75), crest * 0.16);
      `);
    };
    this.sea = new THREE.Mesh(seaGeo, seaMaterial);
    this.sea.position.y = -1.65; this.sea.receiveShadow = true; this.scene.add(this.sea);
    this.seaPositions = seaGeo.attributes.position;
    // Sparse foam dashes; stable procedural placement, no texture downloads.
    this.foam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1,0.08),material(0xafd0c5,{transparent:true,opacity:0.24,depthWrite:false}),240);
    const foamTransform=new THREE.Object3D();foamTransform.rotation.x=-Math.PI/2;
    for (let i = 0; i < 240; i++) {
      foamTransform.position.set(Math.sin(i*127.3)*140,-1.42,Math.cos(i*73.4)*140);foamTransform.scale.set(1.3+i%4,1,1);foamTransform.updateMatrix();this.foam.setMatrixAt(i,foamTransform.matrix);
    }
    this.scene.add(this.foam);
    this.island = new THREE.Group(); this.scene.add(this.island);
    this.tileBatch=new TileBatch(balance.tileSize);this.island.add(this.tileBatch.group);
    this.tiles = new Map(); this.facilities = new Map(); this.enemies = new Map(); this.bars = new Map(); this.effects = [];
    this.units=new Map();this.unitBars=new Map();this.commandMarkers=new THREE.Group();this.scene.add(this.commandMarkers);this.focusUnits=false;
    this.contactRings=[0.10,0.006,0.008].map((width,i)=>{const ring=new THREE.Mesh(new THREE.RingGeometry(1-width,1,80),new THREE.MeshBasicMaterial({color:i===2?0x8ecfd3:i?0xefb386:0xf2a07d,transparent:true,opacity:i?0.55:0.8,side:THREE.DoubleSide,depthWrite:false,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.renderOrder=3;ring.visible=false;this.scene.add(ring);return ring;});
    this.structureBars=new Map();
    const linkGeometry=new THREE.BufferGeometry();linkGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(256*6),3));linkGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(256*6),3));linkGeometry.setDrawRange(0,0);
    this.powerLinks=new THREE.LineSegments(linkGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.65,depthWrite:false}));this.powerLinks.frustumCulled=false;this.scene.add(this.powerLinks);
    this.core = coreModel(); this.island.add(this.core);
    this.decoration = new THREE.Group(); this.island.add(this.decoration);
    this.ghosts = new THREE.Group(); this.island.add(this.ghosts);
    this.range = new THREE.Mesh(new THREE.RingGeometry(19.88, 20, 80), new THREE.MeshBasicMaterial({ color: 0xf4d395, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, depthTest:false }));
    this.range.rotation.x = -Math.PI / 2; this.range.position.y = 0.56; this.range.renderOrder=-1; this.range.visible = false; this.scene.add(this.range);
    this.selection = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.07, 3.18), new THREE.MeshBasicMaterial({ color: 0xffdf91, transparent: true, opacity: 0.35, depthWrite: false }));
    this.selection.position.y = 0.46; this.selection.visible = false; this.island.add(this.selection);
    this.markers = balance.sites.map(s => this.createMarker(s));
    this.markerKey = balance.sites.map(s => s.id).join(',');
    this.scenery = new THREE.Group(); this.scene.add(this.scenery); this.warningMeshes = new Map();
    this.barrier = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 12), new THREE.MeshBasicMaterial({ color: 0x90d5e1, transparent: true, opacity: 0.15, wireframe: true, depthWrite: false }));
    this.scene.add(this.barrier); this.barrier.visible = false; this.ally = null; this.allyBar = null;
    this.homeMarker = this.createMarker({ x: 0, z: 0, name: '정박지', label: '⌂', tier: 0 });
    this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.resize(); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
  }
  createMarker(site) {
    const group = new THREE.Group(); group.position.set(site.x, -1.15, site.z);
    const color = site.tier === 3 ? 0xe8957e : site.tier === 2 ? 0xe4bd78 : 0xc3ded0;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
    ring.userData.ownedMaterial = true;
    ring.rotation.x = -Math.PI / 2; group.add(ring);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#143740d9'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 112, 24); ctx.fill();
    ctx.fillStyle = '#f2e5c6'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${site.label}  ${site.name}`, 256, 69);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.userData.ownedMaterial = true;
    sprite.position.y = 5.5; sprite.scale.set(10.5, 2.3, 1); group.add(sprite); this.scene.add(group); return group;
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); const aspect = w / h;
    this.camera.left = -this.zoom * aspect; this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom; this.camera.bottom = -this.zoom; this.camera.updateProjectionMatrix();
  }
  pick(clientX, clientY, tool=null) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    if(!tool){
      const structure=this.raycaster.intersectObjects([...this.facilities.values()],true)[0];
      if(structure){let mesh=structure.object;while(mesh&&!mesh.userData.facilityId)mesh=mesh.parent;if(mesh)return {...mesh.userData.tile,facilityId:mesh.userData.facilityId};}
    }
    const hit = this.raycaster.intersectObjects([...this.tiles.values(), this.ghosts], true).find(h => h.object.userData.tile);
    if(!hit)return null;
    const tile=hit.object.userData.tile,local=this.island.worldToLocal(hit.point.clone()),dx=local.x-tile.x*balance.tileSize,dz=local.z-tile.z*balance.tileSize;
    return {...tile,edge:Math.abs(dx)>Math.abs(dz)?(dx>0?'east':'west'):(dz>0?'south':'north')};
  }
  projectTile(x, z) {
    const p = new THREE.Vector3(x * balance.tileSize, 0.4, z * balance.tileSize); this.island.localToWorld(p); p.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }
  projectWorld(point) {
    const p=new THREE.Vector3(point.x,point.y ?? 0,point.z).project(this.camera),r=this.renderer.domElement.getBoundingClientRect();
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  }
  visibleUnitIds(g) {
    const p=new THREE.Vector3();
    return (g.fleet?.units||[]).filter(u=>u.hp>0&&visibleProjection(p.set(u.x,0.6,u.z).project(this.camera))).map(u=>u.id);
  }
  pointAt(clientX,clientY) {
    const r=this.renderer.domElement.getBoundingClientRect();this.mouse.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.mouse,this.camera);
    const point=this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());return point?{x:point.x,z:point.z}:null;
  }
  pickCombat(clientX,clientY) {
    this.pointAt(clientX,clientY);
    const hits=this.raycaster.intersectObjects([...this.units.values(),...this.enemies.values()],true);
    for(const hit of hits){let obj=hit.object;while(obj){if(obj.userData.unit!==undefined)return {unit:obj.userData.unit};if(obj.userData.enemy!==undefined)return {enemy:obj.userData.enemy};obj=obj.parent;}}
    return null;
  }
  reset() {
    this.tileBatch.clear();
    for (const map of [this.tiles, this.facilities, this.enemies, this.bars,this.units,this.unitBars,this.structureBars]) { for (const mesh of map.values()) this.release(mesh); map.clear(); }
    this.clearGroup(this.commandMarkers);this.focusUnits=false;this.commandKey='';this.mapFocus=null;
    for(const ring of this.contactRings)ring.visible=false;
    this.clearGroup(this.decoration); this.clearGroup(this.ghosts);
    for (const e of this.effects) this.release(e.mesh); this.effects = [];
    this.target.set(0, 0, 0); this.lastGhostKey = '';
    this.needsSnap = true;
    this.markerKey = null;
  }
  // Shared cached materials stay alive. Dynamic geometry/textures are disposed.
  release(obj) {
    obj.removeFromParent(); obj.traverse(n => {
      n.geometry?.dispose();
      if (n.userData.ownedMaterial) { n.material.map?.dispose(); n.material.dispose(); }
    });
  }
  clearGroup(g) { for (const obj of [...g.children]) this.release(obj); }
  healthBar(e,color=0xf2a58a) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.34), new THREE.MeshBasicMaterial({ color: 0x163c46, depthTest: false })); bg.userData.ownedMaterial = true; g.add(bg);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.2), new THREE.MeshBasicMaterial({ color, depthTest: false })); fill.position.z = 0.02; fill.userData.ownedMaterial = true; g.add(fill);
    g.userData.fill = fill; this.scene.add(g); return g;
  }
  event(event) {
    if (event.type === 'shot' || event.type === 'enemyShot') {
      const mortar = event.weapon === 'mortar';
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(mortar ? 0.27 : 0.14, 6, 5), material(event.type === 'enemyShot' ? 0xee987b : 0xffdf8d, { emissive: event.type === 'enemyShot' ? 0xad3820 : 0xc68b31, emissiveIntensity: 0.7 }));
      this.scene.add(mesh); this.effects.push({ mesh, event, age: 0, life: mortar ? 0.55 : 0.24, kind: 'projectile' });
    } else if (event.type === 'pulse') {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(7.6,8,48), new THREE.MeshBasicMaterial({color:0xb5dce0,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false}));
      mesh.rotation.x=-Math.PI/2; mesh.position.set(event.x,-0.9,event.z); mesh.userData.ownedMaterial=true;
      this.scene.add(mesh); this.effects.push({mesh,age:0,life:0.65,kind:'burst'});
    } else if (['hit', 'kill', 'build'].includes(event.type)) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(event.type === 'kill' ? 1.5 : 0.6, 0), new THREE.MeshBasicMaterial({ color: event.type === 'kill' ? 0xffc979 : event.type === 'build' ? 0xd5eebd : 0xf8bc92, transparent: true, opacity: 0.8, wireframe: event.type === 'build' }));
      mesh.position.set(event.x, 0.9, event.z); mesh.userData.ownedMaterial = true;
      this.scene.add(mesh); this.effects.push({ mesh, age: 0, life: event.type === 'kill' ? 0.8 : 0.3, kind: 'burst' });
    }
  }
  render(g, ui, dt) {
    this.waterTime.value = g.time;
    const sites = sitesFor(g);
    const markerKey = `${g.campaign?.missionId || (g.campaign ? 'harbor' : 'training')}:${sites.map(s => s.id).join(',')}`;
    if (markerKey !== this.markerKey) {
      this.markerKey = markerKey;
      for (const m of this.markers) this.release(m);
      this.markers = sites.map(s => this.createMarker(s)); this.clearGroup(this.scenery);
      if (this.ally) this.release(this.ally); if (this.allyBar) this.release(this.allyBar); this.ally = null; this.allyBar = null;
      if (g.campaign) {
        const chapter = getChapter(g);
        this.sea.material.color.set(chapter.color).lerp(oceanColor,0.78);
        const landscape = sites.length ? sites : [{x:-32,z:-20},{x:32,z:-42},{x:-45,z:-64},{x:45,z:-86}];
        for (const [i,p] of landscape.entries()) {
          const model = terrainModel(chapter.theme, i); model.position.set(p.x+(i%2?13:-13), 0, p.z+12); this.scenery.add(model);
        }
        if (getMission(g.campaign.missionId)?.kind === 'defend') {
          this.ally = coreModel(); this.ally.position.set(sites[0].x, 0, sites[0].z); this.ally.scale.setScalar(1.5); this.scene.add(this.ally);
          this.allyBar = this.healthBar();
        }
      } else this.sea.material.color.set(0x337f91);
    }
    for (const event of g.events.splice(0)) this.event(event);
    this.island.position.set(g.island.x, Math.sin(g.time * 1.7) * 0.12, g.island.z);
    this.core.userData.fan.rotation.z = g.time * 0.7;
    for (const t of g.tiles) if (!this.tiles.has(keyOf(t.x, t.z))) {
      const mesh = tileModel(t.x, t.z, balance.tileSize);mesh.visible=false;this.tiles.set(keyOf(t.x, t.z), mesh); this.island.add(mesh);
      if ((Math.abs(t.x) + Math.abs(t.z)) >= 2 && !g.facilities.some(f => f.x === t.x && f.z === t.z)) {
        const d = decorationModel(t.x * 7 + t.z); d.position.set(t.x * balance.tileSize + 0.85, 0, t.z * balance.tileSize - 0.7); d.scale.setScalar(0.55); d.userData.tile = keyOf(t.x, t.z); this.decoration.add(d);
      }
    }
    this.tileBatch.sync(g.tiles);
    for (const d of this.decoration.children) d.visible = !g.facilities.some(f => keyOf(f.x, f.z) === d.userData.tile);
    for (const [id, mesh] of this.facilities) if (!g.facilities.some(f => f.id === id)) { this.release(mesh); this.facilities.delete(id); }
    for (const f of g.facilities) {
      let mesh = this.facilities.get(f.id);
      if (!mesh || mesh.userData.level !== f.level || mesh.userData.destroyed!==(f.hp===0)) {
        if (mesh) this.release(mesh); mesh = facilityModel(f.hp===0?(f.type==='wall'?'wall-ruin':'ruin'):f.type, f.level);mesh.userData.destroyed=f.hp===0; mesh.userData.level = f.level; this.facilities.set(f.id, mesh); this.island.add(mesh);
      }
      const position=facilityPosition(g,f);mesh.position.set(position.x-g.island.x,0,position.z-g.island.z);
      mesh.rotation.y=f.type==='wall'?wallEdges[wallEdge(f)].rotation:0;
      mesh.userData.tile={x:f.x,z:f.z};mesh.userData.facilityId=f.id;mesh.userData.turret.rotation.y = f.aim;
      if(f.type==='laboratory')mesh.userData.turret.rotation.y=g.time*0.45;
      if(mesh.userData.cargo)mesh.userData.cargo.visible=f.stock>0;
      for(const plant of mesh.userData.cropPlants || []){plant.scale.y=0.45+(f.stock>0?0.75:(f.cropProgress || 0)*0.25);plant.position.y=1.12+0.275*plant.scale.y;}
      let bar=this.structureBars.get(f.id);
      if(f.hp!==undefined){if(!bar){bar=this.healthBar(f,0xdec78d);bar.scale.setScalar(0.65);this.structureBars.set(f.id,bar);}const p=facilityPosition(g,f),ratio=f.hp/structureHull(f);bar.position.set(p.x,3.7,p.z);bar.quaternion.copy(this.camera.quaternion);bar.visible=!!g.operation||ratio<1;bar.userData.fill.scale.x=ratio;bar.userData.fill.position.x=-(1-ratio)*1.75;}
    }
    for(const [id,bar] of this.structureBars)if(!g.facilities.some(f=>f.id===id)){this.release(bar);this.structureBars.delete(id);}
    const living = new Set(g.enemies.filter(e=>e.hp>0).map(e=>e.id));
    for(const map of [this.enemies,this.bars])for(const [id,mesh] of map)if(!living.has(id)){this.release(mesh);map.delete(id);}
    for (const e of g.enemies) {
      let mesh = this.enemies.get(e.id), bar = this.bars.get(e.id);
      if (e.hp <= 0) { if (mesh) { this.release(mesh); this.enemies.delete(e.id); } if (bar) { this.release(bar); this.bars.delete(e.id); } continue; }
      if (!mesh) { mesh = enemyModel(e.type, g.campaign ? getChapter(g).id : null, Number(e.id.split('-').at(-1)) || 0);mesh.userData.enemy=e.id; this.enemies.set(e.id, mesh); this.scene.add(mesh); bar = this.healthBar(e); this.bars.set(e.id, bar); }
      mesh.position.set(e.x, fixedEnemyRadius(e)>0 ? 0 : Math.sin(g.time * 3 + e.x) * 0.16, e.z);
      if (e.active) {const closest=(g.fleet?.units || []).filter(u=>u.hp>0).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0],target=closest||g.island,angle=Math.atan2(target.x-e.x,target.z-e.z);if(mesh.userData.turret)mesh.userData.turret.rotation.y=angle;else if(!fixedEnemyRadius(e))mesh.rotation.y=angle;}
      if(mesh.userData.powerIndicator){const light=mesh.userData.powerIndicator,powered=e.type==='generator'||basePower(g,e)>0;light.visible=!e.captured;light.material.color.setHex(powered?0x97dccc:0x9b7771);light.material.emissiveIntensity=powered?0.7+Math.sin(g.time*3)*0.2:0;}
      animateBoss(mesh,g.time,e.bossPhase,!!e.windup);
      bar.position.set(e.x, mesh.userData.barHeight || mesh.userData.boss?.height || (e.type === 'leviathan' ? 4.5 : e.type === 'nest' ? 4 : 2.4), e.z); bar.quaternion.copy(this.camera.quaternion);
      bar.visible = !e.captured&&(e.active || e.hp < e.maxHp || !!g.operation); const ratio = e.hp / e.maxHp; bar.userData.fill.scale.x = ratio; bar.userData.fill.position.x = -(1 - ratio) * 1.75;
    }
    const links=powerConnections(g),linkKey=links.map(({generator,target})=>`${generator.id}:${target.id}:${generator.powerBus||'legacy'}`).join('|');
    if(linkKey!==this.powerLinkKey){this.powerLinkKey=linkKey;const positions=this.powerLinks.geometry.attributes.position,colors=this.powerLinks.geometry.attributes.color;
      for(const [i,{generator,target}]of links.slice(0,256).entries()){
        positions.setXYZ(i*2,generator.x,1.5,generator.z);positions.setXYZ(i*2+1,target.x,1.5,target.z);
        const color=generator.powerBus==='west'?[0.95,0.7,0.3]:[0.59,0.86,0.8];for(const v of [i*2,i*2+1])colors.setXYZ(v,...color);
      }
      positions.needsUpdate=true;colors.needsUpdate=true;this.powerLinks.geometry.setDrawRange(0,Math.min(256,links.length)*2);
    }this.powerLinks.visible=links.length>0;
    this.markers.forEach((m, i) => { m.visible = !g.sites[i]?.cleared && (g.operation?.kind==='explore'?g.operation.visible.includes(sites[i].id):!g.campaign || i===g.campaign.objectiveIndex || i===g.campaign.objectiveIndex+1); });
    const units=(g.fleet?.units || []).filter(u=>u.hp>0),unitIds=new Set(units.map(u=>u.id));
    const contact=inspectedContact(g,ui);
    for(const [i,ring] of this.contactRings.entries()){ring.visible=!!contact&&(i===0||i===1&&contact.stats.range>0||i===2&&!!contact.shield);if(contact){const source=i===2?contact.shield:contact.enemy;if(source){ring.position.set(source.x,-0.45,source.z);ring.scale.setScalar(i===2?enemyProtectionRadius:i?contact.stats.range:fixedEnemyRadius(contact.enemy)||2.4);}}}
    for(const map of [this.units,this.unitBars])for(const [id,mesh] of map)if(!unitIds.has(id)){this.release(mesh);map.delete(id);}
    for(const u of units) {
      let mesh=this.units.get(u.id),bar=this.unitBars.get(u.id);
      if(!mesh){mesh=unitModel(u.type);mesh.userData.unit=u.id;this.units.set(u.id,mesh);this.scene.add(mesh);bar=this.healthBar(u,0xa9dfa7);bar.scale.setScalar(0.7);this.unitBars.set(u.id,bar);}
      mesh.position.set(u.x,Math.sin(g.time*3+u.id)*0.08,u.z);mesh.rotation.y=u.heading;mesh.userData.turret.rotation.y=u.aim-u.heading;mesh.userData.selection.visible=ui.selectedUnits?.includes(u.id);
      bar.position.set(u.x,2.3,u.z);bar.quaternion.copy(this.camera.quaternion);bar.visible=!!ui.commandMode||u.hp<u.maxHp;
      const ratio=u.hp/u.maxHp;bar.userData.fill.scale.x=ratio;bar.userData.fill.position.x=-(1-ratio)*1.75;
    }
    const commanded=units.filter(u=>ui.selectedUnits?.includes(u.id)&&['move','attackMove','attack','guard'].includes(u.command.type));
    const commandKey=JSON.stringify(commanded.map(u=>[u.id,u.command,u.orders]));
    if(commandKey!==this.commandKey) {
      this.commandKey=commandKey;this.clearGroup(this.commandMarkers);
      for(const u of commanded){
        const orders=[u.command,...u.orders||[]];
        for(const [index,order] of orders.entries()){
          const ring=new THREE.Mesh(new THREE.RingGeometry(index?0.4:0.7,index?0.6:0.9,24),new THREE.MeshBasicMaterial({color:order.type==='attack'?0xef9c83:order.type==='attackMove'?0xf5d48b:order.type==='guard'?0x8ecfd3:0xb5e6b0,side:THREE.DoubleSide,depthTest:false}));
          Object.assign(ring.userData,{ownedMaterial:true,unit:u.id,orderIndex:index});ring.rotation.x=-Math.PI/2;ring.renderOrder=3;this.commandMarkers.add(ring);
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((orders.length+1)*3),3));
        const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xb5e6b0,transparent:true,opacity:0.65,depthTest:false}));
        Object.assign(line.userData,{ownedMaterial:true,unit:u.id,route:true});line.frustumCulled=false;line.renderOrder=2;this.commandMarkers.add(line);
      }
    }
    for(const mesh of this.commandMarkers.children){
      const u=units.find(u=>u.id===mesh.userData.unit),orders=[u.command,...u.orders||[]],destination=order=>order?.type==='attack'?g.enemies.find(e=>e.id===order.target&&e.hp>0&&!e.captured):order?.type==='guard'?units.find(other=>other.id===order.target):order;
      if(mesh.userData.route){const points=[u,...orders.map(destination).filter(Boolean)],positions=mesh.geometry.attributes.position;for(const [index,p] of points.entries())positions.setXYZ(index,p.x,-0.6,p.z);positions.needsUpdate=true;mesh.geometry.setDrawRange(0,points.length);}
      else {const point=destination(orders[mesh.userData.orderIndex]);mesh.visible=!!point;if(point)mesh.position.set(point.x,-0.6,point.z);}
    }
    this.homeMarker.visible = Math.hypot(g.island.x,g.island.z)>14;
    const selected = g.facilities.find(f => f.id === ui.selected);
    this.range.visible = !!selected;
    if (selected) { const p = facilityPosition(g, selected), r = weaponStats(selected, g).range; this.range.position.set(p.x, 0.56, p.z); this.range.scale.setScalar(r / 20); }
    this.barrier.visible = !!g.campaign && (g.campaign.barrierSeconds > 0 || g.campaign.braceSeconds>0);
    this.barrier.position.set(g.island.x, 0, g.island.z);
    if (this.allyBar) {
      const p = g.campaign.allyPosition || sites[0]; this.allyBar.position.set(p.x, 6, p.z); this.allyBar.quaternion.copy(this.camera.quaternion);
      this.ally.visible=this.allyBar.visible=g.campaign.expeditionVersion===2?!!g.campaign.allyPosition:true;
      this.ally.position.set(p.x,0,p.z);
      const ratio = g.campaign.allyHull / g.campaign.allyMaxHull; this.allyBar.userData.fill.scale.x = ratio; this.allyBar.userData.fill.position.x = -(1-ratio)*1.75;
    }
    const warnings = g.campaign ? [...g.campaign.hazards, ...g.enemies.filter(e => e.hp > 0 && e.windup).flatMap(e => (e.windup.zones||[e.windup]).map((z,i)=>({id:`${e.id}-${i}`, ...z,remaining:e.windup.remaining})))] : [];
    for (const [id, mesh] of this.warningMeshes) if (!warnings.some(w => w.id === id)) { this.release(mesh); this.warningMeshes.delete(id); }
    for (const warning of warnings) {
      let mesh = this.warningMeshes.get(warning.id);
      if (!mesh) {
        const color=['frost','current','tide'].includes(warning.kind)?0x9acbdd:['fog','pulse'].includes(warning.kind)?0xb5a0dd:0xed7e68;
        mesh=new THREE.Mesh(new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.2,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
        const edge=new THREE.Mesh(new THREE.RingGeometry(0.96,1.02,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
        edge.userData.ownedMaterial=true;edge.renderOrder=mesh.renderOrder=-1;mesh.add(edge);
        mesh.rotation.x=-Math.PI/2;mesh.userData.ownedMaterial=true;this.warningMeshes.set(warning.id,mesh);this.scene.add(mesh);
      }
      // Large islands must not hide warnings beneath their deck.
      mesh.position.set(warning.x, 0.62, warning.z); mesh.scale.setScalar(warning.radius); mesh.material.opacity = 0.1 + (Math.sin(g.time * 14) + 1) * 0.08;
    }
    const movingWall=ui.tool==='move'&&g.facilities.find(f=>f.id===ui.moving)?.type==='wall';
    const wallPreview=ui.hover&&(ui.tool==='wall'||movingWall)?{type:'wall',...ui.hover}:!ui.tool&&selected?.type==='wall'?selected:null;
    this.selection.visible = !!ui.hover||!!wallPreview;
    if(wallPreview){const p=facilityPosition(g,wallPreview);this.selection.position.set(p.x-g.island.x,0.55,p.z-g.island.z);this.selection.rotation.y=wallEdges[wallEdge(wallPreview)].rotation;this.selection.scale.set(3.4/3.18,1,0.42/3.18);}
    else if(ui.hover){this.selection.position.set(ui.hover.x*balance.tileSize,0.47,ui.hover.z*balance.tileSize);this.selection.rotation.y=0;this.selection.scale.set(1,1,1);}
    const ghostKey = ui.tool === 'expand' ? g.tiles.length : 'none';
    if (this.lastGhostKey !== ghostKey) {
      this.lastGhostKey = ghostKey; this.clearGroup(this.ghosts);
      if (ui.tool === 'expand') for (const t of expansionSlots(g)) {
        const ghost = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.1, 3.18), new THREE.MeshBasicMaterial({ color: 0xffd78d, transparent: true, opacity: 0.27, depthWrite: false }));
        ghost.userData.ownedMaterial = true; ghost.position.set(t.x * balance.tileSize, 0.15, t.z * balance.tileSize); ghost.userData.tile = t; this.ghosts.add(ghost);
      }
    }
    for (const effect of this.effects) {
      effect.age += dt; const t = Math.min(1, effect.age / effect.life);
      if (effect.kind === 'projectile') {
        const e = effect.event; effect.mesh.position.set(e.x + (e.tx - e.x) * t, 1.6 + Math.sin(t * Math.PI) * (e.weapon === 'mortar' ? 7 : 0.3), e.z + (e.tz - e.z) * t);
      } else { effect.mesh.scale.setScalar(1 + t * 2.5); effect.mesh.material.opacity = 0.8 * (1 - t); effect.mesh.rotation.y += dt * 3; }
    }
    this.effects = this.effects.filter(e => { if (e.age >= e.life) { this.release(e.mesh); return false; } return true; });
    if (this.needsSnap) { this.target.set(g.island.x,0,g.island.z); this.needsSnap=false; }
    const selectedUnits=units.filter(u=>ui.selectedUnits?.includes(u.id));
    const focus=ui.fleetFocus&&selectedUnits.length?{x:selectedUnits.reduce((n,u)=>n+u.x,0)/selectedUnits.length,z:selectedUnits.reduce((n,u)=>n+u.z,0)/selectedUnits.length}:this.mapFocus || g.island;
    const follow = 1 - Math.exp(-dt * 6); this.target.lerp(new THREE.Vector3(focus.x, 0, focus.z), follow);
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * 52, 50, this.target.z + Math.cos(this.yaw) * 52); this.camera.lookAt(this.target);
    this.sun.position.set(this.target.x - 30, 65, this.target.z + 20); this.sun.target.position.copy(this.target);
    // Water displacement runs on the GPU. No per-frame 10k-vertex CPU uploads.
    this.renderer.render(this.scene, this.camera);
  }
}
