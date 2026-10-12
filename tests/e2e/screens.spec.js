// Screenshots of every screen and state at 390 x 844 for design review, plus
// a contrast audit of every visible piece of text in each state.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setDate, setPick, setTime, settings, ms, shot, scrollSheet } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

/** Sixty days of windows up to Saturday 26 September; weekends open earlier; one day unlogged, three paused. */
function sixtyDays() {
  const DAY = 86_400_000;
  const base = ms('2026-07-29T00:00');
  const days = [];
  for (let i = 0; i < 60; i++) {
    if (i === 12) continue;
    const key = new Date(base + i * DAY + 3 * 3_600_000).toISOString().slice(0, 10);
    if (i >= 44 && i <= 46) {
      days.push({ day: key, paused: 'travel' });
      continue;
    }
    const weekend = [5, 6].includes(new Date(`${key}T12:00:00Z`).getUTCDay());
    const start = (weekend ? 13 * 60 : 16 * 60 + 30) + ((i * 37) % 150);
    const length = 150 + ((i * 53) % 110);
    const firstBite = base + i * DAY + start * 60_000;
    days.push({ day: key, firstBite, lastBite: firstBite + length * 60_000 });
  }
  return days;
}

test('today: before the window', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, '01-today-before-workday');
  await shot(page, '01b-today-before-full', { full: true });
  await tap(page, 'edit-last-bite');
  await shot(page, '01f-last-bite-sheet');
});

test('today: fasting stages', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await page.locator('[data-block="stages"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await shot(page, '01c-today-stages');
  await tap(page, 'about-stages');
  await shot(page, '01d-stages-sheet');
  await scrollSheet(page, 'stages');
  await shot(page, '01e-stages-sheet-end');
});

test('today: window open, phases and sheets', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await choose(page, 'meal-type', 'Dinner');
  await pick(page, 'hunger', 7);
  await shot(page, '02-start-meal-sheet');
  await tap(page, 'start-eating');
  await advance(page, 40);
  await shot(page, '03-today-open');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await shot(page, '04-finish-meal-sheet');
  await tap(page, 'save-finish');
  await advance(page, 21);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 7);
  await shot(page, '05-fullness-check');
  await tap(page, 'save-fullness');
  await advance(page, 155); // 21:06, 24 minutes left
  await shot(page, '06-today-open-warn');
  await advance(page, 30); // grace
  await shot(page, '07-today-open-grace');
  await advance(page, 20); // over
  await shot(page, '08-today-open-over');
  await tap(page, 'done-eating');
  await shot(page, '09-done-eating-sheet');
});

test('today: just closed, the fullness check above the new fast', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T20:50'), lastBite: ms('2026-09-27T21:30') }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T20:50'), finishedAt: ms('2026-09-27T21:30'), hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20DueAt: ms('2026-09-27T21:50') }],
    settings: install,
  });
  await expect(page.locator('[data-block="satiety-pointer"]')).toBeVisible();
  await shot(page, '10d-today-just-closed-fullness');
});

test('today: closed, success and miss', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:34'), lastBite: ms('2026-09-27T21:26'), energy4pm: 4, trained: true, trainingType: 'weights' }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:34'), finishedAt: ms('2026-09-27T18:10'), hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20: 7 }],
    settings: install,
  });
  await shot(page, '10-today-closed-success');
  await shot(page, '10b-today-closed-full', { full: true });
  await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
  await shot(page, '10c-today-closed-window-below');
  await tap(page, 'ate-something');
  await choose(page, 'trigger', 'boredom');
  await choose(page, 'amount', 'little');
  await shot(page, '11-outside-sheet');
  await tap(page, 'save-outside');
  await shot(page, '12-outside-slip-line');
  await tap(page, 'done');
  await shot(page, '13-today-closed-miss-outside');
});

