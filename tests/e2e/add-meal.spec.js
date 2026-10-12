import { test, expect, openAt, seed, tap, pick, choose, sheet, setTime, readDb, settings, ms } from './helpers.js';

// Add a meal: a meal already eaten, added whole with no timer, from Satiety,
// Today or a day in Week. Before saving, the sheet says what the meal does to
// that day's window. 2026-09-26 is a Saturday, 2026-09-27 a Sunday (a workday).

const install = settings({ installedAt: ms('2026-09-20T08:00') });
const effect = (page) => sheet(page, 'add-meal').getByTestId('add-meal-effect');

test('from Satiety: a meal and all its readings in one go; as the last meal it opens and closes the window', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00', '#satiety');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  // An hour ago, for 30 minutes, picked as Lunch from its start.
  await expect(s.locator('button[data-choice="added-day"][aria-checked="true"]')).toHaveText('Today');
  await expect(s.locator('button[data-choice="meal-type"][aria-checked="true"]')).toHaveText('Lunch');
  await expect(effect(page)).toHaveText('This meal opens your window at 14:00.');
  await pick(page, 'hunger', 6);
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await choose(page, 'last-meal', 'true');
  await expect(effect(page)).toHaveText('Your window: 14:00 to 14:30, 30 min.');
  await expect(s.getByTestId('add-meal-miss')).toHaveText('');
  await tap(page, 'save-added-meal');
  await expect(page.getByTestId('flash')).toHaveText('Meal saved.');
  let db = await readDb(page);
  expect(db.days).toMatchObject([{ day: '2026-09-26', firstBite: ms('2026-09-26T14:00'), lastBite: ms('2026-09-26T14:30') }]);
  expect(db.meals).toHaveLength(1);
  expect(db.meals[0]).toMatchObject({
    day: '2026-09-26', name: 'Lunch', startedAt: ms('2026-09-26T14:00'), finishedAt: ms('2026-09-26T14:30'),
    hungerBefore: 6, stop: 'before_full', fullnessNow: 6, fullness20: 7, fullness20DueAt: null,
  });
  expect(db.meals[0].outside).toBeUndefined();
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('14:00 Lunch');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('6 → 6 → 7');

  // Undo takes back the meal and the window.
  await tap(page, 'undo');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(0);
  db = await readDb(page);
  expect(db.days).toEqual([]);
});

test('from Today: quick times and lengths; a meal that has only just ended still gets its fullness check', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  await tap(page, 'added-start-30');
  await tap(page, 'added-length-15');
  await expect(effect(page)).toHaveText('This meal opens your window at 14:30.');
  await tap(page, 'save-added-meal');
  await expect(page.getByTestId('flash')).toHaveText('Meal saved. Fullness check at 15:05.');
  // Not the last meal: the window stays open, and Today points to the check.
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(page.locator('[data-block="satiety-pointer"]')).toBeVisible();
  const [meal] = (await readDb(page)).meals;
  expect(meal).toMatchObject({ startedAt: ms('2026-09-26T14:30'), finishedAt: ms('2026-09-26T14:45'), fullness20: null, fullness20DueAt: ms('2026-09-26T15:05') });
});

test('the finish time follows the start and the length, and never passes now', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  const finish = sheet(page, 'add-meal').locator('[data-time="added-finish"]');
  await setTime(page, 'added-start', '13:00');
  await tap(page, 'added-length-60');
  await expect(finish.locator('[data-part="hour"]')).toHaveAttribute('aria-valuenow', '14');
  // Ten minutes ago with a length of an hour: the meal ends now.
  await setTime(page, 'added-start', '14:50');
  await tap(page, 'save-added-meal');
  const [meal] = (await readDb(page)).meals;
  expect(meal).toMatchObject({ startedAt: ms('2026-09-26T14:50'), finishedAt: ms('2026-09-26T15:00') });
});

test('a start still ahead is refused', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  await setTime(page, 'added-start', '16:00');
  const s = sheet(page, 'add-meal');
  await expect(s.getByTestId('add-meal-ahead')).toHaveText('That time is still ahead.');
  await tap(page, 'save-added-meal');
  await expect(s.getByTestId('add-meal-hint')).toHaveText('That time is still ahead.');
  expect((await readDb(page)).meals).toEqual([]);
});

