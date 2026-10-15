import { test, expect, openAt, seed, advance, tap, sheet, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// Today after Zero: the fast in one card, the stages one at a time, the end
// of each fast marked, and the week across the top.

// Last night's window closed at 21:00 on Saturday 26 September.
const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

const startMeal = async (page) => {
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="open"]')).toBeVisible();
};

test('one card: the dial, when the fast began and when it reaches its goal, then Start a meal', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const card = page.locator('[data-block="before"]');
  await expect(card.getByTestId('fasting-ring')).toBeVisible();
  const times = card.getByTestId('fast-times');
  await expect(times.locator('.label')).toHaveText(['Last bite', '20 h goal']);
  await expect(times.locator('[data-action="edit-last-bite"]')).toHaveText('21:00 yesterday');
  await expect(times.locator('[data-action="edit-goal"]')).toHaveText('17:00');
  await expect(times.locator('[data-action="edit-goal"]')).not.toHaveClass(/reached/);
  // The 16:00 warning sits just above the button, in the same card.
  await expect(card.getByTestId('firm-reminder')).toBeVisible();
  await expect(card.locator('[data-action="start-meal"]')).toBeVisible();
  // The rest of the plan follows on its own panel.
  await expect(page.locator('[data-block="plan"]')).toContainText('Window planned for 17:30.');
  await expect(page.locator('[data-block="plan"]')).toContainText('Until then: water');
  // The goal opens the goal sheet.
  await tap(page, 'edit-goal');
  await expect(sheet(page, 'goal')).toBeVisible();
});

test('the goal turns gold the minute it is reached', async ({ page }) => {
  await openAt(page, '2026-09-27T16:58');
  await seed(page, LAST_NIGHT);
  const goal = page.locator('[data-block="before"] [data-action="edit-goal"]');
  await expect(goal).toHaveText('17:00');
  await advance(page, 3);
  await expect(goal).toHaveText('Reached 17:00');
  await expect(goal).toHaveClass(/reached/);
});

// The order of Today's main panels, top to bottom.
const panels = (page) => page.locator('.today > section').evaluateAll((els) => els.map((el) => el.dataset.block).filter(Boolean));

test('after the window, the new fast leads Today: the full dial and its two times, the stage, then the window just closed', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:30') }] });
  const card = page.locator('[data-block="fasting"]');
  await expect(card).toHaveClass(/strong/);
  await expect(card.locator('.label').first()).toHaveText('Fasting');
  await expect(card.getByTestId('fasting-ring')).toBeVisible();
  await expect(card.getByTestId('fasting-ring')).not.toHaveClass(/compact/);
  await expect(card.locator('[data-action="edit-last-bite"]')).toHaveText('21:30');
  await expect(card.locator('[data-action="edit-goal"]')).toHaveText('17:30 tomorrow');
  expect((await panels(page)).slice(0, 3)).toEqual(['fasting', 'stages', 'closed']);
  // The window keeps all it had, now as a plain panel under the fast.
  const closed = page.locator('[data-block="closed"]');
  await expect(closed).not.toHaveClass(/strong/);
  await expect(closed.getByTestId('window-length')).toHaveText('4h');
  await expect(closed.getByTestId('result')).toHaveText('Success. All eating inside the window.');
  await expect(closed.locator('[data-action="change-times"]')).toBeVisible();
  await expect(closed.getByTestId('next-window')).toHaveText("Tomorrow's window opens at 17:30.");
  await expect(page.locator('[data-block="stages"]').getByTestId('fasting-ring')).toHaveCount(0);
});

test('a fullness check still running sits above the new fast', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, LAST_NIGHT);
  await startMeal(page);
  await advance(page, 40);
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="satiety-pointer"]')).toBeVisible();
  await expect.poll(async () => (await panels(page)).slice(0, 4)).toEqual(['satiety-pointer', 'fasting', 'stages', 'closed']);
});

test('a meal still being eaten after the window closed keeps the window, with Finished this meal, on top', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, {
    ...LAST_NIGHT,
    days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    meals: [{ id: 5, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: null, outside: true }],
  });
  await expect(page.locator('[data-block="closed"]')).toHaveClass(/strong/);
  await expect.poll(async () => (await panels(page))[0]).toBe('closed');
  await expect(page.locator('[data-block="fasting"]')).toHaveCount(0);
  await expect(page.locator('[data-block="stages"]').getByTestId('fasting-ring')).toBeVisible();
});