test('today: over by 20 min and the forgotten close', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T21:20') }], settings: install });
  await shot(page, '14-today-closed-over');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T15:30'), lastBite: null }], settings: install });
  await shot(page, '15-today-forgot-close');
});

test('today: correcting a window', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T16:30'), lastBite: null }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T16:30'), finishedAt: null }],
    settings: install,
  });
  await shot(page, '17-today-open-change-link');
  await tap(page, 'change-opening');
  await shot(page, '18-opening-sheet');
  await tap(page, 'remove-window');
  await shot(page, '18b-opening-remove-confirm');
  await tap(page, 'keep-window');
  await tap(page, 'close-sheet');
  await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T12:30'), lastBite: ms('2026-09-27T16:50') }], settings: install });
  await tap(page, 'change-times');
  await shot(page, '19-window-times-sheet');
});

test('add a meal: the form, what it does to the window, a miss in words', async ({ page }) => {
  await openAt(page, '2026-09-27T14:20'); // a Sunday, a workday
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'add-meal');
  await choose(page, 'meal-type', 'Lunch');
  await pick(page, 'hunger', 6);
  await scrollSheet(page, 'add-meal', 'top');
  await shot(page, '19b-add-meal-sheet');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await choose(page, 'last-meal', 'true');
  await scrollSheet(page, 'add-meal');
  await shot(page, '19c-add-meal-sheet-end');
  await tap(page, 'save-added-meal');
  await shot(page, '19d-today-after-added-meal');
  // After the window and its goal: eating outside it, a miss in words.
  const days = WEEK.days.map((d) => (d.day === '2026-09-26' ? { ...d, firstBite: ms('2026-09-26T13:00'), lastBite: ms('2026-09-26T15:00') } : d));
  await seed(page, { ...WEEK, days, settings: install });
  await page.locator('.tab[data-tab="satiety"]').click();
  await shot(page, '19e-satiety-add-meal');
  await tap(page, 'add-meal');
  await choose(page, 'added-day', '2026-09-26');
  await setTime(page, 'added-start', '20:00');
  await scrollSheet(page, 'add-meal');
  await shot(page, '19f-add-meal-outside');
});

test('today: notices', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { days: [WEEK.days[0]], settings: settings({ installedAt: ms('2026-09-18T08:00') }) });
  await shot(page, '16-today-notices');
});

test('temptation flow', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'tempted');
  await shot(page, '20-tempted-trigger');
  await choose(page, 'trigger', 'boredom');
  await shot(page, '21-tempted-gains');
  await tap(page, 'ride-it-out');
  await shot(page, '22-tempted-surf');
  await pick(page, 'urge', 7);
  await advance(page, 4);
  await shot(page, '23-tempted-surf-4min', { full: true });
  await tap(page, 'stop-timer');
  await shot(page, '24-tempted-how-now');
  await tap(page, 'with-people');
  await shot(page, '25-tempted-social', { full: true });
  await tap(page, 'cant-avoid');
  await shot(page, '26-tempted-cant-before');
  await tap(page, 'back');
  await tap(page, 'ride-it-out');
  await advance(page, 11);
  await tap(page, 'held');
  await shot(page, '27-tempted-held');
});

test('temptation flow after the window', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:30') }], settings: install });
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'tired');
  await tap(page, 'cant-avoid');
  await shot(page, '28-tempted-cant-after');
});