test("yesterday: inside its goal the window stretches; past it the meal counts as eating outside, a miss in words", async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T13:00'), lastBite: ms('2026-09-26T15:00') }], settings: install });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  await choose(page, 'added-day', '2026-09-26');
  // Quick times are for today only.
  await expect(s.locator('[data-action="added-start-30"]')).toHaveCount(0);
  await setTime(page, 'added-start', '16:00');
  await expect(effect(page)).toHaveText("Yesterday's window becomes 13:00 to 16:30, 3 h 30 min.");
  // A closed window: no question about the last meal.
  await expect(s.locator('button[data-choice="last-meal"]')).toHaveCount(0);
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).days[0].lastBite).toBe(ms('2026-09-26T16:30'));

  await tap(page, 'add-meal');
  await choose(page, 'added-day', '2026-09-26');
  await setTime(page, 'added-start', '20:00');
  await expect(effect(page)).toHaveText("Yesterday's window closed at 16:30 and its hours were over, so this meal counts as eating outside it.");
  await expect(sheet(page, 'add-meal').getByTestId('add-meal-miss')).toHaveText('Eating outside the window makes the day a miss.');
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(2);
  const db = await readDb(page);
  expect(db.days[0].lastBite).toBe(ms('2026-09-26T16:30'));
  expect(db.meals.find((m) => m.startedAt === ms('2026-09-26T20:00'))).toMatchObject({ day: '2026-09-26', outside: true });
});

test('before the first bite the window opens earlier, and a meal over one already logged is refused', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T19:00') }],
    meals: [{ id: 1, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:00'), finishedAt: ms('2026-09-27T17:30') }],
    settings: install,
  });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  await setTime(page, 'added-start', '17:10');
  await expect(effect(page)).toHaveText('That overlaps Dinner from 17:00 to 17:30. Change the time, or edit that meal.');
  await tap(page, 'save-added-meal');
  await expect(s.getByTestId('add-meal-hint')).toHaveText('That overlaps Dinner from 17:00 to 17:30. Change the time, or edit that meal.');
  expect((await readDb(page)).meals).toHaveLength(1);

  await setTime(page, 'added-start', '15:00');
  await expect(effect(page)).toHaveText('Your window becomes 15:00 to 19:00, 4 h.');
  await expect(s.getByTestId('add-meal-miss')).toHaveText('Opening before 16:00 on a workday makes the day a miss.');
  await tap(page, 'save-added-meal');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  const db = await readDb(page);
  expect(db.days[0]).toMatchObject({ firstBite: ms('2026-09-27T15:00'), lastBite: ms('2026-09-27T19:00') });
  // The meal that opened the window before stays where it was.
  expect(db.meals.find((m) => m.id === 1)).toMatchObject({ startedAt: ms('2026-09-27T17:00'), finishedAt: ms('2026-09-27T17:30') });
});

test('on a paused day the meal counts for Satiety only', async ({ page }) => {
  await openAt(page, '2026-09-27T14:00');
  await seed(page, { days: [{ day: '2026-09-27', paused: 'travel' }], settings: install });
  await expect(page.locator('[data-block="paused"]')).toBeVisible();
  await tap(page, 'add-meal');
  await expect(effect(page)).toHaveText('This day is paused, so the meal counts for Satiety only.');
  await tap(page, 'save-added-meal');
  await expect(page.getByTestId('flash')).toHaveText('Meal saved.');
  await expect(page.locator('[data-block="paused"]')).toBeVisible();
  const db = await readDb(page);
  expect(db.days).toEqual([expect.objectContaining({ day: '2026-09-27', paused: 'travel' })]);
  expect(db.days[0].firstBite).toBeUndefined();
  expect(db.meals).toMatchObject([{ day: '2026-09-27', startedAt: ms('2026-09-27T13:00') }]);
});