test('the stage under the time opens the stages at the one the fast is in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10'); // 16 h 10 min: the metabolic switch
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('stage-name')).toHaveText('Metabolic switch');
  await tap(page, 'open-stages');
  const s = sheet(page, 'stages');
  await expect(s.locator('.stage-stop.now')).toHaveAttribute('data-action', 'stage-switch');
  await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
  await expect(s.getByTestId('stage-now')).toHaveCount(1);
  await expect(s.locator('.stage-card[data-stage="switch"]').getByTestId('stage-now')).toHaveText('Now');
  // The card in view is the one the fast is in.
  const inView = () => s.locator('.stage-cards').evaluate((el) => Math.round(el.scrollLeft / el.clientWidth));
  await expect.poll(inView).toBe(2);
  // Tap another stage: its card comes into view and the mark moves.
  await tap(page, 'stage-ketones');
  await expect.poll(inView).toBe(3);
  await expect(s.locator('[data-action="stage-ketones"]')).toHaveAttribute('aria-current', 'true');
  await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'false');
  // The last stage, past three days, is in reach too.
  await tap(page, 'stage-sparing');
  await expect.poll(inView).toBe(5);
  await expect(s.locator('[data-action="stage-sparing"]')).toHaveAttribute('aria-current', 'true');
});

test('the stages show three at a time; the line swipes on its own and follows the card in view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T13:10'); // 16 h 10 min: the metabolic switch
  await seed(page, LAST_NIGHT);
  await tap(page, 'open-stages');
  const s = sheet(page, 'stages');
  const line = s.getByTestId('stage-line');
  // Whether a stage sits wholly inside the line's view.
  const inLine = (key) => line.evaluate((el, k) => {
    const view = el.getBoundingClientRect();
    const r = el.querySelector(`[data-action="stage-${k}"]`).getBoundingClientRect();
    return r.left >= view.left - 1 && r.right <= view.right + 1;
  }, key);
  const perView = await line.evaluate((el) => el.clientWidth / el.querySelector('.stage-stop').getBoundingClientRect().width);
  expect(perView).toBeGreaterThan(3);
  expect(perView).toBeLessThan(4);
  // It opens with the stage the fast is in, in view.
  await expect.poll(() => inLine('switch')).toBe(true);
  expect(await inLine('sparing')).toBe(false);
  // Swiping the line alone leaves the card where it is.
  await line.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect.poll(() => inLine('sparing')).toBe(true);
  expect(await s.locator('.stage-cards').evaluate((el) => Math.round(el.scrollLeft / el.clientWidth))).toBe(2);
  // Tapping the stage already shown centres it again.
  await s.locator('[data-action="stage-switch"]').evaluate((b) => b.click());
  await expect.poll(() => inLine('switch')).toBe(true);
  await line.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  // Swiping the cards brings the line back to the card in view.
  await s.locator('.stage-cards').evaluate((el) => el.scrollTo({ left: el.children[0].offsetLeft }));
  await expect(s.locator('[data-action="stage-digesting"]')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => inLine('digesting')).toBe(true);
  expect(await inLine('sparing')).toBe(false);
});

test('the cards keep one size at every point of a swipe, so a swipe comes to rest on a card', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // 16 h 10 min: the metabolic switch
  await seed(page, LAST_NIGHT);
  await tap(page, 'open-stages');
  const s = sheet(page, 'stages');
  await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
  // Every card is as tall as the list, and nothing restyles or resizes the
  // list as the cards pass: on iPhone a snapping list resized mid-swipe left
  // the cards at rest between two stages.
  const seen = await s.locator('.stage-cards').evaluate(async (el) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const step = el.children[1].offsetLeft - el.children[0].offsetLeft;
    // Held between cards, as a finger holds them.
    el.style.setProperty('scroll-snap-type', 'none');
    let restyled = 0;
    const watch = new MutationObserver((changes) => { restyled += changes.length; });
    watch.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    const sizes = new Set();
    for (const at of [0, 0.3, 0.5, 1.5, 2.7, 3.5, 4.2, 5, 2]) {
      el.scrollLeft = at * step;
      await frame();
      sizes.add(Math.round(el.getBoundingClientRect().height));
      for (const card of el.children) sizes.add(Math.round(card.getBoundingClientRect().height));
    }
    watch.disconnect();
    return { sizes: [...sizes], restyled };
  });
  expect(seen.sizes).toHaveLength(1);
  expect(seen.restyled).toBe(0);
});

