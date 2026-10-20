// The More group in every state, shot at 390 x 844 for design review
// (test-results/screens, names starting with M), each with the contrast
// audit of shot(): More, Help, the Goal, Pause, Reset, Restore, Copies and
// time sheets, the Tempted flow and the first-run welcome.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setDate, setPick, setTime, settings, ms, shot, scrollSheet, captureShares, sharedFiles, copiesInDb } from './helpers.js';
import { WEEK, fastBackup } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

/** Sabr before the move from Fast: three days logged after Fast's last one. */
const FAST_PHONE = {
  days: [
    { day: '2026-10-15', firstBite: ms('2026-10-15T17:40'), lastBite: ms('2026-10-15T21:00') },
    { day: '2026-10-16', firstBite: ms('2026-10-16T14:00'), lastBite: ms('2026-10-16T17:30') },
  ],
  weights: [{ date: '2026-10-17', kg: 103.2 }],
  settings: settings({ installedAt: ms('2026-10-15T08:00'), lastBackupAt: ms('2026-10-16T21:00'), lastImportAt: ms('2026-10-17T09:00') }),
};

test('more: the goal hero, the groups, help and reset', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#more');
  await seed(page, WEEK);
  await shot(page, 'M34-more');
  await shot(page, 'M34b-more-full', { full: true });
  await page.locator('[data-block="reminder-times"]').scrollIntoViewIfNeeded();
  await shot(page, 'M34c-more-reminders');
  await page.locator('[data-block="backup"]').scrollIntoViewIfNeeded();
  await shot(page, 'M34d-more-your-data');
  await page.locator('[data-action="edit-trainingTime"]').click();
  await shot(page, 'M36-time-sheet');
  await tap(page, 'close-sheet');
  await tap(page, 'reset');
  await shot(page, 'M38-reset-first');
  await tap(page, 'reset-continue');
  await shot(page, 'M39-reset-final');
  await tap(page, 'reset-keep');
  await expect(sheet(page, 'reset')).toHaveCount(0);
  await tap(page, 'help');
  await shot(page, 'M35-help');
  await shot(page, 'M35b-help-full', { full: true });
  await page.locator('[data-block="moving"]').scrollIntoViewIfNeeded();
  await shot(page, 'M35c-help-backups-moving');
});

test('more: a calendar file to add again, feasting hours, Alarms on', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#more');
  await seed(page, { ...WEEK, settings: [...install, { key: 'icsTimes', value: 'old' }, { key: 'alarms', value: true }] });
  await page.locator('[data-block="calendar"]').scrollIntoViewIfNeeded();
  await shot(page, 'M34e-more-calendar-changed');
  await page.evaluate(() => window.scrollTo(0, 0));
  await choose(page, 'timing', 'flexible');
  await shot(page, 'M77-more-feasting-hours');
});

test('more: pauses running and ahead, the pause sheet in its states', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00', '#more');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' })), ...['2026-10-10', '2026-10-11'].map((day) => ({ day, paused: 'illness' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await page.locator('[data-block="pauses"]').scrollIntoViewIfNeeded();
  await shot(page, 'M53-more-pauses');
  await tap(page, 'add-pause');
  await setDate(page, 'pause-from', '2027-02-08');
  await setDate(page, 'pause-to', '2027-03-09');
  await choose(page, 'pause-reason', 'ramadan');
  await shot(page, 'M54-pause-sheet');
  await tap(page, 'close-sheet');
  await expect(sheet(page, 'pause')).toHaveCount(0);
  await page.locator('[data-pause="2026-09-29"]').click();
  await shot(page, 'M54b-pause-sheet-change');
  await tap(page, 'close-sheet');
  await expect(sheet(page, 'pause')).toHaveCount(0);

  // A window still open: the pause is refused, with the reason in the footer.
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'add-pause');
  await tap(page, 'save-pause');
  await expect(sheet(page, 'pause').getByTestId('pause-hint')).toBeVisible();
  await shot(page, 'M54c-pause-sheet-refused');
});

test('goal: the sheet with presets, custom and a long fast, then More', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'edit-goal');
  await shot(page, 'M63-goal-sheet');
  await choose(page, 'goal', '6');
  await expect(page.getByTestId('flash')).toHaveText('Goal 18:6 from today.');
  await shot(page, 'M63a-goal-sheet-flash');
  await choose(page, 'goal', 'custom');
  await setPick(page, 'goal-hours', 6);
  await shot(page, 'M63b-goal-sheet-custom');
  await choose(page, 'goal-by', 'fast');
  await setPick(page, 'goal-fast', 48);
  // The caption's last line clears the flash.
  await scrollSheet(page, 'goal');
  await shot(page, 'M63c-goal-sheet-long-fast');
  await tap(page, 'close-sheet');
  await page.locator('.tab[data-tab="more"]').click();
  await shot(page, 'M64-more-goal-long-fast');
});

test('restore: the sheet before replacing everything', async ({ page }) => {
  await captureShares(page);
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, WEEK);
  await tap(page, 'backup');
  await expect.poll(async () => (await sharedFiles(page)).length).toBe(1);
  const [file] = await sharedFiles(page);
  await page.getByTestId('restore-input').setInputFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) });
  await expect(sheet(page, 'restore')).toBeVisible();
  await shot(page, 'M40-restore-sheet');
});

