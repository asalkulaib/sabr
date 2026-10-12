// Today in rings: the hero on the page, the readout as the rings' legend, the
// stage chip as a white pill, the ring draw, and the first screen.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setTime, settings, ms } from './helpers.js';

const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') }),
};

// A redraw can take an element away just as it is measured: wait for it to
// show, and measure again if it went.
const box = async (loc) => {
  let b = null;
  await expect(async () => {
    await expect(loc).toBeVisible();
    b = await loc.boundingBox();
    expect(b).not.toBeNull();
  }).toPass();
  return b;
};
// A detached element reads an empty style: read again until it is drawn.
const css = async (loc, prop) => {
  let v = '';
  await expect(async () => {
    v = await loc.evaluate((el, p) => (el.isConnected ? getComputedStyle(el)[p] : ''), prop);
    expect(v).not.toBe('');
  }).toPass();
  return v;
};

test('before the window: one hero on the page, the rings at 184 with their readout beside them', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const hero = page.locator('[data-block="before"]');
  await expect(hero).toHaveClass(/\bstrong\b/);
  await expect(hero).toHaveClass(/\bhero\b/);
  expect(await css(hero, 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
  expect(await css(hero, 'borderTopWidth')).toBe('0px');
  expect(await page.locator('.today .hero').count()).toBe(1);
  // The rings take the hero token, 184 across; the rays overflow.
  const rings = await box(hero.locator('.ring-wrap > svg.rings'));
  expect(Math.round(rings.width)).toBe(216);
  const wrap = await box(hero.getByTestId('fasting-ring'));
  expect(Math.round(wrap.width)).toBe(358);
  // The readout is the legend: one item per ring, each in its row.
  const readout = hero.getByTestId('ring-legend');
  await expect(readout).toHaveClass(/ring-readout/);
  await expect(readout.locator('.legend-item')).toHaveText(['Fast', 'Window', 'Fullness']);
  expect(await readout.locator('[data-ring-row]').evaluateAll((els) => els.map((e) => e.dataset.ringRow))).toEqual(['fast', 'win', 'full']);
  await expect(readout.locator('[data-ring-row="fast"] .value')).toHaveText('16h 10m');
  expect(await css(hero.getByTestId('fasting-for'), 'fontSize')).toBe('40px');
  expect(await css(hero.getByTestId('fasting-for'), 'color')).toBe('rgb(200, 16, 63)');
  // The order of the hero: context, rings, chip, then the warning, the way in, the pills, the tiles.
  const top = async (sel) => (await box(hero.locator(sel).first())).y;
  const order = [await top('.hero-context'), await top('.ring-wrap'), await top('.stage-chip'), await top('.miss-line'), await top('[data-action="start-meal"]'), await top('[data-action="add-meal"]'), await top('[data-testid="fast-times"]')];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // No other legend line under the rings.
  await expect(page.getByTestId('ring-legend')).toHaveCount(1);
});

test('the stage chip is a white tertiary pill whose icon moves; the stage card disc is still', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const chip = page.locator('.stage-chip');
  expect(await css(chip, 'backgroundColor')).toBe('rgb(255, 255, 255)');
  expect((await box(chip)).height).toBeGreaterThanOrEqual(44);
  const moving = (sel) => page.evaluate((q) => document.querySelector(q).getAnimations({ subtree: true }).filter((a) => a.animationName && !/ring-draw|fade/.test(a.animationName)).length, sel);
  await expect.poll(() => moving('.stage-chip')).toBeGreaterThan(0);
  expect(await moving('[data-block="stages"] .stage-disc')).toBe(0);
  await expect(page.locator('[data-block="stages"] .stage-disc')).toHaveClass(/is-now/);
});

test('with one notice, the rings and Start a meal are on the first screen', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  // Two days after install with no weight imported: one notice.
  await seed(page, {
    days: [{ day: '2026-09-25', firstBite: ms('2026-09-25T14:00'), lastBite: ms('2026-09-25T18:00') }, ...LAST_NIGHT.days],
    settings: settings({ installedAt: ms('2026-09-25T08:00'), lastBackupAt: ms('2026-09-26T08:00') }),
  });
  await expect(page.locator('.notice')).toHaveCount(1);
  const tabTop = (await box(page.locator('#tabbar'))).y;
  const start = await box(page.locator('[data-block="before"] [data-action="start-meal"]'));
  expect(start.y + start.height).toBeLessThanOrEqual(tabTop);
  const rings = await box(page.getByTestId('fasting-ring'));
  expect(rings.y + rings.height).toBeLessThanOrEqual(tabTop);
});

