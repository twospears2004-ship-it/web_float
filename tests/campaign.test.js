import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, advance, build, upgrade, applyHullDamage, weaponStats, setRoute } from '../src/game.js';
import { launchMission, returnToHarbor, retryMission, availableMissions, researchTechnology, useAbility, powerCapacity, powerUsed, currentFieldDecision, resolveFieldDecision } from '../src/campaign.js';
import { missions, campaignRules } from '../src/campaign-content.js';
import { encodeSave, decodeSave, saveCampaign, loadCampaign, SAVE_KEY, BACKUP_KEY, validateCampaign } from '../src/save.js';

const run = (g, seconds, input = {}) => { for (let i = 0; i < seconds * 60; i++) advance(g, 1/60, input); };
const storage = () => { const data = new Map(); return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k,v) }; };
function playMission(g,limit=900) {
  for(let t=0;t<limit*60&&g.phase==='playing';t++) {
    const decision=currentFieldDecision(g);if(decision)resolveFieldDecision(g,decision.options.find(o=>g.resources>=(o.cost || 0)).id);
    const site=g.catalog[g.campaign.objectiveIndex];
    if(!g.combat&&!g.route&&!g.sites[g.campaign.objectiveIndex].cleared)setRoute(g,site.id);
    if(g.hull<g.maxHull*0.7)useAbility(g,'mend');
    if(g.combat)useAbility(g,'pulse');
    if(g.enemies.some(e=>e.windup))useAbility(g,'barrier');
    advance(g,1/60);
  }
}
function winFirst(g) { assert.equal(launchMission(g, 'coral-1'), true); playMission(g); assert.equal(g.phase, 'mission-complete'); }

test('campaign harbor starts with durable ship and only the first authored mission unlocked', () => {
  const g = createCampaign('destination'); assert.equal(g.resources,150); assert.equal(g.maxHull,360); assert.deepEqual(availableMissions(g).map(m=>m.id),['coral-1']);
  assert.equal(launchMission(g,'heart-6'), false); assert.equal(validateCampaign(g),true);
});
test('campaign navigation modes share the same enemies and mission seed', () => {
  const a=createCampaign('direct'), b=createCampaign('destination'); launchMission(a,'coral-1'); launchMission(b,'coral-1');
  assert.deepEqual(a.enemies,b.enemies); assert.deepEqual(a.catalog,b.catalog);
});

