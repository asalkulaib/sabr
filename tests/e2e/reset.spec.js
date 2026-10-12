import { test, expect, openAt, seed, tap, sheet, readDb, captureShares, sharedFiles, ms, MIN } from './helpers.js';
import { WEEK } from './seed-data.js';

const SEEDED = {
  ...WEEK,
  settings: [
    ...WEEK.settings,
    { key: 'workdayStart', value: '18:00' },
    { key: 'weekendStart', value: '15:00' },
    { key: 'historyChart', value: 'line' },
  ],
};

test('reset asks twice; backing out at either step keeps everything', async ({ page }) => {
  await captureShares(page);
  await openAt(page, '2026-09-26T23:00', '#more');
  await seed(page, SEEDED);
  await tap(page, 'reset');
  await expect(sheet(page, 'reset')).toContainText('Delete all history?');
  await tap(page, 'reset-backup');
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  await tap(page, 'reset-keep');
  await expect(sheet(page, 'reset')).toHaveCount(0);

  await tap(page, 'reset');
  await tap(page, 'reset-continue');
  await expect(page.getByTestId('reset-final')).toHaveText('This cannot be undone.');
  await expect(sheet(page, 'reset')).toContainText('7 windows, 4 meals, 6 weigh-ins and 4 temptations will be deleted for good.');
  await tap(page, 'reset-keep');
  const db = await readDb(page);
  expect(db.days).toHaveLength(7);
  expect(db.weights).toHaveLength(6);
});

test('confirming both steps deletes all history and keeps the settings', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#more');
  await seed(page, SEEDED);
  await tap(page, 'reset');
  await tap(page, 'reset-continue');
  await tap(page, 'reset-confirm');
  await expect(page.getByTestId('flash')).toHaveText('All history deleted.');
  await expect(page.locator('.tab[data-tab="today"]')).toHaveAttribute('aria-current', 'page');
  // Saturday: the weekend start, as set before the reset.
  await expect(page.locator('[data-block="before"]')).toContainText('Window planned for 15:00.');
  await expect(page.locator('[data-notice]')).toHaveCount(0); // a fresh start: nothing unlogged
  const db = await readDb(page);
  for (const store of ['days', 'meals', 'outside', 'temptations', 'weights']) expect(db[store], store).toHaveLength(0);
  const s = Object.fromEntries(db.settings.map((x) => [x.key, x.value]));
  expect(s).toMatchObject({ workdayStart: '18:00', weekendStart: '15:00', historyChart: 'line', lastBackupAt: null, lastImportAt: null });
  // Tracking starts again now, so the emptied days are not flagged as unlogged.
  expect(s.installedAt).toBeGreaterThanOrEqual(ms('2026-09-26T23:00'));
  expect(s.installedAt).toBeLessThan(ms('2026-09-26T23:00') + 5 * MIN);
});
