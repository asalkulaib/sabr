import { test, expect, openAt, seed, advance, tap, sheet, readDb, settings, ms } from './helpers.js';

// Travel: Fast follows the phone's time zone, and every day keeps the times
// it happened in. ms() reads times as Kuwait time.

const zoneNote = (page) => page.getByTestId('zone-note');
const hour = (page, name) => page.locator(`[data-time="${name}"] [data-part="hour"]`);

test.describe('in Dubai', () => {
  test.use({ timezoneId: 'Asia/Dubai' });

  test('times follow the phone; Thursday at home keeps its Kuwait times', async ({ page }) => {
    // Friday 2 October, 19:00 in Dubai. Fast was last open on Thursday at 21:05 in Kuwait.
    await openAt(page, '2026-10-02T18:00');
    await seed(page, {
      days: [{ day: '2026-10-01', firstBite: ms('2026-10-01T17:30'), lastBite: ms('2026-10-01T21:00') }],
      settings: settings({ installedAt: ms('2026-09-20T08:00'), zoneSeenAt: ms('2026-10-01T21:05') }),
    });
    await expect(page.getByTestId('flash')).toHaveText('Times now follow Dubai time.');
    await expect(zoneNote(page)).toHaveText(' · Dubai time');
    const zones = (await readDb(page)).settings.find((s) => s.key === 'zones').value;
    expect(zones).toEqual([{ from: null, zone: 'Asia/Kuwait' }, { from: ms('2026-10-01T21:05') + 1, zone: 'Asia/Dubai' }]);
    // Last night's bite, as it happened at home.
    await expect(page.locator('[data-action="edit-last-bite"]')).toContainText('21:00 yesterday');

    // A meal now starts at 19:00 by the phone.
    await tap(page, 'start-meal');
    await expect(hour(page, 'meal-start')).toHaveAttribute('aria-valuenow', '19');
    await tap(page, 'start-eating');
    await expect(page.getByTestId('flash')).toHaveText('Window open from 19:00.');
    await expect(page.locator('[data-block="open"]')).toContainText('23:00');
    expect((await readDb(page)).days.find((d) => d.day === '2026-10-02').firstBite).toBe(ms('2026-10-02T18:00'));

    // Done at 22:30 in Dubai: three and a half hours, a success.
    await advance(page, 210);
    await tap(page, 'done-eating');
    await tap(page, 'close-window');
    await expect(page.getByTestId('window-length')).toHaveText('3h 30m');
    await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'success');

    // Thursday, seen from Dubai, says its times are Kuwait time.
    await page.goto('./#day/2026-10-01');
    await expect(page.locator('.day .head')).toContainText('Times in Kuwait time');
    await expect(page.locator('[data-time="day-first"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '17');

    // At 00:30 in Dubai the day has turned: it is Saturday.
    await page.goto('./');
    await advance(page, 120);
    if (await sheet(page, 'fullness').isVisible()) await tap(page, 'skip-fullness');
    await expect(page.locator('.today .head')).toContainText('Saturday');
    await expect(page.locator('.today .head')).toContainText('3 October');
  });
});

test.describe('first opened in Dubai', () => {
  test.use({ timezoneId: 'Asia/Dubai' });

  test('with no note of when Fast was last open, the change starts after the last thing logged', async ({ page }) => {
    await openAt(page, '2026-10-02T18:00');
    await seed(page, {
      days: [{ day: '2026-10-01', firstBite: ms('2026-10-01T17:30'), lastBite: ms('2026-10-01T21:00') }],
      settings: settings({ installedAt: ms('2026-09-20T08:00') }),
    });
    await expect(page.getByTestId('flash')).toHaveText('Times now follow Dubai time.');
    const zones = (await readDb(page)).settings.find((s) => s.key === 'zones').value;
    expect(zones[1]).toEqual({ from: ms('2026-10-01T21:00') + 1, zone: 'Asia/Dubai' });
    await expect(page.locator('[data-action="edit-last-bite"]')).toContainText('21:00 yesterday');
  });
});

test('back home: Kuwait time again, and the Dubai days keep their Dubai times', async ({ page }) => {
  await openAt(page, '2026-10-03T22:30');
  await seed(page, {
    days: [
      { day: '2026-10-01', firstBite: ms('2026-10-01T17:30'), lastBite: ms('2026-10-01T21:00') },
      { day: '2026-10-02', firstBite: ms('2026-10-02T18:00'), lastBite: ms('2026-10-02T21:30') },
      { day: '2026-10-03', firstBite: ms('2026-10-03T13:00'), lastBite: ms('2026-10-03T16:00') },
    ],
    settings: settings({
      installedAt: ms('2026-09-20T08:00'),
      zones: [{ from: null, zone: 'Asia/Kuwait' }, { from: ms('2026-10-02T10:00'), zone: 'Asia/Dubai' }],
      zoneSeenAt: ms('2026-10-03T21:00'),
    }),
  });
  await expect(page.getByTestId('flash')).toHaveText('Back on Kuwait time.');
  await expect(zoneNote(page)).toHaveCount(0);
  // Friday in Dubai: 19:00 to 22:30, as it happened there.
  await page.goto('./#day/2026-10-02');
  await expect(page.locator('.day .head')).toContainText('Times in Dubai time');
  await expect(page.locator('[data-time="day-first"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '19');
  await expect(page.locator('[data-time="day-last"] [data-part="hour"]')).toHaveAttribute('aria-valuenow', '22');
  await expect(page.locator('.day')).toContainText('Success.');
  // Thursday at home needs no note.
  await page.goto('./#day/2026-10-01');
  await expect(page.locator('.day .head')).not.toContainText('Times in');
});

test.describe('in London', () => {
  test.use({ timezoneId: 'Europe/London' });

  test('the day the clocks go back: times and the window follow London', async ({ page }) => {
    // Sunday 25 October, 18:00 in London (winter time again).
    await openAt(page, '2026-10-25T21:00');
    await expect(page.getByTestId('flash')).toHaveText('Times now follow London time.');
    await expect(page.locator('.today .head')).toContainText('Sunday');
    await expect(page.locator('.today .head')).toContainText('25 October');
    await tap(page, 'start-meal');
    await tap(page, 'start-eating');
    await expect(page.getByTestId('flash')).toHaveText('Window open from 18:00.');
    await expect(page.getByTestId('countdown')).toHaveText('4:00');
  });
});

test('a calendar file from before alerts followed the phone asks to be added again', async ({ page }) => {
  await openAt(page, '2026-10-01T10:00', '#more');
  await seed(page, { settings: settings({ installedAt: ms('2026-09-20T08:00'), icsTimes: '13:00|16:30|17:30|14:00' }) });
  await expect(page.getByTestId('ics-status')).toContainText('Your calendar alerts ring by Kuwait time, even when you travel.');
});
