// Screenshots at 390 x 844 for design review, with a contrast audit of every
// visible piece of text in each state. Each screen group shoots its own states
// in screens-<group>.spec.js (T today, ST stages, F forms, W week and day,
// H history and weight, SA satiety, M more, help, goal, pause, Tempted and the
// welcome); this file holds only the states no group shoots, so every state
// is shot once, under one name.
import { test, expect, openAt, seed, tap, pick, choose, sheet, setDate, setPick, settings, ms, shot, scrollSheet } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

test('today: a window opened with a meal still being eaten', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T16:30'), lastBite: null }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T16:30'), finishedAt: null }],
    settings: install,
  });
  await shot(page, '17-today-open-change-link');
});

test('add a meal: Today after it, and Satiety with Add a meal', async ({ page }) => {
  await openAt(page, '2026-09-27T14:20'); // a Sunday, a workday
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'add-meal');
  await choose(page, 'meal-type', 'Lunch');
  await pick(page, 'hunger', 6);
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await choose(page, 'last-meal', 'true');
  await scrollSheet(page, 'add-meal');
  await tap(page, 'save-added-meal');
  await expect(sheet(page, 'add-meal')).toHaveCount(0);
  await shot(page, '19d-today-after-added-meal');
  const days = WEEK.days.map((d) => (d.day === '2026-09-26' ? { ...d, firstBite: ms('2026-09-26T13:00'), lastBite: ms('2026-09-26T15:00') } : d));
  await seed(page, { ...WEEK, days, settings: install });
  await page.locator('.tab[data-tab="satiety"]').click();
  await shot(page, '19e-satiety-add-meal');
});

test('a pause saved: the message with Undo', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'add-pause');
  await setDate(page, 'pause-from', '2027-02-08');
  await setDate(page, 'pause-to', '2027-03-09');
  await choose(page, 'pause-reason', 'ramadan');
  await tap(page, 'save-pause');
  await expect(sheet(page, 'pause')).toHaveCount(0);
  await expect(page.getByTestId('flash')).toHaveText('Paused: Mon 8 Feb to Tue 9 Mar.');
  await shot(page, '55-flash-undo');
});

test('a 48 h goal set from a new start: Today before the window', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await tap(page, 'begin-fast');
  await tap(page, 'fast-last');
  await tap(page, 'save-fast');
  await expect(sheet(page, 'begin-fast')).toHaveCount(0);
  await tap(page, 'edit-goal');
  await choose(page, 'goal', 'custom');
  await choose(page, 'goal-by', 'fast');
  await setPick(page, 'goal-fast', 48);
  await tap(page, 'close-sheet');
  await page.locator('[data-block="before"]').scrollIntoViewIfNeeded();
  await shot(page, '63c-today-long-fast');
});

test('fourteen rated meals: Week and Today with their legends', async ({ page }) => {
  const meals = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10);
    const stop = ['before_full', 'full', 'full', 'stuffed'][i % 4];
    meals.push({ id: i + 1, day, name: i % 3 ? 'Dinner' : 'Lunch', startedAt: ms(`${day}T17:30`), finishedAt: ms(`${day}T18:00`), hungerBefore: 5 + (i % 4), stop, fullnessNow: 5 + (i % 3), fullness20: i === 13 ? null : 6 + (i % 4) });
  }
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, { ...WEEK, meals, settings: install });
  await shot(page, '73-week-legend');
  await page.locator('.tab[data-tab="today"]').click();
  await shot(page, '74-today-closed');
});

test('the stages sheet: Brain fuel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'open-stages');
  await tap(page, 'stage-brain');
  await shot(page, '87-stages-brain');
});
