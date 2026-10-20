// Satiety's honest numbers: every figure that uses the 20-minute reading rests
// on checks answered on time (15 to 40 minutes after the meal finished), a
// quiet line under the drift says what was left out, readings not taken on
// time are marked in words, and the hero says where to stop eating.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, readDb, setTime, settings, ms } from './helpers.js';
import { READINGS, WEEK, satietyMeal } from './seed-data.js';

const install = settings({ installedAt: ms('2026-09-20T08:00') });
const tab = (page, name) => page.locator(`.tab[data-tab="${name}"]`);
const items = (page, testid) => page.getByTestId(testid).locator('.legend-item');
const meal = (page, id) => page.locator(`[data-meal="${id}"]`);
const STOP = 'Stop near 5: 8 of your 10 meals stopped there landed in 6 to 8, none past 8.';

test('the 20-minute figures rest on checks answered on time; the line under the drift says what was left out', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals: READINGS, settings: install });
  // 18 checks on time drift +1.8; 3 late, 1 early and 3 added are left out.
  await expect(page.getByTestId('tile-drift')).toHaveText('+1.8 pts');
  await expect(page.getByTestId('drift-basis')).toHaveText('From 18 on-time checks. Left out: 3 late, 1 early, 3 added.');
  await expect(page.getByTestId('tile-zone')).toContainText('11 of 18');
  await expect(page.getByTestId('tile-complete')).toContainText('18 of 26');
  await expect(page.getByTestId('tile-complete')).toContainText('1 still missing the 20-minute check, 7 not checked on time.');
  // The count at the top counts every meal with both readings, however the 20-minute one was taken.
  await expect(page.getByTestId('satiety-count')).toHaveText('26 rated meals; 25 with the 20-minute check.');
  // Where you land and the lag show the on-time checks only.
  await expect(page.getByTestId('landing-chart').locator('path[data-stop]')).toHaveCount(18);
  await expect(items(page, 'lag-legend')).toHaveText(['Left wanting (9)', 'Satisfied (4)', 'Overfull (5)']);
  // How often you stop where, and arriving hungry, still count every rated meal.
  await expect(page.getByTestId('lead-stops')).toHaveText('12 of 26');
  await expect(page.getByTestId('stop-chart')).toContainText('12 (46%)');
  await expect(page.getByTestId('lead-hunger')).toHaveText('6.6 of 10');
  await expect(page.getByTestId('hunger-chart')).toContainText('5.7 (12)');
  // The climbing note's second sentence is the stop point.
  await expect(page.getByTestId('drift-note')).toHaveText(`Fullness keeps climbing after you stop. ${STOP}`);
  await expect(page.getByTestId('stop-point')).toHaveText(STOP);
  await expect(page.getByTestId('drift-note')).not.toContainText('satisfied');
});

test('the stop point: rough under 10 meals and after the note when the drift is not climbing; none before 5 meals', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  // Seven checks on time, all stopped at 6: +1.3, not climbing.
  const seven = [7, 7, 7, 8, 6, 9, 7].map((at20, i) => satietyMeal(i + 10, 6, at20, 'before_full', 6));
  await seed(page, { ...WEEK, meals: seven, settings: install });
  await expect(page.getByTestId('tile-drift')).toHaveText('+1.3 pts');
  await expect(page.getByTestId('drift-note')).toHaveText('How much fullness rises in the 20 minutes after a meal. Rough so far: stop near 6: 6 of your 7 meals stopped there landed in 6 to 8, 1 past 8.');
  // Nothing left out: nothing said under the drift.
  await expect(page.getByTestId('drift-basis')).toHaveCount(0);
  // Four meals at one value: no stop point yet, and the climbing note keeps its first sentence only.
  const four = [8, 8, 8, 8].map((at20, i) => satietyMeal(i + 10, 5, at20, 'before_full', 6));
  await seed(page, { ...WEEK, meals: four, settings: install });
  await expect(page.getByTestId('tile-drift')).toHaveText('+3.0 pts');
  await expect(page.getByTestId('drift-note')).toHaveText('Fullness keeps climbing after you stop.');
  await expect(page.getByTestId('stop-point')).toHaveCount(0);
  // No check on time at all: no drift, what was left out, and what the drift needs.
  const offTime = [satietyMeal(20, 5, 7, 'before_full', 6, 'added-now'), satietyMeal(22, 6, 8, 'full', 7, 'late', '19:10'), satietyMeal(23, 5, 7, 'before_full', 6, 'added')];
  await seed(page, { ...WEEK, meals: offTime, settings: install });
  await expect(page.getByTestId('tile-drift')).toHaveText('not yet');
  await expect(page.getByTestId('drift-basis')).toHaveText('Left out: 1 late, 2 added.');
  await expect(page.getByTestId('drift-note')).toHaveText('Needs a fullness check answered 15 to 40 minutes after a meal.');
  await expect(page.getByTestId('tile-complete')).toContainText('3 not checked on time.');
  await expect(page.getByTestId('satiety-count')).toHaveText('3 rated meals; 3 with the 20-minute check.');
  // The charts wait for a check on time, too.
  await expect(page.locator('.chart-wait')).toHaveText([
    'Answer a fullness check 15 to 40 minutes after a meal and your first point appears here.',
    'Answer a fullness check 15 to 40 minutes after a meal and the lines appear here.',
  ]);
  // No 20-minute reading at all: the charts wait for a first check.
  await seed(page, { ...WEEK, meals: [satietyMeal(20, 5, null, 'full', 7, 'none')], settings: install });
  await expect(page.getByTestId('satiety-count')).toHaveText('1 rated meal; 0 with the 20-minute check.');
  await expect(page.getByTestId('drift-note')).toHaveText('Needs a meal with both fullness readings.');
  await expect(page.locator('.chart-wait')).toHaveText([
    'Answer one fullness check and your first point appears here.',
    'Answer one fullness check and the lines appear here.',
  ]);
});

