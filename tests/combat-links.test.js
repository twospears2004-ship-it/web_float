import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeSave} from '../src/save.js';
import {launchDefense,startDefenseWave} from '../src/frontier.js';
import {endgameSieges} from '../src/siege-content.js';
import {returnToHarbor} from '../src/campaign.js';
import {linkedPowerContacts,inspectedContact,inspectionContext} from '../src/combat-inspector.js';
function ready(){const g=decodeSave(fs.readFileSync('tests/fixtures/supply-links-earned-network-result.json','utf8'));assert(returnToHarbor(g));g.paused=false;const d=endgameSieges.find(d=>d.chapter>0&&d.pattern==='citadel');assert(launchDefense(g,d.id));assert(startDefenseWave(g));return g;}
test('real split dock links expose both shared-core suppliers and the matching generator recipients without changing paid state',()=>{
  const g=ready(),core=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='shared'),west=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='west'),east=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='east'),before=structuredClone(g);
  assert.deepEqual(linkedPowerContacts(g,core).map(e=>e.id),[west.id,east.id]);const recipients=linkedPowerContacts(g,west);assert.equal(recipients.length,4);assert.deepEqual(recipients.filter(e=>e.type==='baseCore').map(e=>e.powerBus).sort(),['shared','west']);assert.deepEqual(recipients.filter(e=>e.type==='gunTower').map(e=>e.powerBus).sort(),['shared','west']);const ui={inspectedEnemy:core.id,inspectionContext:inspectionContext(g),selectedUnits:g.fleet.units.map(u=>u.id)};assert.deepEqual(inspectedContact(g,ui).powerLinks.map(e=>e.id),[west.id,east.id]);assert.deepEqual(g,before);
});
test('live inspection links remove destroyed, captured or other-site suppliers, reject dead owners, and retain deterministic order',()=>{
  const g=ready(),core=g.enemies.find(e=>e.type==='baseCore'&&e.powerBus==='shared'),west=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='west'),east=g.enemies.find(e=>e.type==='generator'&&e.powerBus==='east'),ids=linkedPowerContacts(g,core).map(e=>e.id);g.enemies.reverse();assert.deepEqual(linkedPowerContacts(g,core).map(e=>e.id),ids);
  west.hp=0;assert.deepEqual(linkedPowerContacts(g,core).map(e=>e.id),[east.id]);assert.deepEqual(linkedPowerContacts(g,west),[]);east.captured=true;assert.deepEqual(linkedPowerContacts(g,core),[]);east.captured=false;east.siteId='another-dock';assert.deepEqual(linkedPowerContacts(g,core),[]);east.siteId=core.siteId;core.captured=true;assert.deepEqual(linkedPowerContacts(g,core),[]);assert.deepEqual(linkedPowerContacts(g,undefined),[]);assert.deepEqual(linkedPowerContacts(g,g.enemies.find(e=>e.type==='crawler')),[]);
});
