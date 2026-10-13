// History (Fast and Feast), Weight and the import page in every state, shot at
// 390 x 844 for design review (test-results/screens, names starting with H),
// each with the contrast audit of shot(). Then, in every browser, History and
// Weight fit every iPhone width (320 is iPhone SE with Display Zoom).
import { test, expect, openAt, seed, tap, choose, settings, ms, shot } from './helpers.js';
import { WEEK } from './seed-data.js';

/** Ninety-four days of windows up to Saturday 26 September, fasts near 20 h 40 min, most reaching the goal. */
function denseDays() {
  const DAY = 86_400_000;
  const base = ms('2026-06-25T00:00');
  return Array.from({ length: 94 }, (_, i) => {
    const key = new Date(base + i * DAY + 3 * 3_600_000).toISOString().slice(0, 10);
    const firstBite = base + i * DAY + (16 * 60 + 30 + ((i * 37) % 150)) * 60_000;
    return { day: key, firstBite, lastBite: firstBite + (150 + ((i * 53) % 110)) * 60_000 };
  });
}

test.describe('screens, shot in WebKit', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

  const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });

  /** Sixty days of windows up to Saturday 26 September; weekends open earlier; one day unlogged, three paused. */
  function sixtyDays() {
    const DAY = 86_400_000;
    const base = ms('2026-07-29T00:00');
    const days = [];
    for (let i = 0; i < 60; i++) {
      if (i === 12) continue;
      const key = new Date(base + i * DAY + 3 * 3_600_000).toISOString().slice(0, 10);
      if (i >= 44 && i <= 46) {
        days.push({ day: key, paused: 'travel' });
        continue;
      }
      const weekend = [5, 6].includes(new Date(`${key}T12:00:00Z`).getUTCDay());
      const start = (weekend ? 13 * 60 : 16 * 60 + 30) + ((i * 37) % 150);
      const length = 150 + ((i * 53) % 110);
      const firstBite = base + i * DAY + start * 60_000;
      days.push({ day: key, firstBite, lastBite: firstBite + length * 60_000 });
    }
    return days;
  }

  /** Daily weigh-ins from 5 Jul to 26 Sep, drifting down. */
  function dailyWeights() {
    const w = [];
    let kg = 106.2;
    for (let d = new Date('2026-07-05T12:00:00Z'); d <= new Date('2026-09-26T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      kg -= 0.03 + (d.getUTCDate() % 3) * 0.01;
      w.push({ date: d.toISOString().slice(0, 10), kg: Math.round(kg * 10) / 10 });
    }
    return w;
  }

  /** About three weigh-ins a week from July, none for most of September. */
  function sparseWeights() {
    const weights = [];
    for (let d = new Date('2026-07-01T12:00:00Z'), i = 0; d <= new Date('2026-10-07T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1), i++) {
      const key = d.toISOString().slice(0, 10);
      if (key > '2026-09-02' && key < '2026-09-28') continue;
      if ([0, 2, 4].includes(d.getUTCDay()) || (i % 9 === 0)) weights.push({ date: key, kg: Math.round((106 - i * 0.03 + (i % 3) * 0.2) * 10) / 10 });
    }
    return weights;
  }

  /** Weigh-ins every other day from 20 Aug to 26 Sep. */
  function everyOtherDay() {
    const w = [];
    let kg = 104.8;
    for (let d = new Date('2026-08-20T12:00:00Z'); d <= new Date('2026-09-26T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 2)) {
      kg -= 0.08 + (d.getUTCDate() % 3) * 0.03;
      w.push({ date: d.toISOString().slice(0, 10), kg: Math.round(kg * 10) / 10 });
    }
    return w;
  }

  /** A normal week: seven fasts all near 20 h, 20 to 26 September. */
  function closeWeek() {
    const days = [];
    for (let d = 19; d <= 26; d++) {
      const day = `2026-09-${d}`;
      const firstBite = ms(`${day}T16:00`) + ((d * 7) % 25) * 60_000;
      days.push({ day, firstBite, lastBite: firstBite + (200 + ((d * 13) % 30)) * 60_000 });
    }
    return days;
  }

  const at = async (page, testid) => page.getByTestId(testid).evaluate((el) => el.scrollIntoView({ block: 'center' }));

  test('history: Fast as a line over 90 days, squares only on misses and the selected day', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { days: sixtyDays(), settings: [...install, ...settings({ historyRange: 90, historyChart: 'line' })] });
    const chart = page.getByTestId('history-chart');
    await expect(chart.locator('rect[data-day]:not([data-miss="true"])')).toHaveCount(1);
    await shot(page, 'H42c-history-fast-line-90');
    // Most days reaching the goal, over 90 days: still only the selected day and the misses.
    await seed(page, { days: denseDays(), settings: settings({ installedAt: ms('2026-06-01T08:00'), historyRange: 90, historyChart: 'line' }) });
    await expect(chart.locator('rect[data-day]:not([data-miss="true"])')).toHaveCount(1);
    await shot(page, 'H42d-history-fast-line-90-most-goal');
  });

  test('history: fast and feast, bars and line, ranges, reading, table', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { days: sixtyDays(), settings: install });
    await shot(page, 'H40-history-fast-bars-30');
    await at(page, 'history-readout');
    await shot(page, 'H40b-history-fast-reading');
    await page.evaluate(() => window.scrollTo(0, 0));
    await choose(page, 'history-chart', 'line');
    await shot(page, 'H41-history-fast-line-30');
    await choose(page, 'history-range', '7');
    await shot(page, 'H41b-history-fast-line-7');
    await at(page, 'history-readout');
    await shot(page, 'H41f-history-line-reading');
    await page.evaluate(() => window.scrollTo(0, 0));
    await choose(page, 'history-chart', 'bars');
    await shot(page, 'H41c-history-fast-bars-7');
    await choose(page, 'history-metric', 'feast');
    await choose(page, 'history-range', '90');
    await choose(page, 'history-chart', 'line');
    await shot(page, 'H42-history-feast-line-90');
    await choose(page, 'history-chart', 'bars');
    await shot(page, 'H42b-history-feast-bars-90');
    await choose(page, 'history-range', '7');
    await page.getByTestId('history-chart').locator('rect[data-day="2026-09-23"]').click();
    await shot(page, 'H43-history-feast-bars-7');
    await at(page, 'history-readout');
    await shot(page, 'H43b-history-feast-miss-reading');
    await tap(page, 'history-toggle-table');
    await shot(page, 'H44-history-table', { full: true });
    await page.getByTestId('history-table').locator('tbody tr').nth(4).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, 120));
    await shot(page, 'H44b-history-table-sticky-head');
  });

  test('history: the fast table over 30 days, its head held while it scrolls, and at 320', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { days: sixtyDays(), settings: install });
    await tap(page, 'history-toggle-table');
    // A row meets the held head's lower edge, so no row shows cut in half under it.
    await page.getByTestId('history-table').locator('tbody tr').nth(12).evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -el.closest('table').querySelector('th').getBoundingClientRect().height);
    });
    await expect.poll(() => page.getByTestId('history-table').locator('th').first().evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    await shot(page, 'H44c-history-fast-table-30-sticky');
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByTestId('history-table').locator('tbody tr').nth(6).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await shot(page, 'H44d-history-fast-table-320');
  });

  test('history: a week of close values, each label on its own mark', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { days: closeWeek(), settings: [...install, ...settings({ historyRange: 7 })] });
    await page.getByTestId('history-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, 'H41d-history-close-week-bars');
    await choose(page, 'history-chart', 'line');
    await page.getByTestId('history-chart').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, 'H41e-history-close-week-line');
  });

  test('history: the week seed, a paused day read, legend filters', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { ...WEEK, days: WEEK.days.map((d) => (d.day === '2026-09-24' ? { ...d, paused: 'travel' } : d)), settings: install });
    await choose(page, 'history-metric', 'feast');
    await choose(page, 'history-range', '7');
    await page.getByTestId('history-chart').locator('rect[data-paused="2026-09-24"]').click();
    await expect(page.getByTestId('history-readout')).toHaveText('Thu 24 Sep: paused for travel.');
    await at(page, 'history-legend');
    await shot(page, 'H46-history-paused-reading');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('history-legend').locator('button[data-series="miss"]').click();
    await shot(page, 'H76b-history-misses-only');
    await shot(page, 'H76-history-legend-full', { full: true });
  });

  test('history: scrubbing along the chart, and its focus ring', async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, { days: sixtyDays(), settings: install });
    const chart = page.getByTestId('history-chart');
    const box = await chart.boundingBox();
    const mid = box.y + box.height / 2;
    // A finger held down mid-drag: the crosshair and the day at the top.
    await page.mouse.move(box.x + box.width * 0.3, mid);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.04), mid);
    await expect(chart).toHaveClass(/scrubbing/);
    await shot(page, 'H47-history-scrubbing');
    await page.mouse.up();
    await expect(chart).not.toHaveClass(/scrubbing/);
    await at(page, 'history-readout');
    await shot(page, 'H47b-history-after-scrub-reading');
    // Keyboard: the ring on the chart, arrows step the day.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-block="history-controls"]').locator('button[data-choice="history-chart"][data-value="line"]').focus();
    await page.keyboard.press('Tab');
    await expect(chart).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await shot(page, 'H47c-history-chart-focus');
  });

  test('history: empty, then at 320 wide', async ({ page }) => {
    await openAt(page, '2026-09-27T09:00', '#history');
    // Nothing logged: the lead with no figure, both switches, and an empty
    // chart frame holding the metric's own line; no legend, reading or table.
    const empty = page.locator('.history.empty');
    await expect(empty.locator('.empty-words')).toHaveText('Fasts appear here from the day after your first logged window.');
    await expect(empty.getByTestId('history-summary')).toHaveText('Nothing yet in the last 30 days.');
    await expect(empty.locator('.chart-lead .label')).toHaveText('Average fast');
    await expect(empty.locator('svg.empty-art')).toBeVisible();
    await expect(empty.locator('[data-block="history-controls"] [data-choice="history-chart"]')).toHaveCount(2);
    await expect(empty.locator('svg.chart, .legend, [data-testid="history-readout"]')).toHaveCount(0);
    await shot(page, 'H45-history-empty');
    await choose(page, 'history-metric', 'feast');
    await expect(empty.locator('.empty-words')).toHaveText('Your eating windows appear here once you close one.');
    await expect(empty.locator('.chart-lead .label')).toHaveText('Average window');
    await expect(empty.locator('svg.chart, .legend')).toHaveCount(0);
    await shot(page, 'H45b-history-feast-empty');
    await page.setViewportSize({ width: 320, height: 700 });
    await choose(page, 'history-metric', 'fast');
    await seed(page, { days: sixtyDays(), settings: install });
    await shot(page, 'H48-history-320');
  });

  test('history: nothing in the days shown, with earlier fasts', async ({ page }) => {
    await openAt(page, '2026-10-10T09:00', '#history');
    await seed(page, { days: sixtyDays(), settings: install });
    await choose(page, 'history-range', '7');
    const empty = page.locator('.history.empty');
    await expect(empty.getByTestId('history-summary')).toHaveText('Nothing yet in the last 7 days.');
    await expect(empty.locator('.empty-words')).toHaveText('Fasts appear here from the day after your first logged window.');
    await expect(empty.locator('svg.empty-art')).toBeVisible();
    await expect(empty.locator('svg.chart, .legend')).toHaveCount(0);
    await shot(page, 'H45c-history-range-empty');
    await choose(page, 'history-range', '30');
    await expect(page.getByTestId('history-average')).toBeVisible();
  });

  test('weight: daily weigh-ins, time frames, a day chosen, table', async ({ page }) => {
    await openAt(page, '2026-09-27T09:00', '#weight');
    await seed(page, { weights: dailyWeights(), settings: install });
    await shot(page, 'H32-weight');
    await shot(page, 'H32f-weight-full', { full: true });
    await choose(page, 'weight-range', '1m');
    await shot(page, 'H32b-weight-1-month');
    // Keyboard focus on the chart shows the day it is on, the latest included.
    await page.locator('[data-block="chart"] button[data-choice="weight-range"][data-value="all"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-block="chart"] svg.chart')).toBeFocused();
    await expect(page.locator('[data-block="chart"] svg.chart')).toHaveClass(/chosen-on/);
    await shot(page, 'H32k-weight-chart-focus');
    await choose(page, 'weight-range', 'all');
    await shot(page, 'H32g-weight-all');
    await choose(page, 'weight-range', '3m');
    await page.locator('[data-block="chart"] svg.chart').click({ position: { x: 120, y: 80 } });
    await expect(page.locator('[data-action="weight-latest"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'H32h-weight-day-chosen-daily');
    await tap(page, 'toggle-table');
    await shot(page, 'H33-weight-table', { full: true });
  });

  test('weight: a few weigh-ins a week, with dots and a break in the line', async ({ page }) => {
    await openAt(page, '2026-10-08T09:00', '#weight');
    await seed(page, { weights: sparseWeights(), settings: [...install, ...settings({ weightRange: '3m' })] });
    await page.locator('[data-block="chart"]').scrollIntoViewIfNeeded();
    await shot(page, 'H32c-weight-sparse');
    const chart = page.locator('[data-block="chart"] svg.chart');
    const box = await chart.boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height / 2);
    await expect(page.locator('[data-action="weight-latest"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'H32e-weight-day-chosen');
    await tap(page, 'toggle-table');
    await shot(page, 'H32d-weight-sparse-table', { full: true });
  });

  test('weight: weigh-ins every other day over a month keep their dots', async ({ page }) => {
    await openAt(page, '2026-09-27T09:00', '#weight');
    await seed(page, { weights: everyOtherDay(), settings: [...install, ...settings({ weightRange: '1m' })] });
    await expect(page.locator('[data-block="chart"] circle.weigh-in').first()).toBeVisible();
    await page.locator('[data-block="chart"]').scrollIntoViewIfNeeded();
    await shot(page, 'H32j-weight-every-other-day-1-month');
  });

  test('weight: empty, a failed import with the paste box, 320 wide', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'hello', writeText: async () => {} }, configurable: true });
    });
    await openAt(page, '2026-09-27T09:00', '#weight');
    await shot(page, 'H36-weight-empty');
    await tap(page, 'import-weight');
    await expect(page.getByTestId('paste-target')).toBeVisible();
    await page.getByTestId('paste-target').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, 'H36b-weight-paste');
    await page.setViewportSize({ width: 320, height: 700 });
    await seed(page, { weights: dailyWeights(), settings: install });
    await shot(page, 'H32i-weight-320');
    await page.locator('[data-block="import"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await shot(page, 'H36c-weight-import-320');
  });

  test('import page: saved, failed, and loading', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
    await page.goto('./import/#w=2026-09-20:104.6,2026-09-21:104.3,2026-09-22:104.1');
    await expect(page.getByTestId('import-result')).toBeVisible();
    await shot(page, 'H37-import-page');
    await page.goto('about:blank');
    await page.goto('./import/#w=2026-09-26:229.5,2026-02-30:104,2026-09-28:104.1');
    await expect(page.getByTestId('import-result')).toContainText('Nothing imported');
    await shot(page, 'H37b-import-page-failed');
    // The page before its script has run: the skeleton (the script is held back).
    await page.route('**/js/import-page.js', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto('about:blank');
    await page.goto('./import/#w=2026-09-20:104.6');
    await expect(page.locator('#view .sk-dock')).toBeVisible();
    await shot(page, 'H37c-import-page-loading');
  });
});

