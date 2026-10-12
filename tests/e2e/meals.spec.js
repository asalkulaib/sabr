import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setTime, readDb, settings, ms } from './helpers.js';

// Meals open the window: the first meal's start is the first bite, and each
// meal keeps its own satiety. One meal at a time.

const install = settings({ installedAt: ms('2026-09-26T08:00') });

test('the first meal opens the window at its start; Undo takes both back', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  const s = sheet(page, 'start-meal');
  await expect(s.getByTestId('meal-context')).toHaveText('Your first meal opens the window.');
  // At 18:00 the sheet picks Dinner by itself.
  await expect(s.locator('button[data-choice="meal-type"][aria-checked="true"]')).toHaveText('Dinner');
  await pick(page, 'hunger', 7);
  await tap(page, 'start-eating');
  await expect(page.getByTestId('flash')).toHaveText('Window open from 18:00.');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(page.locator('[data-block="eating"]')).toContainText('Dinner, since 18:00.');
  let db = await readDb(page);
  expect(db.days[0].firstBite).toBe(ms('2026-09-27T18:00'));
  expect(db.meals[0]).toMatchObject({ name: 'Dinner', hungerBefore: 7, startedAt: ms('2026-09-27T18:00') });

  await tap(page, 'undo');
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  db = await readDb(page);
  expect(db.days).toEqual([]);
  expect(db.meals).toEqual([]);
});

test('one meal at a time: the next meal first asks how the open one finished', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await advance(page, 30);
  await tap(page, 'another-meal');
  const finish = sheet(page, 'finish-meal');
  await expect(finish.getByTestId('finish-lead')).toHaveText('One meal at a time. First, how did this one finish?');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect(sheet(page, 'start-meal')).toBeVisible();
  await choose(page, 'meal-type', 'other');
  await page.locator('input[data-field="meal-name"]').fill('Dessert');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="eating"]')).toContainText('Dessert, since 18:30.');
  const meals = (await readDb(page)).meals.sort((a, b) => a.startedAt - b.startedAt);
  expect(meals).toHaveLength(2);
  expect(meals[0]).toMatchObject({ stop: 'before_full', fullnessNow: 6, finishedAt: ms('2026-09-27T18:30') });
  expect(meals[1]).toMatchObject({ name: 'Dessert', finishedAt: null });
});

test('after closing: inside the goal a meal reopens the window', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T19:00') }], settings: install });
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-context')).toHaveText('This reopens your window from 17:00.');
  await tap(page, 'start-eating');
  await expect(page.getByTestId('flash')).toHaveText('Meal started at 20:00.');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  expect((await readDb(page)).days[0].lastBite).toBeNull();
});

test('after the goal: a meal counts as eating outside the window, with its satiety', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T20:00') }], settings: install });
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-context')).toContainText('this meal counts as eating outside it and the day becomes a miss');
  await tap(page, 'start-eating');
  // The sheet fades out first, as a finger would wait for.
  await expect(sheet(page, 'start-meal')).toHaveCount(0);
  const closed = page.locator('[data-block="closed"]');
  await expect(closed).toHaveAttribute('data-result', 'miss');
  // Still eating: the window's card, with Finished this meal, leads Today.
  await expect(page.locator('[data-block="fasting"]')).toHaveCount(0);
  await expect(closed.getByTestId('result')).toHaveText('Ate outside the window.');
  await expect(closed.locator('[data-block="eating"]')).toContainText('Eating outside the window: ');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'full');
  await tap(page, 'save-finish');
  // Finished: the new fast leads again.
  await expect(page.locator('[data-block="fasting"]')).toBeVisible();
  const [meal] = (await readDb(page)).meals;
  expect(meal).toMatchObject({ outside: true, stop: 'full', startedAt: ms('2026-09-27T22:00') });
  await page.locator('.tab[data-tab="satiety"]').click();
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('Satisfied, outside the window');
});

test('Already finished? in Start a meal opens Add a meal', async ({ page }) => {
  await openAt(page, '2026-09-27T19:00');
  await tap(page, 'start-meal');
  await tap(page, 'already-finished');
  await expect(sheet(page, 'start-meal')).toHaveCount(0);
  await expect(sheet(page, 'add-meal')).toBeVisible();
});

test('the meal is picked from its start time until you tap one', async ({ page }) => {
  await openAt(page, '2026-09-26T13:00'); // a Saturday: no 16:00 rule
  await tap(page, 'start-meal');
  const s = sheet(page, 'start-meal');
  const picked = s.locator('button[data-choice="meal-type"][aria-checked="true"]');
  await expect(s.locator('button[data-choice="meal-type"]')).toHaveText(['Snack', 'Breakfast', 'Lunch', 'Dinner', 'Other']);
  await expect(picked).toHaveText('Lunch');
  await setTime(page, 'meal-start', '10:30');
  await expect(picked).toHaveText('Breakfast');
  await tap(page, 'meal-start-60'); // 12:00
  await expect(picked).toHaveText('Lunch');
  // A tapped choice stays, whatever the time.
  await choose(page, 'meal-type', 'Snack');
  await setTime(page, 'meal-start', '12:30');
  await expect(picked).toHaveText('Snack');
  // Typing only under Other.
  await expect(s.locator('input[data-field="meal-name"]')).toHaveCount(0);
  await tap(page, 'start-eating');
  expect((await readDb(page)).meals[0]).toMatchObject({ name: 'Snack', startedAt: ms('2026-09-26T12:30') });
});

test('Other: a name typed before comes back as a shortcut', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:30'), lastBite: ms('2026-09-26T19:15') }],
    meals: [{ id: 1, day: '2026-09-26', name: 'Dessert', startedAt: ms('2026-09-26T19:00'), finishedAt: ms('2026-09-26T19:15') }],
    settings: install,
  });
  await tap(page, 'start-meal');
  const s = sheet(page, 'start-meal');
  await choose(page, 'meal-type', 'other');
  await s.locator('[data-block="meal-type"] .btn-row button', { hasText: 'Dessert' }).click();
  await expect(s.locator('input[data-field="meal-name"]')).toHaveValue('Dessert');
  await tap(page, 'start-eating');
  const meals = (await readDb(page)).meals.sort((a, b) => a.startedAt - b.startedAt);
  expect(meals[1]).toMatchObject({ name: 'Dessert', startedAt: ms('2026-09-27T18:00') });
});

test('editing a meal shows its saved choice, including names typed before the choices', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00', '#satiety');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:30'), lastBite: ms('2026-09-26T19:15') }],
    meals: [
      { id: 1, day: '2026-09-26', name: 'Dessert', startedAt: ms('2026-09-26T19:00'), finishedAt: ms('2026-09-26T19:15') },
      { id: 2, day: '2026-09-26', name: 'dinner', startedAt: ms('2026-09-26T17:30'), finishedAt: ms('2026-09-26T18:00') },
    ],
    settings: install,
  });
  await choose(page, 'satiety-view', 'meals');
  const s = sheet(page, 'edit-meal');
  const picked = s.locator('button[data-choice="meal-type"][aria-checked="true"]');
  await page.locator('[data-meal="2"]').click();
  await expect(picked).toHaveText('Dinner');
  await tap(page, 'close-sheet');
  await page.locator('[data-meal="1"]').click();
  await expect(picked).toHaveText('Other');
  await expect(s.locator('input[data-field="meal-name"]')).toHaveValue('Dessert');
  await choose(page, 'meal-type', 'Snack');
  await tap(page, 'save-meal-edit');
  await expect.poll(async () => (await readDb(page)).meals.find((m) => m.id === 1).name).toBe('Snack');
});
