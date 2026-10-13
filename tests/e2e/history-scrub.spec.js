// Scrubbing along the History chart (owner's answer, 12 October 2026): touch
// or drag reads the day under the finger, like the Weight chart. Tapping still
// selects a day; the readout and Open this day follow.
import { test, expect, openAt, seed, choose, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

/** Fourteen days of windows, 13 to 26 Sep, 17:00 for 3 h plus a few minutes each day. */
function fortnight() {
  const days = [];
  for (let d = 13; d <= 26; d++) {
    const day = `2026-09-${d}`;
    const firstBite = ms(`${day}T17:00`);
    days.push({ day, firstBite, lastBite: firstBite + (180 + d) * 60_000 });
  }
  return days;
}
const install = settings({ installedAt: ms('2026-09-13T08:00') });

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
const early = settings({ installedAt: ms('2026-07-01T08:00') });

/** The page x of day i of n on the History chart (viewBox 340 wide, plot from 32 to 332). */
async function dayX(chart, i, n) {
  const box = await chart.boundingBox();
  return { x: box.x + (box.width * (32 + (300 / n) * (i + 0.5))) / 340, y: box.y + box.height / 2 };
}

test('a drag along the chart reads each day under the pointer, in place, and Open this day follows', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, { days: fortnight(), settings: install });
  await choose(page, 'history-metric', 'feast');
  await expect(page.locator('.history[data-metric="feast"] [data-testid="history-chart"]')).toBeVisible();
  const chart = page.getByTestId('history-chart');
  const readout = page.getByTestId('history-readout');
  await expect(readout).toContainText('Sat 26 Sep: window 3 h 26 min.');
  // The chart is not redrawn under the finger: the same element all along.
  await chart.evaluate((el) => { el.dataset.probe = 'kept'; });

  const start = await dayX(chart, 2, 14); // 15 Sep
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(readout).toContainText('Tue 15 Sep: window 3 h 15 min.');
  // Mid-drag, the day sits at the top of the chart with a crosshair.
  for (const i of [4, 6, 8]) {
    const p = await dayX(chart, i, 14);
    await page.mouse.move(p.x, p.y, { steps: 3 });
  }
  await expect(chart).toHaveClass(/scrubbing/);
  await expect(chart.locator('.date-tag')).toHaveText('Mon 21 Sep');
  await expect(readout).toContainText('Mon 21 Sep: window 3 h 21 min.');
  await expect(chart.locator('rect[data-day="2026-09-21"]')).toHaveAttribute('fill', '#0E0E12');
  await expect(chart.locator('rect[data-day="2026-09-26"]')).toHaveAttribute('fill', '#2FCB57');
  await page.mouse.up();
  await expect(chart).not.toHaveClass(/scrubbing/);
  await expect(chart).toHaveAttribute('data-probe', 'kept');

  // The pick stays through a redraw, and Open this day opens it.
  await page.locator('[data-action="history-toggle-table"]').click();
  await expect(readout).toContainText('Mon 21 Sep: window 3 h 21 min.');
  await page.locator('[data-action="history-open-day"]').click();
  await expect(page.locator('.day[data-day="2026-09-21"]')).toBeVisible();
});

test('a tap still selects one day, and the arrow keys step from it', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, WEEK);
  await choose(page, 'history-metric', 'feast');
  await expect(page.locator('.history[data-metric="feast"] [data-testid="history-chart"]')).toBeVisible();
  const chart = page.getByTestId('history-chart');
  const readout = page.getByTestId('history-readout');
  const p = await dayX(chart, 1, 7); // Mon 21 Sep
  await page.mouse.click(p.x, p.y);
  // Monday opened before 16:00: a miss, read with its words.
  await expect(readout).toContainText('Mon 21 Sep: window');
  await expect(readout).toContainText('a miss.');
  // On 7 days there is no tag: each day is named under its bar.
  await expect(chart).not.toHaveClass(/scrubbing/);
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout).toContainText('Tue 22 Sep:');
  await expect(chart.locator('rect[data-day="2026-09-22"]')).toHaveAttribute('fill', '#0E0E12');
  await expect(chart.locator('rect[data-day="2026-09-21"]')).toHaveAttribute('fill', /^url\(#miss-hatch/);
});

