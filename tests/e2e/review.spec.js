import { test, expect, openAt, seed } from './helpers.js';
import { WEEK } from './seed-data.js';

const stat = (page, name) => page.locator(`[data-stat="${name}"] .stat-value`);

test('weekly review maths, Sunday to Saturday', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#week');
  await seed(page, WEEK);

  await expect(page.getByTestId('week-range')).toHaveText('20 to 26 September');
  await expect(page.getByTestId('success-count')).toHaveText('4 of 7');
  await expect(stat(page, 'avg-window')).toHaveText('3 h 17 min');
  await expect(stat(page, 'streak')).toHaveText('2 days');
  await expect(stat(page, 'on-time')).toHaveText('4 of 5');
  await expect(page.locator('.stat', { hasText: 'Nothing eaten before 4 PM' }).locator('.stat-value')).toHaveText('4.0 (4 days)');
  await expect(page.locator('.stat', { hasText: 'Ate before 4 PM' }).locator('.stat-value')).toHaveText('2.0 (1 day)');
  await expect(page.getByTestId('energy-all')).toHaveText('All time: 4.0 without eating before 4 PM (4 days), 2.0 with (1 day).');
  await expect(stat(page, 'weight-avg')).toHaveText('104.7 kg');
  await expect(stat(page, 'weight-change')).toHaveText('−0.8 kg');
  await expect(stat(page, 'training')).toHaveText('3');
  await expect(page.locator('[data-stat="training"] + p')).toHaveText('weights 2, cardio 1');
  await expect(stat(page, 'temptations')).toHaveText('4');
  await expect(stat(page, 'hold-rate')).toHaveText('3 of 4 (75%)');
  await expect(stat(page, 'triggers')).toHaveText('boredom 2, social 1, stress 1');

  const rows = page.locator('.dayrow');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('Sun 20');
  await expect(rows.nth(0)).toContainText('17:30 to 21:00');
  await expect(rows.nth(0)).toContainText('Success');
  await expect(rows.nth(1)).toContainText('Miss');
  await expect(rows.nth(6)).toContainText('Sat 26');

  // Step back a week and forward again.
  await page.locator('[data-action="prev-week"]').click();
  await expect(page.getByTestId('week-range')).toHaveText('13 to 19 September');
  await page.locator('[data-action="next-week"]').click();
  await expect(page.getByTestId('week-range')).toHaveText('20 to 26 September');

  // A day opens for editing.
  await rows.nth(1).click();
  await expect(page.locator('.day[data-day="2026-09-21"]')).toContainText('Miss: opened before 16:00.');
});
