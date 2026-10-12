import { test, expect, openAt, seed, tap, choose, sheet, setDate, readDb, settings, ms } from './helpers.js';

// Pauses: days for travel, illness or Ramadan that are not tracked.

const T = (day, from, to) => ({ day, firstBite: ms(`${day}T${from}`), lastBite: ms(`${day}T${to}`) });
const LAST_NIGHT = {
  days: [T('2026-09-26', '17:00', '21:00')],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};
const pausedDays = async (page) => (await readDb(page)).days.filter((d) => d.paused).map((d) => [d.day, d.paused]);

test('Pause today: one tap, nothing to log, and Undo brings the day back', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const streak = page.getByTestId('streak');
  await expect(streak).toHaveText('1 day');
  await tap(page, 'pause-today');
  await expect(page.getByTestId('flash')).toHaveText('Today is paused.');
  const paused = page.locator('[data-block="paused"]');
  await expect(paused.getByTestId('paused-until')).toHaveText('Paused today');
  await expect(paused).toContainText('Fasting is not tracked and your streak holds; fullness still counts. Tracking resumes on Monday 28 September.');
  // Nothing to log: no First bite, no ring, no check-in, no Tempted?.
  await expect(page.locator('[data-action="start-meal"]')).toHaveCount(0);
  await expect(page.getByTestId('fasting-ring')).toHaveCount(0);
  await expect(page.locator('[data-block="checkin"]')).toHaveCount(0);
  await expect(page.locator('[data-action="tempted"]')).toHaveCount(0);
  await expect(streak).toHaveText('1 day');
  expect(await pausedDays(page)).toEqual([['2026-09-27', true]]);

  await tap(page, 'undo');
  await expect(page.getByTestId('flash')).toHaveText('Undone.');
  await expect(page.locator('[data-action="start-meal"]')).toBeVisible();
  expect((await readDb(page)).days).toHaveLength(1);
});

test('a pause set from More, with dates and a reason', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00', '#more');
  await seed(page, LAST_NIGHT);
  await tap(page, 'add-pause');
  const s = sheet(page, 'pause');
  await setDate(page, 'pause-from', '2026-09-29');
  await setDate(page, 'pause-to', '2026-10-01');
  await expect(s.getByTestId('pause-summary')).toHaveText('3 days: Tue 29 Sep to Thu 1 Oct. Tracking resumes on Fri 2 Oct.');
  await choose(page, 'pause-reason', 'travel');
  await tap(page, 'save-pause');
  await expect(page.getByTestId('flash')).toHaveText('Paused: Tue 29 Sep to Thu 1 Oct.');
  const row = page.locator('[data-block="pauses"] [data-pause="2026-09-29"]');
  await expect(row).toContainText('Travel');
  await expect(row).toContainText('Tue 29 Sep to Thu 1 Oct');
  await expect(row).toContainText('Ahead');
  expect(await pausedDays(page)).toEqual([['2026-09-29', 'travel'], ['2026-09-30', 'travel'], ['2026-10-01', 'travel']]);

  // A save redraws More; a tap that lands just as the row is redrawn is tapped again.
  const openRow = () => expect(async () => {
    await row.click();
    await expect(s).toBeVisible({ timeout: 1000 });
  }).toPass();
  // Changing it: one day longer.
  await openRow();
  await setDate(page, 'pause-to', '2026-10-02');
  await tap(page, 'save-pause');
  await expect(s).toHaveCount(0);
  expect((await pausedDays(page)).map(([d]) => d)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  // Removing it before it starts.
  await openRow();
  await tap(page, 'end-pause-sheet');
  await expect(page.getByTestId('flash')).toHaveText('Pause removed.');
  expect(await pausedDays(page)).toEqual([]);
  expect((await readDb(page)).days).toHaveLength(1);
});

test('on a paused day Today says until when, and the pause can end early', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    ...LAST_NIGHT,
    days: [...LAST_NIGHT.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
  });
  const paused = page.locator('[data-block="paused"]');
  await expect(paused.getByTestId('paused-until')).toHaveText('Paused until Thu 1\u00A0Oct');
  await expect(paused).toContainText('For travel. Fasting is not tracked');
  await expect(page.locator('.head')).toContainText('Paused');
  await tap(page, 'end-pause');
  await expect(page.getByTestId('flash')).toHaveText('Pause ended. Today is tracked again.');
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  // Yesterday stays paused: it happened.
  expect(await pausedDays(page)).toEqual([['2026-09-29', 'travel']]);
  // Eating during the pause went unrecorded, so there is no ring until the next window.
  await expect(page.getByTestId('fasting-ring')).toHaveCount(0);
  await expect(page.locator('[data-block="before"]')).toContainText('Fasting');
});

test('paused days keep the streak, are never flagged as unlogged, and leave the week counts', async ({ page }) => {
  await openAt(page, '2026-09-24T09:00');
  await seed(page, {
    days: [T('2026-09-20', '17:30', '21:00'), { day: '2026-09-21', paused: 'illness' }, { day: '2026-09-22', paused: 'illness' }, T('2026-09-23', '17:30', '21:00')],
    settings: settings({ installedAt: ms('2026-09-20T08:00') }),
  });
  await expect(page.getByTestId('streak')).toHaveText('2 days');
  await expect(page.locator('[data-notice="unlogged"]')).toHaveCount(0);
  await page.locator('.tab[data-tab="week"]').click();
  await expect(page.locator('[data-stat="streak"]')).toContainText('2 days');
  await expect(page.getByTestId('success-count')).toHaveText('2 of 5');
  await expect(page.locator('.week')).toContainText('Paused2 days');
  await expect(page.locator('.dayrow[data-day="2026-09-21"]')).toContainText('Illness');
  await expect(page.locator('.dayrow[data-day="2026-09-21"]')).toContainText('Paused');
});

test('the day editor pauses and unpauses a single day', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { settings: settings({ installedAt: ms('2026-09-24T08:00') }) });
  await expect(page.locator('[data-notice="unlogged"]')).toContainText('3 recent days have nothing logged.');
  await page.locator('[data-action="fill-in"]').click();
  await expect(page.locator('.day[data-day="2026-09-26"]')).toBeVisible();
  await tap(page, 'pause-day');
  await expect(page.getByTestId('flash')).toHaveText('Day paused.');
  await expect(page.locator('.day')).toContainText('Paused: not tracked.');
  await expect(page.locator('[data-block="day-window"]')).toHaveCount(0);
  await page.locator('.tab[data-tab="today"]').click();
  await expect(page.locator('[data-notice="unlogged"]')).toContainText('2 recent days have nothing logged.');
  await page.goto('./#day/2026-09-26');
  await tap(page, 'unpause-day');
  await expect(page.getByTestId('flash')).toHaveText('Day unpaused.');
  await expect(page.locator('[data-block="day-window"]')).toBeVisible();
  expect((await readDb(page)).days).toHaveLength(0);
});

test('a pause is refused while a window is open on one of its days', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="more"]').click();
  await tap(page, 'add-pause');
  await tap(page, 'save-pause');
  await expect(sheet(page, 'pause').getByTestId('pause-hint')).toHaveText('A window is still open on one of those days. Close it first.');
  expect(await pausedDays(page)).toEqual([]);
});