test('starting the first meal ends the fast: its length, gold when it reached the goal; Close puts it away', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30'); // 20 h 30 min after the last bite
  await seed(page, LAST_NIGHT);
  await startMeal(page);
  const done = page.locator('[data-block="fast-done"]');
  await expect(done).toHaveAttribute('data-reached', 'true');
  await expect(done.getByTestId('fast-length')).toHaveText('20h 30m');
  await expect(done.getByTestId('fast-length')).toHaveClass(/hl/);
  await expect(done.getByTestId('fast-goal')).toHaveText('Fasting goal of 20 h reached.');
  await tap(page, 'close-fast-done');
  await expect(done).toHaveCount(0);
  expect((await readDb(page)).days.find((d) => d.day === '2026-09-27').fastNoteClosed).toBe(ms('2026-09-27T17:30'));
  await page.reload();
  await expect(page.locator('[data-block="open"]')).toBeVisible();
  await expect(page.locator('[data-block="fast-done"]')).toHaveCount(0);
});

test('a shorter fast gets its length alone, and nothing shows without a fast on record', async ({ page }) => {
  await openAt(page, '2026-09-27T16:30'); // 19 h 30 min
  await seed(page, LAST_NIGHT);
  await startMeal(page);
  const done = page.locator('[data-block="fast-done"]');
  await expect(done.getByTestId('fast-length')).toHaveText('19h 30m');
  await expect(done.getByTestId('fast-length')).not.toHaveClass(/hl/);
  await expect(done.getByTestId('fast-goal')).toHaveCount(0);
  // Once the window closes, the note goes with it.
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
  await expect(done).toHaveCount(0);

  await seed(page, { settings: LAST_NIGHT.settings });
  await startMeal(page);
  await expect(page.locator('[data-block="fast-done"]')).toHaveCount(0);
});

test('the week on Today: each day in the Week marks, today underlined; tap a day to open it', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00'); // Saturday night, the end of the seeded week
  await seed(page, WEEK);
  const row = page.getByTestId('today-week');
  const days = row.locator('.week-day');
  await expect(days).toHaveCount(7);
  await expect(days.locator('.wd')).toHaveText(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  expect(await days.evaluateAll((els) => els.map((e) => e.dataset.result))).toEqual(['success', 'miss', 'success', 'miss', 'miss', 'success', 'success']);
  await expect(row.locator('[aria-current="date"]')).toHaveAttribute('data-day', '2026-09-26');
  await expect(days.nth(0).getByTestId('left-wanting-dot')).toHaveCount(1);
  await expect(days.nth(4)).toHaveAttribute('aria-label', 'Thu 24 Sep, miss, left wanting');
  // The legend names only the marks in the row.
  await expect(page.getByTestId('today-week-legend').locator('.legend-item')).toHaveText(['Success', 'Miss', 'Left wanting']);
  await days.nth(1).click();
  await expect(page).toHaveURL(/#day\/2026-09-21$/);
});

test('the week on Today, early in the week: days still ahead are dashed', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, LAST_NIGHT);
  const days = page.getByTestId('today-week').locator('.week-day');
  expect(await days.evaluateAll((els) => els.map((e) => e.dataset.result))).toEqual(['pending', 'future', 'future', 'future', 'future', 'future', 'future']);
  await expect(page.getByTestId('today-week-legend').locator('.legend-item')).toHaveText(['Open or not logged', 'Still ahead']);
});

test('no Jebel Uhud: the streak sits under the stage panel, and More has no climber switches', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, { ...LAST_NIGHT, days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:30') }] });
  await expect(page.locator('[data-block="climb"]')).toHaveCount(0);
  await expect(page.getByTestId('uhud')).toHaveCount(0);
  await expect(page.getByTestId('streak')).toHaveText('2 days');
  await expect.poll(async () => (await panels(page)).slice(0, 5)).toEqual(['fasting', 'stages', 'closed', 'streak', 'checkin']);
  await page.locator('.tab[data-tab="more"]').click();
  await expect(page.locator('[data-block="climb-settings"]')).toHaveCount(0);
  await expect(page.locator('.more')).not.toContainText('Uhud');
});

