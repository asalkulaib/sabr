// Today in every mode, shot at 390 x 844 for design review (test-results/screens,
// names starting with T), each with the contrast audit of shot().
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setTime, settings, ms, shot } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });
const LAST_NIGHT = [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }];

test('before the window: a fast known, the plan, the stage card', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, 'T01-today-before-workday');
  await shot(page, 'T01b-today-before-full', { full: true });
  await page.locator('[data-block="stages"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await shot(page, 'T01c-today-stages');
});

test('before the window with one notice: Start a meal still on the first screen', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: settings({ installedAt: ms('2026-09-20T08:00'), lastImportAt: ms('2026-09-26T09:00') }) });
  await expect(page.locator('.notice')).toHaveCount(1);
  await shot(page, 'T01d-today-before-one-notice');
});

test('before the window: feasting hours, a day off, eating late', async ({ page }) => {
  await openAt(page, '2026-09-27T11:00');
  await seed(page, { ...WEEK, settings: [...install, { key: 'flexChanges', value: [{ from: '2026-09-27', on: true }] }] });
  await shot(page, 'T78-today-before-flexible', { full: true });
  await openAt(page, '2026-09-28T01:30'); // just after midnight: last night can take a late meal
  await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:00') }], settings: install });
  await tap(page, 'day-off');
  await expect(page.locator('[data-action="day-off-undo"]')).toBeVisible();
  // The tap redraws Today: scroll once the plan card stays.
  await expect(async () => page.locator('[data-block="plan"]').scrollIntoViewIfNeeded({ timeout: 1000 })).toPass();
  await shot(page, 'T01e-today-plan-late-day-off');
});

test('nothing on record, then Begin fast', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await shot(page, 'T60-today-start-new-user');
  await tap(page, 'begin-fast');
  await tap(page, 'fast-last');
  await tap(page, 'save-fast');
  await expect(sheet(page, 'begin-fast')).toHaveCount(0);
  await shot(page, 'T62-today-fast-begun');
});

test('window open: in the window, eating, warn, grace, over', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await advance(page, 40);
  await shot(page, 'T03-today-open-eating');
  await shot(page, 'T03b-today-open-eating-full', { full: true });
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await tap(page, 'save-finish');
  await advance(page, 21);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await pick(page, 'fullness-20', 7);
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toHaveCount(0);
  await shot(page, 'T03c-today-open-between-meals');
  await advance(page, 155); // 21:06, 24 minutes left
  await shot(page, 'T06-today-open-warn');
  await advance(page, 30); // grace
  await shot(page, 'T07-today-open-grace');
  await advance(page, 20); // over
  await shot(page, 'T08-today-open-over');
  await shot(page, 'T08b-today-open-over-full', { full: true });
});

test('window open: a meal running, opened before 16:00', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T15:30'), lastBite: null }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T15:30'), finishedAt: null }],
    settings: install,
  });
  await shot(page, 'T17-today-open-early-eating');
});

test('the goal reached, then the fast marked complete', async ({ page }) => {
  await openAt(page, '2026-09-27T18:10');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, 'T83-today-goal-reached');
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await expect(page.locator('[data-block="fast-done"]')).toBeVisible();
  await shot(page, 'T84-today-fast-complete');
  // A shorter fast: its length alone.
  await openAt(page, '2026-09-27T16:30');
  await seed(page, { days: LAST_NIGHT, settings: install });
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await shot(page, 'T84b-today-fast-complete-short');
});

test('closed: the new fast first, then the window', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:34'), lastBite: ms('2026-09-27T21:26'), energy4pm: 4, trained: true, trainingType: 'weights' }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:34'), finishedAt: ms('2026-09-27T18:10'), hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20: 7 }],
    settings: install,
  });
  await shot(page, 'T10-today-closed-success');
  await shot(page, 'T10b-today-closed-full', { full: true });
  await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
  await shot(page, 'T10c-today-closed-window-below');
  await tap(page, 'ate-something');
  await choose(page, 'trigger', 'boredom');
  await choose(page, 'amount', 'little');
  await tap(page, 'save-outside');
  await tap(page, 'done');
  await expect(sheet(page, 'outside')).toHaveCount(0);
  await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
  await shot(page, 'T13-today-closed-miss-outside');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-block="fasting"]').scrollIntoViewIfNeeded();
  await shot(page, 'T13a-today-closed-miss-hero');
});

