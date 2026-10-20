// Copies on this iPhone: a daily copy, a copy before each restore, reset and
// bring back, the keep rule, the More sheet with Bring back, and Undo.
import { test, expect, openAt, seed, readDb, copiesInDb, tap, sheet, advance, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

/** Opens the page again and waits for its first screen. */
async function reopen(page) {
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await page.waitForFunction(() => window.__sabrDrawn === true);
}

/** A backup file holding one day, made with the app's own export shape. */
const ONE_DAY = {
  app: 'sabr',
  schema: 1,
  version: 'test',
  exportedAt: '2026-09-21T09:00:00.000Z',
  data: { days: [WEEK.days[0]], meals: [WEEK.meals[0]], outside: [], temptations: [], weights: [], settings: [] },
};

const restoreFile = (page, obj) => page.getByTestId('restore-input').setInputFiles({
  name: 'sabr-backup-2026-09-21.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)),
});

const HISTORY = ['days', 'meals', 'outside', 'temptations', 'weights'];

test('a daily copy, once a day, in a database of its own', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, WEEK);
  // It waits until the first screen is up.
  await page.clock.runFor(2000);
  await expect.poll(async () => (await copiesInDb(page)).length).toBe(1);
  const [first] = await copiesInDb(page);
  expect(first).toMatchObject({
    kind: 'daily',
    counts: { windows: 7, meals: 4, weighIns: 6, temptations: 4 },
    stores: { days: 7, meals: 4, outside: 1, temptations: 4, weights: 6 },
  });
  expect(first.at).toBeGreaterThanOrEqual(ms('2026-09-27T09:00'));
  // The main database is untouched by it.
  expect((await readDb(page)).days).toHaveLength(7);

  // Opened again the same day: no second copy.
  await reopen(page);
  await page.clock.runFor(2000);
  await page.waitForTimeout(300);
  expect(await copiesInDb(page)).toHaveLength(1);

  // Left open into the next day: the new day gets its own.
  await advance(page, 24 * 60);
  await expect.poll(async () => (await copiesInDb(page)).length).toBe(2);

  // More lists them, newest first, with what each holds.
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'copies');
  const s = sheet(page, 'copies');
  await expect(s).toContainText('Copies stay on this iPhone and protect against a wrong restore or reset. To survive a lost phone, save backups to iCloud Drive.');
  const rows = s.locator('li.copy');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.copy-when')).toHaveText(/^Today, 09:\d\d$/);
  await expect(rows.nth(0).locator('.copy-kind')).toHaveText('Daily copy');
  await expect(rows.nth(0).locator('.copy-counts')).toHaveText('7 windows, 4 meals, 6 weigh-ins and 4 temptations');
  await expect(rows.nth(1).locator('.copy-when')).toHaveText(/^Yesterday, 09:\d\d$/);
  await expect(rows.locator('[data-action="bring-back"]')).toHaveCount(2);
});

test('with nothing logged, no daily copy is taken', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await page.clock.runFor(2000);
  await page.waitForTimeout(300);
  expect(await copiesInDb(page)).toEqual([]);
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'copies');
  await expect(sheet(page, 'copies').getByTestId('copies-empty')).toHaveText('No copies yet.');
});

test('Restore keeps a copy first, and Undo brings back what was there', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, WEEK);
  const before = await readDb(page);
  await restoreFile(page, ONE_DAY);
  await expect(sheet(page, 'restore')).toBeVisible();
  await tap(page, 'confirm-restore');
  await expect(page.getByTestId('flash')).toHaveText('Backup restored.');
  expect((await readDb(page)).days).toHaveLength(1);
  const kept = (await copiesInDb(page)).filter((c) => c.kind === 'before-restore');
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ counts: { windows: 7, meals: 4, weighIns: 6, temptations: 4 } });

  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  const after = await readDb(page);
  for (const store of HISTORY) expect(after[store], store).toEqual(before[store]);
  const s = (db) => Object.fromEntries(db.settings.map((x) => [x.key, x.value]));
  expect(s(after)).toMatchObject({ installedAt: s(before).installedAt, lastImportAt: s(before).lastImportAt });
  // A copy is no backup file: the reminder still counts from no backup.
  expect(s(after).lastBackupAt).toBeNull();
  await expect(page.getByTestId('backup-status')).toHaveText('No backup yet.');
});