test('window open: the readout leads with the time left; grace and over state the fact', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00');
  await seed(page, LAST_NIGHT);
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  const open = page.locator('[data-block="open"]');
  await expect(open).toHaveClass(/\bhero\b/);
  const readout = open.getByTestId('open-ring-legend');
  await expect(readout.locator('.legend-item')).toHaveText(['Window', 'Fast', 'Fullness']);
  await expect(readout.locator('[data-ring-row="win"] .legend-item')).toHaveText('Window');
  await expect(readout.getByTestId('countdown')).toHaveText('4:00');
  // While eating: the meal's card holds Finished this meal, in the window's green.
  const eating = open.locator('[data-block="eating"]');
  await expect(eating).toHaveClass(/tint-win/);
  await expect(eating.locator('[data-action="finish-meal"]')).toBeVisible();
  await advance(page, 245); // 21:05, inside the grace
  await expect(page.getByTestId('grace')).toHaveText('Your 4 hours are up. 10 min of grace left.');
  // The readout says it all: the countdown, at 0:00, stays only for a screen reader.
  await expect(readout.getByTestId('countdown')).toHaveCount(0);
  await expect(open.getByTestId('countdown')).toHaveText('0:00');
  await expect(open.locator('.countdown-line')).toHaveClass(/\bsr-only\b/);
  expect((await open.locator('.countdown-line').boundingBox()).height).toBeLessThanOrEqual(1);
  // The readout stays within the rings' picture, their rays' room included.
  const picture = async () => (await box(open.locator('.ring-wrap > svg.rings'))).height;
  expect((await box(readout)).height).toBeLessThanOrEqual(await picture());
  await advance(page, 15); // 21:20
  await expect(page.getByTestId('over')).toHaveText('Over by 20 min');
  await expect(open.locator('.hero-context')).toHaveCSS('color', 'rgb(14, 14, 18)');
  // Over: the window ring is stripes, so the Window key is the striped ring,
  // named in the colour of a miss, and it is the only key over the figure.
  await expect(open.locator('[data-ring="win"]')).toHaveClass(/ring-miss/);
  const winName = readout.locator('[data-ring-row="win"] > .legend-item');
  await expect(winName).toHaveText('Window');
  await expect(winName).toHaveClass(/is-miss/);
  await expect(winName.locator('svg.key')).toHaveCount(1);
  await expect(winName.locator('svg.key pattern')).toHaveCount(1);
  await expect(page.getByTestId('over').locator('svg')).toHaveCount(0);
  expect((await box(readout)).height).toBeLessThanOrEqual(await picture());
  await expect(open.locator('.countdown-line')).toHaveClass(/\bsr-only\b/);
  await expect(page.getByTestId('band-legend').locator('.legend-item')).toHaveText(['Over']);
});

test('a meal eaten after the window is never on green: grey, with the stripes of a miss', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, {
    ...LAST_NIGHT,
    days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    meals: [{ id: 5, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: null, outside: true }],
  });
  const eating = page.locator('[data-block="closed"] [data-block="eating"]');
  await expect(eating).not.toHaveClass(/tint-win/);
  expect(await css(eating, 'backgroundColor')).toBe('rgb(243, 243, 246)');
  await expect(eating.locator('.eating-line svg.key')).toHaveCount(1);
  // The closed card leads, with the window's length at display size.
  await expect(page.locator('[data-block="closed"]')).toHaveClass(/\bhero\b/);
  expect(await css(page.getByTestId('window-length'), 'fontSize')).toBe('40px');
  // The rings move into the stage card, smaller.
  const svg = page.locator('[data-block="stages"] .ring-wrap.compact > svg.rings');
  expect(Math.round((await box(svg)).width)).toBe(152);
});

