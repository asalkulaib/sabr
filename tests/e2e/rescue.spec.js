// The rescue screen (docs/js/rescue.js): when Sabr cannot start, it says so,
// can still save the data as a backup Restore accepts, and can try again.
// The app is broken on purpose here, so these tests check the page errors
// themselves: only the ones caused on purpose may appear.
import { test as base, expect } from '@playwright/test';
import { test as healthy, T, openAt, seed, advance, captureShares, sharedFiles } from './helpers.js';
import { WEEK } from './seed-data.js';

const APP = '**/sabr/js/app.js';

const test = base.extend({
  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.addInitScript(() => {
      try { localStorage.setItem('sabr.welcomed', '1'); } catch { /* the app's own check decides */ }
    });
    await use(errors);
  },
});

/** The app module, replaced by one that does what body says. */
const breakApp = (page, body) => page.route(APP, (route) => route.fulfill({ contentType: 'text/javascript', body }));

test('a module that throws: the rescue at once, and Save my data hands over the backup Restore accepts', async ({ page, errors }) => {
  await captureShares(page);
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, WEEK);
  // What Back up now hands over, to compare.
  await page.locator('[data-action="backup"]').click();
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  const [made] = await sharedFiles(page);

  await breakApp(page, "throw new Error('Broken on purpose');");
  await page.reload();
  const rescue = page.getByTestId('rescue');
  await expect(rescue).toBeVisible();
  await expect(rescue.locator('h1')).toHaveText('Sabr could not start.');
  await expect(page.getByTestId('rescue-note')).toHaveText('Your data is safe on this iPhone.');
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  // The tabs need the app.
  await expect(page.locator('#tabbar')).toBeHidden();

  await page.locator('[data-action="rescue-save"]').click();
  await expect(page.getByTestId('rescue-status')).toHaveText('Backup handed to iOS. Keep it in iCloud Drive, in a folder named Sabr.');
  const [saved] = await sharedFiles(page); // the page started afresh: only the rescue's file
  expect(saved.name).toBe('sabr-backup-2026-09-27.json');
  expect(saved.type).toBe('application/json');
  // The validation Restore uses takes it whole.
  const info = await page.evaluate(async (text) => {
    const { describeBackup, parseBackup } = await import('/sabr/js/core/backup.js');
    return describeBackup(parseBackup(text));
  }, saved.text);
  expect(info).toMatchObject({ windows: 7, meals: 4, weighIns: 6, temptations: 4, skipped: 0 });
  // The same shape as Back up now's file, with the same history in it.
  const a = JSON.parse(made.text);
  const b = JSON.parse(saved.text);
  expect(Object.keys(b)).toEqual(Object.keys(a));
  expect(b).toMatchObject({ app: 'sabr', schema: 1 });
  for (const store of ['days', 'meals', 'outside', 'temptations', 'weights']) expect(b.data[store], store).toEqual(a.data[store]);
  const settingsA = Object.fromEntries(a.data.settings.map((s) => [s.key, s.value]));
  for (const { key, value } of b.data.settings) {
    if (!['lastBackupAt', 'zoneSeenAt'].includes(key)) expect(value, key).toEqual(settingsA[key]);
  }
  expect(errors).toEqual(['Broken on purpose']);
});

test('a start that never draws: the rescue after 6 seconds, and Try again starts Sabr', async ({ page, errors }) => {
  await page.clock.install({ time: T('2026-09-27T10:00') });
  await breakApp(page, 'export {};');
  await page.goto('./');
  await page.clock.runFor(4000);
  await expect(page.getByTestId('rescue')).toHaveCount(0);
  await page.clock.runFor(2500);
  await expect(page.getByTestId('rescue')).toBeVisible();

  // Fixed meanwhile: Try again loads Sabr afresh.
  await page.unroute(APP);
  await page.locator('[data-action="rescue-retry"]').click();
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(page.getByTestId('rescue')).toHaveCount(0);
  await expect(page.locator('#tabbar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a module that does not load, or a promise rejected while starting: the rescue at once', async ({ page, errors }) => {
  await page.clock.install({ time: T('2026-09-27T10:00') });
  await page.route('**/sabr/js/store.js', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  await page.goto('./');
  await expect(page.getByTestId('rescue')).toBeVisible({ timeout: 3000 });
  await page.unroute('**/sabr/js/store.js');

  await breakApp(page, "Promise.reject(new Error('Rejected on purpose')); export {};");
  await page.reload();
  await expect(page.getByTestId('rescue')).toBeVisible({ timeout: 3000 });
  expect(errors.every((e) => /Rejected on purpose/.test(e))).toBe(true);
});

test('storage the app cannot open: the rescue at once, and it still saves the data', async ({ page, errors }) => {
  await captureShares(page);
  await openAt(page, '2026-09-27T10:00');
  await seed(page, WEEK);
  // The app opens its database at version 1; the rescue reads it as it is.
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      if (name === 'sabr' && version === 1) throw new DOMException('Connection to Indexed Database server lost.', 'UnknownError');
      return version === undefined ? open.call(this, name) : open.call(this, name, version);
    };
  });
  await page.reload();
  await expect(page.getByTestId('rescue')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('rescue-note')).toHaveText('Your data is safe on this iPhone.');
  await page.locator('[data-action="rescue-save"]').click();
  await expect(page.getByTestId('rescue-status')).toHaveText('Backup handed to iOS. Keep it in iCloud Drive, in a folder named Sabr.');
  const [saved] = await sharedFiles(page);
  expect(JSON.parse(saved.text).data.days).toHaveLength(7);
  expect(errors).toEqual([]);
});

test('storage that cannot be opened at all: the rescue says so, never that the data is safe', async ({ page, errors }) => {
  await captureShares(page);
  // As when Private Browsing or a setting blocks storage.
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
  });
  await page.clock.install({ time: T('2026-09-27T10:00') });
  await page.goto('./');
  await expect(page.getByTestId('rescue')).toBeVisible({ timeout: 3000 });
  const note = page.getByTestId('rescue-note');
  await expect(note).toHaveText('Sabr could not open its storage. In Private Browsing, open Sabr from the Home Screen instead.');
  await page.locator('[data-action="rescue-save"]').click();
  await expect(page.getByTestId('rescue-status')).toHaveText('Sabr could not read its data.');
  await expect(note).not.toContainText('safe');
  expect(await sharedFiles(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('with no share sheet, Save my data downloads the file', async ({ page, errors }) => {
  await page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  await page.clock.install({ time: T('2026-09-27T10:00') });
  await breakApp(page, "throw new Error('Broken on purpose');");
  await page.goto('./');
  await expect(page.getByTestId('rescue')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-action="rescue-save"]').click();
  expect((await download).suggestedFilename()).toBe('sabr-backup-2026-09-27.json');
  await expect(page.getByTestId('rescue-status')).toHaveText('Backup file downloaded.');
  expect(errors).toEqual(['Broken on purpose']);
});

healthy('a healthy start never shows it, however far the clock runs on', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  expect(await page.evaluate(() => window.__sabrDrawn)).toBe(true);
  await page.clock.runFor(7000);
  await advance(page, 60);
  await page.clock.fastForward('24:00:00');
  await page.clock.runFor(7000);
  await expect(page.getByTestId('rescue')).toHaveCount(0);
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect(page.locator('#view .head h1')).toHaveText('Monday');
});