test('while a legend filter is on, a drag still reads days and the filter keeps fading the rest', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, WEEK);
  await choose(page, 'history-metric', 'feast');
  await expect(page.locator('.history[data-metric="feast"] [data-testid="history-chart"]')).toBeVisible();
  await page.getByTestId('history-legend').locator('button[data-series="miss"]').click();
  const chart = page.getByTestId('history-chart');
  const a = await dayX(chart, 6, 7);
  const b = await dayX(chart, 5, 7);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('history-readout')).toContainText('Fri 25 Sep:');
  await expect(chart.locator('rect[data-day="2026-09-25"]')).toHaveClass(/dim/);
  await expect(chart.locator('rect[data-day="2026-09-25"]')).toHaveAttribute('fill', '#0E0E12');
  await expect(chart.locator('rect[data-miss="true"].dim')).toHaveCount(0);
  // A faded label fades to the quiet tone only: neither of its lines loses opacity.
  const opacities = await chart.locator('text.bar-value tspan').evaluateAll((els) => els.map((e) => getComputedStyle(e).fillOpacity));
  expect(opacities.length).toBeGreaterThan(0);
  expect(new Set(opacities)).toEqual(new Set(['1']));
});

test('a finger dragged along the chart reads each day; a scroll that starts on it changes nothing', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch drags are sent through the Chromium DevTools protocol');
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, { days: fortnight(), settings: install });
  await choose(page, 'history-metric', 'feast');
  await expect(page.locator('.history[data-metric="feast"] [data-testid="history-chart"]')).toBeVisible();
  const chart = page.getByTestId('history-chart');
  const readout = page.getByTestId('history-readout');
  await chart.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  // Drag from 14 Sep to 23 Sep.
  let from = await dayX(chart, 1, 14);
  let to = await dayX(chart, 10, 14);
  await touch('touchStart', from.x, from.y);
  for (let i = 1; i <= 10; i++) await touch('touchMove', from.x + ((to.x - from.x) * i) / 10, from.y);
  await touch('touchEnd');
  await expect(readout).toContainText('Wed 23 Sep:');
  await expect(chart.locator('rect[data-day="2026-09-23"]')).toHaveAttribute('fill', '#0E0E12');

  // An upward swipe that starts on the chart scrolls the page; the day stays 23 Sep.
  await chart.scrollIntoViewIfNeeded();
  from = await dayX(chart, 3, 14);
  const box = await chart.boundingBox();
  const low = box.y + box.height * 0.7;
  await touch('touchStart', from.x, low);
  for (let i = 1; i <= 10; i++) await touch('touchMove', from.x, low - i * 30);
  await touch('touchEnd');
  await expect(readout).toContainText('Wed 23 Sep:');
  await expect(chart.locator('rect[data-day="2026-09-23"]')).toHaveAttribute('fill', '#0E0E12');
});