// The closed card's actions in two weights: Add a meal and Start a meal as
// the 48 outline pair side by side, then the corrections as 44 pills.
const expectClosedActions = async (page) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:30') }] });
  const closed = page.locator('[data-block="closed"]');
  const pair = closed.locator('.closed-actions > .btn-pair > .btn.outline');
  await expect(pair).toHaveText(['Add a meal', 'Start a meal']);
  const boxes = [];
  for (const b of await pair.all()) {
    boxes.push(await box(b));
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  for (const b of boxes) expect(Math.round(b.height)).toBe(48);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
  const pills = closed.locator('.closed-actions > .pill-row > .btn-2');
  await expect(pills).toHaveText(['I ate something', 'Change times']);
  for (const b of await pills.all()) {
    const r = await box(b);
    expect(Math.round(r.height)).toBe(44);
    expect(r.y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await expect(closed.locator('.closed-actions .btn-grid')).toHaveCount(0);
  return closed;
};

test('closed under the new fast: a card with no strong, its length in ink, two weights of action', async ({ page }) => {
  const closed = await expectClosedActions(page);
  await expect(closed).not.toHaveClass(/\bstrong\b/);
  await expect(closed).not.toHaveClass(/\bhero\b/);
  expect(await css(page.getByTestId('window-length'), 'color')).toBe('rgb(14, 14, 18)');
});

test.describe('closed card at 320 wide', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('the outline pair stays side by side, the pills under it', async ({ page }) => {
    await expectClosedActions(page);
  });
});

test('the rings draw to their value on the first paint, and not on a clock tick', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const draws = () => page.evaluate(() => document.querySelectorAll('.today .rings .ring-draw').length);
  expect(await draws()).toBeGreaterThan(0);
  await page.clock.runFor(3000);
  await advance(page, 5); // a redraw for the clock
  expect(await draws()).toBe(0);
  // A user action: the last bite moves later; the red ring draws from where it was.
  await tap(page, 'edit-last-bite');
  await setTime(page, 'edit-last-bite', '22:10');
  await tap(page, 'save-last-bite');
  await expect(page.getByTestId('fasting-for')).toHaveText(/^15h/);
  expect(await draws()).toBeGreaterThan(0);
});

test('with Reduce Motion on, the rings show their value at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  expect(await page.evaluate(() => document.querySelectorAll('.today .rings .ring-draw').length)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('.today .rings').getAnimations({ subtree: true }).length)).toBe(0);
});

test('the fast complete note: one callout row with a key, the length in ink, a Close pill; the hero ring celebrates', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, LAST_NIGHT);
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  const done = page.locator('[data-block="fast-done"]');
  await expect(done).toHaveClass(/tint-fast/);
  // No ring of its own: a 14px key, so the hero keeps the only rings.
  await expect(done.locator('svg.rings')).toHaveCount(0);
  const k = await box(done.locator('.done-line svg.key'));
  expect(Math.round(k.width)).toBe(14);
  await expect(done.locator('.done-title')).toHaveText('Fast complete');
  expect(await css(done.getByTestId('fast-length'), 'fontSize')).toBe('17px');
  await expect(done.getByTestId('fast-length')).toHaveCSS('color', 'rgb(14, 14, 18)');
  // Dismissed like every other note: a tertiary Close pill.
  const closeBtn = done.locator('[data-action="close-fast-done"]');
  await expect(closeBtn).toHaveText('Close');
  await expect(closeBtn).toHaveClass(/\bbtn-2\b/);
  const close = await box(closeBtn);
  expect(close.height).toBeGreaterThanOrEqual(44);
  // The words and Close share one row.
  const line = await box(done.locator('.done-line'));
  expect(Math.abs((line.y + line.height / 2) - (close.y + close.height / 2))).toBeLessThanOrEqual(2);
  // The goal reached is celebrated on the hero's red ring.
  await expect(page.locator('[data-block="open"] .ring-wrap')).toHaveClass(/\bcelebrate-fast\b/);
});

