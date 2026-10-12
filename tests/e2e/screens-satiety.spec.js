// Satiety (Insights, Now, Meals) and the fullness card in every state, shot at
// 390 x 844 for design review (test-results/screens, names starting with SA),
// each with the contrast audit of shot().
import { test, expect, openAt, seed, advance, tap, pick, choose, settings, ms, shot, settleMotion } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

/** Fourteen meals, 12 to 25 September: every way of finishing, one still without its 20-minute check. */
function fourteen() {
  const meals = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10);
    const stop = ['before_full', 'full', 'full', 'stuffed'][i % 4];
    meals.push({ id: i + 1, day, name: i % 3 ? 'Dinner' : 'Lunch', startedAt: ms(`${day}T17:30`), finishedAt: ms(`${day}T18:00`), hungerBefore: 5 + (i % 4), stop, fullnessNow: 5 + (i % 3), fullness20: i === 13 ? null : 6 + (i % 4) });
  }
  return meals;
}

test('insights: the drift hero, the four charts, findings and the table', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals: fourteen(), settings: install });
  await expect(page.getByTestId('tile-drift')).toBeVisible();
  await shot(page, 'SA70-satiety-insights');
  // The filter chips lead the first chart's legend: they filter every chart.
  await page.getByTestId('landing-legend').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'SA70k-satiety-filter');
  await page.evaluate(() => window.scrollTo(0, 0));
  // The lag lines rise once the chart is seen: see it, then shoot the whole page.
  await page.getByTestId('lag-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.getByTestId('lag-chart')).not.toHaveClass(/waiting/);
  await settleMotion(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'SA70b-satiety-insights-full', { full: true });
  await page.getByTestId('landing-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'SA70i-satiety-landing');
  await page.getByTestId('stop-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'SA70j-satiety-stops');
  // One way of finishing picked: the others fade, the focus bar sits above the tabs.
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  await page.getByTestId('lag-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'SA70c-satiety-overfull-only');
  await shot(page, 'SA70d-satiety-overfull-only-full', { full: true });
  await tap(page, 'show-all');
  // The table, under the findings.
  await tap(page, 'satiety-table');
  await page.getByTestId('satiety-table').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, 'SA70e-satiety-table');
});

test('insights: few meals, and none rated yet', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  // See the lag chart first, so its lines have risen to the figures beside them.
  await page.getByTestId('lag-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.getByTestId('lag-chart')).not.toHaveClass(/waiting/);
  await settleMotion(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'SA70f-satiety-insights-few', { full: true });
  await seed(page, { ...WEEK, meals: [], settings: install });
  await shot(page, 'SA70g-satiety-insights-empty');
});

test('meals: one list with sticky days, an outside meal, an unrated one, a filter', async ({ page }) => {
  const meals = [
    ...fourteen(),
    { id: 20, day: '2026-09-26', name: 'Dessert', startedAt: ms('2026-09-26T21:30'), finishedAt: ms('2026-09-26T21:45'), outside: true, hungerBefore: 3, stop: 'full', fullnessNow: 7, fullness20: 8 },
    { id: 21, day: '2026-09-26', name: 'Lunch', startedAt: ms('2026-09-26T16:40'), finishedAt: ms('2026-09-26T17:10'), hungerBefore: 6 },
  ];
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await shot(page, 'SA71-satiety-meals');
  // Scrolled: the day stays on top of its meals.
  await page.evaluate(() => window.scrollTo(0, 700));
  await shot(page, 'SA71b-satiety-meals-scrolled');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'SA71c-satiety-meals-full', { full: true });
  // A row by keyboard.
  await page.locator('[data-meal="20"]').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await shot(page, 'SA71d-satiety-meals-row-focus');
  // Filtered to left wanting.
  await page.getByTestId('meals-legend').locator('button[data-series="before_full"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  await shot(page, 'SA71e-satiety-meals-left-wanting');
});

test('meals: a filter with nothing in it, and no meals at all', async ({ page }) => {
  // The only overfull meal is older than 30 days: the chart has it, the list does not.
  const meals = [
    { id: 1, day: '2026-08-10', name: 'Dinner', startedAt: ms('2026-08-10T17:30'), finishedAt: ms('2026-08-10T18:00'), hungerBefore: 8, stop: 'stuffed', fullnessNow: 8, fullness20: 9 },
    ...WEEK.meals.map((m) => ({ ...m, id: m.id + 1, stop: m.stop === 'stuffed' ? 'full' : m.stop })),
  ];
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await page.getByTestId('meals-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('No overfull meals in the last 30 days.');
  await shot(page, 'SA71f-satiety-meals-filter-empty');
  await seed(page, { ...WEEK, meals: [], settings: install });
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('No meals in the last 30 days.');
  await shot(page, 'SA71g-satiety-meals-empty');
  await choose(page, 'satiety-view', 'now');
  await shot(page, 'SA72i-satiety-now-no-meals');
});

test('meals: a meal added from Satiety shows itself in the list', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await tap(page, 'add-meal');
  await choose(page, 'meal-type', 'Lunch');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-added-meal');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('Lunch');
  await shot(page, 'SA71h-satiety-meals-added');
});

test('now: nothing waiting, the day asked; a check running, then due; several', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await choose(page, 'satiety-view', 'now');
  await shot(page, 'SA72-satiety-now');
  // The day's fullness chosen: the ink diamond turns white on the pill.
  await choose(page, 'day-fullness', 'stuffed');
  await shot(page, 'SA72b-satiety-now-day-overfull');
  await choose(page, 'day-fullness', 'before_full');
  await shot(page, 'SA72c-satiety-now-day-left-wanting');

  // A meal finished at 18:00: its check counts down, then comes due.
  await openAt(page, '2026-09-27T18:00');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="satiety"]').click();
  await choose(page, 'satiety-view', 'now');
  await shot(page, 'SA72d-satiety-now-eating');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await advance(page, 8);
  await expect(page.getByTestId('fullness-check')).toContainText('Check in 12 min.');
  await shot(page, 'SA72e-satiety-now-check-running');
  await advance(page, 12);
  await expect(page.getByTestId('fullness-check')).toContainText('Time to score it.');
  // The check asks for itself when due; put it off to see the screen.
  if (await page.locator('[data-sheet="fullness"]').isVisible()) await tap(page, 'close-sheet');
  await shot(page, 'SA72f-satiety-now-check-due');
});

