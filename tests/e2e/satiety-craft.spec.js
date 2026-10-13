// Satiety's motion and taps: the lag lines rise when first seen, tied lines
// share the post, a tap on a lag line picks its own way of finishing, the
// comfortable zone is read off the scale, a due check reads 0 min, Show all
// fades the focus bar out, and only a meal saved by Add a meal on Satiety
// shows itself in the list.
import { test, expect, openAt, seed, tap, choose, settings, ms, settleMotion } from './helpers.js';
import { WEEK } from './seed-data.js';

/** Fourteen meals, 12 to 25 September: every way of finishing, one still without its 20-minute check. */
function fourteen() {
  const meals = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10);
    const stop = ['before_full', 'full', 'full', 'stuffed'][i % 4];
    meals.push({ id: i + 1, day, name: i % 3 ? 'Dinner' : 'Lunch', startedAt: ms(`${day}T17:30`), finishedAt: ms(`${day}T18:00`), hungerBefore: 5 + (i % 4), stop, fullnessNow: 5 + (i % 3), fullness20: i === 13 ? null : 6 + (i % 4) });
  }
  return meals;
}

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

/** Animations running on the lag chart's lines and end marks. */
const lagRunning = (page) => page.getByTestId('lag-chart').evaluate((svg) =>
  svg.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);

test('the lag lines wait until the chart is seen, rise once, and not again on a redraw', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  const lag = page.getByTestId('lag-chart');
  // Below the fold: flat and still.
  await expect(lag).toHaveClass(/waiting/);
  expect(await lagRunning(page)).toBe(0);
  await lag.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(lag).not.toHaveClass(/waiting/);
  expect(await lagRunning(page)).toBeGreaterThan(0);
  await settleMotion(page);
  // A redraw later in the session draws the lines where they ended.
  await tap(page, 'satiety-table');
  await expect(page.getByTestId('satiety-table')).toBeVisible();
  await expect(lag).not.toHaveClass(/waiting/);
  expect(await lagRunning(page)).toBe(0);
});

test('under Reduce Motion the lag lines never wait or move', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  const lag = page.getByTestId('lag-chart');
  await expect(lag).not.toHaveClass(/waiting/);
  await lag.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  expect(await lagRunning(page)).toBe(0);
});

test('a tap on a lag line picks that way of finishing, never the row drawn after it', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  const lag = page.getByTestId('lag-chart');
  await lag.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(lag).not.toHaveClass(/waiting/);
  await settleMotion(page);
  const middle = (stop) => lag.locator(`line[data-lag="${stop}"]`).evaluate((ln) => {
    const m = ln.getScreenCTM();
    const p = new DOMPoint((ln.x1.baseVal.value + ln.x2.baseVal.value) / 2, (ln.y1.baseVal.value + ln.y2.baseVal.value) / 2).matrixTransform(m);
    return { x: p.x, y: p.y };
  });
  for (const [stop, words] of [['before_full', 'left wanting'], ['full', 'satisfied'], ['stuffed', 'overfull']]) {
    const at = await middle(stop);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('satiety-focus')).toContainText(`Charts and meals show ${words} only.`);
    await tap(page, 'show-all');
    await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
  }
  // Just under the lowest line, off its stroke: its own finger-wide target.
  const ways = [['before_full', 'left wanting'], ['full', 'satisfied'], ['stuffed', 'overfull']];
  const at = await Promise.all(ways.map(([stop]) => middle(stop)));
  const lowest = at.indexOf(at.reduce((a, p) => (p.y > a.y ? p : a)));
  await page.mouse.click(at[lowest].x, at[lowest].y + 12);
  await expect(page.getByTestId('satiety-focus')).toContainText(`Charts and meals show ${ways[lowest][1]} only.`);
});

test('Show all fades the focus bar out, then everything shows', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  await tap(page, 'show-all');
  await expect(page.locator('.focus-bar.leaving')).toHaveCount(1);
  await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
  await expect(page.locator('.chart .dim')).toHaveCount(0);
});

test('Show all clears at once: a redraw during the fade keeps everything shown', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  // Show all, then the table at once, inside the bar's fade.
  await page.evaluate(() => {
    document.querySelector('[data-action="show-all"]').click();
    document.querySelector('[data-action="satiety-table"]').click();
  });
  await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
  await expect(page.locator('.chart .dim')).toHaveCount(0);
  await expect(page.getByTestId('satiety-table').locator('tbody tr')).toHaveCount(WEEK.meals.filter((m) => m.stop && m.fullnessNow != null && m.fullness20 != null).length);
  // The same with the Meals view.
  await page.getByTestId('landing-legend').locator('button[data-series="stuffed"]').click();
  await expect(page.getByTestId('satiety-focus')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('[data-action="show-all"]').click();
    document.querySelector('button[data-choice="satiety-view"][data-value="meals"]').click();
  });
  await expect(page.locator('[data-block="satiety-meals"]')).toBeVisible();
  await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
});

test('a tap just off a landing mark picks that mark, never a neighbour', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals: fourteen(), settings: install });
  const chart = page.getByTestId('landing-chart');
  await chart.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const marks = await chart.locator('path[data-stop]').evaluateAll((ps) => ps.map((p) => {
    const b = p.getBoundingClientRect();
    return { stop: p.dataset.stop, x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }));
  expect(marks.length).toBeGreaterThan(8);
  const words = { before_full: 'left wanting', full: 'satisfied', stuffed: 'overfull' };
  for (const m of marks) {
    await page.mouse.click(m.x + 8, m.y + 10);
    await expect(page.getByTestId('satiety-focus')).toContainText(`Charts and meals show ${words[m.stop]} only.`);
    await page.evaluate(() => document.querySelector('[data-action="show-all"]').click());
    await expect(page.getByTestId('satiety-focus')).toHaveCount(0);
  }
});

