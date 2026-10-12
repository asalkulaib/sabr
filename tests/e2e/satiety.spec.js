import { test, expect, openAt, seed, tap, pick, choose, sheet, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// The Satiety tab (Insights, Now, Meals), legends on every colour-coded
// visual, Weight inside History, and feasting hours.

const tab = (page, name) => page.locator(`.tab[data-tab="${name}"]`);
const items = (page, testid) => page.getByTestId(testid).locator('.legend-item');

test('Satiety opens on Insights: tiles, charts with legends, and the findings', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00');
  await seed(page, WEEK);
  await expect(page.locator('.tab')).toHaveText(['Today', 'Week', 'Satiety', 'History', 'More']);
  await tab(page, 'satiety').click();
  await expect(page.locator('.satiety')).toHaveAttribute('data-view', 'insights');
  await expect(page.locator('button[data-choice="satiety-view"]')).toHaveText(['Insights', 'Now', 'Meals']);
  // Drift (7-5, 7-6, 9-8) averages +1.3; 7, 7 and 9 at 20 minutes: two in the zone.
  await expect(page.getByTestId('tile-drift')).toContainText('+1.3 pts');
  await expect(page.getByTestId('tile-zone')).toContainText('2 of 3');
  await expect(page.getByTestId('tile-complete')).toContainText('3 of 4');
  await expect(page.getByTestId('tile-past')).toContainText('25%');
  await expect(page.getByTestId('landing-chart').locator('path[data-stop]')).toHaveCount(3);
  await expect(items(page, 'landing-legend')).toHaveText(['Left wanting', 'Satisfied', 'Overfull', 'Comfortable zone, 6 to 8', 'Meal to meal']);
  for (const id of ['lag-chart', 'stop-chart', 'hunger-chart']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('stop-chart')).toContainText('2 (50%)');
  // The 20-minute lag: a line per way of finishing, from right after to 20 minutes on.
  const lag = page.getByTestId('lag-chart');
  await expect(lag.locator('line[data-lag]')).toHaveCount(3);
  await expect(lag).toContainText('7.0 +2.0');
  await expect(items(page, 'lag-legend')).toHaveText(['Left wanting (1)', 'Satisfied (1)', 'Overfull (1)']);
  await expect(page.getByTestId('insights')).toHaveText('Rate how ten meals finished and your own patterns show here.');
  await tap(page, 'satiety-table');
  await expect(page.getByTestId('satiety-table').locator('tbody tr')).toHaveCount(3);
  // Nothing about satiety is left on Week or Today.
  await tab(page, 'week').click();
  await expect(page.locator('[data-stat="before-full"]')).toHaveCount(0);
  await tab(page, 'today').click();
  await expect(page.locator('[data-block="meals"], [data-block="fullness"]')).toHaveCount(0);
});

test('Meals: by day, newest first; each reads hunger, fullness after and at 20 minutes', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, WEEK);
  await choose(page, 'satiety-view', 'meals');
  const view = page.locator('[data-block="satiety-meals"]');
  await expect(view.locator('section[data-day]')).toHaveCount(4);
  await expect(view.locator('section[data-day]').first()).toHaveAttribute('data-day', '2026-09-24');
  const first = view.locator('[data-meal="1"]');
  await expect(first).toContainText('17:30 Dinner');
  await expect(first).toContainText('Left wanting');
  await expect(first).toContainText('7 → 5 → 7');
  await expect(first).toContainText('+2.0');
  await expect(items(page, 'meals-legend')).toHaveText(['Left wanting', 'Satisfied', 'Overfull', 'Not rated yet']);
  await first.click();
  await expect(sheet(page, 'edit-meal')).toBeVisible();
  // The view is remembered.
  expect((await readDb(page)).settings.find((s) => s.key === 'satietyView').value).toBe('meals');
});

test('Now: the meal in progress, then its 20-minute check; Today points to it', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await tab(page, 'satiety').click();
  await choose(page, 'satiety-view', 'now');
  await expect(page.locator('[data-block="satiety-now"] [data-block="eating"]')).toContainText('since 18:00');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect(page.getByTestId('fullness-check')).toContainText('Check in 20 min.');
  await tab(page, 'today').click();
  await expect(page.locator('[data-block="satiety-pointer"]')).toContainText('check in 20 min');
  await tap(page, 'open-satiety');
  await tap(page, 'score-now');
  await expect(sheet(page, 'fullness')).toBeVisible();
});

test('legends name every colour: week strip, ring and weight', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);
  await expect(items(page, 'strip-legend')).toHaveText(['Success', 'Miss', 'Paused', 'Open or not logged', 'Still ahead', 'Left wanting', '16:00 on workdays', 'Ate outside the window']);
  await tab(page, 'today').click();
  await expect(items(page, 'ring-legend')).toHaveText(['Fast', 'Window', 'Fullness']);
  await tab(page, 'history').click();
  await choose(page, 'history-metric', 'weight');
  await expect(items(page, 'weight-legend')).toHaveText(['7-day average', 'Latest']);
});