test('now: two checks, one due and one running; the day read from its meals', async ({ page }) => {
  const meals = [
    ...WEEK.meals,
    { id: 8, day: '2026-09-27', name: 'Lunch', startedAt: ms('2026-09-27T17:00'), finishedAt: ms('2026-09-27T17:30'), hungerBefore: 7, stop: 'before_full', fullnessNow: 5, fullness20DueAt: ms('2026-09-27T17:50') },
    { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:40'), finishedAt: ms('2026-09-27T17:55'), hungerBefore: 5, stop: 'before_full', fullnessNow: 6, fullness20DueAt: ms('2026-09-27T18:15') },
  ];
  await openAt(page, '2026-09-27T18:02', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  // The due check asks for itself at once; put it off to see the screen.
  await tap(page, 'close-sheet');
  await choose(page, 'satiety-view', 'now');
  await expect(page.getByTestId('fullness-check')).toHaveCount(2);
  await shot(page, 'SA72g-satiety-now-two-checks');
  await shot(page, 'SA72h-satiety-now-two-checks-full', { full: true });
});

test('the fullness card on a day: asked on a paused day, read from the meals on another', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await page.goto('./#day/2026-09-29');
  await page.locator('[data-block="fullness"]').scrollIntoViewIfNeeded();
  await shot(page, 'SA52-day-fullness-asked');
  await page.goto('./#day/2026-09-22');
  await page.locator('[data-block="fullness"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-block="fullness"]').getByTestId('day-fullness')).toHaveText('Satisfied at one meal or more.');
  await shot(page, 'SA52b-day-fullness-from-meals');
});

test.describe('at 320 wide', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('labels hold: the switch, Add a meal, the focus bar, the day track', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#satiety');
    await seed(page, { ...WEEK, meals: fourteen(), settings: install });
    await shot(page, 'SA80-satiety-320');
    await page.getByTestId('landing-legend').locator('button[data-series="before_full"]').click();
    await shot(page, 'SA80b-satiety-320-focus');
    await tap(page, 'show-all');
    await choose(page, 'satiety-view', 'meals');
    await shot(page, 'SA80c-satiety-320-meals');
    await choose(page, 'satiety-view', 'now');
    await shot(page, 'SA80d-satiety-320-now');
  });
});
