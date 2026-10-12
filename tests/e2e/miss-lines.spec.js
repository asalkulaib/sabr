import { test, expect, openAt, seed, tap, sheet, setTime, readDb, settings, ms } from './helpers.js';

// Before a window's times are saved, I'm done eating and Window times say in
// words when those times would make the day a miss, as Add a meal does, with
// the same words. Only the misses the sheet's own times decide: the last bite
// for I'm done eating; the first and last bite for Window times.
// 2026-09-27 is a Sunday (a workday), 2026-09-26 a Saturday.

const install = settings({ installedAt: ms('2026-09-20T08:00') });
const OVER = 'That is longer than your 4-hour goal, so the day becomes a miss.';
const EARLY = 'Opening before 16:00 on a workday makes the day a miss.';

test("I'm done eating: a last bite past the goal and its grace is a miss in words; inside it, none", async ({ page }) => {
  await openAt(page, '2026-09-27T21:56');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: null }], settings: install });
  await tap(page, 'done-eating');
  const s = sheet(page, 'done-eating');
  const miss = s.getByTestId('done-miss');
  await expect(s.getByTestId('done-summary')).toHaveText('Window 17:30 to 21:56, 4 h 26 min.');
  await expect(miss).toHaveText(OVER);
  await expect(miss).toBeVisible();
  // Inside the 15 minutes of grace: no miss.
  await setTime(page, 'last-bite', '21:45');
  await expect(miss).toHaveText('');
  await expect(miss).toBeHidden();
  await setTime(page, 'last-bite', '21:46');
  await expect(miss).toHaveText(OVER);
  // A time still ahead: no window to judge, the summary says why as an error, and the window cannot close.
  await setTime(page, 'last-bite', '22:30');
  await expect(miss).toHaveText('');
  await expect(s.getByTestId('done-summary')).toHaveText('That time is still ahead.');
  await expect(s.getByTestId('done-summary')).toBeVisible();
  await expect(s.locator('.effect-slot.is-error')).toHaveCount(1);
  await expect(page.locator('[data-action="close-window"]')).toBeDisabled();
  // The line warns; it never stops the close.
  await setTime(page, 'last-bite', '21:50');
  await expect(miss).toHaveText(OVER);
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  expect((await readDb(page)).days[0].lastBite).toBe(ms('2026-09-27T21:50'));
});

test("I'm done eating: a window opened before 16:00 says nothing about it here, only the length", async ({ page }) => {
  await openAt(page, '2026-09-27T16:30');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T14:00'), lastBite: null }], settings: install });
  await tap(page, 'done-eating');
  await expect(sheet(page, 'done-eating').getByTestId('done-miss')).toHaveText('');
  await openAt(page, '2026-09-27T18:30');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T14:00'), lastBite: null }], settings: install });
  await tap(page, 'done-eating');
  await expect(sheet(page, 'done-eating').getByTestId('done-miss')).toHaveText(OVER);
});

test('Window times: opening before 16:00 and a window past its goal, each in words, until the times are fixed', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T12:30'), lastBite: ms('2026-09-27T16:50') }], settings: install });
  await tap(page, 'change-times');
  const s = sheet(page, 'window-times');
  const miss = s.getByTestId('times-miss');
  await expect(miss).toHaveText(`${EARLY} ${OVER}`);
  await expect(s.locator('.miss-reason')).toHaveCount(2);
  await setTime(page, 'times-last', '16:30');
  await expect(miss).toHaveText(EARLY);
  await setTime(page, 'times-first', '17:00');
  await setTime(page, 'times-last', '21:15');
  await expect(s.getByTestId('times-summary')).toHaveText('17:00 to 21:15, 4 h 15 min.');
  await expect(miss).toHaveText('');
  await expect(miss).toBeHidden();
  await setTime(page, 'times-last', '21:20');
  await expect(miss).toHaveText(OVER);
  await setTime(page, 'times-last', '21:00');
  await tap(page, 'save-times');
  await expect(page.getByTestId('flash')).toHaveText('Window times saved.');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
});

test('Window times: on a weekend, an early opening is no miss; the length still is', async ({ page }) => {
  await openAt(page, '2026-09-26T22:00');
  await seed(page, { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T12:30'), lastBite: ms('2026-09-26T16:00') }], settings: install });
  await tap(page, 'change-times');
  const miss = sheet(page, 'window-times').getByTestId('times-miss');
  await expect(miss).toHaveText('');
  await setTime(page, 'times-last', '17:00');
  await expect(miss).toHaveText(OVER);
});

test('Window times: a last bite still ahead shows no window and no miss, and says why at once', async ({ page }) => {
  await openAt(page, '2026-09-27T21:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T20:30') }], settings: install });
  await tap(page, 'change-times');
  const s = sheet(page, 'window-times');
  await expect(s.getByTestId('times-summary')).toHaveText('17:00 to 20:30, 3 h 30 min.');
  await setTime(page, 'times-last', '23:30');
  await expect(s.getByTestId('times-summary')).toHaveText('');
  await expect(s.getByTestId('times-miss')).toHaveText('');
  await expect(s.getByTestId('times-miss')).toBeHidden();
  await expect(s.getByTestId('times-hint')).toHaveText('That last bite is still ahead.');
  // Back inside the day: the window again, and the error gone.
  await setTime(page, 'times-last', '20:45');
  await expect(s.getByTestId('times-summary')).toHaveText('17:00 to 20:45, 3 h 45 min.');
  await expect(s.getByTestId('times-hint')).toHaveText('');
});

test('A first bite still ahead: the summary says so as an error, in First bite and in Window times', async ({ page }) => {
  await openAt(page, '2026-09-27T21:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T20:30') }], settings: install });
  await tap(page, 'edit-first-bite');
  const b = sheet(page, 'first-bite-time');
  await setTime(page, 'edit-first-bite', '23:00');
  await expect(b.getByTestId('bite-summary')).toHaveText('That time is still ahead.');
  await expect(b.locator('.effect-slot.is-error')).toHaveCount(1);
  // The hint answers Save only.
  await expect(b.getByTestId('bite-hint')).toHaveText('');
  await setTime(page, 'edit-first-bite', '17:10');
  await expect(b.getByTestId('bite-summary')).toHaveText('Window 17:10 to 20:30, 3 h 20 min.');
  await expect(b.locator('.effect-slot.is-error')).toHaveCount(0);
});

test('Window times: a first bite still ahead reads in the summary, as an error', async ({ page }) => {
  await openAt(page, '2026-09-27T21:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T20:30') }], settings: install });
  await tap(page, 'change-times');
  const s = sheet(page, 'window-times');
  await setTime(page, 'times-first', '23:00');
  await expect(s.getByTestId('times-summary')).toHaveText('That first bite is still ahead.');
  await expect(s.locator('.effect-slot.is-error')).toHaveCount(1);
  await expect(s.getByTestId('times-hint')).toHaveText('');
  await expect(s.getByTestId('times-miss')).toHaveText('');
});