test('Bring back asks once, keeps a copy of now first, and Undo returns to it', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, WEEK);
  await page.clock.runFor(2000);
  await expect.poll(async () => (await copiesInDb(page)).length).toBe(1);

  // Reset all history: a copy of everything is kept first.
  await tap(page, 'reset');
  await tap(page, 'reset-continue');
  await tap(page, 'reset-confirm');
  await expect(page.getByTestId('flash')).toHaveText('All history deleted.');
  expect((await readDb(page)).days).toHaveLength(0);
  expect((await copiesInDb(page)).map((c) => c.kind)).toEqual(['daily', 'before-reset']);

  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'copies');
  const s = sheet(page, 'copies');
  const newest = s.locator('li.copy').first();
  await expect(newest.locator('.copy-kind')).toHaveText('Before a reset');
  await newest.locator('[data-action="bring-back"]').click();
  // It asks once, in place.
  await expect(newest.locator('.confirm-question')).toHaveText('Bring back this copy? It replaces what is in Sabr now. A copy of now is kept first.');
  await tap(page, 'cancel-bring-back');
  await expect(s.locator('.copy-confirm')).toHaveCount(0);
  expect((await readDb(page)).days).toHaveLength(0);
  await newest.locator('[data-action="bring-back"]').click();
  await tap(page, 'confirm-bring-back');
  await expect(s).toHaveCount(0);
  await expect(page.getByTestId('flash')).toHaveText('Copy brought back.');
  const back = await readDb(page);
  expect(back.days).toHaveLength(7);
  expect(back.meals).toHaveLength(4);
  // The install's own start comes back with it, from before the reset.
  expect(Object.fromEntries(back.settings.map((x) => [x.key, x.value])).installedAt).toBe(ms('2026-09-20T08:00'));
  expect((await copiesInDb(page)).map((c) => c.kind)).toEqual(['daily', 'before-reset', 'before-bring-back']);

  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  const undone = await readDb(page);
  for (const store of HISTORY) expect(undone[store], store).toHaveLength(0);
});

test('after each new copy, the keep rule lets the others go', async ({ page }) => {
  await openAt(page, '2026-10-20T09:00');
  await seed(page, { ...WEEK, settings: settings({ installedAt: ms('2026-09-01T08:00') }) });
  await page.clock.runFor(2000);
  await expect.poll(async () => (await copiesInDb(page)).length).toBe(1); // today's daily copy
  // Earlier copies: one a day from 11 September to 19 October, and seven before restores.
  await page.evaluate(async () => {
    const day = (i) => new Date(Date.UTC(2026, 8, 11 + i, 5, 0)).getTime(); // 08:00 in Kuwait
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sabr-copies');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const data = { days: [], meals: [], outside: [], temptations: [], weights: [], settings: [] };
    const counts = { windows: 0, meals: 0, weighIns: 0, temptations: 0 };
    await new Promise((resolve, reject) => {
      const tx = db.transaction('copies', 'readwrite');
      for (let i = 0; i < 39; i++) tx.objectStore('copies').put({ kind: 'daily', at: day(i), counts, version: 'test', data });
      for (let i = 0; i < 7; i++) tx.objectStore('copies').put({ kind: 'before-restore', at: day(30 + i) + 3600000, counts, version: 'test', data });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  expect(await copiesInDb(page)).toHaveLength(47);
  // A new copy: the rule runs.
  await page.evaluate(async () => {
    const { takeCopy } = await import('/sabr/js/copies.js');
    await takeCopy('before-reset');
  });
  const left = await copiesInDb(page);
  const days = (kind) => left.filter((c) => c.kind === kind).map((c) => new Date(c.at + 3 * 3600000).toISOString().slice(0, 10));
  // The seven newest daily copies, 14 to 20 October, and the newest of each of the four weeks before.
  expect(days('daily')).toEqual(['2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13',
    '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
  // The five newest of the other kinds, together: the new one and four before restores.
  expect(days('before-restore')).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  expect(days('before-reset')).toEqual(['2026-10-20']);
});

test.describe('when the copies database fails', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...rest) {
        if (name === 'sabr-copies') throw new DOMException('Storage is blocked.', 'SecurityError');
        return open.call(this, name, ...rest);
      };
    });
  });

  test('Sabr carries on: Today as ever, Restore still undoes, the list is empty', async ({ page }) => {
    await openAt(page, '2026-09-27T10:00');
    await seed(page, WEEK);
    await page.clock.runFor(2000);
    await expect(page.locator('[data-block="before"]')).toBeVisible();
    await expect(page.getByTestId('flash')).toHaveCount(0);

    await page.locator('.tab[data-tab="more"]').click();
    const before = await readDb(page);
    await restoreFile(page, ONE_DAY);
    await tap(page, 'confirm-restore');
    await expect(page.getByTestId('flash')).toHaveText('Backup restored.');
    expect((await readDb(page)).days).toHaveLength(1);
    // The copy in hand still brings it back.
    await tap(page, 'undo');
    await expect(page.getByTestId('flash')).toHaveText('Undone.');
    expect((await readDb(page)).days).toEqual(before.days);

    await tap(page, 'copies');
    await expect(sheet(page, 'copies').getByTestId('copies-empty')).toHaveText('No copies yet.');
  });
});
