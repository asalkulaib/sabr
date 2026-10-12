import { test, expect, openAt, advance, tap, pick, choose, setTime, sheet, readDb, seed, settings, ms } from './helpers.js';

// 2026-09-27 is a Sunday (workday); 2026-09-25 a Friday and 2026-09-26 a Saturday.

async function openWindow(page) {
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal')).toBeVisible();
}

async function startFirstMeal(page, name = 'Dinner', hunger = 7) {
  await expect(page.getByText('Protein and vegetables first.')).toBeVisible();
  await expect(page.getByText('Pause halfway.')).toBeVisible();
  await choose(page, 'meal-type', name);
  await pick(page, 'hunger', hunger);
  await tap(page, 'start-eating');
  await expect(sheet(page, 'start-meal')).toBeHidden();
}

/** The 20-minute fullness check opens by itself once it is due. */
async function answerFullness(page, value = 7) {
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', value);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toBeHidden();
}

async function closeWindowAt(page, hhmm) {
  await tap(page, 'done-eating');
  await expect(sheet(page, 'done-eating')).toBeVisible();
  if (hhmm) await setTime(page, 'last-bite', hhmm);
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
}

test('a normal window: first bite, a meal, the 20-minute check, done eating', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(page.getByTestId('firm-reminder')).toHaveCount(0); // after 16:00
  await openWindow(page);
  await startFirstMeal(page);

  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(page.getByTestId('countdown')).toHaveText('4:00');
  await expect(page.locator('[data-action="tempted"]')).toHaveCount(0); // hidden during the window

  await advance(page, 30);
  await expect(page.getByTestId('countdown')).toHaveText('3:30');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect(page.getByTestId('flash')).toHaveText('Fullness check at 18:20.');

  await advance(page, 20);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await expect(page.getByText('20 minutes after Dinner')).toBeVisible();
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toBeHidden();

  await advance(page, 160); // 21:00
  await closeWindowAt(page);
  await expect(page.getByTestId('window-length')).toHaveText('3h 30m');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('result')).toHaveText('Success. All eating inside the window.');
  await expect(page.getByTestId('streak')).toHaveText('1 day');
  await expect(page.getByTestId('next-window')).toHaveText("Tomorrow's window opens at 17:30.");

  const db = await readDb(page);
  const day = db.days.find((d) => d.day === '2026-09-27');
  expect(day.firstBite).toBe(ms('2026-09-27T17:30'));
  expect(day.lastBite).toBe(ms('2026-09-27T21:00'));
  const meal = db.meals[0];
  expect(meal).toMatchObject({ name: 'Dinner', hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20: 7 });
  expect(meal.finishedAt).toBe(ms('2026-09-27T18:00'));
});

test('4 h 10 min is a success inside the grace period', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 215); // 20:35, 25 minutes left
  await expect(page.getByTestId('warn-30')).toHaveText('25 min left. The window closes at 21:00.');
  await advance(page, 30); // 21:05, inside grace
  await expect(page.getByTestId('grace')).toContainText('10 min of grace left');
  await advance(page, 5); // 21:10
  await closeWindowAt(page);
  await expect(page.getByTestId('window-length')).toHaveText('4h 10m');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
});

test('4 h 20 min is a miss, shown as over by 20 min', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 260); // 21:20
  await expect(page.getByTestId('over')).toHaveText('Over by 20 min');
  await closeWindowAt(page);
  await expect(page.getByTestId('window-length')).toHaveText('4h 20m');
  await expect(page.getByTestId('window-length')).toHaveClass(/clay/);
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  await expect(page.getByTestId('result')).toHaveText('Over by 20 min.');
  await expect(page.getByTestId('streak')).toHaveText('0 days'); // a miss is no success
});

test('a workday window opening at 15:30 is a miss even when short', async ({ page }) => {
  await openAt(page, '2026-09-27T15:30');
  await expect(page.getByTestId('firm-reminder')).toHaveText('Opening before 16:00 makes today a miss.');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toHaveText('Before 16:00 on a workday: today will count as a miss.');
  await startFirstMeal(page);
  await expect(page.getByText('Opened before 16:00, so today counts as a miss.')).toBeVisible();
  await advance(page, 150); // 18:00, only 2 h 30 min
  await closeWindowAt(page);
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  await expect(page.getByTestId('result')).toHaveText('Opened at 15:30, before 16:00.');
});

