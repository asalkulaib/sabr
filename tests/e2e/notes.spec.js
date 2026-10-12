import { test, expect, openAt, seed, tap, setTime, sheet, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// Tapping the time notes on Today, and the rolling wheels behind them.

const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

test('before the window: tap Last bite and roll it to a new time', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await tap(page, 'edit-last-bite');
  const s = sheet(page, 'last-bite-time');
  await expect(s).toBeVisible();
  await expect(s.getByTestId('bite-summary')).toHaveText('Window 17:00 to 21:00, 4 h.');
  await setTime(page, 'edit-last-bite', '20:40');
  await expect(s.getByTestId('bite-summary')).toHaveText('Window 17:00 to 20:40, 3 h 40 min.');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('flash')).toHaveText('Last bite saved: 20:40.');
  await expect(page.getByTestId('fasting-for')).toHaveText('16h 30m');
  expect((await readDb(page)).days[0].lastBite).toBe(ms('2026-09-26T20:40'));
});

test('Just now moves the last bite to this minute; the sheet shows the new window before saving', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // the next day: the window stretches into today
  await seed(page, LAST_NIGHT);
  await tap(page, 'edit-last-bite');
  const s = sheet(page, 'last-bite-time');
  await tap(page, 'last-bite-now');
  await expect(s.getByTestId('bite-summary')).toHaveText('Window 17:00 to 13:10 next day, 20 h 10 min.');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('flash')).toHaveText('Last bite saved: 13:10.');
  expect((await readDb(page)).days[0].lastBite).toBe(ms('2026-09-27T13:10'));
  await expect(page.getByTestId('fasting-for')).toHaveText('0m');
});

test('Just now on eating logged outside the window moves that entry to this minute', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...LAST_NIGHT, outside: [{ id: 1, day: '2026-09-26', at: ms('2026-09-26T23:15'), trigger: 'boredom', amount: 'little', source: 'today' }] });
  await tap(page, 'edit-last-bite');
  await expect(sheet(page, 'outside-bite-time')).toBeVisible();
  await tap(page, 'last-bite-now');
  await tap(page, 'save-outside-bite');
  await expect(page.getByTestId('flash')).toHaveText('Last bite saved: 13:10.');
  expect((await readDb(page)).outside[0].at).toBe(ms('2026-09-27T13:10'));
});

test('after the window: tap First bite or Last bite to change just that time', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:50') }], settings: LAST_NIGHT.settings });
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');
  await tap(page, 'edit-first-bite');
  await setTime(page, 'edit-first-bite', '17:40');
  await tap(page, 'save-first-bite');
  await expect(page.getByTestId('flash')).toHaveText('First bite saved: 17:40.');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');
  // The window's own Last bite note, under the new fast.
  await page.locator('[data-block="closed"] [data-action="edit-last-bite"]').click();
  await setTime(page, 'edit-last-bite', '21:30');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('window-length')).toHaveText('3h 50m');
  const db = await readDb(page);
  expect(db.days[0]).toMatchObject({ firstBite: ms('2026-09-27T17:40'), lastBite: ms('2026-09-27T21:30') });
  // The Last bite pill on the Fasting card edits the same time.
  await expect(page.locator('[data-block="fasting"] [data-action="edit-last-bite"]')).toHaveText('21:30');
  await page.locator('[data-block="fasting"] [data-action="edit-last-bite"]').click();
  await setTime(page, 'edit-last-bite', '21:20');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('window-length')).toHaveText('3h 40m');
  await expect(page.locator('[data-block="fasting"] [data-action="edit-last-bite"]')).toHaveText('21:20');
});

