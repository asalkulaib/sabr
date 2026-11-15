// The rules changed on a day (the owner, 15 November 2026): 30 minutes of
// grace, and no 16:00 workday rule. A phone takes them up from the day it
// first runs them; the days before keep the verdict they had.
import { test, expect, openAt, seed, advance, tap, sheet, readDb, settings, ms } from './helpers.js';

const T = (day, from, to) => ({ day, firstBite: ms(`${day}T${from}`), lastBite: to ? ms(`${day}T${to}`) : null });
const setting = async (page, key) => ((await readDb(page)).settings.find((s) => s.key === key) || {}).value;

test('a phone with history takes the rules from today: past days keep their verdict', async ({ page }) => {
  // Monday 28 September. Thursday ran 4 h 20 min; Sunday opened at 15:00.
  await openAt(page, '2026-09-28T13:00');
  await seed(page, {
    days: [T('2026-09-23', '17:00', '21:00'), T('2026-09-24', '17:00', '21:20'), T('2026-09-27', '15:00', '18:00')],
    settings: settings({ installedAt: ms('2026-09-23T08:00') }),
  });
  expect(await setting(page, 'graceChanges')).toEqual([{ from: '2026-09-28', minutes: 30 }]);
  expect(await setting(page, 'cutoffEnd')).toBe('2026-09-28');
  // Both misses stand, in their own words, and the streak is as it was.
  await expect(page.getByTestId('streak')).toHaveText('0 days');
  await page.goto('./#day/2026-09-24');
  await expect(page.locator('.day')).toContainText('Miss: over 4 h 15 min.');
  await page.goto('./#day/2026-09-27');
  await expect(page.locator('.day')).toContainText('Miss: opened before 16:00.');
  await expect(page.getByTestId('day-legend')).toContainText('16:00 on workdays');
  // Today: opening at 13:00 on a workday warns of nothing and is no miss.
  await page.goto('./#today');
  await expect(page.locator('.today')).not.toContainText('16:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(sheet(page, 'start-meal')).toBeHidden();
  await expect(page.getByTestId('band-legend')).toContainText('30 min grace');
  await advance(page, 265); // 17:25: 4 h 25 min, inside the grace
  await expect(page.getByTestId('grace')).toHaveText('Your 4 hours are up. 5 min of grace left.');
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('streak')).toHaveText('1 day');
  // Today's row in Week has no 16:00 line; Sunday's keeps it.
  await page.goto('./#week');
  await expect(page.locator('[data-cutoff="2026-09-28"]')).toHaveCount(0);
  await expect(page.locator('[data-cutoff="2026-09-27"]')).toHaveCount(1);
  await expect(page.locator('[data-block="workdays"]')).toBeVisible();
});

test('a phone with nothing logged takes them for every day, and More says how a day succeeds', async ({ page }) => {
  await openAt(page, '2026-09-28T13:00', '#more');
  expect(await setting(page, 'graceChanges')).toEqual([{ from: '2000-01-01', minutes: 30 }]);
  expect(await setting(page, 'cutoffEnd')).toBe('2000-01-01');
  const timing = page.locator('[data-block="timing"]');
  await expect(timing).toContainText('When your window opens');
  await expect(page.getByTestId('timing-text')).toHaveText('Your 4-hour window, planned for 17:30 on workdays and 14:00 at weekends. A day succeeds when all eating fits inside it, whenever it opens.');
  // A week with no day under the 16:00 rule has no Workdays card.
  await page.goto('./#week');
  await expect(page.locator('.week')).toBeVisible();
  await expect(page.locator('[data-block="workdays"]')).toHaveCount(0);
});

test('a day in Week: a day off says what it changes now', async ({ page }) => {
  await openAt(page, '2026-09-28T13:00', '#day/2026-09-28');
  const row = page.locator('[data-block="day-off"]');
  await expect(row).toContainText('A workday: your window is planned for 17:30.');
  await tap(page, 'toggle-day-off');
  await expect(row).toContainText('A day off: your window is planned for 14:00, as at a weekend.');
});