test('from a day in Week: Add a meal adds to that day, even one with no window yet', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#day/2026-09-24');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  await expect(s.getByTestId('add-meal-day')).toHaveText('Thursday 24 September');
  await expect(s.locator('button[data-choice="added-day"]')).toHaveCount(0);
  // With no window, the wheel starts at the day's planned time (17:30 on a workday). The day is over,
  // so Last meal of the day? reads Yes until changed, and the window closes with the meal.
  await expect(s.locator('button[data-choice="last-meal"][aria-checked="true"]')).toHaveText('Yes');
  await expect(effect(page)).toHaveText('The window on Thu 24 Sep: 17:30 to 18:00, 30 min.');
  await choose(page, 'last-meal', 'false');
  await expect(effect(page)).toHaveText('This meal opens the window on Thu 24 Sep at 17:30.');
  await choose(page, 'last-meal', 'true');
  await tap(page, 'save-added-meal');
  await expect(page.locator('[data-block="day-meals"]')).toContainText('17:30 to 18:00');
  const db = await readDb(page);
  expect(db.days).toMatchObject([{ day: '2026-09-24', firstBite: ms('2026-09-24T17:30'), lastBite: ms('2026-09-24T18:00') }]);
});

test('from a day in Week with meals: the sheet starts after its last meal, and a time after midnight stays in a window that crosses it', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#day/2026-09-24');
  await seed(page, {
    days: [{ day: '2026-09-24', firstBite: ms('2026-09-24T21:00'), lastBite: ms('2026-09-25T01:00') }],
    meals: [{ id: 1, day: '2026-09-24', name: 'Dinner', startedAt: ms('2026-09-24T21:00'), finishedAt: ms('2026-09-24T21:40') }],
    settings: install,
  });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  await expect(s.locator('[data-time="added-start"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '21');
  await expect(s.locator('[data-time="added-start"] [data-part="minute"]')).toHaveAttribute('aria-valuenow', '40');
  await expect(effect(page)).toHaveText('This meal goes in the window on Thu 24 Sep.');
  // 00:10 is inside the window that runs to 01:00 the next day, not the morning before it.
  await setTime(page, 'added-start', '00:10');
  await tap(page, 'added-length-15');
  await expect(effect(page)).toHaveText('This meal goes in the window on Thu 24 Sep.');
  await expect(s.getByTestId('add-meal-miss')).toHaveText('');
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(2);
  const db = await readDb(page);
  expect(db.meals.find((m) => m.id !== 1)).toMatchObject({ day: '2026-09-24', startedAt: ms('2026-09-25T00:10'), finishedAt: ms('2026-09-25T00:25') });
  expect(db.days[0]).toMatchObject({ firstBite: ms('2026-09-24T21:00'), lastBite: ms('2026-09-25T01:00') });
});

test('the Finished at wheel takes the hour, then the minute; a time still ahead or before the start is refused', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  const note = s.getByTestId('add-meal-finish-note');
  await tap(page, 'added-start-30'); // 14:30, ending now
  await setTime(page, 'added-finish', '14:50');
  await expect(note).toHaveText('');
  await expect(s.locator('[data-time="added-finish"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '14');
  await expect(s.locator('[data-time="added-finish"] [data-part="minute"]')).toHaveAttribute('aria-valuenow', '50');
  await setTime(page, 'added-finish', '15:30');
  await expect(note).toHaveText('That time is still ahead.');
  await tap(page, 'save-added-meal');
  await expect(s.getByTestId('add-meal-hint')).toHaveText('That time is still ahead.');
  // Yesterday, a finish rolled before the start is not read as a meal of nearly a day.
  await choose(page, 'added-day', '2026-09-25');
  await setTime(page, 'added-start', '19:00');
  await setTime(page, 'added-finish', '18:45');
  await expect(note).toHaveText('That is before the meal started.');
  await tap(page, 'save-added-meal');
  await expect(s.getByTestId('add-meal-hint')).toHaveText('That is before the meal started.');
  expect((await readDb(page)).meals).toEqual([]);
  await setTime(page, 'added-finish', '19:20');
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(1);
  expect((await readDb(page)).meals[0]).toMatchObject({ day: '2026-09-25', startedAt: ms('2026-09-25T19:00'), finishedAt: ms('2026-09-25T19:20') });
});

test('Already finished? hands Add a meal the time, meal and hunger picked in Start a meal', async ({ page }) => {
  await openAt(page, '2026-09-26T19:00');
  await seed(page, { settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'meal-start-30'); // 18:30
  await choose(page, 'meal-type', 'Snack');
  await pick(page, 'hunger', 7);
  await tap(page, 'already-finished');
  const s = sheet(page, 'add-meal');
  await expect(s.locator('[data-time="added-start"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '18');
  await expect(s.locator('[data-time="added-start"] [data-part="minute"]')).toHaveAttribute('aria-valuenow', '30');
  await expect(s.locator('button[data-choice="meal-type"][aria-checked="true"]')).toHaveText('Snack');
  await expect(s.locator('button[data-scale="hunger"][aria-checked="true"]')).toHaveText('7');
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(1);
  expect((await readDb(page)).meals[0]).toMatchObject({ name: 'Snack', hungerBefore: 7, startedAt: ms('2026-09-26T18:30'), finishedAt: ms('2026-09-26T19:00') });
});

test('Alarms: only a fullness check still ahead starts a timer, never the window it opens', async ({ page }) => {
  await page.addInitScript(() => { window.__fastOpened = []; });
  await openAt(page, '2026-09-26T15:00');
  await seed(page, { settings: [...install, ...settings({ alarms: true })] });
  const opened = () => page.evaluate(() => window.__fastOpened);
  // The first meal, 13:00 to 13:30: it opens the window, and its check (13:50) is long past.
  await tap(page, 'add-meal');
  await setTime(page, 'added-start', '13:00');
  await tap(page, 'save-added-meal');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  expect(await opened()).toEqual([]);
  await tap(page, 'add-meal');
  await setTime(page, 'added-start', '14:40');
  await tap(page, 'added-length-15'); // ends 14:55: its check is at 15:15
  await tap(page, 'save-added-meal');
  await expect.poll(opened).toEqual(['shortcuts://run-shortcut?name=Fast%20Timer&input=text&text=15']);
});

test('from Today: the sheet starts clear of a meal just logged, and just after midnight a live window stays open', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T14:20'), lastBite: null }],
    meals: [{ id: 1, day: '2026-09-26', name: 'Lunch', startedAt: ms('2026-09-26T14:20'), finishedAt: ms('2026-09-26T14:50') }],
    settings: install,
  });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  await expect(s.locator('[data-time="added-start"] [data-part="minute"]')).toHaveAttribute('aria-valuenow', '50');
  await expect(effect(page)).toHaveText('This meal goes in your window.');
  await tap(page, 'close-sheet');

  // 00:30, last night's window still inside its goal: Last meal reads No until changed.
  await page.clock.setFixedTime(new Date('2026-09-27T00:30:00+03:00'));
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T21:00'), lastBite: null }],
    meals: [{ id: 1, day: '2026-09-26', name: 'Dinner', startedAt: ms('2026-09-26T21:00'), finishedAt: ms('2026-09-26T21:40') }],
    settings: install,
  });
  await tap(page, 'add-meal');
  await expect(s.locator('button[data-choice="added-day"][aria-checked="true"]')).toHaveText('Yesterday');
  await expect(s.locator('button[data-choice="last-meal"][aria-checked="true"]')).toHaveText('No');
  await expect(effect(page)).toHaveText("This meal goes in yesterday's window.");
  await tap(page, 'save-added-meal');
  await expect.poll(async () => (await readDb(page)).meals.length).toBe(2);
  expect((await readDb(page)).days[0].lastBite).toBeNull();
});