test('a last bite logged outside the window opens that entry', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...LAST_NIGHT, outside: [{ id: 1, day: '2026-09-26', at: ms('2026-09-26T23:15'), trigger: 'boredom', amount: 'little', source: 'today' }] });
  await expect(page.locator('[data-block="before"] [data-action="edit-last-bite"]')).toContainText('23:15 yesterday');
  await tap(page, 'edit-last-bite');
  await expect(sheet(page, 'outside-bite-time')).toContainText('logged outside the window');
  await setTime(page, 'edit-outside-bite', '23:00');
  await tap(page, 'save-outside-bite');
  expect((await readDb(page)).outside[0].at).toBe(ms('2026-09-26T23:00'));
});

test('while open: the Opened note changes the opening time', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await tap(page, 'edit-opened');
  await expect(sheet(page, 'opening')).toBeVisible();
  await setTime(page, 'opened-at', '17:45');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('countdown')).toHaveText('3:45');
});

test('the day editor: clear a last bite, then roll it back in', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#day/2026-09-24');
  await seed(page, WEEK);
  const summary = page.getByTestId('day-summary');
  await expect(summary).toHaveText('18:00 to 20:00, 2 h.');
  await tap(page, 'clear-day-last');
  await expect(summary).toHaveText('With no last bite, the window stays open.');
  await expect(page.locator('[data-action="clear-day-last"]')).toBeHidden();
  await setTime(page, 'day-last', '20:30');
  await expect(summary).toHaveText('18:00 to 20:30, 2 h 30 min.');
  await expect(page.locator('[data-action="clear-day-last"]')).toBeVisible();
  await tap(page, 'save-window');
  await expect.poll(async () => (await readDb(page)).days.find((d) => d.day === '2026-09-24').lastBite).toBe(ms('2026-09-24T20:30'));
});

test('a wheel on More saves exactly the time rolled, though saving redraws the screen', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#more');
  await tap(page, 'edit-workdayStart');
  await setTime(page, 'workdayStart', '18:05');
  await page.waitForTimeout(500); // past any late settling of the wheel that was replaced
  const s = Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value]));
  expect(s.workdayStart).toBe('18:05');
  const wheel = page.locator('[data-time="workdayStart"]');
  await expect(wheel.locator('[data-part="hour"]')).toHaveAttribute('aria-valuenow', '18');
  await expect(wheel.locator('[data-part="minute"]')).toHaveAttribute('aria-valuenow', '5');
});

test('wheels roll with the arrow keys and wrap around like the iPhone clock', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await tap(page, 'edit-last-bite');
  const hours = page.locator('[data-time="edit-last-bite"] [data-part="hour"]');
  const minutes = page.locator('[data-time="edit-last-bite"] [data-part="minute"]');
  const summary = sheet(page, 'last-bite-time').getByTestId('bite-summary');
  await expect(hours).toHaveAttribute('aria-valuenow', '21');
  await hours.focus();
  await page.keyboard.press('ArrowUp');
  await expect(hours).toHaveAttribute('aria-valuenow', '20');
  await expect(summary).toHaveText('Window 17:00 to 20:00, 3 h.');
  // A tap on a number in view picks it.
  await hours.locator('.wheel-item.near[data-value="21"]').click();
  await expect(hours).toHaveAttribute('aria-valuenow', '21');
  await expect(summary).toHaveText('Window 17:00 to 21:00, 4 h.');
  // 23 rolls straight on to 00, past midnight.
  await hours.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(hours).toHaveAttribute('aria-valuetext', '00');
  await expect(summary).toHaveText('Window 17:00 to 00:00 next day, 7 h.');
  // And 00 back to 59 on the minutes: the hour stays.
  await minutes.focus();
  await page.keyboard.press('ArrowUp');
  await expect(minutes).toHaveAttribute('aria-valuetext', '59');
  await expect(summary).toHaveText('Window 17:00 to 00:59 next day, 7 h 59 min.');
  // Numbers repeat above and below, always in 24-hour form.
  await expect(hours.locator('.wheel-item.on')).toHaveText('00');
  await expect(hours.locator('.wheel-item.near')).toHaveText(['23', '01']);
});