test('weekend windows can move earlier or later', async ({ page }) => {
  await openAt(page, '2026-09-25T12:00'); // Friday
  await expect(page.getByTestId('firm-reminder')).toHaveCount(0);
  await expect(page.locator('[data-block="before"]')).toContainText('Window planned for 14:00.');
  await openWindow(page);
  await startFirstMeal(page, 'Lunch');
  await advance(page, 210); // 15:30
  await closeWindowAt(page);
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');

  // Saturday, later than planned.
  await page.clock.setSystemTime(new Date('2026-09-26T19:00:00+03:00'));
  await advance(page, 0);
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 225); // 22:45
  await closeWindowAt(page);
  await expect(page.getByTestId('window-length')).toHaveText('3h 45m');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('streak')).toHaveText('2 days');
});

test('eating after the window closes is recorded with its trigger and makes the day a miss', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 150); // 20:00
  await closeWindowAt(page);
  await expect(page.locator('[data-action="reopen"]')).toBeVisible(); // still inside the 4 hours
  await advance(page, 25); // 20:25: the meal ended at 20:00, so its fullness check is due
  await answerFullness(page);
  await advance(page, 70); // 21:35: the 4 hours are over
  await expect(page.locator('[data-action="reopen"]')).toHaveCount(0);

  await advance(page, 55); // 22:30
  await tap(page, 'ate-something');
  await expect(sheet(page, 'outside')).toBeVisible();
  await expect(sheet(page, 'outside')).toContainText('What set it off?');
  await choose(page, 'trigger', 'boredom');
  await choose(page, 'amount', 'little');
  await tap(page, 'save-outside');
  await expect(page.getByTestId('slip-line')).toHaveText("Tomorrow's window opens at 17:30.");
  await tap(page, 'done');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  await expect(page.getByTestId('result')).toHaveText('Ate outside the window.');

  const db = await readDb(page);
  expect(db.outside).toHaveLength(1);
  expect(db.outside[0]).toMatchObject({ day: '2026-09-27', trigger: 'boredom', amount: 'little', at: ms('2026-09-27T22:30') });
});

test('reopening inside the 4 hours keeps the day a success', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 60);
  await closeWindowAt(page); // 18:30
  await advance(page, 60); // 19:30
  await answerFullness(page);
  await tap(page, 'reopen');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await advance(page, 60); // 20:30
  await closeWindowAt(page);
  await expect(page.getByTestId('window-length')).toHaveText('3h');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
});

test('a window crossing midnight counts for the day of its first bite', async ({ page }) => {
  await openAt(page, '2026-09-25T23:00'); // Friday
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 100); // Saturday 00:40
  await expect(page.locator('.head')).toContainText('Saturday');
  await expect(page.locator('.head')).toContainText('26 September');
  await expect(page.locator('[data-block="open"]')).toContainText('23:00 yesterday');
  await expect(page.getByTestId('countdown')).toHaveText('2:20');
  await advance(page, 50); // 01:30
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  // Friday's window stays on screen while it could still reopen (until 03:00).
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.locator('[data-action="reopen"]')).toBeVisible();
  // After its 4 hours, Today shows Saturday before its window, with the option
  // to count late eating against last night until 04:00.
  await advance(page, 95); // 03:05
  await answerFullness(page); // the meal ended at 01:30, so its 20-minute check is due
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(page.locator('[data-action="late-night"]')).toBeVisible();

  const db = await readDb(page);
  const fri = db.days.find((d) => d.day === '2026-09-25');
  expect(fri.firstBite).toBe(ms('2026-09-25T23:00'));
  expect(fri.lastBite).toBe(ms('2026-09-26T01:30'));
  expect(db.days.find((d) => d.day === '2026-09-26' && d.firstBite)).toBeUndefined();

  await page.locator('.tab[data-tab="week"]').click();
  const row = page.locator('.dayrow[data-day="2026-09-25"]');
  await expect(row).toContainText('23:00 to 01:30');
  await expect(row).toContainText('Success');
  await expect(page.locator('[data-stat="streak"]')).toContainText('1 day');
});

test('the 20-minute fullness timer survives closing the app', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 25);
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'full');
  await pick(page, 'fullness-now', 5);
  await tap(page, 'save-finish'); // finished 17:55, check due 18:15
  await expect(page.getByTestId('flash')).toHaveText('Fullness check at 18:15.');
  await page.reload();
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  await advance(page, 25); // 18:20
  await page.reload(); // reopen after the 20 minutes
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 8);
  await tap(page, 'save-fullness');
  const db = await readDb(page);
  expect(db.meals[0]).toMatchObject({ fullnessNow: 5, fullness20: 8, fullness20DueAt: ms('2026-09-27T18:15') });
});