test('Meals and the table mark each reading not taken on time, in words', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals: READINGS, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await expect(meal(page, 25)).toContainText('6 → 5 → 7 late +2.0');
  await expect(meal(page, 24)).toContainText('8 → 7 → 8 added +1.0'); // changed in the meal sheet
  await expect(meal(page, 23)).toContainText('6 → 5 → 7 added +2.0'); // Add a meal, before it marked its readings
  await expect(meal(page, 21)).toContainText('7 → 6 → 6 early 0.0');
  await expect(meal(page, 20)).toContainText('6 → 4 → 6 added +2.0');
  // On time: drawn as before, with no word.
  await expect(meal(page, 18)).toContainText('6 → 5 → 5 0.0');
  await expect(meal(page, 18).locator('.read-how')).toHaveCount(0);
  await expect(page.locator('[data-block="satiety-meals"] .read-how')).toHaveText(['late', 'added', 'added', 'late', 'early', 'added', 'late']);
  // The table lists every meal with both readings and marks the same ones.
  await choose(page, 'satiety-view', 'insights');
  await tap(page, 'satiety-table');
  const rows = page.getByTestId('satiety-table').locator('tbody tr');
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText('Fri 25 Sep');
  await expect(rows.first().locator('td').nth(3)).toHaveText('7, late');
  await expect(page.getByTestId('satiety-table').locator('.read-how')).toHaveText(['late', 'added', 'added', 'late', 'early', 'added', 'late']);
});

test('a 20-minute reading entered or changed in the meal sheet counts as added; one left alone keeps its check', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await expect(page.getByTestId('tile-drift')).toHaveText('+1.3 pts');
  await choose(page, 'satiety-view', 'meals');
  // Changing the 20-minute reading: added, and left out from then on.
  await meal(page, 2).click();
  await pick(page, 'fullness-20', 8);
  await tap(page, 'save-meal-edit');
  await expect(sheet(page, 'edit-meal')).toHaveCount(0);
  await expect(meal(page, 2)).toContainText('6 → 6 → 8 added +2.0');
  let db = await readDb(page);
  expect(db.meals.find((m) => m.id === 2)).toMatchObject({ fullness20: 8, fullness20Recalled: true });
  // Entering one where there was none: added too.
  await meal(page, 4).click();
  await pick(page, 'fullness-20', 6);
  await tap(page, 'save-meal-edit');
  await expect(meal(page, 4)).toContainText('5 → 5 → 6 added +1.0');
  // Changing only the name keeps the check as it was.
  await meal(page, 1).click();
  await choose(page, 'meal-type', 'Snack');
  await tap(page, 'save-meal-edit');
  await expect(meal(page, 1)).toContainText('17:30 Snack');
  await expect(meal(page, 1).locator('.read-how')).toHaveCount(0);
  // Correcting when a meal finished keeps its check's due time, so its reading
  // reads from when it was answered: 18:37, 27 minutes after 18:10, on time.
  await meal(page, 3).click();
  await setTime(page, 'edit-finish', '18:10');
  await tap(page, 'save-meal-edit');
  await expect(sheet(page, 'edit-meal')).toHaveCount(0);
  db = await readDb(page);
  expect(db.meals.find((m) => m.id === 3)).toMatchObject({ finishedAt: ms('2026-09-23T18:10'), fullness20DueAt: ms('2026-09-23T18:35') });
  expect(db.meals.find((m) => m.id === 3).fullness20Recalled).toBeUndefined();
  expect(db.meals.find((m) => m.id === 1).fullness20Recalled).toBeUndefined();
  await expect(meal(page, 3).locator('.read-how')).toHaveCount(0);
  // Insights follow: two checks on time (+1.5), two readings added.
  await choose(page, 'satiety-view', 'insights');
  await expect(page.getByTestId('tile-drift')).toHaveText('+1.5 pts');
  await expect(page.getByTestId('drift-basis')).toHaveText('From 2 on-time checks. Left out: 2 added.');
});

