import { test, expect, openAt, seed, tap, choose, sheet, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// Every choice and rating is one sliding track: an ink pill sits under the
// chosen option and glides to the next; on a single line it can be dragged.

const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

const trackOf = (page, attr, name) => page.locator(`.${attr === 'scale' ? 'scale' : 'choice'}`).filter({ has: page.locator(`[data-${attr}="${name}"]`) });
const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2];

/** Waits until the pill covers the button (the glide is over). */
async function pillOn(track, button) {
  await expect.poll(async () => {
    const [p, b] = [await track.locator('.pill').boundingBox(), await button.boundingBox()];
    return !!p && !!b && Math.abs(p.x - b.x) < 1.5 && Math.abs(p.y - b.y) < 1.5 && Math.abs(p.width - b.width) < 1.5 && Math.abs(p.height - b.height) < 1.5;
  }).toBe(true);
}

/** Drags with the mouse from the centre of one option to the centre of another. */
async function drag(page, from, to) {
  // The screen can redraw once just after it opens (startup settings are
  // saved); find the track again until it holds still, then drag.
  await expect(async () => {
    await from.scrollIntoViewIfNeeded({ timeout: 1000 });
    const [a, b] = [await from.boundingBox(), await to.boundingBox()];
    expect(a && b).toBeTruthy();
    await page.mouse.move(...centre(a));
    await page.mouse.down();
    await page.mouse.move(...centre(b), { steps: 8 });
    await page.mouse.up();
  }).toPass({ timeout: 5000 });
}

test('a choice is one track: the pill sits under the chosen option and moves to the next', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, WEEK);
  const track = trackOf(page, 'choice', 'satiety-view');
  await expect(track.locator('.pill')).toHaveCount(1);
  await pillOn(track, track.locator('[data-value="insights"]'));
  await choose(page, 'satiety-view', 'now');
  await expect(track.locator('[data-value="now"]')).toHaveAttribute('aria-checked', 'true');
  await pillOn(track, track.locator('[data-value="now"]'));
});

test('nothing chosen yet: no pill until a choice is made', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const track = trackOf(page, 'choice', 'trained');
  await expect(track.locator('.pill')).toBeHidden();
  await choose(page, 'trained', 'true');
  await pillOn(track, track.locator('[data-value="true"]'));
  expect((await readDb(page)).days.find((d) => d.day === '2026-09-27').trained).toBe(true);
});

test('over more than one line the pill moves across lines, to a wide option too', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, LAST_NIGHT);
  await tap(page, 'start-meal');
  const track = sheet(page, 'start-meal').locator('.choice.grid');
  await choose(page, 'meal-type', 'Snack');
  await pillOn(track, track.locator('[data-value="Snack"]'));
  await choose(page, 'meal-type', 'other');
  await pillOn(track, track.locator('[data-value="other"]'));
});

test('drag the pill along a rating: the number it lands on is saved', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00'); // a workday, after 16:00: energy at 4 PM is asked
  await seed(page, LAST_NIGHT);
  const track = trackOf(page, 'scale', 'energy');
  await drag(page, track.locator('[data-value="1"]'), track.locator('[data-value="4"]'));
  await expect.poll(async () => (await readDb(page)).days.find((d) => d.day === '2026-09-27')?.energy4pm).toBe(4);
  await pillOn(trackOf(page, 'scale', 'energy'), trackOf(page, 'scale', 'energy').locator('[data-value="4"]'));
});

test('the tabs are one sliding track: tap or drag to switch, and the pill follows any way in', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00');
  await seed(page, WEEK);
  const track = page.locator('#tabbar .tabs');
  const tab = (name) => page.locator(`.tab[data-tab="${name}"]`);
  await expect(track.locator('.pill')).toHaveCount(1);
  await pillOn(track, tab('today'));
  await tab('week').click();
  await expect(tab('week')).toHaveAttribute('aria-current', 'page');
  await pillOn(track, tab('week'));
  // A day opened from Week stays under Week's pill.
  await page.locator('.dayrow[data-day="2026-09-24"]').click();
  await expect(page.locator('.day')).toBeVisible();
  await pillOn(track, tab('week'));
  // Drag the pill along to History.
  await drag(page, tab('week'), tab('history'));
  await expect(page).toHaveURL(/#history$/);
  await expect(tab('history')).toHaveAttribute('aria-current', 'page');
  await pillOn(track, tab('history'));
  // Reached without the tabs (the link from Today's notices, the back button): the pill follows.
  await page.goBack();
  await expect(tab('week')).toHaveAttribute('aria-current', 'page');
  await pillOn(track, tab('week'));
});

test('drag along a single line of choices: History moves from 30 to 90 days', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, WEEK);
  const track = trackOf(page, 'choice', 'history-range');
  await drag(page, track.locator('[data-value="30"]'), track.locator('[data-value="90"]'));
  await expect.poll(async () => (await readDb(page)).settings.find((x) => x.key === 'historyRange')?.value).toBe(90);
  await expect(page.getByTestId('history-summary')).toContainText('of the last 90 days');
});
