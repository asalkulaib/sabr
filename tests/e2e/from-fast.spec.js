// Moving from Fast: a backup in Fast's own format (made up here, no personal
// data) restores into Sabr. The Restore sheet says what it covers and what it
// removes, Fast's calendar record stays out, and Undo brings back what was there.
import { test, expect, openAt, seed, readDb, tap, sheet, captureShares, settings } from './helpers.js';
import { fastBackup } from './seed-data.js';

const K = (s) => new Date(`${s}:00+03:00`).getTime();

/** Sabr on this iPhone before the move: three days logged after Fast's last one. */
const PHONE = {
  days: [
    { day: '2026-10-15', firstBite: K('2026-10-15T17:40'), lastBite: K('2026-10-15T21:00') },
    { day: '2026-10-16', firstBite: K('2026-10-16T14:00'), lastBite: K('2026-10-16T17:30') },
  ],
  meals: [{ id: 1, day: '2026-10-15', name: 'Dinner', startedAt: K('2026-10-15T17:40'), finishedAt: K('2026-10-15T18:20'), hungerBefore: 7, stop: 'full', fullnessNow: 7, fullness20: 8 }],
  weights: [{ date: '2026-10-17', kg: 103.2 }],
  settings: settings({ installedAt: K('2026-10-15T08:00'), welcomedAt: K('2026-10-15T08:00') }),
};

const pickFile = (page) => page.getByTestId('restore-input').setInputFiles({
  name: 'fast-backup-2026-10-14.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fastBackup())),
});
const settingsOf = async (page) => Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value]));

test('a backup from Fast: what it covers, what it removes, its calendar note, and Undo', async ({ page }) => {
  await captureShares(page);
  await openAt(page, '2026-10-17T10:00', '#more'); // a Saturday
  await seed(page, PHONE);
  const before = await readDb(page);

  // Before you confirm: the days it runs over, and what this iPhone holds after them.
  await pickFile(page);
  const s = sheet(page, 'restore');
  await expect(s).toContainText('Backup from Wednesday 14 October: 20 windows, 20 meals, 7 weigh-ins and 1 temptations.');
  await expect(s.getByTestId('restore-span')).toHaveText('This backup runs 25 Sep to 14 Oct.');
  await expect(s.getByTestId('restore-loss')).toHaveText('3 days logged on this iPhone after 14 Oct will be removed.');
  await tap(page, 'confirm-restore');
  await expect(page.getByTestId('flash')).toHaveText('Backup restored.');
  expect((await readDb(page)).days).toHaveLength(20);
  // Fast's calendar file stays Fast's: its record is left out, and More says what to do.
  await expect(page.getByTestId('ics-status')).toHaveText('Restored from Fast. In Calendar, delete the Fast events: open one, tap Delete Event, then Delete All Future Events. Then add Sabr\'s file.');
  expect(await settingsOf(page)).toMatchObject({ icsTimes: null, icsSequence: 0, fastCalendar: true, workdayStart: '17:30' });

  // Undo: everything as it was before.
  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  const after = await readDb(page);
  for (const store of ['days', 'meals', 'outside', 'temptations', 'weights']) expect(after[store], store).toEqual(before[store]);
  expect(await settingsOf(page)).toMatchObject({ installedAt: K('2026-10-15T08:00'), welcomedAt: K('2026-10-15T08:00'), fastCalendar: false, icsTimes: null });
  await expect(page.getByTestId('ics-status')).toHaveText('Not added yet.');
});

test('restored from Fast: Week, History and Satiety show it, and adding Sabr\'s file clears the note', async ({ page }) => {
  await captureShares(page);
  await openAt(page, '2026-10-17T10:00', '#more');
  await seed(page, PHONE);
  await pickFile(page);
  await tap(page, 'confirm-restore');
  await expect(page.getByTestId('flash')).toHaveText('Backup restored.');

  // This week, Sunday 11 to Saturday 17 October: Fast's four days, each a success.
  await page.locator('.tab[data-tab="week"]').click();
  await expect(page.getByTestId('success-count')).toHaveText('4 of 7');
  // History: each fast ran from 21:00 to 17:30 the next day.
  await page.locator('.tab[data-tab="history"]').click();
  await expect(page.getByTestId('history-average')).toHaveText('20h 30m');
  // Satiety: Fast's rated dinners.
  await page.locator('.tab[data-tab="satiety"]').click();
  await expect(page.getByTestId('satiety-count')).toContainText('20 rated meals');

  // Sabr's own calendar file, added after Fast's events are gone: the note goes.
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'add-calendar');
  await expect(page.getByTestId('ics-status')).toHaveText('Added with your current times.');
  expect(await settingsOf(page)).toMatchObject({ fastCalendar: false, icsSequence: 0 });
});

test('a Fast backup with no calendar file says nothing about Fast\'s events', async ({ page }) => {
  await openAt(page, '2026-10-17T10:00', '#more');
  const obj = fastBackup();
  obj.data.settings = obj.data.settings.map((x) => (x.key === 'icsTimes' ? { key: 'icsTimes', value: null } : x));
  await page.getByTestId('restore-input').setInputFiles({ name: 'fast-backup-2026-10-14.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
  // Nothing on this iPhone yet: nothing to remove.
  await expect(sheet(page, 'restore').getByTestId('restore-span')).toHaveText('This backup runs 25 Sep to 14 Oct.');
  await expect(sheet(page, 'restore').getByTestId('restore-loss')).toHaveCount(0);
  await tap(page, 'confirm-restore');
  await expect(page.getByTestId('flash')).toHaveText('Backup restored.');
  await expect(page.getByTestId('ics-status')).toHaveText('Not added yet.');
});