test('a refused finish does not stay behind; an early-morning time on a past day stays on that day', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T13:00'), lastBite: ms('2026-09-26T19:00') }], settings: install });
  await tap(page, 'add-meal');
  const s = sheet(page, 'add-meal');
  const note = s.getByTestId('add-meal-finish-note');
  await tap(page, 'added-start-30'); // 09:30, ending 10:00
  await setTime(page, 'added-finish', '09:10');
  await expect(note).toHaveText('That is before the meal started.');
  // Moving the start brings back the length last accepted, 30 minutes.
  await setTime(page, 'added-start', '08:30');
  await expect(note).toHaveText('');
  await expect(s.locator('[data-time="added-finish"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '9');
  await expect(s.locator('[data-time="added-finish"] [data-part="minute"]')).toHaveAttribute('aria-valuenow', '0');
  // Yesterday: no meal lasts over 12 hours, and 00:30 is that morning, before its window.
  await choose(page, 'added-day', '2026-09-26');
  await setTime(page, 'added-start', '07:00');
  await setTime(page, 'added-finish', '20:00');
  await expect(note).toHaveText('A meal lasts at most 12 hours.');
  await setTime(page, 'added-start', '00:30');
  await expect(effect(page)).toHaveText("Yesterday's window becomes 00:30 to 19:00, 18 h 30 min.");
});
