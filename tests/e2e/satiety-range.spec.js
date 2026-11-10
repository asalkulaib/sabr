// The time shown on Satiety: Insights, Meals and the count above them rest on
// the meals of the last 7 days, the last 30 days, this year or all, and the
// choice is remembered.
import { test, expect, openAt, seed, choose, readDb, settings, ms } from './helpers.js';
import { READINGS } from './seed-data.js';

const install = settings({ installedAt: ms('2026-08-01T08:00') });
const count = (page) => page.getByTestId('satiety-count');

// READINGS: 26 meals, one a day, 1 to 26 September 2026.
test('each time frame counts its own meals, on Insights and on Meals', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { meals: READINGS, settings: install });
  await expect(page.locator('[data-choice="satiety-range"]')).toHaveText(['7 days', '30 days', 'This year', 'All']);
  await expect(count(page)).toHaveText('26 rated meals; 25 with the 20-minute check.');
  await choose(page, 'satiety-range', '7d');
  // 20 to 26 September: seven meals.
  await expect(count(page)).toHaveText('Last 7 days: 7 rated meals; 6 with the 20-minute check.');
  await expect(page.getByTestId('tile-complete')).toContainText('of 7');
  expect((await readDb(page)).settings.find((s) => s.key === 'satietyRange').value).toBe('7d');
  // Meals lists the same seven.
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"] .meal-day')).toHaveCount(7);
  await choose(page, 'satiety-range', 'ytd');
  await expect(page.locator('[data-block="satiety-meals"] .meal-day')).toHaveCount(26);
  await expect(count(page)).toHaveText('This year: 26 rated meals; 25 with the 20-minute check.');
  // Now has no time frame; the choice is kept, and remembered after a reload.
  await choose(page, 'satiety-view', 'now');
  await expect(page.locator('.satiety-range')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await choose(page, 'satiety-view', 'insights');
  await expect(page.locator('[data-choice="satiety-range"][aria-checked="true"]')).toHaveText('This year');
});

test('a time frame with no rated meals says so, and a longer one brings them back', async ({ page }) => {
  await openAt(page, '2026-10-20T12:00', '#satiety'); // 24 days after the last meal
  await seed(page, { meals: READINGS, settings: install });
  await choose(page, 'satiety-range', '7d');
  await expect(page.locator('[data-block="satiety-insights"]')).toHaveText('No rated meals in the last 7 days. Choose a longer time above to see more.');
  await expect(count(page)).toHaveText('Last 7 days: no rated meals.');
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('No meals in the last 7 days.');
  await choose(page, 'satiety-range', '30d');
  // 21 to 26 September fall in the last 30 days.
  await expect(page.locator('[data-block="satiety-meals"] .meal-day')).toHaveCount(6);
  await choose(page, 'satiety-view', 'insights');
  await expect(page.getByTestId('insights')).toHaveText('Rate how ten meals finished and your own patterns show here.');
  await choose(page, 'satiety-range', 'all');
  await expect(count(page)).toHaveText('26 rated meals; 25 with the 20-minute check.');
});
