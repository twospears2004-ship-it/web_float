import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('[data-experience="training"]').click();
  await page.locator('[data-start="direct"]').click();
  await page.locator('[data-tool="mortar"]').click(); await page.locator('[data-tile="-1,-1"]').click();
  await page.keyboard.down('w'); await page.waitForTimeout(2200); await page.keyboard.up('w');
  const sample = await page.evaluate(async () => {
    const stamps = []; const start = performance.now();
    await new Promise(resolve => { const sampleFrame = t => { stamps.push(t); if (t - start >= 5000) resolve(); else requestAnimationFrame(sampleFrame); }; requestAnimationFrame(sampleFrame); });
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
    const canvas = document.querySelector('#scene canvas'); const gl = canvas.getContext('webgl2'); const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { durationMs: stamps.at(-1) - stamps[0], frames: stamps.length, fps: (stamps.length - 1) * 1000 / (stamps.at(-1) - stamps[0]), p95FrameMs: gaps[Math.floor(gaps.length * 0.95)], gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', render: window.__TIDEHOLD__.rendererInfo(), state: window.__TIDEHOLD__.snapshot() };
  });
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/realtime-play.png' });
  const beforeReset = await page.evaluate(() => window.__TIDEHOLD__.rendererInfo());
  // Compare identical fresh scenes. Dead enemies and occupied decorations legitimately
  // differ from the initial scene, and first selection warms two retained geometries.
  await page.locator('#restart-button').click(); await page.waitForTimeout(200);
  const resetBaseline = await page.evaluate(() => window.__TIDEHOLD__.rendererInfo());
  const resetSamples = [];
  for (let i = 0; i < 5; i++) { await page.locator('#restart-button').click(); await page.waitForTimeout(200); resetSamples.push(await page.evaluate(() => window.__TIDEHOLD__.rendererInfo())); }
  const afterReset = await page.evaluate(() => window.__TIDEHOLD__.rendererInfo());
  const report = { measuredAt: '2026-10-09', platform: 'Windows / headless Chrome / 1440x900', browser: browser.version(), ...sample, beforeReset, resetBaseline, resetSamples, afterReset, errors };
  await fs.writeFile('artifacts/performance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ browser: report.browser, fps: report.fps, p95FrameMs: report.p95FrameMs, gpu: report.gpu, render: report.render, resetBaseline, resetSamples, afterReset, earned: report.state.earned, errors }, null, 2));
  if (errors.length || sample.state.earned !== 100 || resetSamples.some(s => s.geometries !== resetBaseline.geometries || s.textures !== resetBaseline.textures)) throw new Error('Realtime gameplay or reset rendering check failed');
} finally { await browser.close(); }