// History and Weight fit the screen on every iPhone width: the tables stay
// inside their cards, the import card's outlines stay inside theirs, and the
// page never scrolls sideways.
test.describe('fit on every width', () => {
  const early = settings({ installedAt: ms('2026-06-01T08:00') });

  /** Daily weigh-ins from 5 Jul to 26 Sep. */
  function fitWeights() {
    const w = [];
    let kg = 106.2;
    for (let d = new Date('2026-07-05T12:00:00Z'); d <= new Date('2026-09-26T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      kg -= 0.03 + (d.getUTCDate() % 3) * 0.01;
      w.push({ date: d.toISOString().slice(0, 10), kg: Math.round(kg * 10) / 10 });
    }
    return w;
  }

  /** The table's right edge against its card's inner edge, and the page's width against the screen's. */
  const fit = (page, testid) => page.getByTestId(testid).evaluate((t) => {
    const card = t.closest('.card');
    const cs = getComputedStyle(card);
    const inner = card.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    return { over: t.getBoundingClientRect().right - inner, page: document.documentElement.scrollWidth, screen: window.innerWidth };
  });

  for (const width of [320, 375, 390]) {
    test(`History Fast over 30 days, as a table, fits at ${width} wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openAt(page, '2026-09-26T23:00', '#history');
      await seed(page, { days: denseDays(), settings: early });
      await tap(page, 'history-toggle-table');
      const r = await fit(page, 'history-table');
      expect(r.over).toBeLessThanOrEqual(0.5);
      expect(r.page).toBe(r.screen);
      // A day that is a miss still reads as one cell.
      await expect(page.getByTestId('history-table').locator('tbody tr').first().locator('td').first()).toHaveText(/^\w{3} \d{1,2} \w{3}(, miss)?$/);
    });

    test(`the Weight table and the import card fit at ${width} wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openAt(page, '2026-09-27T09:00', '#weight');
      await seed(page, { weights: fitWeights(), settings: early });
      await tap(page, 'toggle-table');
      const r = await fit(page, 'weight-table');
      expect(r.over).toBeLessThanOrEqual(0.5);
      expect(r.page).toBe(r.screen);
      const out = await page.locator('[data-block="import"] .import-more').evaluate((box) => {
        const card = box.closest('[data-block="import"]');
        const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
        return Math.max(...[...box.children].map((b) => b.getBoundingClientRect().right - inner));
      });
      expect(out).toBeLessThanOrEqual(0.5);
    });
  }

  test('the empty Weight page fits at 320 wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openAt(page, '2026-09-27T09:00', '#weight');
    await expect(page.locator('[data-block="import"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
});
