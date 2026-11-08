// The streak on Today: one line under the week row, and a celebration when
// the run reaches 7, 14, 30, 60 or 100 days, once for that run.
import { test, expect, openAt, seed, settings, ms } from './helpers.js';

const install = settings({ installedAt: ms('2026-09-01T08:00') });
/** Successful windows, 17:00 to 20:30, on the n days before 27 September. */
const run = (n) => Array.from({ length: n }, (_, i) => {
  const day = new Date(Date.UTC(2026, 8, 26 - i)).toISOString().slice(0, 10);
  return { day, firstBite: ms(`${day}T17:00`), lastBite: ms(`${day}T20:30`) };
});
const line = (page) => page.locator('[data-block="streak"]');

test('six days in a row: the streak says so, and nothing is celebrated', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: run(6), settings: install });
  await expect(line(page).getByTestId('streak')).toHaveText('6 days');
  await expect(line(page).getByTestId('streak-best')).toHaveText('6 days');
  await expect(line(page)).not.toHaveClass(/\bcelebrate\b/);
});

test('seven days in a row: the mark spins and bursts once for this run', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: run(7), settings: install });
  await expect(line(page).getByTestId('streak')).toHaveText('7 days');
  await expect(line(page)).toHaveClass(/\bcelebrate-win\b/);
  const moving = () => page.evaluate(() => document.querySelector('[data-block="streak"] .burst-win').getAnimations().length);
  expect(await moving()).toBeGreaterThan(0);
  // Opened again later: the same milestone of the same run is not celebrated twice.
  await page.clock.runFor(4000);
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await expect(line(page).getByTestId('streak')).toHaveText('7 days');
  await expect(line(page)).not.toHaveClass(/\bcelebrate\b/);
});

test('fourteen days: the next milestone is celebrated', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: run(14), settings: install });
  await expect(line(page).getByTestId('streak')).toHaveText('14 days');
  await expect(line(page)).toHaveClass(/\bcelebrate-win\b/);
});

test('with Reduce Motion on, a milestone moves nothing; the figure still says it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: run(7), settings: install });
  await expect(line(page).getByTestId('streak')).toHaveText('7 days');
  await expect(line(page)).not.toHaveClass(/\bcelebrate\b/);
});