test('a chosen day with no mark still shows: a paused day and an empty day keep the crosshair, and so does a miss', async ({ page }) => {
  await openAt(page, '2026-09-26T23:00', '#history');
  await seed(page, { ...WEEK, days: WEEK.days.map((d) => (d.day === '2026-09-24' ? { ...d, paused: 'travel' } : d)) });
  await choose(page, 'history-metric', 'feast');
  await choose(page, 'history-range', '7');
  const chart = page.getByTestId('history-chart');
  const band = chart.locator('rect[data-paused="2026-09-24"]');
  await band.click();
  await expect(page.getByTestId('history-readout')).toContainText('Thu 24 Sep: paused');
  // The band keeps no edge: the crosshair runs through it.
  await expect(band).not.toHaveAttribute('stroke', /./);
  await expect(chart).toHaveClass(/pick-bare/);
  await expect(chart.locator('line.scrub-part')).toHaveCSS('opacity', '1');
  await expect(chart.locator('line.scrub-part')).toHaveAttribute('x1', String(((32 + (300 / 7) * 4.5)).toFixed(1)));
  // Its name under the axis is in ink; the legend keeps no Selected day key, as no mark is chosen.
  await expect(chart.locator('text.x-chosen')).toHaveText('Th 24');
  const pickKey = page.getByTestId('history-legend').locator('.legend-item', { hasText: 'Selected day' });
  await expect(pickKey).toBeHidden();
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('history-readout')).toContainText('Fri 25 Sep:');
  await expect(chart).not.toHaveClass(/pick-bare/);
  await expect(chart.locator('text.x-chosen')).toHaveText('Fr 25');
  await expect(pickKey).toBeVisible();
  // A chosen miss over 7 days keeps its stripes and its ink edge, and no
  // crosshair (its label stands over it): its day under the axis turns ink.
  for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('history-readout')).toContainText('Mon 21 Sep:');
  await expect(chart.locator('rect[data-day="2026-09-21"]')).toHaveAttribute('fill', /^url\(#miss-hatch/);
  await expect(chart.locator('rect[data-day="2026-09-21"]')).toHaveAttribute('stroke', '#0E0E12');
  await expect(chart.locator('line.scrub-part')).toHaveCSS('opacity', '0');
  await expect(chart.locator('text.x-chosen')).toHaveCount(1);
  await expect(chart.locator('text.x-chosen')).toHaveText('Mo 21');
  // Over more than 7 days, a tap on a day with nothing recorded leaves the crosshair on it.
  await seed(page, { days: fortnight().filter((d) => d.day !== '2026-09-18'), settings: install });
  await choose(page, 'history-metric', 'feast');
  await choose(page, 'history-range', '30');
  await expect(chart.locator('rect[data-day]')).toHaveCount(13);
  // The screen may still redraw once after the seed: tap again until the day is read.
  await expect(async () => {
    const p = await dayX(chart, 5, 14);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('history-readout')).toContainText('Fri 18 Sep: no window recorded.', { timeout: 500 });
  }).toPass();
  await expect(chart).toHaveClass(/pick-bare/);
  await expect(chart.locator('line.scrub-part')).toHaveCSS('opacity', '1');
});

test('Weight: keyboard focus shows the latest day, and a mouse let go outside the chart ends the press', async ({ page }) => {
  const weights = [];
  for (let d = 10; d <= 26; d++) weights.push({ date: `2026-09-${d}`, kg: 104 - d * 0.05 });
  await openAt(page, '2026-09-27T09:00', '#weight');
  await seed(page, { weights, settings: settings({ weightRange: '1m' }) });
  const chart = page.locator('[data-block="chart"] svg.chart');
  await page.locator('[data-block="chart"] button[data-choice="weight-range"][data-value="all"]').focus();
  await page.keyboard.press('Tab');
  await expect(chart).toBeFocused();
  await expect(chart).toHaveClass(/chosen-on/);
  await chart.evaluate((el) => el.blur());
  await expect(chart).not.toHaveClass(/chosen-on/);
  // Press on the latest day, drag straight down off the chart, let go there.
  const latest = await chart.locator('rect.latest').boundingBox();
  const box = await chart.boundingBox();
  await page.mouse.move(latest.x + latest.width / 2, latest.y + latest.height / 2);
  await page.mouse.down();
  await expect(chart).toHaveClass(/chosen-on/);
  await page.mouse.move(latest.x + latest.width / 2, box.y + box.height + 120, { steps: 4 });
  await page.mouse.up();
  await expect(chart).not.toHaveClass(/chosen-on/);
});

/**
 * Every value label sits with its own mark: its box ends between 1 unit into
 * and 20 units above the top of the day's mark, or, where it rose over a
 * line, within 14 units above the highest line that runs between it and the
 * mark in its column. No line runs through a label's box: the 7-day trend
 * (sampled every unit along its path), the average and, in Line, the day
 * line, so no label needs its fallback plate. Returns the faults.
 * A chart a redraw just removed has no boxes to measure, so it says so and
 * the caller polls for the chart in place.
 */
