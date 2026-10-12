// Week and Day in every state, shot at 390 x 844 for design review
// (test-results/screens, names starting with W), each with the contrast audit of shot().
import { test, expect, openAt, seed, tap, settings, ms, shot } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

test('week: the schedule, its legend, the tiles and cards', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await expect(page.getByTestId('success-count')).toHaveText('4 of 7');
  await shot(page, 'W30-week');
  await shot(page, 'W30b-week-full', { full: true });
  await page.getByTestId('strip-legend').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'W30d-week-legend-tiles');
  // A row pressed and a row focused by keyboard.
  await page.locator('.dayrow[data-day="2026-09-22"]').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'W30e-week-row-focus');
});

test('week: a window still open today, then the week before', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="week"]').click();
  await expect(page.getByTestId('strip-legend')).toContainText('Window still open');
  await shot(page, 'W30c-week-window-open');
  await tap(page, 'prev-week');
  await expect(page.getByTestId('week-range')).toHaveText('20 to 26 September');
  await shot(page, 'W30f-week-past');
  await tap(page, 'prev-week');
  await expect(page.getByTestId('week-range')).toHaveText('13 to 19 September');
  await shot(page, 'W30g-week-before-tracking', { full: true });
});

test('week: a narrow phone, 320 wide', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await shot(page, 'W30h-week-320', { full: true });
  await page.locator('.dayrow[data-day="2026-09-24"]').click();
  await shot(page, 'W31h-day-320', { full: true });
});

test('day: a miss with eating outside, meals and temptations; its sheets', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await page.locator('.dayrow[data-day="2026-09-24"]').click();
  await expect(page.locator('.day[data-day="2026-09-24"]')).toBeVisible();
  // The legend names only the marks the day's line shows; the line says it in words.
  await expect(page.getByTestId('day-legend').locator('.legend-item')).toHaveText(['Miss', '16:00 on workdays', 'Ate outside the window', 'Left wanting']);
  await expect(page.locator('.day-track-wrap')).toHaveAttribute('aria-label', 'miss, left wanting, 18:00 to 20:00');
  await shot(page, 'W31-day-editor');
  await shot(page, 'W31b-day-editor-full', { full: true });
  await tap(page, 'clear-window');
  await expect(page.locator('[data-action="confirm-clear"]')).toBeVisible();
  await page.locator('[data-action="confirm-clear"]').scrollIntoViewIfNeeded();
  await shot(page, 'W31c-day-clear-confirm');
  await page.locator('.confirm button', { hasText: 'Keep' }).click();
  // The outside entry, then its delete question.
  await page.locator('[data-outside="1"]').click();
  await expect(page.locator('[data-sheet="edit-outside"]')).toBeVisible();
  await shot(page, 'W33-edit-outside-sheet');
  await tap(page, 'delete-outside');
  await page.locator('[data-action="confirm-delete-outside"]').scrollIntoViewIfNeeded();
  await shot(page, 'W33b-edit-outside-confirm');
  await tap(page, 'close-sheet');
  // The temptation, then its delete question.
  await page.locator('[data-block="day-temptations"] .item').first().click();
  await expect(page.locator('[data-sheet="temptation-detail"]')).toBeVisible();
  await shot(page, 'W34-temptation-sheet');
  await tap(page, 'delete-temptation');
  await shot(page, 'W34b-temptation-confirm');
});

test('day: a success left wanting, and a day with nothing logged', async ({ page }) => {
  await openAt(page, '2026-09-28T12:00', '#day/2026-09-20');
  await seed(page, { ...WEEK, settings: install });
  await expect(page.locator('.day')).toContainText('Success.');
  await shot(page, 'W35-day-success-left-wanting', { full: true });
  await page.goto('./#day/2026-09-27');
  await expect(page.locator('[data-action="log-window"]')).toBeVisible();
  await shot(page, 'W36-day-nothing-logged', { full: true });
  await tap(page, 'log-window');
  await shot(page, 'W36b-day-log-window');
  await page.goto('./#day/2026-09-27');
  await tap(page, 'no-eating');
  await expect(page.locator('[data-action="undo-no-eating"]')).toBeVisible();
  await shot(page, 'W36c-day-no-eating');
});

test('day: today with a window open, and a day still ahead', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.goto('./#day/2026-09-27');
  await expect(page.locator('.day')).toContainText('Window open.');
  await shot(page, 'W37-day-today-open');
  await page.goto('./#day/2026-09-30');
  await expect(page.locator('.day')).toContainText('This day has not started yet.');
  await expect(page.getByTestId('day-legend')).toHaveCount(0);
  await shot(page, 'W38-day-ahead', { full: true });
});

test('week and day paused', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await page.locator('.tab[data-tab="week"]').click();
  await shot(page, 'W51-week-paused', { full: true });
  await page.locator('.dayrow[data-day="2026-09-29"]').click();
  await expect(page.locator('.day')).toContainText('Paused: not tracked.');
  await expect(page.getByTestId('day-legend')).toHaveCount(0);
  await shot(page, 'W52-day-paused', { full: true });
});

test('week: a long fast, a day fasted', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T16:00'), lastBite: ms('2026-09-26T21:00') }],
    settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 6, fast: 48 }] }),
  });
  await openAt(page, '2026-09-28T10:00', '#week');
  await expect(page.locator('.dayrow[data-day="2026-09-27"]')).toContainText('Fasted');
  await shot(page, 'W64d-week-fasted-day');
});

test.describe('travel', () => {
  test.use({ timezoneId: 'Asia/Dubai' });

  test('a day at home, seen from Dubai', async ({ page }) => {
    await openAt(page, '2026-10-02T18:00');
    await seed(page, { ...WEEK, settings: [...install, { key: 'zoneSeenAt', value: ms('2026-09-27T10:00') }] });
    await page.goto('./#day/2026-09-26');
    await expect(page.locator('.day .head')).toContainText('Times in');
    await shot(page, 'W81-day-kuwait-from-dubai');
  });
});

test('day: clearing the window cross-fades the changed verdict', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#day/2026-09-25');
  await seed(page, WEEK);
  await expect(page.locator('.day-verdict')).toHaveText('Success.');
  await tap(page, 'clear-window');
  await tap(page, 'confirm-clear');
  await expect(page.locator('.day-verdict')).toHaveText('Nothing logged yet.');
  await expect(page.locator('.day-hero-top')).toHaveClass(/changed/);
});

test('week: only the pager slides a week in', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await tap(page, 'prev-week');
  await expect(page.locator('.week-body')).toHaveClass(/turn-prev/);
  await tap(page, 'next-week');
  await expect(page.locator('.week-body')).toHaveClass(/turn-next/);
  await tap(page, 'prev-week');
  await page.locator('.tab[data-tab="today"]').click();
  await page.locator('.tab[data-tab="week"]').click();
  await expect(page.getByTestId('week-range')).toHaveText('20 to 26 September');
  await expect(page.locator('.week-body')).not.toHaveClass(/turn-/);
});

test('reduce motion: week and day draw at rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none')).length);
  expect(moving).toBe(0);
  await tap(page, 'prev-week');
  const turning = await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none')).length);
  expect(turning).toBe(0);
  await shot(page, 'W30i-week-reduce-motion');
});
