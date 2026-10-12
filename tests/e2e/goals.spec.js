import { test, expect, openAt, seed, advance, tap, choose, sheet, setPick, readDb, settings, ms } from './helpers.js';

// Goals: the eating window (16:8, 18:6, 20:4, 23:1 or 1 to 12 hours); the fast is the rest of the day.

const settingsOf = async (page) => Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value]));

test('a 16:8 goal from More: the window counts down 8 hours, and 7 hours is a success', async ({ page }) => {
  await openAt(page, '2026-09-26T12:00', '#more'); // Saturday: no 16:00 rule
  await expect(page.getByTestId('goal-text')).toHaveText('Eating window 4 hours, fasting 20 hours.');
  await choose(page, 'goal', '8');
  await expect(page.getByTestId('flash')).toHaveText('Goal 16:8 from today.');
  await expect(page.getByTestId('goal-text')).toHaveText('Eating window 8 hours, fasting 16 hours.');
  expect((await settingsOf(page)).goalChanges).toEqual([{ from: '2026-09-26', hours: 8 }]);

  await page.locator('.tab[data-tab="today"]').click();
  await expect(page.locator('[data-action="edit-goal"]')).toContainText('16:8');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('.countdown-caption')).toHaveText('left of 8 hours');
  await expect(page.getByTestId('countdown')).toHaveText('8:00');
  await advance(page, 7 * 60);
  await expect(page.locator('[data-block="open"]')).toHaveAttribute('data-phase', 'window');
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  await expect(page.getByTestId('window-length')).toHaveText('7h');
});

test('past days keep the goal they had', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00', '#week');
  await seed(page, {
    days: [
      { day: '2026-09-25', firstBite: ms('2026-09-25T12:00'), lastBite: ms('2026-09-25T19:00') },
      { day: '2026-09-27', firstBite: ms('2026-09-27T16:00'), lastBite: ms('2026-09-27T21:30') },
    ],
    settings: settings({ installedAt: ms('2026-09-25T08:00'), goalChanges: [{ from: '2026-09-27', hours: 6 }] }),
  });
  await page.locator('[data-action="prev-week"]').click();
  await expect(page.locator('.dayrow[data-day="2026-09-25"]')).toContainText('Miss'); // 7 h on the 4-hour goal
  await page.locator('[data-action="next-week"]').click();
  await expect(page.locator('.dayrow[data-day="2026-09-27"]')).toContainText('Success'); // 5 h 30 min on 18:6
  await page.locator('.dayrow[data-day="2026-09-27"]').click();
  await expect(page.locator('.day')).toContainText('Success');
});

test('the Goal note on Today: a custom window from the wheel, and Undo', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await tap(page, 'edit-goal');
  const s = sheet(page, 'goal');
  await choose(page, 'goal', 'custom');
  await setPick(page, 'goal-hours', 5);
  await expect(page.getByTestId('flash')).toHaveText('Goal 19:5 from today.');
  await expect(s.getByTestId('goal-text')).toHaveText('Eating window 5 hours, fasting 19 hours.');
  await tap(page, 'close-sheet');
  await expect(page.locator('[data-action="edit-goal"]')).toContainText('19:5');
  await tap(page, 'undo');
  await expect(page.locator('[data-action="edit-goal"]')).toContainText('20:4');
  expect((await settingsOf(page)).goalChanges).toEqual([]);
});

test('the fast ring fills towards the fasting goal and says how far it is', async ({ page }) => {
  const lastNight = { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }] };
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...lastNight, settings: settings({ installedAt: ms('2026-09-26T08:00') }) });
  await expect(page.getByTestId('fasting-ring')).toHaveAttribute('data-goal', '20');
  await expect(page.getByTestId('stage-marker')).toHaveAttribute('data-frac', (16.1666 / 20).toFixed(3));
  await expect(page.getByTestId('goal-line')).toHaveText('Fasting goal 20 h: 3 h 50 min to go.');
  await seed(page, { ...lastNight, settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-27', hours: 8 }] }) });
  await expect(page.getByTestId('fasting-ring')).toHaveAttribute('data-goal', '16');
  await expect(page.getByTestId('ring-goal')).toHaveText('Goal of 16 h reached');
  await expect(page.getByTestId('goal-line')).toHaveText('Fasting goal of 16 h reached.');
});

test('custom by fasting: 17 hours leaves a 7-hour window', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await tap(page, 'edit-goal');
  const s = sheet(page, 'goal');
  await choose(page, 'goal', 'custom');
  await choose(page, 'goal-by', 'fast');
  await setPick(page, 'goal-fast', 17);
  await expect(page.getByTestId('flash')).toHaveText('Goal 17:7 from today.');
  await expect(s.getByTestId('goal-text')).toHaveText('Eating window 7 hours, fasting 17 hours.');
  expect((await settingsOf(page)).goalChanges).toEqual([{ from: '2026-09-27', hours: 7 }]);
  // The wheels stay in step: the window wheel shows the same goal.
  await choose(page, 'goal-by', 'window');
  await expect(s.locator('[data-pick="goal-hours"] [data-part="option"]')).toHaveAttribute('aria-valuetext', '7 hours');
});