test('the week row: 56 tall days, today on an ink pill, keys in the shape of each mark', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const today = page.locator('.week-day[aria-current="date"]');
  expect((await box(today)).height).toBeGreaterThanOrEqual(56);
  expect(await css(today.locator('.wd'), 'backgroundColor')).toBe('rgb(14, 14, 18)');
  expect(await css(page.locator('.week-day').nth(2).locator('.wd'), 'textTransform')).toBe('none');
  await expect(page.getByTestId('today-week-legend').locator('.legend-item svg')).toHaveCount(2);
});

test('opened before 16:00: the window ring keeps measuring the window; the bar says the miss', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await seed(page, {
    ...LAST_NIGHT,
    days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T15:30'), lastBite: null }],
  });
  const open = page.locator('[data-block="open"]');
  const ring = open.getByTestId('window-ring');
  await expect(ring).not.toHaveClass(/ring-miss/);
  expect(Number(await ring.getAttribute('data-frac'))).toBeCloseTo(135 / 240, 2);
  await expect(open.locator('.phase-bar.miss')).toContainText('Opened before 16:00, so today counts as a miss.');
  await expect(open.locator('[data-ring-row="win"] > .legend-item')).not.toHaveClass(/is-miss/);
});

for (const [name, seedDays, at] of [
  ['a day without eating', [{ day: '2026-09-27', noEating: true }], '2026-09-27T20:00'],
  ['a closed window leading while a meal goes on', [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }], '2026-09-27T22:30'],
]) {
  test(`the smaller rings keep the stage chip: ${name}`, async ({ page }) => {
    await openAt(page, at);
    await seed(page, {
      ...LAST_NIGHT,
      days: [...LAST_NIGHT.days, ...seedDays],
      meals: name.startsWith('a closed') ? [{ id: 5, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: null, outside: true }] : [],
    });
    const card = page.locator('[data-block="stages"]');
    await expect(card.locator('.ring-wrap.compact')).toBeVisible();
    await expect(page.getByTestId('stage-name')).toHaveCount(1);
    const chip = card.getByTestId('stage-name');
    await expect(chip).toBeVisible();
    // Under the rings, over the fast's times.
    const rings = await box(card.locator('.ring-wrap.compact'));
    const chipBox = await box(chip);
    expect(chipBox.y).toBeGreaterThanOrEqual(rings.y + rings.height);
    expect(chipBox.height).toBeGreaterThanOrEqual(44);
    expect((await box(card.getByTestId('fast-times'))).y).toBeGreaterThan(chipBox.y);
    const stage = await card.getAttribute('data-stage');
    await expect.poll(() => chip.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.animationName && !/ring-draw|fade/.test(a.animationName)).length)).toBeGreaterThan(0);
    await tap(page, 'open-stages');
    const s = sheet(page, 'stages');
    await expect(s).toBeVisible();
    await expect(s.locator(`.stage-card[data-stage="${stage}"]`).getByTestId('stage-now')).toHaveText('Now');
  });
}

// The striped window ring of a missed day is named by the striped key, in the
// colour of a miss, wherever the rings are drawn.
const expectStripedWindow = async (scope) => {
  await expect(scope.locator('[data-ring="win"]')).toHaveClass(/ring-miss/);
  const row = scope.locator('[data-ring-row="win"]');
  const name = row.locator('> .legend-item');
  await expect(name).toHaveText('Window');
  await expect(name).toHaveClass(/is-miss/);
  await expect(name.locator('svg.key')).toHaveCount(1);
  await expect(name.locator('svg.key pattern')).toHaveCount(1);
  await expect(row.locator('> .value')).toHaveText('Miss');
  await expect(row.locator('> .value')).toHaveClass(/is-miss/);
  expect(await css(name, 'color')).toBe(await css(row.locator('> .value'), 'color'));
  await expect(scope.getByTestId('ring-legend').locator('.legend-item')).toHaveText(['Fast', 'Window', 'Fullness']);
};

test('a missed day: the fasting hero names its striped window ring with the striped key', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T21:20') }] });
  const hero = page.locator('[data-block="fasting"]');
  await expect(hero).toHaveClass(/\bhero\b/);
  await expectStripedWindow(hero);
});

