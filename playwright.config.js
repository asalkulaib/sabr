import { defineConfig } from '@playwright/test';

// Phone-sized (390 x 844), Kuwait time, WebKit (Safari's engine) and Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://localhost:4173/sabr/',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Kuwait',
    locale: 'en-GB',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node tools/serve.mjs 4173',
    url: 'http://localhost:4173/sabr/',
    reuseExistingServer: true,
  },
});
