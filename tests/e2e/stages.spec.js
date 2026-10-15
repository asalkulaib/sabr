import { test, expect, openAt, seed, advance, tap, sheet, settings, ms } from './helpers.js';

// Last night's window closed at 21:00 on Saturday 26 September.
const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

const ring = (page) => page.getByTestId('fasting-ring');

test('before the window: the ring leads Today and shows where the fast stands', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // 16 h 10 min after the last bite
  await seed(page, LAST_NIGHT);
  const before = page.locator('[data-block="before"]');
  await expect(before.getByTestId('fasting-ring')).toHaveAttribute('data-stage', 'switch');
  await expect(page.getByTestId('fasting-for')).toHaveText('16h 10m');
  await expect(page.getByTestId('stage-name')).toHaveText('Metabolic switch');
  await expect(page.getByTestId('stage-next')).toHaveText('Next: ketones climbing, in about 7 h 50 min.');
  await expect(page.getByTestId('stage-marker')).toHaveAttribute('data-hours', '16.2');
  // The stage the fast is in sits in the middle of the rings.
  await expect(ring(page).locator('.rings .stage-icon')).toHaveCount(1);
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-switch/);
  // The explanation sits in the section below.
  const stages = page.locator('[data-block="stages"]');
  await expect(stages).toHaveAttribute('data-stage', 'switch');
  await expect(stages).toContainText('fat becomes the main fuel and ketones start to rise');
  await expect(stages.getByTestId('fasting-ring')).toHaveCount(0);
});

test('a new stage arrives while the app is open', async ({ page }) => {
  await openAt(page, '2026-09-27T08:55'); // 11 h 55 min
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('stage-name')).toHaveText('Blood sugar settles');
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-settling/);
  await expect(page.getByTestId('stage-next')).toHaveText('Next: metabolic switch, in about 5 min.');
  await advance(page, 6);
  await expect(page.getByTestId('stage-name')).toHaveText('Metabolic switch');
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-switch/);
  await expect(page.locator('.ring-hero')).toHaveClass(/fade-in/);
  await expect(page.locator('[data-block="stages"]')).toHaveClass(/fade-in/);
  // Later redraws within the same stage do not fade again.
  await advance(page, 5);
  await expect(page.getByTestId('fasting-for')).toHaveText('12h 6m');
  await expect(page.locator('.ring-hero')).not.toHaveClass(/fade-in/);
});

test('hidden while the window is open, then on top again from the last bite', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, LAST_NIGHT);
  await expect(ring(page)).toBeVisible();
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(ring(page)).toHaveCount(0);
  await advance(page, 60);
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="fasting"]').getByTestId('fasting-ring')).toBeVisible();
  await expect(page.locator('[data-block="stages"]').getByTestId('fasting-ring')).toHaveCount(0);
  // The meal's fullness check, just started, sits above them.
  await expect.poll(() => page.locator('.today > section').evaluateAll((els) => els.map((el) => el.dataset.block).filter(Boolean).slice(0, 4)))
    .toEqual(['satiety-pointer', 'fasting', 'stages', 'closed']);
  await expect(page.getByTestId('stage-name')).toHaveText('Digesting');
  await expect(page.getByTestId('fasting-for')).toHaveText('0m');
});

test('past the goal the fast ring laps itself and the stages go on', async ({ page }) => {
  await openAt(page, '2026-09-27T23:30'); // 26 h 30 min, no window today
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('stage-name')).toHaveText('Ketones climbing');
  await expect(page.getByTestId('stage-next')).toHaveText('Next: brain on ketones, in about 21 h 30 min.');
  await expect(page.getByTestId('fasting-for')).toHaveText('26h 30m');
  await expect(page.getByTestId('stage-marker')).toHaveAttribute('data-frac', (26.5 / 20).toFixed(3));
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-ketones/);
});

test('on the third day, the brain on ketones; the icon in the rings follows the stage', async ({ page }) => {
  await openAt(page, '2026-09-28T23:30'); // 50 h 30 min
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('stage-name')).toHaveText('Brain on ketones');
  await expect(page.getByTestId('stage-next')).toHaveText('Next: protein sparing, in about 21 h 30 min.');
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-brain/);
  await expect(page.locator('[data-block="stages"]')).toContainText('a quarter of its energy needs');
});

test('from 72 hours, protein sparing: the last stage, with the advice to see a doctor', async ({ page }) => {
  await openAt(page, '2026-09-30T09:00'); // 84 h
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('stage-name')).toHaveText('Protein sparing');
  await expect(page.getByTestId('stage-next')).toHaveCount(0);
  await expect(ring(page).locator('.rings .stage-icon')).toHaveClass(/icon-sparing/);
  await expect(page.locator('[data-block="stages"]')).toContainText("best done with a doctor's guidance");
});

test('about the stages: every stage with its icon, the autophagy note and the sources', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await tap(page, 'about-stages');
  const s = sheet(page, 'stages');
  await expect(s.getByTestId('stage-list').locator('> li')).toHaveCount(6);
  await expect(s.locator('[data-stage-icon]')).toHaveCount(6);
  await expect(s).toContainText('from about 12 h');
  await expect(s).toContainText('72 h and beyond');
  await expect(s.getByTestId('autophagy-note')).toContainText('when it starts in people is not known');
  await expect(s).toContainText('Flipping the metabolic switch');
  await expect(s).toContainText('Brain metabolism during short-term starvation in humans');
});