test('manual harbor sailing restores safely without granting production or starting a mission', () => {
  const g=createCampaign('direct');assert.equal(build(g,'fishery',1,-1),true);
  const resources=g.resources,stock=g.facilities.find(f=>f.type==='fishery').stock;run(g,5,{x:1,z:-1});
  assert.ok(g.island.x>20 && g.island.z<-20);assert.equal(g.campaign.stage,'harbor');
  assert.equal(g.resources,resources);assert.equal(g.facilities.find(f=>f.type==='fishery').stock,stock);
  assert.equal(g.enemies.length,0);const restored=decodeSave(encodeSave(g));assert.deepEqual(restored.island,g.island);
  g.paused=true;const stopped={...g.island};run(g,1,{x:1});assert.deepEqual(g.island,stopped);g.paused=false;
  assert.equal(launchMission(g,'coral-1'),true);assert.deepEqual(g.island,{x:0,z:0});assert.equal(validateCampaign(g),true);
  const b=createCampaign('destination');run(b,1,{x:1,z:-1});assert.deepEqual(b.island,{x:0,z:0});
});
test('complete first multi-wave mission, bank rewards, preserve construction and unlock next mission', () => {
  const g=createCampaign('destination'); build(g,'mortar',-1,-1); winFirst(g);
  assert.equal(g.campaign.completed.length,1); assert.equal(g.campaign.research,1); assert.equal(g.kills,9); assert.equal(g.resources,160);
  const before=g.resources; returnToHarbor(g); assert.equal(g.resources,before); assert.equal(g.facilities.length,2); assert.equal(g.island.z,0);
  assert.deepEqual(availableMissions(g).map(m=>m.id),['coral-1','coral-2']); assert.equal(validateCampaign(g),true);
});
test('failed attempt and retry restore ship and economy without keeping duplicate wave rewards', () => {
  const g=createCampaign('destination'); build(g,'mortar',-1,-1); const before=structuredClone(g);
  launchMission(g,'coral-1'); setRoute(g,'objective-0'); run(g,5); g.hull=0; run(g,1); assert.equal(g.phase,'defeat');
  assert.equal(retryMission(g),true); assert.equal(g.hull,before.hull); assert.equal(g.resources,before.resources); assert.equal(g.kills,before.kills); assert.equal(g.enemies.length,3); assert.equal(validateCampaign(g),true);
});
test('multi-location recovery requires moving to each location and completes in order', () => {
  const g=createCampaign('destination'); build(g,'mortar',-1,-1); winFirst(g); returnToHarbor(g); upgrade(g,1);
  assert.equal(launchMission(g,'coral-2'),true);
  assert.equal(g.catalog.length,6); assert.equal(setRoute(g,'objective-5'),false);
  playMission(g);
  assert.equal(g.phase,'mission-complete'); assert.equal(g.campaign.completed.length,2); assert.ok(g.sites.every(s=>s.cleared)); assert.equal(validateCampaign(g),true);
});
test('research spends once, boosts actual weapons and locks outside harbor', () => {
  const g=createCampaign(); g.campaign.research=2; const old=weaponStats(g.facilities[0],g).damage;
  assert.equal(researchTechnology(g,'ballistics'),true); assert.equal(g.campaign.research,0); assert.ok(weaponStats(g.facilities[0],g).damage>old);
  assert.equal(researchTechnology(g,'ballistics'),false); launchMission(g,'coral-1'); g.campaign.research=100; assert.equal(researchTechnology(g,'bulkhead'),false);
});
test('unlocked facility roles enforce chapter gates', () => {
  const g=createCampaign(); g.resources=500; assert.equal(build(g,'rail',1,1),false); assert.equal(g.resources,500);
  g.campaign.completed=missions.slice(0,12).map(m=>m.id); g.campaign.chapter=2; assert.equal(build(g,'rail',1,1),true);
});
test('reactor capacity makes composition a choice and rejects construction before spending', () => {
  const g=createCampaign();g.resources=1000;build(g,'mortar',-1,-1);build(g,'mortar',1,-1);const before=g.resources;
  assert.equal(powerUsed(g),5);assert.equal(build(g,'cannon',1,1),false);assert.equal(g.resources,before);
  g.campaign.research=2;assert.equal(researchTechnology(g,'reactor'),true);assert.equal(powerCapacity(g),7);assert.equal(build(g,'cannon',1,1),true);
});
test('barrier reduces real damage; cooldown cannot be bypassed; repair is bounded', () => {
  const g=createCampaign(); launchMission(g,'coral-1'); const initial=g.hull;
  assert.equal(useAbility(g,'barrier'),true); assert.equal(useAbility(g,'barrier'),false);
  assert.ok(Math.abs(applyHullDamage(g,{x:0,z:-10},100)-35)<1e-6); assert.ok(Math.abs(g.hull-(initial-35))<1e-6);
  assert.equal(useAbility(g,'mend'),true); assert.equal(g.hull,g.maxHull); run(g,6); assert.ok(g.campaign.barrierSeconds<1e-8);
});
test('directional shielding depends on facility location relative to incoming attack', () => {
  const g=createCampaign(); g.campaign.chapter=3; g.resources=500; assert.equal(build(g,'shield',0,1),true);
  assert.equal(applyHullDamage(g,{x:0,z:10},100),70); assert.equal(applyHullDamage(g,{x:0,z:-10},100),100);
});
test('boss warning resolves at the original position, allowing a real movement dodge', () => {
  const make=mode=>{const g=createCampaign(mode);g.campaign.completed=missions.slice(0,5).map(m=>m.id);launchMission(g,'coral-6');const e=g.enemies[0];Object.assign(e,{type:'leviathan',x:0,z:-8,hp:10000,maxHp:10000,active:true});g.enemies=[e];return g;};
  const stationary=make('destination'), moving=make('direct');
  run(stationary,2);run(moving,2,{x:1});assert.ok(stationary.hull<360);assert.equal(moving.hull,360);
});
test('siege crosses six encounters and preserves separate battery targets', () => {
  const g=createCampaign('destination');g.campaign.completed=missions.slice(0,3).map(m=>m.id);g.resources=300;build(g,'mortar',-1,-1);upgrade(g,1);upgrade(g,2);launchMission(g,'coral-4');assert.equal(g.catalog.length,6);
  playMission(g);
  assert.equal(g.phase,'mission-complete');assert.ok(g.sites.every(s=>s.cleared));
});
test('save restores exact mission, enemies, cooldowns and economy in paused state', () => {
  const g=createCampaign('destination'); build(g,'mortar',-1,-1); launchMission(g,'coral-1'); setRoute(g,'objective-0'); run(g,5);
  useAbility(g,'barrier'); const text=encodeSave(g), restored=decodeSave(text);
  assert.equal(restored.paused,true); assert.deepEqual(restored.enemies,g.enemies); assert.deepEqual(restored.facilities,g.facilities); assert.equal(restored.resources,g.resources); assert.equal(restored.campaign.missionId,'coral-1');
  const a=structuredClone(g); a.paused=false; restored.paused=false; run(a,20); run(restored,20);
  assert.equal(restored.resources,a.resources); assert.equal(restored.kills,a.kills); assert.equal(restored.phase,a.phase);
});
test('corrupted primary falls back to valid backup without deleting original files', () => {
  const s=storage(), g=createCampaign(); saveCampaign(g,s); g.resources=140; saveCampaign(g,s); const backup=s.getItem(BACKUP_KEY);
  s.setItem(SAVE_KEY,'broken'); const loaded=loadCampaign(s); assert.equal(loaded.recovered,true); assert.equal(loaded.game.resources,150); assert.equal(s.getItem(SAVE_KEY),'broken'); assert.equal(s.getItem(BACKUP_KEY),backup);
});
test('failed save leaves valid previous primary intact and reports failure', () => {
  const s=storage(), g=createCampaign(); saveCampaign(g,s); const original=s.getItem(SAVE_KEY);
  const failing={getItem:s.getItem,setItem(){throw new Error('disk full');}};
  g.resources=100; const result=saveCampaign(g,failing); assert.equal(result.ok,false); assert.equal(s.getItem(SAVE_KEY),original);
});
test('invalid save data is rejected before running or replacing current progression', () => {
  const g=createCampaign();
  for (const mutate of [g=>g.hull=NaN,g=>g.facilities[0].x=4,g=>g.facilities[0].type='constructor',g=>g.tiles.push(g.tiles[0]),g=>g.campaign.completed=['heart-6'],g=>g.campaign.abilityCooldowns.barrier=-1]) {
    const corrupt=structuredClone(g); mutate(corrupt); assert.throws(()=>encodeSave(corrupt));
  }
  assert.throws(()=>decodeSave(encodeSave(g).replace('"resources":150','"resources":500')));
});