test('week, day, weight, more, help', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await shot(page, '30-week');
  await shot(page, '30b-week-full', { full: true });
  await page.locator('.dayrow[data-day="2026-09-24"]').click();
  await shot(page, '31-day-editor', { full: true });
  await page.locator('.tab[data-tab="history"]').click();
  await choose(page, 'history-metric', 'weight');
  await page.evaluate(async () => {
    const db = await import('/sabr/js/db.js');
    const w = [];
    let kg = 106.2;
    for (let d = new Date('2026-07-05T12:00:00Z'); d <= new Date('2026-09-26T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      kg -= 0.03 + (d.getUTCDate() % 3) * 0.01;
      w.push({ date: d.toISOString().slice(0, 10), kg: Math.round(kg * 10) / 10 });
    }
    await db.replaceAll({ ...(await db.readAll()), weights: w });
  });
  await page.reload();
  await shot(page, '32-weight');
  await choose(page, 'weight-range', '1m');
  await shot(page, '32b-weight-1-month');
  await choose(page, 'weight-range', '3m');
  await page.locator('.chart').click({ position: { x: 120, y: 80 } });
  await tap(page, 'toggle-table');
  await shot(page, '33-weight-table', { full: true });
  await page.locator('.tab[data-tab="more"]').click();
  await shot(page, '34-more');
  await shot(page, '34b-more-full', { full: true });
  await tap(page, 'reset');
  await shot(page, '38-reset-first');
  await tap(page, 'reset-continue');
  await shot(page, '39-reset-final');
  await tap(page, 'reset-keep');
  await tap(page, 'help');
  await shot(page, '35-help', { full: true });
});

test('week: a window still open, with its key', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="week"]').click();
  await expect(page.getByTestId('strip-legend')).toContainText('Window still open');
  await page.getByTestId('strip-legend').scrollIntoViewIfNeeded();
  await shot(page, '30c-week-window-open');
});

test('history: fast and feast, bars and line, ranges, table', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, { days: sixtyDays(), settings: install });
  await shot(page, '40-history-fast-bars-30');
  await choose(page, 'history-chart', 'line');
  await shot(page, '41-history-fast-line-30');
  await choose(page, 'history-metric', 'feast');
  await choose(page, 'history-range', '90');
  await shot(page, '42-history-feast-line-90');
  await choose(page, 'history-chart', 'bars');
  await shot(page, '42b-history-feast-bars-90');
  await choose(page, 'history-range', '7');
  await page.getByTestId('history-chart').locator('rect[data-day="2026-09-23"]').click();
  await shot(page, '43-history-feast-bars-7');
  await tap(page, 'history-toggle-table');
  await shot(page, '44-history-table', { full: true });
});

test('weight: a few weigh-ins a week, with dots and a break in the line', async ({ page }) => {
  await openAt(page, '2026-10-08T09:00', '#weight');
  const weights = [];
  // About three weigh-ins a week from July, two in some weeks, and none for most of September.
  for (let d = new Date('2026-07-01T12:00:00Z'), i = 0; d <= new Date('2026-10-07T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1), i++) {
    const key = d.toISOString().slice(0, 10);
    if (key > '2026-09-02' && key < '2026-09-28') continue;
    if ([0, 2, 4].includes(d.getUTCDay()) || (i % 9 === 0)) weights.push({ date: key, kg: Math.round((106 - i * 0.03 + (i % 3) * 0.2) * 10) / 10 });
  }
  await seed(page, { weights, settings: [...install, ...settings({ weightRange: '3m' })] });
  await page.locator('[data-block="chart"]').scrollIntoViewIfNeeded();
  await shot(page, '32c-weight-sparse');
  // A day chosen on the chart: the big box follows it, with Back to latest.
  const chart = page.locator('[data-block="chart"] svg.chart');
  const box = await chart.boundingBox();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height / 2);
  await expect(page.locator('[data-action="weight-latest"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '32e-weight-day-chosen');
  await tap(page, 'toggle-table');
  await shot(page, '32d-weight-sparse-table', { full: true });
});

test('weight: empty, import page', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00', '#weight');
  await shot(page, '36-weight-empty');
  await page.locator('.tab[data-tab="history"]').click();
  await shot(page, '45-history-empty');
  await page.goto('./import/#w=2026-09-20:104.6,2026-09-21:104.3,2026-09-22:104.1');
  await expect(page.getByTestId('import-result')).toBeVisible();
  await shot(page, '37-import-page');
});

test('pauses and undo', async ({ page }) => {
  // Today on a paused day, then the week around it.
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await shot(page, '50-today-paused');
  await page.locator('.tab[data-tab="week"]').click();
  await shot(page, '51-week-paused', { full: true });
  await page.locator('.dayrow[data-day="2026-09-29"]').click();
  await shot(page, '52-day-paused');
  // More: the list, and the sheet for a new pause.
  await page.locator('.tab[data-tab="more"]').click();
  await page.locator('[data-block="pauses"]').scrollIntoViewIfNeeded();
  await shot(page, '53-more-pauses');
  await tap(page, 'add-pause');
  await setDate(page, 'pause-from', '2027-02-08');
  await setDate(page, 'pause-to', '2027-03-09');
  await choose(page, 'pause-reason', 'ramadan');
  await shot(page, '54-pause-sheet');
  await tap(page, 'save-pause');
  await expect(sheet(page, 'pause')).toHaveCount(0);
  await expect(page.getByTestId('flash')).toHaveText('Paused: Mon 8 Feb to Tue 9 Mar.');
  await shot(page, '55-flash-undo');
});

test('undo bar after a time change', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'edit-last-bite');
  await setTime(page, 'edit-last-bite', '22:10');
  await tap(page, 'save-last-bite');
  await shot(page, '56-today-undo-bar');
});