test('the comfortable zone is read off the scale, never written beside a meal', async ({ page }) => {
  // The latest meal left wanting at 8, by the band's right end: once the
  // zone's range was written there, and read as that meal's value.
  const meals = fourteen().map((m) => (m.id === 13 ? { ...m, fullness20: 8 } : m));
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  const chart = page.getByTestId('landing-chart');
  await chart.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // The scale counts in twos, so the zone's own numbers are on it, in ink. Nothing else is written on the chart.
  await expect(chart.locator('text')).toHaveText(['2', '4', '6', '8', '10', '13 meals ago', 'latest']);
  await expect(chart.locator('text.zone-tick')).toHaveText(['6', '8']);
  const fills = await chart.locator('text').evaluateAll((ts) => ts.map((t) => getComputedStyle(t).fill));
  expect(fills[2]).toBe(fills[3]);
  expect(fills[2]).not.toBe(fills[0]);
  // The band runs under its 6 and 8.
  const band = await chart.getByTestId('zone-band').evaluate((el) => el.getBoundingClientRect().toJSON());
  const ticks = await chart.locator('text.zone-tick').evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().toJSON()));
  for (const t of ticks) {
    expect(t.left).toBeGreaterThanOrEqual(band.left);
    expect(t.right).toBeLessThanOrEqual(band.right);
    expect((t.top + t.bottom) / 2).toBeGreaterThan(band.top);
    expect((t.top + t.bottom) / 2).toBeLessThan(band.bottom);
  }
});

test('the empty states read as whole sentences', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, meals: [], settings: install });
  await expect(page.locator('[data-block="satiety-insights"]')).toContainText('Your insights start with your first rated meal. Finish a meal');
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"]')).toContainText('No meals in the last 30 days. Start a meal from Today');
});

test('a due check reads 0 min on its closed dial', async ({ page }) => {
  const meals = [
    ...WEEK.meals,
    { id: 8, day: '2026-09-27', name: 'Lunch', startedAt: ms('2026-09-27T17:00'), finishedAt: ms('2026-09-27T17:30'), hungerBefore: 7, stop: 'before_full', fullnessNow: 5, fullness20DueAt: ms('2026-09-27T17:50') },
  ];
  await openAt(page, '2026-09-27T18:02', '#satiety');
  await seed(page, { ...WEEK, meals, settings: install });
  await tap(page, 'close-sheet');
  await choose(page, 'satiety-view', 'now');
  await expect(page.getByTestId('fullness-check')).toContainText('Time to score it.');
  await expect(page.locator('.check-hero .dial-figure')).toHaveText('0 min');
});

test('Add a meal put away unsaved marks no later meal as just added', async ({ page }) => {
  await openAt(page, '2026-09-27T18:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await tap(page, 'add-meal');
  await tap(page, 'close-sheet');
  await expect(page.locator('[data-sheet="add-meal"]')).toHaveCount(0);
  // A meal started from Today, then the list again.
  await page.locator('.tab[data-tab="today"]').click();
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await page.locator('.tab[data-tab="satiety"]').click();
  await choose(page, 'satiety-view', 'meals');
  await expect(page.locator('[data-block="satiety-meals"] [data-meal]').first()).toBeVisible();
  await expect(page.locator('.meal-list > li.fresh')).toHaveCount(0);
});

test('lag lines that end together keep both end marks, side by side, and every right figure carries its shape', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  const lag = page.getByTestId('lag-chart');
  await expect(lag.locator('line[data-lag]')).toHaveCount(3);
  // Left wanting and Satisfied both land on 7.0.
  await expect(lag).toContainText('7.0 +2.0');
  const got = await lag.evaluate((svg) => {
    const centre = (p) => { const b = p.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const ends = [...svg.querySelectorAll('.lag-ends > path[data-stop]')].map(centre);
    const posts = [116, 236].map((X) => ends.filter((p) => Math.abs(p.x - X) < 12));
    const marked = [...svg.querySelectorAll('.lag-label')].map((g) => !!g.querySelector('path[data-stop]'));
    return { count: ends.length, posts, marked };
  });
  // Two end marks per line, one at each post.
  expect(got.count).toBe(6);
  expect(got.posts.map((p) => p.length)).toEqual([3, 3]);
  // No mark hides another at either post.
  for (const post of got.posts) {
    for (let i = 0; i < post.length; i++) {
      for (let j = i + 1; j < post.length; j++) {
        const apart = Math.abs(post[i].x - post[j].x) >= 10 || Math.abs(post[i].y - post[j].y) >= 10;
        expect(apart, JSON.stringify([post[i], post[j]])).toBe(true);
      }
    }
  }
  expect(got.marked).toHaveLength(3);
  expect(got.marked.every(Boolean)).toBe(true);
});

test.describe('at 320 wide', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('the table fits its card, and its heads share one baseline', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#satiety');
    await seed(page, { ...WEEK, settings: install });
    await tap(page, 'satiety-table');
    const fit = await page.getByTestId('satiety-table').evaluate((t) => {
      const card = t.closest('.table-card').getBoundingClientRect();
      const heads = [...t.querySelectorAll('th')].map((th) => th.getBoundingClientRect());
      return { over: t.getBoundingClientRect().right - card.right, bottoms: heads.map((b) => Math.round(b.bottom)) };
    });
    expect(fit.over).toBeLessThanOrEqual(-4);
    expect(new Set(fit.bottoms).size).toBe(1);
  });
});