test('read more: a stage opens its own longer page, with no links, and Back returns to its card', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // the metabolic switch
  await seed(page, LAST_NIGHT);
  await tap(page, 'open-stages');
  const s = sheet(page, 'stages');
  await expect(s.locator('[data-action^="more-"]')).toHaveCount(6);
  await expect(s.locator('[data-action="more-switch"]')).toHaveAccessibleName('Read more about Metabolic switch');
  await tap(page, 'more-switch');
  const more = s.getByTestId('stage-more');
  await expect(more).toHaveAttribute('data-stage', 'switch');
  await expect(more.locator('h2')).toHaveText('Metabolic switch');
  await expect(more.getByTestId('stage-now')).toHaveText('Now');
  await expect(more).toContainText('What happens');
  await expect(more).toContainText('12 to 36 hours after the last meal');
  await expect(more.getByTestId('stage-findings').locator('> li')).toHaveCount(3);
  await expect(more).toContainText('Anton and colleagues, 2018');
  await expect(more).toContainText('Flipping the metabolic switch');
  await expect(s.locator('a')).toHaveCount(0);
  // Back returns to the cards, at the stage just read.
  await tap(page, 'stages-back-end');
  await expect(s.getByTestId('stage-more')).toHaveCount(0);
  await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
  // Another stage's page: no Now badge, and its own findings. The cards glide
  // to the stage tapped; as a finger would, Read more waits for them to rest.
  const restingOn = () => s.locator('.stage-cards').evaluate((el) => new Promise((done) => {
    const from = el.scrollLeft;
    setTimeout(() => done(el.scrollLeft === from ? Math.round(el.scrollLeft / el.clientWidth) : -1), 100);
  }));
  await tap(page, 'stage-sparing');
  await expect(s.locator('[data-action="stage-sparing"]')).toHaveAttribute('aria-current', 'true');
  await expect.poll(restingOn).toBe(5);
  await tap(page, 'more-sparing');
  await expect(more).toHaveAttribute('data-stage', 'sparing');
  await expect(more.getByTestId('stage-now')).toHaveCount(0);
  await expect(more).toContainText("best done with a doctor's guidance");
  await expect(more).toContainText('Ho and colleagues, 1988');
  await tap(page, 'stages-back');
  await expect(s.locator('[data-action="stage-sparing"]')).toHaveAttribute('aria-current', 'true');
  const inView = () => s.locator('.stage-cards').evaluate((el) => Math.round(el.scrollLeft / el.clientWidth));
  await expect.poll(inView).toBe(5);
});

test('the icon of the stage the fast is in moves, in the rings and on the stage under them; in the sheet, the stage in view', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // the metabolic switch
  await seed(page, LAST_NIGHT);
  await expect(page.locator('.stage-chip .stage-icon')).toHaveClass(/\blive\b/);
  await expect(ring(page).locator('.rings .stage-icon.live')).toHaveClass(/icon-switch/);
  await expect(ring(page).locator('.rings .stage-icon.live')).toHaveCount(1);
  const moving = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((el) => el.getAnimations({ subtree: true }).filter((a) => a.animationName).length), sel);
  await expect.poll(() => moving('.stage-chip .stage-icon')).toEqual([expect.any(Number)]);
  expect((await moving('.stage-chip .stage-icon'))[0]).toBeGreaterThan(0);
  expect((await moving('.rings .stage-icon.live'))[0]).toBeGreaterThan(0);
  await tap(page, 'open-stages');
  await tap(page, 'stage-brain');
  const s = sheet(page, 'stages');
  await expect(s.locator('[data-action="stage-brain"]')).toHaveAttribute('aria-current', 'true');
  const stops = await moving('.stage-stop .stage-icon');
  expect(stops.map((n) => n > 0)).toEqual([false, false, false, false, true, false]);
});

test('with Reduce Motion on, the stage icons rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await expect(page.locator('.stage-chip .stage-icon')).toHaveClass(/\blive\b/);
  const n = await page.evaluate(() => document.querySelector('.rings').getAnimations({ subtree: true }).filter((a) => a.animationName).length + document.querySelector('.stage-chip').getAnimations({ subtree: true }).filter((a) => a.animationName).length);
  expect(n).toBe(0);
  // The stage in view in the sheet rests too (only the 1 ms transitions Reduce Motion leaves may run).
  await tap(page, 'open-stages');
  await tap(page, 'stage-brain');
  await expect(sheet(page, 'stages').locator('[data-action="stage-brain"]')).toHaveAttribute('aria-current', 'true');
  const stops = await page.evaluate(() => [...document.querySelectorAll('.stage-stop .stage-icon')].map((el) => el.getAnimations({ subtree: true }).filter((a) => a.animationName).length));
  expect(stops).toEqual([0, 0, 0, 0, 0, 0]);
});

test('the ring round the stage in view fades its colour alone, so it never covers the Now tag', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // the metabolic switch, marked Now
  await seed(page, LAST_NIGHT);
  await tap(page, 'open-stages');
  const s = sheet(page, 'stages');
  await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
  // A ring that faded or grew got a layer of its own while it ran, and iPhone
  // drew that layer over the Now tag. Only its colour changes now.
  const rings = await s.locator('.stage-stop .stop-mark').evaluateAll((els) => els.map((el) => {
    const ring = getComputedStyle(el, '::after');
    return { fades: ring.transitionProperty, opacity: ring.opacity, transform: ring.transform, colour: ring.borderTopColor };
  }));
  // Ink round the stage in view only; the others' rings are see-through.
  const ink = 'rgb(14, 14, 18)';
  const none = 'rgba(0, 0, 0, 0)';
  expect(rings).toEqual([none, none, ink, none, none, none].map((colour) => ({ fades: 'border-color', opacity: '1', transform: 'none', colour })));
});

test('no bite logged yet: no ring', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await expect(page.locator('[data-block="before"]')).toContainText('Fasting');
  await expect(ring(page)).toHaveCount(0);
  await expect(page.locator('[data-block="stages"]')).toHaveCount(0);
});
