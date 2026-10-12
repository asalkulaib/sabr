import { test, expect, openAt, seed, tap, sheet, setTime, readDb, settings, ms } from './helpers.js';

// The start screen: First bite and Begin fast, both with quick times.

const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

test('a first day with Fast: Begin fast from last night, so no fasting hours are lost', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  const before = page.locator('[data-block="before"]');
  await expect(before.getByTestId('begin-fast-hint')).toBeVisible();
  await expect(before.locator('.start-actions [data-action]')).toHaveText(['Start a meal', 'Begin fast']);
  await tap(page, 'begin-fast');
  const s = sheet(page, 'begin-fast');
  // Yesterday was a Saturday: its planned window closed at 18:00.
  await expect(s.locator('.presets [data-action]')).toHaveText(['Now', '1 h ago', '2 h ago', 'Last night 18:00']);
  await tap(page, 'fast-last');
  await expect(s.getByTestId('fast-summary')).toHaveText('Fasting since 18:00 yesterday: 15 h so far.');
  await tap(page, 'save-fast');
  await expect(page.getByTestId('flash')).toHaveText('Fast began 18:00 yesterday.');
  await expect(page.getByTestId('fasting-for')).toHaveText('15h');
  await expect(page.locator('[data-action="edit-fast-start"]')).toContainText('18:00 yesterday');
  await expect(page.locator('[data-notice="unlogged"]')).toHaveCount(0); // yesterday was before Fast
  expect((await readDb(page)).days).toEqual([expect.objectContaining({ day: '2026-09-26', fastFrom: ms('2026-09-26T18:00') })]);
});

test('with a last bite on record, Begin fast is hidden: Start a meal is the one way in', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, LAST_NIGHT);
  const before = page.locator('[data-block="before"]');
  await expect(page.getByTestId('fasting-for')).toHaveText('12h');
  await expect(before.locator('[data-action="begin-fast"]')).toHaveCount(0);
  await expect(before.getByTestId('begin-fast-hint')).toHaveCount(0);
  await expect(before.locator('[data-action="start-meal"]')).toBeVisible();
});

test('the start can be moved later; before the last bite on record it is refused', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { ...LAST_NIGHT, days: [{ ...LAST_NIGHT.days[0], fastFrom: ms('2026-09-26T21:30') }] });
  await expect(page.locator('[data-action="begin-fast"]')).toHaveCount(0);
  await tap(page, 'edit-fast-start');
  const s = sheet(page, 'begin-fast');
  await expect(s.getByTestId('fast-summary')).toHaveText('Fasting since 21:30 yesterday: 11 h 30 min so far.');
  await setTime(page, 'fast-start', '22:30');
  await expect(s.getByTestId('fast-summary')).toHaveText('Fasting since 22:30 yesterday: 10 h 30 min so far.');
  await tap(page, 'save-fast');
  await expect(page.getByTestId('fasting-for')).toHaveText('10h 30m');
  // The day it began keeps its result: no eating is logged outside the window.
  expect((await readDb(page)).outside).toEqual([]);
  await page.goto('./#day/2026-09-26');
  await expect(page.locator('.day')).toContainText('Success.');
  await page.locator('.tab[data-tab="today"]').click();

  await tap(page, 'edit-fast-start');
  await setTime(page, 'fast-start', '20:00');
  await expect(s.getByTestId('fast-hint')).toHaveText('Your last bite on record is 21:00 yesterday. The fast begins after it.');
  await expect(page.locator('[data-action="save-fast"]')).toBeDisabled();
  await tap(page, 'change-last-bite');
  await expect(sheet(page, 'last-bite-time')).toBeVisible();
});

test('Start a meal: quick times start it earlier, and the window opens with it', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').locator('.presets [data-action]')).toHaveText(['Now', '30 min ago', '1 h ago', '2 h ago']);
  await tap(page, 'meal-start-60');
  await expect(page.locator('[data-time="meal-start"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '17');
  await tap(page, 'start-eating');
  await expect(page.getByTestId('countdown')).toHaveText('3:00');
  expect((await readDb(page)).days[0].firstBite).toBe(ms('2026-09-27T17:00'));
});

test('after a pause, a fast begun on its last day counts', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days.map((d) => ({ ...d, day: '2026-09-24', firstBite: ms('2026-09-24T17:00'), lastBite: ms('2026-09-24T21:00') })), { day: '2026-09-25', paused: 'travel' }, { day: '2026-09-26', paused: 'travel' }] });
  await expect(page.getByTestId('fasting-ring')).toHaveCount(0);
  await tap(page, 'begin-fast');
  await tap(page, 'fast-last');
  await tap(page, 'save-fast');
  await expect(page.getByTestId('fasting-for')).toHaveText('15h');
});