test('Weight lives in History: the third view, and back to Fast', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, WEEK);
  await choose(page, 'history-metric', 'weight');
  await expect(page).toHaveURL(/#weight$/);
  await expect(page.locator('.weight')).toBeVisible();
  await expect(tab(page, 'history')).toHaveAttribute('aria-current', 'page');
  // The History tab remembers Weight.
  await tab(page, 'today').click();
  await tab(page, 'history').click();
  await expect(page.locator('.weight')).toBeVisible();
  await choose(page, 'history-metric', 'fast');
  await expect(page.locator('.history')).toHaveAttribute('data-metric', 'fast');
});

test('feasting hours: the window opens any time; a workday window at 09:00 succeeds', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00', '#more');
  await choose(page, 'timing', 'flexible');
  await expect(page.getByTestId('flash')).toHaveText('Feasting hours from today: open your window any time.');
  await expect(page.getByTestId('timing-text')).toHaveText('Open your 4-hour window at any hour, any day. A day succeeds when all eating fits inside it.');
  await expect(page.locator('[data-block="planned"]')).toHaveCount(0);
  await expect(page.locator('[data-block="calendar"]')).toContainText('Two repeating alerts');
  expect((await readDb(page)).settings.find((s) => s.key === 'flexChanges').value).toEqual([{ from: '2026-09-27', on: true }]);
  await tab(page, 'today').click();
  await expect(page.getByTestId('flexible-line')).toHaveText('Your 4-hour window opens when you choose.');
  await expect(page.getByTestId('firm-reminder')).toHaveCount(0);
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toBeHidden();
});

test('feasting hours: success is the length alone; past days keep the planned-start rule', async ({ page }) => {
  await openAt(page, '2026-09-27T13:00');
  await seed(page, {
    days: [
      { day: '2026-09-24', firstBite: ms('2026-09-24T10:00'), lastBite: ms('2026-09-24T13:00') },
      { day: '2026-09-27', firstBite: ms('2026-09-27T09:00'), lastBite: ms('2026-09-27T12:50') },
    ],
    settings: settings({ installedAt: ms('2026-09-20T08:00'), flexChanges: [{ from: '2026-09-27', on: true }] }),
  });
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('next-window')).toHaveText('Tomorrow: a 4-hour window, opened whenever you choose.');
  // Thursday the 24th came before the switch: opening at 10:00 on a workday stays a miss.
  await page.goto('./#day/2026-09-24');
  await expect(page.locator('.day')).toContainText('Miss: opened before 16:00.');
});

test('tap a legend item or a mark: every chart and the meal list show only that one', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, WEEK);
  const dimmed = (id) => page.getByTestId(id).locator('.dim');
  // Tap Overfull in the first legend: the other two fade in every chart.
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.getByTestId('satiety-focus')).toContainText('Charts and meals show overfull only.');
  await expect(page.getByTestId('landing-legend').locator('button[data-series="stuffed"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('landing-chart').locator('[data-series="stuffed"].dim')).toHaveCount(0);
  await expect(page.getByTestId('landing-chart').locator('path[data-stop="before_full"].dim')).toHaveCount(1);
  await expect(dimmed('lag-chart')).toHaveCount(2);
  await expect(dimmed('stop-chart')).toHaveCount(2);
  await expect(dimmed('hunger-chart')).toHaveCount(2);
  // The meal list follows.
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"] [data-meal]')).toHaveCount(1);
  await expect(page.locator('[data-meal="3"]')).toBeVisible();
  // Tapping a bar row switches to its way of finishing; Show all brings everything back.
  await choose(page, 'satiety-view', 'insights');
  const row = page.getByTestId('stop-chart').locator('g[data-series="full"] text').first();
  // WebKit's smooth scroll can move the chart under a synthetic click; real taps hit the right row.
  await row.dispatchEvent('click');
  await expect(page.getByTestId('satiety-focus')).toContainText('Charts and meals show satisfied only.');
  await tap(page, 'show-all');
  await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
  await expect(page.locator('.chart .dim')).toHaveCount(0);
  // Leaving the tab resets it.
  await page.getByTestId('lag-legend').locator('button[data-series="before_full"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  await tab(page, 'today').click();
  await tab(page, 'satiety').click();
  await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
});

test('History: a legend item shows only its series; tap it again for all', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, WEEK);
  await choose(page, 'history-metric', 'feast');
  const chart = page.getByTestId('history-chart');
  const item = page.getByTestId('history-legend').locator('button[data-series="miss"]');
  await item.click();
  await expect(page.getByTestId('history-focus')).toContainText('Showing misses only.');
  await expect(chart).toHaveAttribute('data-focus', 'miss');
  await expect(chart.locator('rect[data-miss="true"].dim')).toHaveCount(0);
  await expect(chart.getByTestId('trend-line')).toHaveClass(/dim/);
  await expect(chart.getByTestId('avg-line')).toHaveClass(/dim/);
  await page.getByTestId('history-legend').locator('button[data-series="miss"]').click();
  await expect(page.getByTestId('history-focus')).toHaveCount(0);
  await expect(chart.locator('.dim')).toHaveCount(0);
});
