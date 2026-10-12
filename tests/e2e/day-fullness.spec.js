import { test, expect, openAt, seed, tap, choose, readDb } from './helpers.js';
import { WEEK } from './seed-data.js';

// How the day ended: asked on Satiety, under Now, when the day's meals were
// not all rated (and on paused days); a day counts as left wanting only when
// every meal was. Kept from the Uhud tests when the climb was removed.

const toNow = async (page) => { await page.locator('.tab[data-tab="satiety"]').click(); await choose(page, 'satiety-view', 'now'); };

test('a day with no meals rated asks how it finished, and the answer is saved', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00');
  await seed(page, WEEK);
  await toNow(page);
  const card = page.locator('[data-block="fullness"]');
  await expect(card).toContainText('How did you finish eating today?');
  await choose(page, 'day-fullness', 'before_full');
  expect((await readDb(page)).days.find((d) => d.day === '2026-09-26').fullness).toBe('before_full');
});

test('with every meal rated, the day reads from the meals', async ({ page }) => {
  await openAt(page, '2026-09-24T23:00');
  await seed(page, WEEK);
  await toNow(page);
  await expect(page.locator('[data-block="fullness"]').getByTestId('day-fullness')).toHaveText('Left wanting at every meal.');
  await page.goto('./#day/2026-09-22');
  await expect(page.locator('[data-block="fullness"]').getByTestId('day-fullness')).toHaveText('Satisfied at one meal or more.');
});

test('a paused day can still be rated for fullness', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00');
  await seed(page, WEEK);
  await tap(page, 'pause-today');
  await toNow(page);
  const card = page.locator('[data-block="fullness"]');
  await expect(card).toContainText('How did you finish eating today?');
  await choose(page, 'day-fullness', 'before_full');
  const today = (await readDb(page)).days.find((d) => d.day === '2026-09-27');
  expect(today.paused).toBeTruthy();
  expect(today.fullness).toBe('before_full');
});
