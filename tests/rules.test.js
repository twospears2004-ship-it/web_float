import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, createGame, advance, build, expand, upgrade, upgradeCost, moveFacility, demolish, repair, damageEnemy, setRoute, weaponStats, facilityPosition } from '../src/game.js';

const simulate = (g, seconds, input = {}, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) advance(g, 1 / fps, input); };
test('both movement modes begin with identical economy, buildings and enemies', () => {
  const a = createGame('direct'), b = createGame('destination'); a.mode = b.mode;
  assert.deepEqual(a, b); assert.equal(a.enemies.length, 7);
});
test('construction spends once and rejects insufficient funds, occupied, core and absent tiles', () => {
  const g = createGame(); assert.equal(build(g, 'mortar', -1, -1), true); assert.equal(g.resources, 20);
  assert.equal(build(g, 'cannon', 1, 1), false); assert.equal(build(g, 'cannon', -1, -1), false);
  assert.equal(build(g, 'cannon', 0, 0), false); assert.equal(build(g, 'cannon', 4, 4), false);
  assert.equal(g.facilities.length, 2); assert.equal(g.resources, 20);
});
test('expansion must be adjacent, raises hull, and unlocks a genuine building tile', () => {
  const g = createGame(); assert.equal(expand(g, 3, 3), false); assert.equal(expand(g, 0, -2), true);
  assert.equal(g.maxHull, 305); assert.equal(g.hull, 305); assert.equal(g.resources, 75);
  assert.equal(build(g, 'cannon', 0, -2), true); assert.equal(g.resources, 10);
  assert.equal(expand(g, 0, -3), false); assert.equal(g.tiles.length, 10);
});
test('upgrades spend resources and affect real damage and range; level is bounded', () => {
  const g = createGame(), f = g.facilities[0]; assert.equal(upgradeCost(f), 46); assert.equal(upgrade(g, f.id), true);
  assert.equal(g.resources, 74); assert.equal(weaponStats(f).damage, 24); assert.equal(weaponStats(f).range, 22);
  g.resources = 1000; assert.equal(upgrade(g, f.id), true); assert.equal(upgrade(g, f.id), false); assert.equal(f.level, 3);
});
test('free relocation changes range origin and rejects occupied slots', () => {
  const g = createGame(); assert.equal(moveFacility(g, 1, 1, 1), true); assert.equal(g.resources, 120);
  assert.deepEqual(facilityPosition(g, g.facilities[0]), { x: 3.4, z: 3.4 });
  assert.equal(moveFacility(g, 1, 0, 0), false);
});
test('demolition refunds only 60 percent including upgrades and cannot repeat', () => {
  const g = createGame(); upgrade(g, 1); const before = g.resources;
  assert.equal(demolish(g, 1), true); assert.equal(g.resources - before, Math.floor((65 + 46) * 0.6));
  assert.equal(demolish(g, 1), false); assert.equal(g.facilities.length, 0);
});
test('death reward is issued once even after repeated overkill', () => {
  const g = createGame(), e = g.enemies[0]; damageEnemy(g, e, 1000); damageEnemy(g, e, 1000);
  assert.equal(e.hp, 0); assert.equal(g.resources, 170); assert.equal(g.kills, 1); assert.equal(g.earned, 50);
});
test('mortar splash damages nearby enemies; cannon only damages one', () => {
  for (const type of ['cannon', 'mortar']) {
    const g = createGame(); g.facilities[0].type = type;
    g.enemies[0].x = 0; g.enemies[0].z = -14; g.enemies[1].x = 2; g.enemies[1].z = -14;
    advance(g, 1 / 60);
    assert.ok(g.enemies[0].hp < 72);
    assert.equal(g.enemies[1].hp < 72, type === 'mortar');
  }
});
test('tile placement changes whether a stationary target is in range', () => {
  const a = createGame(), b = createGame();
  for (const g of [a, b]) { g.enemies = [g.enemies[2]]; g.enemies[0].x = 0; g.enemies[0].z = -22; }
  moveFacility(b, 1, 0, 1); simulate(a, 0.5); simulate(b, 0.5);
  assert.ok(a.enemies[0].hp < b.enemies[0].hp); assert.equal(b.enemies[0].hp, 280);
});
test('attack cooldown is stable at 30/60/144 render fps', () => {
  const results = [30, 60, 144].map(fps => {
    const g = createGame(); g.enemies = [g.enemies[2]]; g.enemies[0].hp = 10000; g.enemies[0].maxHp = 10000; g.enemies[0].x = 0; g.enemies[0].z = -19;
    g.maxHull = 10000; g.hull = 10000; simulate(g, 10, {}, fps); return { shots: g.shots, hp: g.enemies[0].hp, hull: g.hull };
  });
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]); assert.equal(results[0].shots, 15);
});
test('movement uses normalized vectors and is stable across fps', () => {
  const a = createGame(), b = createGame(); simulate(a, 2, { x: 1, z: 1 }, 30); simulate(b, 2, { x: 1, z: 1 }, 144);
  assert.ok(Math.abs(a.island.x - b.island.x) < 1e-8); assert.ok(Math.abs(Math.hypot(a.island.x, a.island.z) - 18) < 1e-8);
});
test('pause freezes navigation, damage, cooldown and time', () => {
  const g = createGame(); setRoute(g, 'shoal'); g.paused = true; const before = structuredClone(g);
  simulate(g, 10, { x: 1, z: 1 }); assert.deepEqual(g, before);
});
test('repair is paid, bounded by max hull and blocked in combat', () => {
  const g = createGame(); assert.equal(repair(g), false); g.hull = 240; assert.equal(repair(g), true);
  assert.equal(g.hull, 280); assert.equal(g.resources, 90); g.combat = true; assert.equal(repair(g), false);
});
test('enemy approach, damage, defeat and restart are real', () => {
  const g = createGame('destination'); demolish(g, 1); setRoute(g, 'trench'); simulate(g, 70);
  assert.equal(g.phase, 'defeat'); assert.equal(g.hull, 0); const snapshot = structuredClone(g); simulate(g, 10); assert.deepEqual(g, snapshot);
  const fresh = createGame('destination'); assert.equal(fresh.resources, 120); assert.equal(fresh.hull, 280); assert.equal(fresh.kills, 0); assert.equal(fresh.facilities.length, 1); assert.ok(fresh.enemies.every(e => e.hp === e.maxHp && !e.rewarded));
});
test('destination mode ignores manual input and locks new travel and construction during combat', () => {
  const g = createGame('destination'); simulate(g, 1, { x: 1 }); assert.equal(g.island.x, 0);
  assert.equal(setRoute(g, 'shoal'), true); assert.equal(build(g, 'cannon', 1, 1), false);
  simulate(g, 3); assert.equal(g.combat, true); assert.equal(setRoute(g, 'home'), false); assert.equal(upgrade(g, 1), false);
});
test('both modes complete first hunt, earn construction resources, grow and fight again', () => {
  for (const mode of ['direct', 'destination']) {
    const g = createGame(mode); build(g, 'mortar', -1, -1);
    if (mode === 'destination') setRoute(g, 'shoal');
    else simulate(g, 30 / balance.moveSpeed, { z: -1 });
    simulate(g, 18); assert.equal(g.sites[0].cleared, true); assert.equal(g.kills, 2); assert.equal(g.resources, 120);
    assert.equal(upgrade(g, 1), true); assert.equal(expand(g, 0, -2), true); assert.equal(g.resources, 29);
    const previousKills = g.kills;
    if (mode === 'destination') setRoute(g, 'outpost');
    else {
      const goal = { x: 34, z: -45 }, dx = goal.x - g.island.x, dz = goal.z - g.island.z;
      simulate(g, Math.hypot(dx, dz) / balance.moveSpeed, { x: dx, z: dz });
    }
    simulate(g, 30); assert.ok(g.kills > previousKills); assert.equal(g.sites[1].cleared, true);
  }
});
test('upgraded island can complete all three destinations and wins', () => {
  const g = createGame('destination'); build(g, 'mortar', -1, -1); setRoute(g, 'shoal'); simulate(g, 25);
  upgrade(g, 1); expand(g, 0, -2); setRoute(g, 'outpost'); simulate(g, 40);
  assert.equal(g.sites[1].cleared, true); assert.equal(g.phase, 'playing');
  assert.equal(repair(g), true); assert.equal(build(g, 'mortar', 1, -1), true);
  assert.equal(upgrade(g, 1), false); // 89 remaining, upgrade costs 91; no hidden credit.
  setRoute(g, 'trench'); simulate(g, 50);
  assert.equal(g.phase, 'victory'); assert.equal(g.kills, 7); assert.ok(g.hull > 0);
});