test('a missed day: the smaller rings in the stage card name the stripes the same way, and the head does not repeat the stage', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, {
    ...LAST_NIGHT,
    days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    meals: [{ id: 5, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: null, outside: true }],
  });
  const card = page.locator('[data-block="stages"]');
  await expectStripedWindow(card);
  // The chip names the stage; the head says only where it falls.
  const name = (await card.locator('.stage-chip-name').textContent()).trim();
  await expect(card.locator('.stage-count')).toHaveText(/^Stage \d of 6$/);
  await expect(card.locator('.stage-count + .stage-lines')).toHaveCount(1);
  // One glyph for the stage in the card: the ring's centre and the chip, no still disc and no second title.
  await expect(card.locator('.stage-head, .stage-title')).toHaveCount(0);
});

test('a window that can still be reopened: the words keep one line, the pill goes under them', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T19:30') }] });
  const bar = page.locator('.reopen-bar');
  await expect(bar.locator('[data-action="reopen"]')).toBeVisible();
  const lines = await bar.locator('> span').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
  expect(lines).toBe(1);
});

test('a new day at midnight does not draw the rings', async ({ page }) => {
  await openAt(page, '2026-09-27T23:51');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T21:00') }] });
  await page.clock.runFor(3000);
  await advance(page, 5); // 23:56, a redraw for the clock
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.today .rings .ring-draw').length)).toBe(0);
  await advance(page, 5); // 00:01, a new day
  await expect(page.locator('.week-day[aria-current="date"]')).toHaveAttribute('data-day', '2026-09-28');
  expect(await page.evaluate(() => document.querySelectorAll('.today .rings .ring-draw').length)).toBe(0);
});

test('last night\'s window giving way to today by the clock does not draw the rings', async ({ page }) => {
  await openAt(page, '2026-09-28T01:55');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T22:00'), lastBite: ms('2026-09-27T23:30') }] });
  await expect(page.locator('.today')).toHaveAttribute('data-mode', 'closed');
  await page.clock.runFor(3000);
  await advance(page, 6); // 02:01: the window can no longer reopen
  await expect(page.locator('.today')).toHaveAttribute('data-mode', 'before');
  expect(await page.evaluate(() => document.querySelectorAll('.today .rings .ring-draw').length)).toBe(0);
});

test('a window narrowed across 375 redraws the rings at 120 on the next tick', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const svg = page.locator('[data-block="before"] .ring-wrap > svg.rings');
  await expect(svg).toHaveAttribute('viewBox', '0 0 216 216');
  await page.setViewportSize({ width: 340, height: 844 });
  await advance(page, 1);
  await expect(svg).toHaveAttribute('viewBox', '0 0 152 152');
  await page.setViewportSize({ width: 390, height: 844 });
  await advance(page, 1);
  await expect(svg).toHaveAttribute('viewBox', '0 0 216 216');
});

test('nothing on record: the rings are empty tracks in their own tints, the goal a small GoalPair', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  const hero = page.locator('[data-block="before"]');
  const strokes = await hero.locator('.empty-rings circle').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes).toEqual(['rgb(255, 227, 234)', 'rgb(221, 247, 227)', 'rgb(220, 243, 252)']);
  const goal = hero.locator('[data-action="edit-goal"]');
  await expect(goal).toHaveAttribute('aria-label', 'Goal, 20:4. Change');
  await expect(goal.locator('b')).toHaveText('Goal 20:4');
  // Never the time figure: the ratio is the tile's quiet name, the hours a pair with ring keys.
  expect(await css(goal.locator('.goal-ratio'), 'fontSize')).toBe('13px');
  await expect(goal.locator('.goal-pair-label')).toHaveText(['Fast', 'Window']);
  await expect(goal.locator('.goal-pair-figure')).toHaveText(['20h', '4h']);
  expect(await css(goal.locator('.goal-pair-figure').first(), 'fontSize')).toBe('24px');
  await expect(goal.locator('svg.key')).toHaveCount(2);
  // Only the Goal sheet's pair speaks.
  await expect(page.getByTestId('goal-pair')).toHaveCount(0);
});

