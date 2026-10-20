import { test, expect, openAt, seed, tap, choose, pick, sheet, setTime, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// The week strip, satiety insights, the shorter More screen and Alarms.

test('the week schedule: a row per day, its square by result, a dot on days left wanting', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  const strip = page.getByTestId('week-strip');
  await expect(strip.locator('.dayrow')).toHaveCount(7);
  const result = (day) => strip.locator(`[data-day="${day}"]`);
  await expect(result('2026-09-20')).toHaveAttribute('data-result', 'success');
  await expect(result('2026-09-21')).toHaveAttribute('data-result', 'miss');
  await expect(result('2026-09-26')).toHaveAttribute('data-result', 'success');
  // Every meal left wanting on the 20th and the 24th.
  await expect(strip.getByTestId('left-wanting-dot')).toHaveCount(2);
  await expect(result('2026-09-24')).toHaveAttribute('aria-label', 'Thu 24 Sep, miss, left wanting, 18:00 to 20:00');
  // Each window sits on the day's line; a miss is striped, eating outside is a cross.
  await expect(strip.locator('rect[data-window="2026-09-21"]')).toHaveAttribute('fill', /^url\(#miss-hatch/);
  await expect(strip.locator('rect[data-window="2026-09-20"]')).toHaveAttribute('fill', '#2FCB57'); // a window kept, in green
  await expect(strip.locator('[data-outside="2026-09-24"]')).toHaveCount(1);
  await expect(strip.locator('[data-cutoff]')).toHaveCount(5); // the 16:00 line on Sunday to Thursday
  await result('2026-09-23').click();
  await expect(page.locator('.day[data-day="2026-09-23"]')).toBeVisible();
});

test('satiety insights appear once ten meals are rated', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, WEEK);
  await expect(page.getByTestId('insights')).toHaveText('Rate how ten meals finished and your own patterns show here.');
  const meals = [];
  for (let i = 0; i < 12; i++) {
    const day = `2026-09-${String(10 + i).padStart(2, '0')}`;
    meals.push({ id: i + 1, day, name: 'Dinner', startedAt: ms(`${day}T18:00`), finishedAt: ms(`${day}T18:30`), hungerBefore: i < 6 ? 5 : 8, stop: i < 6 ? 'before_full' : 'full', fullnessNow: 6, fullness20: i < 6 ? 6 : 8 });
  }
  await seed(page, { ...WEEK, meals });
  await expect(page.getByTestId('insights')).toContainText('Left wanting at 6 of 6 meals started at hunger 6 or less, and 0 of 6 started at 7 or more.');
  await expect(page.getByTestId('insights')).toContainText('Twenty minutes on, fullness averaged 6.0 after meals left wanting, and 8.0 after the rest.');
});

test('More shows each time as a row; tapping it opens the wheel', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  const row = page.locator('[data-action="edit-trainingTime"]');
  await expect(row).toContainText('Training');
  await expect(row).toContainText('16:30');
  await expect(page.locator('[data-time="trainingTime"]')).toHaveCount(0);
  await row.click();
  await expect(sheet(page, 'time-trainingTime')).toBeVisible();
  await setTime(page, 'trainingTime', '17:15');
  await tap(page, 'close-sheet');
  await expect(row).toContainText('17:15');
  const s = Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value]));
  expect(s.trainingTime).toBe('17:15');
});

test('Alarms: when on, finishing a meal starts the 20-minute timer through the shortcut; starting one, the first included, starts none', async ({ page }) => {
  await page.addInitScript(() => { window.__fastOpened = []; });
  await openAt(page, '2026-09-27T18:00');
  const opened = () => page.evaluate(() => window.__fastOpened);
  // Off by default: nothing is handed to Shortcuts.
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await tap(page, 'undo');
  expect(await opened()).toEqual([]);

  await page.locator('.tab[data-tab="more"]').click();
  await choose(page, 'alarms', 'true');
  await page.locator('.tab[data-tab="today"]').click();
  // The meal that breaks the fast starts no timer, like every other meal.
  await tap(page, 'start-meal');
  await tap(page, 'meal-start-30');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="eating"]')).toBeVisible();
  expect(await opened()).toEqual([]);
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect.poll(opened).toEqual(['shortcuts://run-shortcut?name=Fast%20Timer&input=text&text=20']);
  // The next meal: again nothing at its start, and 20 minutes once it is finished.
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="eating"]')).toBeVisible();
  expect(await opened()).toHaveLength(1);
  await tap(page, 'finish-meal');
  await tap(page, 'save-finish');
  await expect.poll(async () => (await opened()).length).toBe(2);
  expect((await opened())[1]).toBe('shortcuts://run-shortcut?name=Fast%20Timer&input=text&text=20');
  // A meal finished by I'm done eating is finished like any other: its check is
  // told and its 20 minutes start.
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="eating"]')).toBeVisible();
  await tap(page, 'done-eating');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 5);
  await tap(page, 'close-window');
  await expect(page.getByTestId('flash')).toHaveText('Window closed. Fullness check at 18:20.');
  await expect.poll(async () => (await opened()).length).toBe(3);
  expect((await opened())[2]).toBe('shortcuts://run-shortcut?name=Fast%20Timer&input=text&text=20');
});

test("I'm done eating with no meal open, or a last bite long past, starts no timer and says nothing of a check", async ({ page }) => {
  await page.addInitScript(() => { window.__fastOpened = []; });
  await openAt(page, '2026-09-27T18:00');
  const opened = () => page.evaluate(() => window.__fastOpened);
  await page.locator('.tab[data-tab="more"]').click();
  await choose(page, 'alarms', 'true');
  await page.locator('.tab[data-tab="today"]').click();
  // A meal started 2 hours ago, ended by I'm done eating with its last bite then:
  // its 20-minute moment is long past, so there is no check and no timer.
  await tap(page, 'start-meal');
  await tap(page, 'meal-start-120');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="eating"]')).toBeVisible();
  await tap(page, 'done-eating');
  await setTime(page, 'last-bite', '16:15');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
  // Only the message from opening the window is still up: none about a check.
  await expect(page.getByTestId('flash')).toHaveText('Window open from 16:00.');
  expect(await opened()).toEqual([]);
});
