// A pause with no end: "Indefinitely" in the Pause sheet, until Resume
// fasting. And meals through any pause: started, finished and checked 20
// minutes on as on any day, with no window.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setDate, readDb, settings, ms } from './helpers.js';

const T = (day, from, to) => ({ day, firstBite: ms(`${day}T${from}`), lastBite: ms(`${day}T${to}`) });
const LAST_NIGHT = {
  days: [T('2026-09-26', '17:00', '21:00')],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};
const pausedKeys = async (page) => (await readDb(page)).days.filter((d) => d.paused).map((d) => d.day);
const openPause = async (page) => ((await readDb(page)).settings.find((s) => s.key === 'pauseOpen') || {}).value ?? null;
const hero = (page) => page.locator('[data-block="paused"]');

/** Pauses indefinitely from today, from More. */
async function pauseIndefinitely(page) {
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'add-pause');
  await choose(page, 'pause-length', 'true');
  await tap(page, 'save-pause');
  await expect(sheet(page, 'pause')).toHaveCount(0);
}

test('Pause indefinitely: no end date, Today says until you resume, and More lists it', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, LAST_NIGHT);
  await tap(page, 'add-pause');
  const s = sheet(page, 'pause');
  // Until a date at first: both wheels.
  await expect(s.locator('[data-date="pause-to"], [data-wheel="pause-to"], [data-field="pause-to"]').or(s.getByText('Until', { exact: true })).first()).toBeVisible();
  await choose(page, 'pause-length', 'true');
  await expect(s.getByText('Until', { exact: true })).toHaveCount(0);
  await expect(s.getByTestId('pause-summary')).toHaveText('From Sun 27 Sep, with no end date. Resume fasting when you choose.');
  await expect(s.locator('[data-action="save-pause"]')).toHaveText('Pause indefinitely');
  await tap(page, 'save-pause');
  await expect(page.getByTestId('flash')).toHaveText('Paused from Sun 27 Sep, until you resume.');
  const row = page.locator('[data-block="pauses"] [data-pause="2026-09-27"]');
  await expect(row).toContainText('From Sun 27 Sep, until you resume');
  await expect(row).toContainText('Now');
  // Marked a week ahead, and noted as open.
  expect(await pausedKeys(page)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  expect(await openPause(page)).toEqual({ from: '2026-09-27', reason: true, through: '2026-10-03' });
  await page.locator('.tab[data-tab="today"]').click();
  await expect(hero(page).getByTestId('paused-until')).toHaveText('Paused until you resume');
  await expect(hero(page)).toContainText('Fasting is not tracked and your streak holds. Meals and fullness checks still count.');
  await expect(hero(page)).not.toContainText('Tracking resumes');
  await expect(hero(page).locator('[data-action="end-pause"]')).toHaveText('Resume fasting');
  await expect(page.getByTestId('streak')).toHaveText('1 day');
});

test('weeks later it is still paused; Resume fasting tracks today again, and Undo takes it back', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, LAST_NIGHT);
  await pauseIndefinitely(page);
  // Opened again 23 days on: every day since is paused, a week ahead too, and the streak held.
  await openAt(page, '2026-10-20T10:00');
  await expect(hero(page).getByTestId('paused-until')).toHaveText('Paused until you resume');
  await expect(page.getByTestId('streak')).toHaveText('1 day');
  const keys = await pausedKeys(page);
  expect(keys[0]).toBe('2026-09-27');
  expect(keys[keys.length - 1]).toBe('2026-10-26');
  expect(keys).toHaveLength(30);
  expect((await openPause(page)).through).toBe('2026-10-26');
  // The week row shows the days ahead paused too.
  expect(await page.getByTestId('today-week').locator('.week-day').evaluateAll((els) => els.map((e) => e.dataset.result))).toEqual(Array(7).fill('paused'));

  await tap(page, 'end-pause');
  await expect(page.getByTestId('flash')).toHaveText('Fasting resumed. Today is tracked again.');
  await expect(hero(page)).toHaveCount(0);
  await expect(page.locator('.today')).toHaveAttribute('data-mode', 'before');
  expect(await openPause(page)).toBeNull();
  // The days before today stay paused; today and after are tracked.
  const after = await pausedKeys(page);
  expect(after[after.length - 1]).toBe('2026-10-19');
  expect(after).toHaveLength(23);
  await expect(page.getByTestId('streak')).toHaveText('1 day');

  await tap(page, 'undo');
  await expect(hero(page).getByTestId('paused-until')).toHaveText('Paused until you resume');
  expect((await openPause(page)).through).toBe('2026-10-26');
  expect(await pausedKeys(page)).toHaveLength(30);
});