test('closed: the fullness check above the new fast', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, {
    ...WEEK,
    days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T20:50'), lastBite: ms('2026-09-27T21:30') }],
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T20:50'), finishedAt: ms('2026-09-27T21:30'), hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20DueAt: ms('2026-09-27T21:50') }],
    settings: install,
  });
  await expect(page.locator('[data-block="satiety-pointer"]')).toBeVisible();
  await shot(page, 'T10d-today-just-closed-fullness');
});

test('closed: over by 20 min, still inside the window, the forgotten close', async ({ page }) => {
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T21:20') }], settings: install });
  await shot(page, 'T14a-today-closed-over-hero');
  await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
  await shot(page, 'T14-today-closed-over');
  await openAt(page, '2026-09-27T20:00');
  await seed(page, { days: [...LAST_NIGHT, { day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T19:30') }], settings: install });
  await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
  await shot(page, 'T14b-today-closed-reopen');
  await openAt(page, '2026-09-27T22:00');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T15:30'), lastBite: null }], settings: install });
  await shot(page, 'T15-today-forgot-close');
  await tap(page, 'forgot-close');
  await setTime(page, 'forgot-last-bite', '23:30');
  await tap(page, 'forgot-close');
  await shot(page, 'T15b-today-forgot-error');
});

test('closed and leading: a meal still being eaten after the window', async ({ page }) => {
  await openAt(page, '2026-09-27T22:30');
  await seed(page, {
    days: [...LAST_NIGHT, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    meals: [{ id: 5, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: null, outside: true }],
    settings: install,
  });
  await shot(page, 'T19-today-closed-leading-outside');
  await shot(page, 'T19b-today-closed-leading-full', { full: true });
  await page.locator('[data-block="stages"] .ring-wrap').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'T19e-today-closed-leading-rings');
});

test('a day without eating', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00');
  await seed(page, { days: [...LAST_NIGHT, { day: '2026-09-27', noEating: true }], settings: install });
  await shot(page, 'T19c-today-no-eating');
  await shot(page, 'T19d-today-no-eating-full', { full: true });
});

test('notices, paused, the undo bar', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { days: [WEEK.days[0]], settings: settings({ installedAt: ms('2026-09-18T08:00') }) });
  await shot(page, 'T16-today-notices');
  await openAt(page, '2026-09-30T12:00');
  await seed(page, {
    days: [...WEEK.days, ...['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, paused: 'travel' }))],
    meals: WEEK.meals,
    settings: install,
  });
  await shot(page, 'T50-today-paused');
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'edit-last-bite');
  await setTime(page, 'edit-last-bite', '22:10');
  await tap(page, 'save-last-bite');
  await shot(page, 'T56-today-undo-bar');
});

test('a long fast: the fasting day, its plan, the third day', async ({ page }) => {
  await openAt(page, '2026-09-27T10:00');
  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T16:00'), lastBite: ms('2026-09-26T21:00') }],
    settings: settings({ installedAt: ms('2026-09-26T08:00'), goalChanges: [{ from: '2026-09-26', hours: 6, fast: 48 }] }),
  });
  await shot(page, 'T64b-today-fasting-day');
  await page.locator('[data-block="plan"]').scrollIntoViewIfNeeded();
  await shot(page, 'T64c-today-fasting-day-plan');
  await openAt(page, '2026-09-28T23:30');
  await seed(page, { days: LAST_NIGHT, settings: install });
  await shot(page, 'T89-today-third-day');
  await page.locator('[data-block="stages"]').scrollIntoViewIfNeeded();
  await shot(page, 'T89b-today-third-day-stage');
});

test('the streak, the check-in and the week row', async ({ page }) => {
  const days = [];
  for (let i = 0; i < 40; i++) {
    const key = new Date(Date.UTC(2026, 7, 17 + i)).toISOString().slice(0, 10);
    days.push({ day: key, firstBite: ms(`${key}T17:00`), lastBite: ms(`${key}T20:30`), fullness: i % 2 ? 'full' : 'before_full' });
  }
  days[39] = { ...days[39], fullness: undefined, energy4pm: 4, trained: true, trainingType: 'weights' };
  await openAt(page, '2026-09-25T22:00');
  await seed(page, { days, settings: install });
  await shot(page, 'T66-today-celebrated');
  await page.locator('[data-block="streak"]').scrollIntoViewIfNeeded();
  await shot(page, 'T65-today-streak-checkin');
  await openAt(page, '2026-09-26T23:00');
  await seed(page, { ...WEEK, settings: install });
  await shot(page, 'T82-today-week-row');
});

test.describe('travel', () => {
  test.use({ timezoneId: 'Asia/Dubai' });

  test('today in Dubai: the header says whose time it is', async ({ page }) => {
    await openAt(page, '2026-10-02T18:00');
    await seed(page, { ...WEEK, settings: [...install, { key: 'zoneSeenAt', value: ms('2026-09-27T10:00') }] });
    await shot(page, 'T80-today-dubai');
  });
});

