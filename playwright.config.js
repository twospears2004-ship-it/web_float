import { defineConfig } from '@playwright/test';
const port=Number(process.env.TIDEHOLD_TEST_PORT || 5187);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('TIDEHOLD_TEST_PORT must be a port between 1024 and 65535.');
export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  // Own this server. Another local project on a shared Vite port must never
  // receive game test input or be stopped by this suite.
  webServer: { command: `node node_modules/vite/bin/vite.js --config scripts/vite-test.config.mjs --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 30000 },
});