test('a long fast: 48 hours for every fast, a fasting day on Today, and a day begun inside the goal counts as a success', async ({ page }) => {
  // Last bite Saturday 21:00, on 18:6.
  const lastNight = { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T16:00'), lastBite: ms('2026-09-26T21:00') }] };
  await openAt(page, '2026-09-27T10:00');
  await seed(page, { ...lastNight, settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 6 }] }) });
  await tap(page, 'edit-goal');
  const s = sheet(page, 'goal');
  await expect(s.locator('button[data-choice="goal"][data-value="6"]')).toHaveAttribute('aria-checked', 'true');
  await choose(page, 'goal', 'custom');
  await choose(page, 'goal-by', 'fast');
  await setPick(page, 'goal-fast', 48);
  await expect(page.getByTestId('flash')).toHaveText('Goal 48 h fast from today.');
  await expect(s.getByTestId('goal-text')).toHaveText('Fasting 48 hours each time, with an eating window of 6 hours between. A day that begins inside the fast\'s goal, with nothing eaten, counts as a success.');
  expect((await settingsOf(page)).goalChanges).toEqual([{ from: '2026-09-26', hours: 6 }, { from: '2026-09-27', hours: 6, fast: 48 }]);
  await tap(page, 'close-sheet');

  // Sunday is a fasting day: the goal comes on Monday at 21:00; the fast ring runs to 48 hours.
  const before = page.locator('[data-block="before"]');
  await expect(before.getByTestId('before-label')).toHaveText('Fasting day');
  await expect(page.locator('[data-action="edit-goal"]')).toHaveAttribute('aria-label', '48 h goal, 21:00 tomorrow. Change');
  await expect(page.getByTestId('long-fast-line')).toHaveText('Your 48-hour fast reaches its goal at 21:00 tomorrow.');
  await expect(page.getByTestId('fasting-ring')).toHaveAttribute('data-goal', '48');
  await expect(page.getByTestId('goal-line')).toHaveText('Fasting goal 48 h: 35 h to go.');

  // Monday: Sunday counts as a success, and the day the goal comes is before the window again.
  await openAt(page, '2026-09-28T10:00', '#week');
  await expect(page.locator('.dayrow[data-day="2026-09-27"]')).toContainText('Fasted');
  await page.locator('.tab[data-tab="today"]').click();
  await expect(page.getByTestId('before-label')).toHaveText('Before the window');
  await expect(page.getByTestId('long-fast-line')).toHaveText('Your 48-hour fast reaches its goal at 21:00.');
  await expect(page.getByText('Nothing logged')).toHaveCount(0);
  // Past the goal, the pill turns gold with the day it came.
  await openAt(page, '2026-09-29T09:00');
  await expect(page.locator('[data-action="edit-goal"]')).toHaveText('Reached 21:00 yesterday');
});

test('a long fast: after the window closes, Today says when the next fast reaches its goal', async ({ page }) => {
  await openAt(page, '2026-09-27T21:00');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T16:00'), lastBite: ms('2026-09-27T20:00') }],
    settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 6, fast: 36 }] }),
  });
  await expect(page.getByTestId('next-window')).toHaveText('Your 36-hour fast reaches its goal at 08:00 Tue 29 Sep.');
  await expect(page.locator('[data-block="fasting"]').getByTestId('fasting-ring')).toBeVisible();
  await expect(page.getByTestId('fasting-ring')).toHaveAttribute('data-goal', '36');
  await expect(page.getByTestId('goal-line')).toHaveText('Fasting goal 36 h: 35 h to go.');
});

test('after a reload, the Fasting wheel stays in use when it leaves a long fast, even on a preset', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, { settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 4, fast: 48 }] }) });
  await tap(page, 'edit-goal');
  const s = sheet(page, 'goal');
  await expect(s.locator('button[data-choice="goal-by"][data-value="fast"]')).toHaveAttribute('aria-checked', 'true');
  await setPick(page, 'goal-fast', 21);
  await expect(page.getByTestId('flash')).toHaveText('Goal 21:3 from today.');
  await expect(s.locator('button[data-choice="goal-by"][data-value="fast"]')).toHaveAttribute('aria-checked', 'true');
  await setPick(page, 'goal-fast', 20);
  await expect(page.getByTestId('flash')).toHaveText('Goal 20:4 from today.');
  await expect(s.locator('[data-pick="goal-fast"]')).toBeVisible();
  await expect(s.locator('button[data-choice="goal"][data-value="custom"]')).toHaveAttribute('aria-checked', 'true');
});
