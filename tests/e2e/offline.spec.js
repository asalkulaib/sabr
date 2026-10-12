import { spawn } from 'node:child_process';
import { test, expect, tap } from './helpers.js';

test.use({ serviceWorkers: 'allow' });

// Offline is simulated the way a phone loses signal: the server goes away.
// (Playwright's own offline switch also blocks service-worker responses in
// WebKit on Windows, which a real iPhone does not do.)
test('works fully offline once opened', async ({ page }, testInfo) => {
  const port = 4180 + testInfo.workerIndex + (testInfo.project.name === 'webkit' ? 20 : 0);
  const base = `http://localhost:${port}/sabr/`;
  const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
  try {
    await expect.poll(async () => {
      try { return (await fetch(base)).status; } catch { return 0; }
    }).toBe(200);

    await page.clock.install({ time: new Date('2026-09-26T14:00:00+03:00') }); // Saturday
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    server.kill();
    await expect.poll(async () => {
      try { await fetch(base); return 'up'; } catch { return 'down'; }
    }).toBe('down');

    await page.reload();
    await expect(page.locator('[data-block="before"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    expect(loaded).toEqual(expect.arrayContaining(['Nunito']));

    // Data still saves offline.
    await tap(page, 'start-meal');
    await tap(page, 'start-eating');
    await expect(page.locator('[data-block="open"]')).toBeVisible();

    // Every tab and the import route load offline.
    for (const tab of ['week', 'satiety', 'history', 'more']) {
      await page.locator(`.tab[data-tab="${tab}"]`).click();
      await expect(page.locator(`.tab[data-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
    }
    await page.goto(`${base}import/#w=2026-09-20:104.6,2026-09-21:104.3,2026-09-22:104.1`);
    await expect(page.getByTestId('import-result')).toHaveText('Imported 3 entries.');
    // Without the trailing slash, served from the cache, the data still arrives.
    await page.goto(`${base}import#w=2026-09-23:103.9`);
    await expect(page.getByTestId('import-result')).toHaveText('Imported 1 entry.');
    expect(new URL(page.url()).hash).toBe('');
  } finally {
    server.kill();
  }
});
