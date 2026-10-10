import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], remoteRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('data:')) remoteRequests.push(r.url()); });
  await page.goto('http://127.0.0.1:4173'); await expect(page.locator('#start-title')).toHaveText('TIDEHOLD');
  if (await page.evaluate(() => typeof window.__TIDEHOLD__ !== 'undefined')) throw new Error('Development diagnostics leaked into production');
  await page.locator('[data-experience="training"]').click(); await page.locator('[data-start="destination"]').click();
  await page.locator('[data-tool="mortar"]').click(); await page.locator('[data-tile="-1,-1"]').click();
  await expect(page.locator('#resources')).toHaveText('20');
  await page.locator('[data-tab="voyage"]').click(); await page.locator('[data-site="shoal"]').click();
  await expect(page.locator('[data-site="shoal"]')).toHaveText('✓ 해역 정리 완료', { timeout: 20000 });
  await expect(page.locator('#resources')).toHaveText('120');
  await page.locator('[data-tab="build"]').click(); await page.locator('[data-tool="expand"]').click(); await page.locator('[data-tile="0,-2"]').click();
  await expect(page.locator('#resources')).toHaveText('75'); await expect(page.locator('#hull-label')).toContainText('/ 305');
  await fs.mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/production-preview.png' });
  const license = await page.request.get('http://127.0.0.1:4173/licenses/THREE-LICENSE.txt');
  if (!license.ok() || !(await license.text()).includes('The MIT License')) throw new Error('Bundled license missing');
  const report = { url: 'http://127.0.0.1:4173', browser: browser.version(), earned: 100, expanded: true, noDevHooks: true, errors, remoteRequests, licenseIncluded: true };
  await fs.writeFile('artifacts/production-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (errors.length || remoteRequests.length) throw new Error('Production browser check failed');
} finally { await browser.close(); }
