import { test, expect, openAt, seed, tap, setTime, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// Undo: every time change, and every removal, can be reversed from its message.

const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

test('Undo reverses a time change, from a bar above the tabs', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await tap(page, 'edit-last-bite');
  await setTime(page, 'edit-last-bite', '22:30');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('flash')).toHaveText('Last bite saved: 22:30.');
  // The message floats just above the tabs, wherever the screen is scrolled
  // (measured once it has risen into place).
  const gap = async () => {
    const bar = await page.locator('[data-flash]').boundingBox();
    const tabs = await page.locator('#tabbar .tabs').boundingBox();
    return tabs.y - (bar.y + bar.height);
  };
  await expect.poll(gap).toBeGreaterThanOrEqual(0);
  expect(await gap()).toBeLessThan(16);
  expect((await readDb(page)).days[0].lastBite).toBe(ms('2026-09-26T22:30'));
  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  await expect(page.locator('[data-action="undo"]')).toHaveCount(0);
  expect((await readDb(page)).days[0].lastBite).toBe(ms('2026-09-26T21:00'));
  await expect(page.getByTestId('fasting-for')).toHaveText('16h 10m');
});

test('Undo brings back a window removed by mistake, with its meal', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await tap(page, 'change-opening');
  await tap(page, 'remove-window');
  await tap(page, 'confirm-remove-window');
  await expect(page.getByTestId('flash')).toHaveText('Window removed. Start a meal when you eat.');
  expect((await readDb(page)).meals).toHaveLength(0);
  await tap(page, 'undo');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  const db = await readDb(page);
  expect(db.days[0].firstBite).toBe(ms('2026-09-27T18:00'));
  expect(db.meals).toHaveLength(1);
});

test('Undo reverses a window saved in the day editor, and a deleted meal', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#day/2026-09-24');
  await seed(page, WEEK);
  await setTime(page, 'day-first', '18:30');
  await setTime(page, 'day-last', '20:30');
  await tap(page, 'save-window');
  await expect(page.getByTestId('flash')).toHaveText('Window saved.');
  await expect(page.getByTestId('day-summary')).toHaveText('18:30 to 20:30, 2 h.');
  await tap(page, 'undo');
  await expect(page.getByTestId('day-summary')).toHaveText('18:00 to 20:00, 2 h.');
  const day = (await readDb(page)).days.find((d) => d.day === '2026-09-24');
  expect([day.firstBite, day.lastBite]).toEqual([ms('2026-09-24T18:00'), ms('2026-09-24T20:00')]);
  expect((await readDb(page)).meals.find((m) => m.id === 4).startedAt).toBe(ms('2026-09-24T18:00'));

  await page.locator('[data-meal="4"]').click();
  await tap(page, 'delete-meal');
  await tap(page, 'confirm-delete-meal');
  await expect(page.getByTestId('flash')).toHaveText('Meal deleted.');
  await tap(page, 'undo');
  await expect(page.locator('[data-meal="4"]')).toBeVisible();
  expect((await readDb(page)).meals).toHaveLength(4);
});

test('messages without a change to reverse have no Undo', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00', '#more');
  await page.getByTestId('restore-input').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByTestId('flash')).toHaveText('This file is not a backup from Sabr or Fast.');
  await expect(page.locator('[data-action="undo"]')).toHaveCount(0);
});

// The message floats above an open sheet, so its Undo can never leave a sheet
// showing a change that is gone.
test('Undo from a message raised before the sheet opened closes the sheet first', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.getByTestId('flash')).toHaveText('Window open from 18:00.');
  await tap(page, 'finish-meal');
  await expect(page.locator('[data-sheet="finish-meal"]')).toBeVisible();
  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  await expect(page.locator('[data-sheet="finish-meal"]')).toHaveCount(0);
  await expect(page.locator('[data-action="save-finish"]')).toHaveCount(0);
  const db = await readDb(page);
  expect(db.meals).toHaveLength(0);
  expect(db.days.filter((d) => d.day === '2026-09-27' && d.firstBite != null)).toHaveLength(0);
  await expect(page.locator('[data-action="start-meal"]')).toBeVisible();
});

test('Undo from a message the Goal sheet raised redraws the sheet with the goal undone', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await tap(page, 'edit-goal');
  const s = page.locator('[data-sheet="goal"]');
  await s.locator('button[data-choice="goal"][data-value="6"]').click();
  await expect(page.getByTestId('flash')).toHaveText('Goal 18:6 from today.');
  await expect(s.locator('button[data-choice="goal"][data-value="6"]')).toHaveAttribute('aria-checked', 'true');
  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  await expect(s).toBeVisible();
  await expect(s.locator('button[data-choice="goal"][data-value="4"]')).toHaveAttribute('aria-checked', 'true');
  await expect(s.locator('button[data-choice="goal"][data-value="6"]')).toHaveAttribute('aria-checked', 'false');
  await expect(s.getByTestId('goal-text')).toHaveText('Eating window 4 hours, fasting 20 hours.');
  const goals = Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value])).goalChanges;
  expect(goals || []).toEqual([]);
});