test('start screen, Begin fast and goals', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await shot(page, '60-start-new-user');
  await tap(page, 'begin-fast');
  await tap(page, 'fast-last');
  await shot(page, '61-begin-fast-sheet');
  await tap(page, 'save-fast');
  await expect(sheet(page, 'begin-fast')).toHaveCount(0);
  await shot(page, '62-today-fast-begun');
  await tap(page, 'edit-goal');
  await choose(page, 'goal', 'custom');
  await setPick(page, 'goal-hours', 6);
  await shot(page, '63-goal-sheet');
  await choose(page, 'goal-by', 'fast');
  await setPick(page, 'goal-fast', 48);
  await shot(page, '63b-goal-sheet-long-fast');
  await tap(page, 'close-sheet');
  await page.locator('[data-block="before"]').scrollIntoViewIfNeeded();
  await shot(page, '63c-today-long-fast');
  await page.locator('.tab[data-tab="more"]').click();
  await shot(page, '64-more-goal');
});

test('a long fast: the fasting day after the last bite, then the day of the goal', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T16:00'), lastBite: ms('2026-09-26T21:00') }],
    settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 6, fast: 48 }] }),
  });
  await shot(page, '64b-today-fasting-day');
  await page.locator('[data-block="plan"]').scrollIntoViewIfNeeded();
  await shot(page, '64c-today-fasting-day-plan');
  await openAt(page, '2026-09-28T10:00', '#week');
  await shot(page, '64d-week-fasted-day');
});

test('the streak and the fullness of the day', async ({ page }) => {
  // Forty days: every one a success, every other one left wanting.
  const days = [];
  for (let i = 0; i < 40; i++) {
    const key = new Date(Date.UTC(2026, 7, 17 + i)).toISOString().slice(0, 10);
    days.push({ day: key, firstBite: ms(`${key}T17:00`), lastBite: ms(`${key}T20:30`), fullness: i % 2 ? 'full' : 'before_full' });
  }
  days[39] = { ...days[39], fullness: undefined };
  await openAt(page, '2026-09-25T22:00');
  await seed(page, { days, settings: install });
  await page.locator('[data-block="streak"]').scrollIntoViewIfNeeded();
  await shot(page, '65-today-streak');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '66-today-fullness-card');
});