test.describe('narrow phone', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('at 320 wide no label wraps or clips', async ({ page }) => {
    await openAt(page, '2026-09-27T09:00');
    await shot(page, 'T90-narrow-start');
    // The week row bleeds into the gutters: every day is a 44 wide target, inside the screen.
    const days = await page.locator('.today .week-day').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, l: r.left, r: r.right }; }));
    expect(days).toHaveLength(7);
    for (const d of days) {
      expect(d.w).toBeGreaterThanOrEqual(44);
      expect(d.l).toBeGreaterThanOrEqual(0);
      expect(d.r).toBeLessThanOrEqual(320);
    }
    await openAt(page, '2026-09-27T21:40');
    await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:34'), lastBite: ms('2026-09-27T21:26') }], settings: install });
    await page.locator('[data-block="closed"]').scrollIntoViewIfNeeded();
    await shot(page, 'T91-narrow-closed');
    // Every button's words fit on one line inside it.
    const clipped = await page.locator('.today button').evaluateAll((els) => els
      .filter((b) => b.offsetParent && (b.scrollWidth > b.clientWidth + 1))
      .map((b) => b.textContent.trim()));
    expect(clipped).toEqual([]);
  });

  // No sideways scroll, and every figure of the readout inside its column.
  const fits = async (page, what) => {
    const r = await page.evaluate(() => {
      const ro = [...document.querySelectorAll('.today .ring-readout')].map((el) => {
        const right = el.getBoundingClientRect().right;
        return [...el.querySelectorAll('.value, [data-testid="fasting-for"]')].map((v) => v.getBoundingClientRect().right - right);
      }).flat();
      return { scroll: document.documentElement.scrollWidth, width: innerWidth, past: Math.max(0, ...ro) };
    });
    expect(r.scroll, what).toBeLessThanOrEqual(r.width);
    expect(r.past, what).toBeLessThanOrEqual(0.5);
  };

  test('at 320 wide the rings step down and the readout fits beside them', async ({ page }) => {
    await openAt(page, '2026-09-27T13:10');
    await seed(page, { ...WEEK, settings: install });
    // Drawn at 120 with its own stroke, not the hero scaled down: the ring's
    // outer edge is on the column's left edge, the gutter.
    const narrowSvg = page.locator('[data-block="before"] .ring-wrap > svg.rings');
    expect(Math.round((await narrowSvg.boundingBox()).width)).toBe(152);
    expect(await narrowSvg.getAttribute('viewBox')).toBe('0 0 152 152');
    const col = await page.locator('[data-block="before"] .ring-wrap').boundingBox();
    expect(Math.abs((await narrowSvg.boundingBox()).x + 16 - col.x)).toBeLessThanOrEqual(0.5);
    await fits(page, 'before');
    await shot(page, 'T90b-narrow-before');
    await openAt(page, '2026-09-27T21:40');
    await seed(page, { ...WEEK, days: [...WEEK.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:34'), lastBite: ms('2026-09-27T21:26') }], settings: install });
    await expect(page.locator('[data-block="fasting"]')).toBeVisible();
    await fits(page, 'fasting');
    expect(await page.locator('[data-block="fasting"] .ring-wrap > svg.rings').getAttribute('viewBox')).toBe('0 0 152 152');
    await openAt(page, '2026-09-27T17:30');
    await seed(page, { ...WEEK, settings: install });
    await tap(page, 'start-meal');
    await tap(page, 'start-eating');
    await expect(page.locator('[data-block="open"]')).toBeVisible();
    await fits(page, 'open');
    expect(await page.locator('[data-block="open"] .ring-wrap > svg.rings').getAttribute('viewBox')).toBe('0 0 152 152');
    await advance(page, 245);
    await expect(page.getByTestId('grace')).toBeVisible();
    await fits(page, 'grace');
    await shot(page, 'T90c-narrow-grace');
    await advance(page, 20);
    await expect(page.getByTestId('over')).toBeVisible();
    await fits(page, 'over');
    await shot(page, 'T90d-narrow-over');
    // A fast of days: its figure steps down and still fits.
    await openAt(page, '2026-10-03T09:00');
    await seed(page, { days: LAST_NIGHT, settings: install });
    await expect(page.getByTestId('fasting-for')).toHaveText(/days 12h/);
    await fits(page, 'six days');
    await shot(page, 'T90e-narrow-long-fast');
  });
});