async function linesThroughLabels(chart) {
  return chart.evaluate((svg) => {
    if (!svg.isConnected) return ['redrawn'];
    const faults = [];
    const line = svg.dataset.kind === 'line' ? svg.querySelector('path[data-series="bar"]') : null;
    // The top of a day's mark: its square or bar, or else the day line's point at x.
    const markTop = (day, x) => {
      const r = svg.querySelector(`rect[data-day="${day}"]`);
      if (r) return Number(r.getAttribute('y'));
      if (!line) return null;
      let best = null;
      const len = line.getTotalLength();
      for (let l = 0; l <= len; l += 0.5) {
        const pt = line.getPointAtLength(l);
        if (!best || Math.abs(pt.x - x) < Math.abs(best.x - x)) best = pt;
      }
      return best && Math.abs(best.x - x) < 1 ? best.y : null;
    };
    const plates = [...svg.querySelectorAll('line.label-plate')].map((p) => {
      const half = Number(p.getAttribute('stroke-width')) / 2;
      const y = Number(p.getAttribute('y1'));
      return { x0: Number(p.getAttribute('x1')), x1: Number(p.getAttribute('x2')), y0: y - half, y1: y + half };
    });
    const covered = (b) => plates.some((p) => p.x0 <= b.x0 + 1 && p.x1 >= b.x1 - 1 && p.y0 <= b.y0 + 1 && p.y1 >= b.y1 - 1);
    const boxes = [...svg.querySelectorAll('text.bar-value')].map((t) => {
      const b = t.getBBox();
      return { day: t.dataset.valueFor, cx: b.x + b.width / 2, x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height };
    });
    // Every point of the lines, sampled every unit; the average every unit across.
    const pts = [];
    for (const p of [svg.querySelector('[data-testid="trend-line"]'), line].filter(Boolean)) {
      const len = p.getTotalLength();
      for (let l = 0; l <= len; l += 1) pts.push(p.getPointAtLength(l));
    }
    const avg = svg.querySelector('[data-testid="avg-line"]');
    if (avg) {
      const ay = Number(avg.getAttribute('y1'));
      for (let x = Number(avg.getAttribute('x1')); x <= Number(avg.getAttribute('x2')); x += 1) pts.push({ x, y: ay });
    }
    for (const b of boxes) {
      const top = markTop(b.day, b.cx);
      if (top == null) { faults.push(`${b.day} no mark`); continue; }
      const gap = top - b.y1;
      if (gap < -1) faults.push(`${b.day} label ${gap.toFixed(1)} into its mark`);
      else if (gap > 20) {
        // Risen over a line: only as far as the highest line under it in its column.
        const under = pts.filter((pt) => pt.x > b.x0 && pt.x < b.x1 && pt.y > b.y1 && pt.y < top + 1);
        const hi = under.length ? Math.min(...under.map((pt) => pt.y)) : null;
        if (hi == null) faults.push(`${b.day} label floats ${gap.toFixed(1)} over its mark`);
        else if (hi - b.y1 > 14) faults.push(`${b.day} label ${(hi - b.y1).toFixed(1)} over the line it rose over`);
      }
    }
    const inside = (b, pt) => pt.x > b.x0 && pt.x < b.x1 && pt.y > b.y0 && pt.y < b.y1;
    for (const b of boxes) if (pts.some((pt) => inside(b, pt)) && !covered(b)) faults.push(`${b.day} crossed by a line`);
    // Each label found room over its lines: none needed the fallback plate.
    if (plates.length) faults.push(`${plates.length} label plates`);
    return [...new Set(faults)];
  });
}

for (const [name, data] of [['sixty days', () => ({ days: sixtyDays(), settings: early })], ['the week seed', () => WEEK], ['a close week', () => ({ days: closeWeek(), settings: early })]]) {
  test(`over 7 days each value label sits on its mark, and no line runs through it (${name})`, async ({ page }) => {
    await openAt(page, '2026-09-26T23:00', '#history');
    await seed(page, data());
    await choose(page, 'history-range', '7');
    const chart = page.getByTestId('history-chart');
    for (const metric of ['fast', 'feast']) {
      await choose(page, 'history-metric', metric);
      for (const kind of ['bars', 'line']) {
        await choose(page, 'history-chart', kind);
        await expect(page.locator(`.history[data-metric="${metric}"] [data-testid="history-chart"][data-kind="${kind}"]`)).toBeVisible();
        await expect(chart.locator('text.bar-value').first()).toBeVisible();
        await expect.poll(() => linesThroughLabels(chart), { message: `${metric} ${kind}` }).toEqual([]);
      }
    }
  });
}