test('satiety tab, legends and feasting hours', async ({ page }) => {
  const meals = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10);
    const stop = ['before_full', 'full', 'full', 'stuffed'][i % 4];
    meals.push({ id: i + 1, day, name: i % 3 ? 'Dinner' : 'Lunch', startedAt: ms(`${day}T17:30`), finishedAt: ms(`${day}T18:00`), hungerBefore: 5 + (i % 4), stop, fullnessNow: 5 + (i % 3), fullness20: i === 13 ? null : 6 + (i % 4) });
  }
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  await shot(page, '70-satiety-insights');
  await shot(page, '70b-satiety-insights-full', { full: true });
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await shot(page, '70c-satiety-overfull-only', { full: true });
  await tap(page, 'show-all');
  await choose(page, 'satiety-view', 'meals');
  await shot(page, '71-satiety-meals');
  await choose(page, 'satiety-view', 'now');
  await shot(page, '72-satiety-now');
  await page.locator('.tab[data-tab="week"]').click();
  await shot(page, '73-week-legend');
  await page.locator('.tab[data-tab="today"]').click();
  await shot(page, '74-today-closed');
  await page.locator('.tab[data-tab="history"]').click();
  await shot(page, '76-history-legend', { full: true });
  await page.getByTestId('history-legend').locator('button[data-series="miss"]').click();
  await shot(page, '76b-history-misses-only');
  await page.locator('.tab[data-tab="more"]').click();
  await choose(page, 'timing', 'flexible');
  await shot(page, '77-more-feasting-hours');
});

test('today before the window: ring legend, Start a meal alone, feasting hours', async ({ page }) => {
  await openAt(page, '2026-09-27T11:00');
  await seed(page, { ...WEEK, settings: [...install, { key: 'flexChanges', value: [{ from: '2026-09-27', on: true }] }] });
  await shot(page, '78-today-before-flexible', { full: true });
});

test('the week on Today, with all seven days of the seeded week', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, '82-today-week-row');
});

test('the goal reached, then the fast marked complete', async ({ page }) => {
  // Sunday 18:10: 20 h 10 min after Saturday's window, so the goal is reached.
  await openAt(page, '2026-09-27T18:10');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, '83-today-goal-reached');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await shot(page, '84-today-fast-complete');
});

test('the stages one at a time, opened from the stage under the time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'open-stages');
  await shot(page, '85-stages-from-the-chip');
  await tap(page, 'stage-ketones');
  await shot(page, '86-stages-ketones');
  await tap(page, 'stage-brain');
  await shot(page, '87-stages-brain');
  await tap(page, 'stage-sparing');
  await shot(page, '88-stages-sparing');
  await tap(page, 'more-sparing');
  await shot(page, '88b-stage-more-sparing');
  await scrollSheet(page, 'stages');
  await shot(page, '88c-stage-more-sparing-end');
  await tap(page, 'stages-back-end');
  await tap(page, 'stage-switch');
  await tap(page, 'more-switch');
  await shot(page, '88d-stage-more-switch');
  await page.getByTestId('stage-findings').scrollIntoViewIfNeeded();
  await shot(page, '88e-stage-more-switch-findings');
});

test('today on the third day of a fast: the sun on the far horizon, the stage beyond a day', async ({ page }) => {
  await openAt(page, '2026-09-28T23:30');
  await seed(page, { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }], settings: install });
  await shot(page, '89-today-third-day');
  await page.locator('[data-block="stages"]').scrollIntoViewIfNeeded();
  await shot(page, '89b-today-third-day-stage');
  await tap(page, 'open-stages');
  await shot(page, '89c-stages-third-day');
});

test.describe('travel', () => {
  test.use({ timezoneId: 'Asia/Dubai' });

  test('today in Dubai: the header says whose time it is', async ({ page }) => {
    await openAt(page, '2026-10-02T18:00');
    await seed(page, { ...WEEK, settings: [...install, { key: 'zoneSeenAt', value: ms('2026-09-27T10:00') }] });
    await shot(page, '80-today-dubai');
    await page.goto('./#day/2026-09-26');
    await shot(page, '81-day-kuwait-from-dubai');
  });
});