test('restore from Fast: what the file covers and removes, the message with Undo, the calendar note', async ({ page }) => {
  await openAt(page, '2026-10-17T10:00', '#more');
  await seed(page, FAST_PHONE);
  await page.getByTestId('restore-input').setInputFiles({ name: 'fast-backup-2026-10-14.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fastBackup())) });
  await expect(sheet(page, 'restore').getByTestId('restore-loss')).toBeVisible();
  await shot(page, 'M40b-restore-sheet-from-fast');
  await tap(page, 'confirm-restore');
  await expect(page.getByTestId('flash')).toHaveText('Backup restored.');
  await shot(page, 'M40c-restored-undo');
  await page.locator('[data-block="calendar"]').scrollIntoViewIfNeeded();
  await shot(page, 'M34f-more-calendar-from-fast');
});

test('copies on this iPhone: the list, Bring back asking, the message after', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, { ...WEEK, settings: install });
  await page.clock.runFor(2000);
  await expect.poll(async () => (await copiesInDb(page)).length).toBe(1);
  // Earlier copies of the same data, of every kind.
  await page.evaluate(async (list) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sabr-copies');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('copies', 'readwrite');
      const os = tx.objectStore('copies');
      const read = os.getAll();
      read.onsuccess = () => {
        const [today] = read.result;
        for (const [kind, at] of list) {
          const { id, ...rest } = today;
          os.put({ ...rest, kind, at });
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, [['before-reset', ms('2026-09-24T07:12')], ['before-bring-back', ms('2026-09-24T22:05')], ['daily', ms('2026-09-25T07:30')], ['before-restore', ms('2026-09-26T21:40')]]);
  await page.locator('[data-block="copies"]').scrollIntoViewIfNeeded();
  await tap(page, 'copies');
  const s = sheet(page, 'copies');
  await expect(s.locator('li.copy')).toHaveCount(5);
  await shot(page, 'M41-copies-sheet');
  await s.locator('li.copy').nth(1).locator('[data-action="bring-back"]').click();
  await expect(s.locator('.copy-confirm')).toBeVisible();
  await shot(page, 'M41b-copies-confirm');
  await tap(page, 'confirm-bring-back');
  await expect(page.getByTestId('flash')).toHaveText('Copy brought back.');
  await shot(page, 'M41c-copies-brought-back');
});

test('copies on this iPhone: none yet', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await tap(page, 'copies');
  await expect(sheet(page, 'copies').getByTestId('copies-empty')).toBeVisible();
  await shot(page, 'M41d-copies-none-yet');
});

test('tempted: every step before the window', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'tempted');
  await shot(page, 'M20-tempted-trigger');
  await choose(page, 'trigger', 'boredom');
  await shot(page, 'M21-tempted-gains');
  await tap(page, 'ride-it-out');
  await shot(page, 'M22-tempted-surf');
  await pick(page, 'urge', 7);
  await advance(page, 4);
  await shot(page, 'M23-tempted-surf-4min');
  await pick(page, 'urge', 5);
  await expect(sheet(page, 'temptation').locator('.urge-so-far')).toHaveText('Urge so far: 7, 5.');
  await shot(page, 'M23b-tempted-surf-so-far');
  await tap(page, 'stop-timer');
  await shot(page, 'M24-tempted-how-now');
  await tap(page, 'with-people');
  await shot(page, 'M25-tempted-social');
  await tap(page, 'cant-avoid');
  await shot(page, 'M26-tempted-cant-before');
  await tap(page, 'back');
  await tap(page, 'close-flow');
  await shot(page, 'M29-tempted-ask');
  await tap(page, 'held');
  await shot(page, 'M27-tempted-held');
});

test('tempted: after the window, a slip and the question at the end', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:30') }], settings: install });
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'tired');
  await shot(page, 'M21b-tempted-gains-after');
  await tap(page, 'cant-avoid');
  await shot(page, 'M28-tempted-cant-after');
  await tap(page, 'eat-little');
  await shot(page, 'M28b-tempted-slip');
  await tap(page, 'done');

  // Just after midnight, last night's window: both ways out, and every answer at the end.
  await openAt(page, '2026-09-27T23:50');
  await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }], settings: install });
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'boredom');
  await tap(page, 'ride-it-out');
  await advance(page, 11);
  await tap(page, 'cant-avoid');
  await shot(page, 'M28c-tempted-cant-late');
  await tap(page, 'back');
  await tap(page, 'close-flow');
  await shot(page, 'M29b-tempted-ask-late');
});

test.describe('the first-run welcome', () => {
  test.use({ welcome: true });

  test('three steps, and Custom', async ({ page }) => {
    await openAt(page, '2026-09-27T09:00');
    await expect(sheet(page, 'welcome')).toBeVisible();
    await shot(page, 'MW1-welcome-goal');
    await choose(page, 'goal', 'custom');
    await shot(page, 'MW1b-welcome-goal-custom');
    await choose(page, 'goal', '4');
    await tap(page, 'welcome-next');
    await setTime(page, 'workdayStart', '18:00');
    await shot(page, 'MW2-welcome-planned');
    await tap(page, 'welcome-next');
    await shot(page, 'MW3-welcome-home');
  });
});