// Every action under a hero: the primary full width, then 48 outlines two to
// a row, an odd last one across the row.
const expectActionGrid = async (scope, names) => {
  const grid = scope.locator('.hero-actions').first();
  const buttons = grid.locator('.btn.outline');
  await expect(buttons).toHaveCount(names.length);
  expect(await buttons.evaluateAll((els) => els.map((el) => el.dataset.action))).toEqual(names);
  const g = await box(grid);
  const boxes = [];
  for (const b of await buttons.all()) boxes.push(await box(b));
  for (const [i, b] of boxes.entries()) {
    expect(Math.round(b.height)).toBe(48);
    const lone = i === boxes.length - 1 && i % 2 === 0;
    expect(Math.abs(b.width - (lone ? g.width : (g.width - 8) / 2))).toBeLessThanOrEqual(1);
  }
};

test('the actions under every hero follow one pattern', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  await expectActionGrid(page.locator('[data-block="before"]'), ['add-meal']);
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  const open = page.locator('[data-block="open"]');
  await expectActionGrid(open, ['done-eating', 'add-meal', 'change-opening']);
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await expect(open.locator('[data-block="eating"]')).toHaveCount(0);
  await expect(open.locator('.hero-primary [data-action="done-eating"]')).toHaveClass(/\bblock\b/);
  await expectActionGrid(open, ['start-meal', 'add-meal', 'change-opening']);
});

test('nothing on record: Start a meal across the group, Begin fast and Add a meal under it', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  const hero = page.locator('[data-block="before"]');
  await expect(hero.locator('.start-actions [data-action]')).toHaveText(['Start a meal', 'Begin fast']);
  const grid = await box(hero.locator('.hero-actions'));
  const start = await box(hero.locator('[data-action="start-meal"]'));
  const begin = await box(hero.locator('[data-action="begin-fast"]'));
  const add = await box(hero.locator('[data-action="add-meal"]'));
  expect(Math.abs(start.width - grid.width)).toBeLessThanOrEqual(1);
  expect(Math.round(begin.height)).toBe(48);
  expect(Math.round(add.height)).toBe(48);
  expect(Math.abs(begin.y - add.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(begin.width - add.width)).toBeLessThanOrEqual(1);
});

test('paused: the headline alone names the pause, and its actions are one grid', async ({ page }) => {
  await openAt(page, '2026-09-30T12:00');
  await seed(page, { ...LAST_NIGHT, days: ['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' })) });
  const hero = page.locator('[data-block="paused"]');
  await expect(hero.getByTestId('paused-until')).toHaveText('Paused until Thu 1 Oct');
  await expect(hero.locator('.paused-words')).toHaveText('Paused until Thu 1 Oct');
  await expectActionGrid(hero, ['end-pause', 'change-pause', 'add-meal']);
});

test('just opened, the window ring shows a round start cap at 12 o\'clock', async ({ page }) => {
  await openAt(page, '2026-09-27T17:00');
  await seed(page, LAST_NIGHT);
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  const svg = page.locator('[data-block="open"] .ring-wrap > svg.rings');
  const cap = svg.locator('.ring-win .ring-start');
  await expect(cap).toHaveCount(1);
  expect(await cap.evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(47, 203, 87)');
  const track = svg.locator('.ring-win circle').first();
  const [cx, cy, r] = await track.evaluate((el) => ['cx', 'cy', 'r'].map((a) => Number(el.getAttribute(a))));
  expect(Number(await cap.getAttribute('cx'))).toBeCloseTo(cx, 1);
  expect(Number(await cap.getAttribute('cy'))).toBeCloseTo(cy - r, 1);
  // Once the arc is longer than its stroke, the arc shows it: no cap.
  await advance(page, 30);
  await expect(cap).toHaveCount(0);
});

test('the streak and the best share a caption line and a figure line', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const row = page.locator('[data-block="streak"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator('.caption')).toHaveText(['Streak', 'Best']);
  const [a, b] = [await box(row.locator('.caption').nth(0)), await box(row.locator('.caption').nth(1))];
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(0.5);
  const [fa, fb] = [await box(row.getByTestId('streak')), await box(row.getByTestId('streak-best'))];
  expect(Math.abs(fa.y - fb.y)).toBeLessThanOrEqual(0.5);
  expect(await css(row.getByTestId('streak-best'), 'fontSize')).toBe(await css(row.getByTestId('streak'), 'fontSize'));
});