test('a window left open for 6 hours asks for the last bite', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await openWindow(page);
  await startFirstMeal(page);
  await advance(page, 400); // 00:10 Monday
  await expect(page.locator('[data-block="forgot"]')).toBeVisible();
  await setTime(page, 'forgot-last-bite', '21:00');
  await tap(page, 'forgot-close');
  await expect(page.locator('[data-block="before"]')).toBeVisible(); // Monday, before its window
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27').lastBite).toBe(ms('2026-09-27T21:00'));
  expect(db.meals[0].finishedAt).toBe(ms('2026-09-27T21:00'));
});

test('a day off follows weekend rules', async ({ page }) => {
  await openAt(page, '2026-09-28T13:00'); // Monday
  await expect(page.getByTestId('firm-reminder')).toBeVisible();
  await tap(page, 'day-off');
  await expect(page.getByTestId('firm-reminder')).toHaveCount(0);
  await expect(page.locator('.head')).toContainText('Day off');
  await expect(page.locator('[data-block="before"]')).toContainText('Window planned for 14:00.');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toBeHidden(); // no warning on a day off
  await startFirstMeal(page, 'Lunch');
  await advance(page, 180);
  await closeWindowAt(page);
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
});

test('a double tap on Start eating logs one meal', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await openWindow(page);
  await page.locator('[data-action="start-eating"]').dblclick();
  await expect(sheet(page, 'start-meal')).toBeHidden();
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  expect((await readDb(page)).meals).toHaveLength(1);
});

test('a start time still ahead is refused; the first meal opens the window at its start', async ({ page }) => {
  await openAt(page, '2026-09-27T17:05');
  await openWindow(page);
  await setTime(page, 'meal-start', '17:10');
  await expect(sheet(page, 'start-meal').getByTestId('meal-ahead')).toHaveText('That time is still ahead.');
  await setTime(page, 'meal-start', '16:50');
  await expect(sheet(page, 'start-meal').getByTestId('meal-ahead')).toHaveText('');
  await tap(page, 'start-eating');
  await expect(page.getByTestId('flash')).toHaveText('Window open from 16:50.');
  const db = await readDb(page);
  expect(db.days.filter((d) => d.firstBite)).toHaveLength(1);
  expect(db.days.find((d) => d.day === '2026-09-27').firstBite).toBe(ms('2026-09-27T16:50'));
  expect(db.meals[0].startedAt).toBe(ms('2026-09-27T16:50'));
});

test('just after midnight, last night\'s window can still be reopened inside its 4 hours', async ({ page }) => {
  await openAt(page, '2026-09-26T00:30'); // Saturday
  await seed(page, {
    days: [{ day: '2026-09-25', firstBite: ms('2026-09-25T21:00'), lastBite: ms('2026-09-25T23:30') }],
    settings: settings({ installedAt: ms('2026-09-25T08:00') }),
  });
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
  await expect(page.getByTestId('next-window')).toHaveText("Today's window opens at 14:00.");
  await tap(page, 'reopen');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(page.getByTestId('countdown')).toHaveText('0:30');
  await advance(page, 10); // 00:40
  await closeWindowAt(page); // last bite now, still Friday's window
  await expect(page.getByTestId('window-length')).toHaveText('3h 40m');
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-25').lastBite).toBe(ms('2026-09-26T00:40'));
  expect(db.days.find((d) => d.day === '2026-09-26' && d.firstBite)).toBeUndefined();
});

test('unlogged days are flagged and can be filled in', async ({ page }) => {
  await openAt(page, '2026-09-30T09:00');
  await seed(page, { settings: settings({ installedAt: ms('2026-09-27T08:00') }) });
  await expect(page.locator('[data-notice="unlogged"]')).toContainText('3 recent days have nothing logged.');
  await page.locator('[data-action="fill-in"]').click();
  await expect(page.locator('.day[data-day="2026-09-29"]')).toBeVisible();
  await tap(page, 'no-eating');
  await tap(page, 'back-to-week');
  await expect(page.locator('.dayrow[data-day="2026-09-29"]')).toContainText('No eating');
  await page.locator('.dayrow[data-day="2026-09-28"]').click();
  await tap(page, 'log-window');
  await setTime(page, 'day-first', '17:40');
  await setTime(page, 'day-last', '21:10');
  await tap(page, 'save-window');
  await tap(page, 'back-to-week');
  await expect(page.locator('.dayrow[data-day="2026-09-28"]')).toContainText('17:40 to 21:10');
  await expect(page.locator('.dayrow[data-day="2026-09-28"]')).toContainText('Success');
});
