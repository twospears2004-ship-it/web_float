import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

async function setup(page, mode) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#start-title')).toHaveText('TIDEHOLD');
  await page.locator('[data-experience="training"]').click();
  await page.locator(`[data-start="${mode}"]`).click();
  await page.clock.runFor(300);
  return errors;
}
const snapshot = page => page.evaluate(() => window.__TIDEHOLD__.snapshot());
async function tile(page, x, z) {
  // Actual raycast on the rendered 3D island; no mutation of game state.
  const p = await page.evaluate(([x, z]) => window.__TIDEHOLD__.projectTile(x, z), [x, z]);
  await page.mouse.click(p.x, p.y); await page.clock.runFor(200);
}
async function buildMortar(page) {
  await page.locator('[data-tool="mortar"]').click(); await tile(page, -1, -1);
  expect((await snapshot(page)).facilities).toHaveLength(2);
  await expect(page.locator('#resources')).toHaveText('20');
}
async function grow(page) {
  await tile(page, 0, -1); await page.locator('[data-action="upgrade"]').click();
  await page.locator('[data-tool="expand"]').click();
  await page.locator('[data-tile="0,-2"]').click(); await page.clock.runFor(200);
  const g = await snapshot(page); expect(g.facilities[0].level).toBe(2); expect(g.maxHull).toBe(305); expect(g.tiles).toHaveLength(10);
}
async function hold(page, key, milliseconds) { await page.keyboard.down(key); await page.clock.runFor(milliseconds); await page.keyboard.up(key); }
async function saveEvidence(page, name) { await fs.mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/${name}.png` }); }

test('A: actual 3D construction → manual movement → reward → growth → second battle', async ({ page }) => {
  const errors = await setup(page, 'direct'); await buildMortar(page);
  const before = await page.evaluate(() => window.__TIDEHOLD__.projectTile(-1, -1));
  await hold(page, 'w', 2200); await page.clock.runFor(300);
  let g = await snapshot(page); expect(g.island.z).toBeLessThan(-19); expect(g.combat).toBe(true);
  const after = await page.evaluate(() => window.__TIDEHOLD__.projectTile(-1, -1));
  expect(Math.abs(before.x - after.x)).toBeLessThan(18); // camera follows the moving parent island
  await saveEvidence(page, 'direct-combat'); await hold(page, 'w', 1200); await page.clock.runFor(10000);
  g = await snapshot(page); expect(g.sites[0].cleared).toBe(true); expect(g.earned).toBe(100); expect(g.resources).toBe(120);
  await grow(page);
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="outpost"]').click();
  await hold(page, 'd', 3800); await hold(page, 'w', 1600); await page.clock.runFor(16000);
  g = await snapshot(page); expect(g.sites[1].cleared).toBe(true); expect(g.kills).toBe(4); expect(g.phase).toBe('playing');
  await saveEvidence(page, 'direct-grown'); expect(errors).toEqual([]);
});

test('B: UI departure → automatic combat → reward → growth → second destination', async ({ page }) => {
  const errors = await setup(page, 'destination'); await buildMortar(page);
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="shoal"]').click();
  await hold(page, 'd', 1500); let g = await snapshot(page); expect(g.island.x).toBe(0); expect(g.route).not.toBeNull();
  await page.clock.runFor(2200); g = await snapshot(page); expect(g.combat).toBe(true);
  await expect(page.locator('[data-site="outpost"]')).toBeDisabled();
  await saveEvidence(page, 'destination-combat'); await page.clock.runFor(12000);
  g = await snapshot(page); expect(g.sites[0].cleared).toBe(true); expect(g.earned).toBe(100);
  await page.locator('[data-tab="build"]').click(); await grow(page);
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="outpost"]').click();
  await page.clock.runFor(27000); g = await snapshot(page); expect(g.sites[1].cleared).toBe(true); expect(g.kills).toBe(4);
  await page.locator('[data-tab="build"]').click(); await saveEvidence(page, 'destination-grown');
  await page.locator('#repair-button').click();
  await page.locator('[data-tool="mortar"]').click(); await page.locator('[data-tile="1,-1"]').click();
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="trench"]').click();
  await page.clock.runFor(45000); await expect(page.locator('#end-title')).toHaveText('더 먼 바다를 향해');
  expect((await snapshot(page)).kills).toBe(7); await saveEvidence(page, 'victory');
  expect(errors).toEqual([]);
});

test('pause, relocation, refund, UI keyboard input, deterministic reset and mode change', async ({ page }) => {
  const errors = await setup(page, 'direct'); await tile(page, 0, -1);
  await page.locator('[data-action="move"]').click(); await page.locator('[data-tile="1,1"]').click();
  let g = await snapshot(page); expect(g.facilities[0].x).toBe(1); expect(g.facilities[0].z).toBe(1); expect(g.resources).toBe(120);
  const before = g.island; await page.locator('[data-tab="build"]').focus(); await hold(page, 'ArrowRight', 1000);
  expect((await snapshot(page)).island).toEqual(before);
  await page.keyboard.press('p'); g = await snapshot(page); await page.clock.runFor(3000); expect((await snapshot(page)).time).toBe(g.time);
  await page.locator('#resume-button').click(); await hold(page, 'd', 1000); expect((await snapshot(page)).island.x).toBeGreaterThan(8);
  await page.locator('#restart-button').click(); g = await snapshot(page); expect(g.island).toEqual({ x: 0, z: 0 }); expect(g.resources).toBe(120); expect(g.facilities[0].z).toBe(-1);
  await page.locator('#mode-button').click(); await page.locator('[data-start="destination"]').click();
  g = await snapshot(page); expect(g.mode).toBe('destination'); expect(g.resources).toBe(120); expect(g.enemies.every(e => e.hp === e.maxHp)).toBe(true);
  expect(errors).toEqual([]);
});

test('actual defeat and same-condition retry through the UI', async ({ page }) => {
  const errors = await setup(page, 'destination'); await tile(page, 0, -1);
  await page.locator('[data-action="demolish"]').click(); expect((await snapshot(page)).facilities).toHaveLength(0);
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="trench"]').click();
  await page.clock.runFor(25000); await expect(page.locator('#end-title')).toHaveText('섬이 침몰했습니다');
  await saveEvidence(page, 'defeat'); await page.locator('#retry-button').click();
  const g = await snapshot(page); expect(g.phase).toBe('playing'); expect(g.hull).toBe(280); expect(g.resources).toBe(120); expect(g.kills).toBe(0); expect(g.facilities).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('start screen, guide, resize and renderer evidence', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/');
  await expect(page.locator('#start-title')).toHaveText('TIDEHOLD'); await saveEvidence(page, 'start');
  await page.locator('[data-experience="training"]').click(); await page.locator('[data-start="direct"]').click(); await page.locator('#help-button').click();
  await expect(page.locator('#help-title')).toBeVisible(); await page.locator('#close-help').click();
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(400);
  await saveEvidence(page, 'desktop-1280');
  const info = await page.evaluate(() => window.__TIDEHOLD__.rendererInfo());
  expect(info.calls).toBeGreaterThan(10); expect(info.triangles).toBeGreaterThan(1000);
  await fs.writeFile('artifacts/renderer-info.json', JSON.stringify({ viewport: '1280x720', renderer: info, browser: await page.context().browser().version() }, null, 2));
  expect(errors).toEqual([]);
});