test('a reading given in Add a meal counts as added', async ({ page }) => {
  await openAt(page, '2026-09-26T15:00', '#satiety');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-added-meal');
  await expect(page.getByTestId('flash')).toHaveText('Meal saved.');
  expect((await readDb(page)).meals[0]).toMatchObject({ fullness20: 7, fullness20DueAt: null, fullness20Recalled: true });
  await expect(page.getByTestId('drift-basis')).toHaveText('Left out: 1 added.');
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('– → 6 → 7 added +1.0');
});

test('checks answered early, on time and late: each says how, and only the one on time counts', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00');
  await seed(page, { settings: install });
  /** Starts a meal on Today now and finishes it on Satiety's Now view at once. */
  const eat = async (stop, now) => {
    await tab(page, 'today').click();
    await tap(page, 'start-meal');
    await tap(page, 'start-eating');
    await tab(page, 'satiety').click();
    await choose(page, 'satiety-view', 'now');
    await tap(page, 'finish-meal');
    await choose(page, 'stop', stop);
    await pick(page, 'fullness-now', now);
    await tap(page, 'save-finish');
    await expect(sheet(page, 'finish-meal')).toHaveCount(0);
  };
  // Scored 5 minutes after finishing, while the timer still runs: early.
  await eat('before_full', 5);
  await advance(page, 5);
  await tap(page, 'score-now');
  await pick(page, 'fullness-20', 6);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  // Answered when the check asks, 22 minutes on: on time.
  await eat('full', 6);
  await advance(page, 22);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 8);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  // Answered an hour on: late.
  await eat('stuffed', 7);
  await advance(page, 60);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 9);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  const db = await readDb(page);
  expect(db.meals.map((m) => Math.round((m.fullness20At - m.finishedAt) / 60_000))).toEqual([5, 22, 60]);
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"] .read-how')).toHaveText(['late', 'early']);
  await choose(page, 'satiety-view', 'insights');
  await expect(page.getByTestId('tile-drift')).toHaveText('+2.0 pts');
  await expect(page.getByTestId('drift-basis')).toHaveText('From 1 on-time check. Left out: 1 late, 1 early.');
});

test('a check answered on time stays on time when the window\'s first bite is corrected', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await seed(page, { settings: install });
  // Started at 18:00, finished at 18:30, the check answered when it asks, 22 minutes on.
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await advance(page, 30);
  await tab(page, 'satiety').click();
  await choose(page, 'satiety-view', 'now');
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 5);
  await tap(page, 'save-finish');
  await expect(sheet(page, 'finish-meal')).toHaveCount(0);
  await advance(page, 22);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  // Forgot to tap: eating really started at 17:30. The first meal moves with
  // the first bite, its check with it, so the check still reads 22 minutes on.
  await tab(page, 'today').click();
  await tap(page, 'change-opening');
  await setTime(page, 'opened-at', '17:30');
  await tap(page, 'save-opening');
  await expect(sheet(page, 'opening')).toHaveCount(0);
  const [moved] = (await readDb(page)).meals;
  expect(moved).toMatchObject({ startedAt: ms('2026-09-27T17:30'), finishedAt: ms('2026-09-27T18:00'), fullness20DueAt: ms('2026-09-27T18:20') });
  expect(Math.round((moved.fullness20At - moved.finishedAt) / 60_000)).toBe(22);
  await tab(page, 'satiety').click();
  await choose(page, 'satiety-view', 'insights');
  await expect(page.getByTestId('tile-drift')).toHaveText('+2.0 pts');
  await expect(page.getByTestId('drift-basis')).toHaveCount(0);
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('5 → 7 +2.0');
  await expect(page.locator('[data-block="satiety-meals"] .read-how')).toHaveCount(0);
});