test('through a pause, a meal is started, finished and checked 20 minutes on, with no window', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await pauseIndefinitely(page);
  await page.locator('.tab[data-tab="today"]').click();
  await expect(hero(page).getByTestId('ring-fullness')).toContainText('Not rated yet');
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-context')).toHaveText('Fasting is paused, so this meal opens no window. It counts for Satiety.');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toBeHidden(); // 13:10 on a workday, and no miss
  await pick(page, 'hunger', 6);
  await tap(page, 'start-eating');
  await expect(page.getByTestId('flash')).toHaveText('Meal started at 13:10.');
  await expect(hero(page).locator('[data-block="eating"]')).toContainText('Eating: Lunch, since 13:10.');
  let db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27')).not.toHaveProperty('firstBite');
  expect(db.meals).toHaveLength(1);
  expect(db.meals[0]).toMatchObject({ day: '2026-09-27', startedAt: ms('2026-09-27T13:10'), hungerBefore: 6 });
  expect(db.meals[0].outside).toBeUndefined();

  await advance(page, 25);
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect(page.getByTestId('flash')).toHaveText('Fullness check at 13:55.');
  // The check is pointed to on Today while it runs, then asks.
  await expect(page.locator('[data-block="satiety-pointer"]')).toBeVisible();
  await advance(page, 21);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  db = await readDb(page);
  expect(db.meals[0]).toMatchObject({ stop: 'full', fullnessNow: 6, fullness20: 7, finishedAt: ms('2026-09-27T13:35'), fullness20DueAt: ms('2026-09-27T13:55') });
  // Still paused, with no window; the day's fullness shows, and its ring closes.
  await expect(hero(page).getByTestId('paused-until')).toHaveText('Paused until you resume');
  await expect(hero(page).getByTestId('ring-fullness')).toContainText('Satisfied');
  await expect(hero(page).locator('[data-action="start-meal"]')).toBeVisible();
  expect((await readDb(page)).days.find((d) => d.day === '2026-09-27')).not.toHaveProperty('firstBite');
  // Satiety counts it as a check answered on time.
  await page.locator('.tab[data-tab="satiety"]').click();
  await expect(page.getByTestId('satiety-count')).toHaveText('1 rated meal; 1 with the 20-minute check.');
  await expect(page.getByTestId('tile-drift')).toHaveText('+1.0 pts');
  await expect(page.getByTestId('drift-basis')).toHaveCount(0);
  // The day in Week lists the meal.
  await page.goto('./#day/2026-09-27');
  await expect(page.locator('[data-block="day-meals"]')).toContainText('13:10 to 13:35');
});

test('a dated pause takes meals the same way; one meal at a time', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await tap(page, 'pause-today');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(hero(page).locator('[data-block="eating"]')).toBeVisible();
  // Start another meal first asks how this one finished.
  await tap(page, 'another-meal');
  await expect(sheet(page, 'finish-meal').getByTestId('finish-lead')).toHaveText('One meal at a time. First, how did this one finish?');
});

test('an open pause given an end date is a dated pause again', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, LAST_NIGHT);
  await pauseIndefinitely(page);
  await page.locator('.tab[data-tab="today"]').click();
  await tap(page, 'change-pause');
  const s = sheet(page, 'pause');
  await expect(s.locator('button[data-choice="pause-length"][data-value="true"]')).toHaveAttribute('aria-checked', 'true');
  await expect(s.locator('[data-action="end-pause-sheet"]')).toHaveText('Resume fasting');
  await choose(page, 'pause-length', 'false');
  await setDate(page, 'pause-to', '2026-09-29');
  await expect(s.getByTestId('pause-summary')).toHaveText('3 days: Sun 27 Sep to Tue 29 Sep. Tracking resumes on Wed 30 Sep.');
  await tap(page, 'save-pause');
  await expect(page.getByTestId('flash')).toHaveText('Paused: Sun 27 Sep to Tue 29 Sep.');
  expect(await openPause(page)).toBeNull();
  expect(await pausedKeys(page)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
  await expect(hero(page).getByTestId('paused-until')).toHaveText('Paused until Tue 29 Sep');
});

test('a day taken out of an open pause by hand stays out; Reset ends the pause', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, LAST_NIGHT);
  await pauseIndefinitely(page);
  await page.goto('./#day/2026-09-28');
  await tap(page, 'unpause-day');
  await expect(page.getByTestId('flash')).toHaveText('Day unpaused.');
  await openAt(page, '2026-10-05T10:00');
  const keys = await pausedKeys(page);
  expect(keys).not.toContain('2026-09-28');
  expect(keys[keys.length - 1]).toBe('2026-10-11');
  // Reset deletes the days, and the open pause with them.
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'reset');
  await tap(page, 'reset-continue');
  await tap(page, 'reset-confirm');
  await expect.poll(() => openPause(page)).toBeNull();
  expect(await pausedKeys(page)).toEqual([]);
});
