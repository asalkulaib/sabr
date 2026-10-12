import { test, expect, openAt, seed, advance, tap, setTime, sheet, readDb, settings, ms } from './helpers.js';

// Correcting a window opened by mistake. 2026-09-27 is a Sunday (workday).

async function firstBiteWithMeal(page) {
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal')).toBeVisible();
  await tap(page, 'start-eating');
  await expect(sheet(page, 'start-meal')).toBeHidden();
}

test('opened too early: move the opening time to when eating really started', async ({ page }) => {
  await openAt(page, '2026-09-27T16:30');
  await firstBiteWithMeal(page);
  await advance(page, 75); // 17:45
  await tap(page, 'change-opening');
  await expect(sheet(page, 'opening')).toBeVisible();
  await setTime(page, 'opened-at', '17:40');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('flash')).toHaveText('The window now opens at 17:40.');
  await expect(page.getByTestId('countdown')).toHaveText('3:55');
  await expect(page.locator('[data-block="open"]')).toContainText('21:40');
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27').firstBite).toBe(ms('2026-09-27T17:40'));
  expect(db.meals[0].startedAt).toBe(ms('2026-09-27T17:40')); // the first meal moves with it
});

test('forgot to tap: move the opening time earlier', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await firstBiteWithMeal(page);
  await tap(page, 'change-opening');
  await setTime(page, 'opened-at', '17:30');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('countdown')).toHaveText('3:30');
});

test('opened by mistake without eating: remove the window, meal and all', async ({ page }) => {
  await openAt(page, '2026-09-27T13:00');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toBeVisible(); // workday before 16:00
  await tap(page, 'start-eating');
  await expect(page.getByText('Opened before 16:00, so today counts as a miss.')).toBeVisible();
  await tap(page, 'change-opening');
  await tap(page, 'remove-window');
  await expect(sheet(page, 'opening')).toContainText('Remove the window opened at 13:00? Its meal goes too.');
  await tap(page, 'confirm-remove-window');
  await expect(page.getByTestId('flash')).toHaveText('Window removed. Start a meal when you eat.');
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(page.getByTestId('firm-reminder')).toBeVisible();
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27').firstBite).toBeNull();
  expect(db.meals).toHaveLength(0);
});

test('an opening time still ahead is refused', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await firstBiteWithMeal(page);
  await tap(page, 'change-opening');
  await setTime(page, 'opened-at', '18:00');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('times-hint')).toHaveText('That time is still ahead.');
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27').firstBite).toBe(ms('2026-09-27T17:45'));
});

test('a meal logged before the new opening time blocks the change', async ({ page }) => {
  await openAt(page, '2026-09-27T18:15');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: null }],
    meals: [
      { id: 1, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:30'), finishedAt: ms('2026-09-27T17:50'), fullnessNow: 6, fullness20: 7 },
      { id: 2, day: '2026-09-27', name: 'Fruit', startedAt: ms('2026-09-27T18:00'), finishedAt: null },
    ],
    settings: settings({ installedAt: ms('2026-09-27T08:00') }),
  });
  await tap(page, 'change-opening');
  await setTime(page, 'opened-at', '18:10');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('times-hint')).toHaveText('A meal is logged at 18:00, before that time. Change or delete it first.');
});

test('after closing: change both times, and the result follows', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:50') }],
    meals: [{ id: 1, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:30'), finishedAt: ms('2026-09-27T18:05'), stop: 'full', fullnessNow: 7, fullness20: 7 }],
    settings: settings({ installedAt: ms('2026-09-27T08:00') }),
  });
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  await tap(page, 'change-times');
  await setTime(page, 'times-first', '17:45');
  await setTime(page, 'times-last', '21:50');
  await expect(page.getByTestId('times-summary')).toHaveText('17:45 to 21:50, 4 h 5 min.');
  await tap(page, 'save-times');
  await expect(page.getByTestId('flash')).toHaveText('Window times saved.');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('window-length')).toHaveText('4h 5m');
  const db = await readDb(page);
  expect(db.days[0]).toMatchObject({ firstBite: ms('2026-09-27T17:45'), lastBite: ms('2026-09-27T21:50') });
  expect(db.meals[0]).toMatchObject({ startedAt: ms('2026-09-27T17:45'), finishedAt: ms('2026-09-27T18:20') });
});
