import { test, expect, openAt, tap, choose, readDb, seed, settings, ms } from './helpers.js';

// 14 days up to Sunday 27 Sep. 21 Sep appears twice: the later value wins.
const DAYS = [
  ['2026-09-14', 105.8], ['2026-09-15', 105.9], ['2026-09-16', 105.4], ['2026-09-17', 105.6],
  ['2026-09-18', 105.1], ['2026-09-19', 105.3], ['2026-09-20', 104.9], ['2026-09-21', 104.6],
  ['2026-09-21', 104.7], ['2026-09-22', 104.8], ['2026-09-23', 104.3], ['2026-09-24', 104.6],
  ['2026-09-25', 104.2], ['2026-09-26', 104.1], ['2026-09-27', 103.9],
];
const PAYLOAD = `w=${DAYS.map(([d, kg]) => `${d}:${kg}`).join(',')}`;
const RAW = [...new Set(DAYS.map(([, kg]) => kg.toFixed(1)))];
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

/** Import messages give counts only, never a weight. */
async function expectNoRawValues(page) {
  const text = await bodyText(page);
  for (const v of RAW) expect(text, `an import message never shows a weight (${v})`).not.toContain(v);
  expect(text).not.toMatch(/\d{2,3},\d/); // no comma-decimal forms either
}

test('import link: hash cleared, duplicates resolved, counts only', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
  await page.goto(`./import/#${PAYLOAD}`);
  await expect(page.getByTestId('import-result')).toHaveText('Imported 14 entries.');
  expect(new URL(page.url()).hash).toBe('');
  await expectNoRawValues(page);

  const db = await readDb(page);
  expect(db.weights).toHaveLength(14);
  expect(db.weights.find((w) => w.date === '2026-09-21').kg).toBe(104.7);

  // The Weight screen shows only averages: the 7-day average, its change, and the 7-day average over time,
  // whose latest point is the same figure as at the top.
  await page.getByRole('link', { name: 'Open Sabr' }).click();
  await expect(page.getByTestId('weight-average')).toHaveText('104.4 kg');
  await expect(page.getByTestId('weight-change')).toHaveText('Change from the 7 days before: −1.1 kg.');
  await expect(page.locator('.chart .latest')).toHaveCount(1);
  await expect(page.locator('.chart .chart-end')).toHaveText('104.4');

  // Re-importing overlapping days: unchanged days are counted as already saved.
  await page.goto('./import/#w=2026-09-20:104.9,2026-09-21:104.7,2026-09-22:104.8,2026-09-23:104.3,2026-09-24:104.6,2026-09-25:104.2,2026-09-26:104.1,2026-09-27:103.8');
  await expect(page.getByTestId('import-result')).toHaveText('Imported 1 entry. 7 already saved.');
  const db2 = await readDb(page);
  expect(db2.weights.find((w) => w.date === '2026-09-27').kg).toBe(103.8);
});

test('the import link works without a trailing slash (the redirect keeps the data)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
  await page.goto('./import#w=2026-09-25:104.2,2026-09-26:104.1,2026-09-27:103.9');
  await expect(page.getByTestId('import-result')).toHaveText('Imported 3 entries.');
  expect(new URL(page.url()).pathname).toBe('/sabr/import/');
  expect(new URL(page.url()).hash).toBe('');
});

test('the main address also accepts a Base64 link and clears it', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
  await page.goto(`./#b=${b64(PAYLOAD)}`);
  await expect(page.getByTestId('flash')).toHaveText('Imported 14 entries.');
  expect(new URL(page.url()).hash).toBe('#weight');
  await expectNoRawValues(page);
});

test('Import weight reads the clipboard (scrambled payload from the Shortcut)', async ({ page }) => {
  await page.addInitScript((text) => {
    Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => text, writeText: async () => {} }, configurable: true });
  }, b64(PAYLOAD));
  await openAt(page, '2026-09-27T09:00', '#weight');
  await expect(page.getByText('No weigh-ins yet')).toBeVisible();
  await tap(page, 'import-weight');
  await expect(page.getByTestId('flash')).toHaveText('Imported 14 entries.');
  await expect(page.getByTestId('weight-average')).toHaveText('104.4 kg');
  await expect(page.getByTestId('paste-target')).toHaveCount(0);
  await expectNoRawValues(page);
});

test('when the clipboard holds no weight data, a paste box takes a paste without showing it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'hello', writeText: async () => {} }, configurable: true });
  });
  await openAt(page, '2026-09-27T09:00', '#weight');
  await tap(page, 'import-weight');
  await expect(page.getByTestId('flash')).toContainText('No weight data found. Run the Fast Weight shortcut');
  const target = page.getByTestId('paste-target');
  await expect(target).toBeVisible();

  // Typing is refused: weight can never be typed in.
  await target.focus();
  await page.keyboard.type('w=2026-09-25:104');
  await expect(target).toHaveValue('');
  expect((await readDb(page)).weights).toHaveLength(0);

  // A paste is imported and never rendered.
  await target.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PAYLOAD);
  await expect(page.getByTestId('flash')).toHaveText('Imported 14 entries.');
  expect((await readDb(page)).weights).toHaveLength(14);
  await expectNoRawValues(page);
});

test('every weigh-in counts: one weigh-in is its own average, two are averaged', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00', '#weight');
  await seed(page, {
    weights: [{ date: '2026-09-26', kg: 104.1 }],
    settings: settings({ installedAt: ms('2026-09-20T08:00'), lastImportAt: ms('2026-09-27T08:00') }),
  });
  await expect(page.getByTestId('weight-average')).toHaveText('104.1 kg');
  await expect(page.locator('.chart .chart-end')).toHaveText('104.1');
  await seed(page, {
    weights: [{ date: '2026-09-26', kg: 104.1 }, { date: '2026-09-27', kg: 103.9 }],
    settings: settings({ installedAt: ms('2026-09-20T08:00'), lastImportAt: ms('2026-09-27T08:00') }),
  });
  await expect(page.getByTestId('weight-average')).toHaveText('104.0 kg');
  await tap(page, 'toggle-table');
  await expect(page.getByTestId('weight-table').locator('tbody tr')).toHaveText(['Sun 27 Sep104.0 kg2', 'Sat 26 Sep104.1 kg1']);
});

test('bad entries are skipped and reported by count only', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
  await page.goto('./import/#w=2026-09-26:229.5,2026-02-30:104,2026-09-28:104.1');
  await expect(page.getByTestId('import-result')).toContainText('Nothing imported. 3 entries skipped');
  expect((await readDb(page)).weights).toHaveLength(0);
});

test('the chart follows the 7-day average on each day with one, in the time frame chosen, with a note', async ({ page }) => {
  await openAt(page, '2026-10-08T09:00', '#weight');
  const weights = [
    ['2026-03-02', 100], ['2026-03-03', 101], ['2026-03-04', 102],
    ['2026-08-20', 104], ['2026-08-22', 103], ['2026-08-26', 102], ['2026-08-27', 101],
    ['2026-10-05', 100], ['2026-10-06', 99], ['2026-10-07', 98],
  ].map(([date, kg]) => ({ date, kg }));
  await seed(page, { weights, settings: settings({ installedAt: ms('2026-03-01T08:00'), lastImportAt: ms('2026-10-08T08:00') }) });
  const chart = page.locator('[data-block="chart"]');
  // The x of each point the line passes through, in order.
  const linePoints = async () => ((await chart.locator('svg.chart path').getAttribute('d')).match(/[ML][\d.]+ [\d.]+/g) || [])
    .map((t) => Number(t.slice(1).split(' ')[0]));
  const rows = page.getByTestId('weight-table').locator('tbody tr');
  await expect(page.getByTestId('weight-average')).toHaveText('99.0 kg');
  await expect(chart.locator('.chart-end')).toHaveText('99.0');
  await expect(chart.getByTestId('weight-chart-note')).toContainText('Each point is your 7-day average on a day you weighed in');
  // 3 months by default: a point on each of the 7 days with a weigh-in since July. The line runs through
  // August, breaks across September (no weigh-in for over a week), and runs again in October. The points
  // sit too close together for a mark each, so only the latest has one.
  await expect(chart.locator('button[data-choice="weight-range"][aria-checked="true"]')).toHaveText('3 months');
  await tap(page, 'toggle-table');
  await expect(rows).toHaveCount(7);
  expect(await linePoints()).toHaveLength(7);
  expect(((await chart.locator('svg.chart path').getAttribute('d')).match(/M/g) || []).length).toBe(2);
  await expect(chart.locator('svg.chart rect')).toHaveCount(1);
  // Placed by date: 7 Oct sits near the right end, 26 Aug about half way along the 3 months.
  const along = (v) => (v - 38) / (340 - 46 - 38);
  const xs = await linePoints();
  expect(along(xs[6])).toBeGreaterThan(0.97); // 7 Oct, of 8 Jul to 8 Oct
  expect(along(xs[2])).toBeGreaterThan(0.5); // 26 Aug: day 49 of 92
  expect(along(xs[2])).toBeLessThan(0.56);
  await choose(page, 'weight-range', '1m');
  await expect(rows).toHaveCount(3);
  await choose(page, 'weight-range', 'ytd');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toHaveText('Wed 7 Oct99.0 kg3');
  // The choice is remembered.
  await expect.poll(async () => (await readDb(page)).settings.find((s) => s.key === 'weightRange')?.value).toBe('ytd');
  await page.reload();
  await expect(page.locator('button[data-choice="weight-range"][aria-checked="true"]')).toHaveText('This year');

  // A time frame with no 7-day average says so, and keeps the note.
  await seed(page, { weights: weights.slice(0, 3), settings: settings({ installedAt: ms('2026-03-01T08:00'), weightRange: '1m' }) });
  await expect(chart.getByTestId('weight-chart-empty')).toHaveText('No 7-day average in this time yet.');
  await expect(chart.locator('svg.chart')).toHaveCount(0);
  await expect(chart.getByTestId('weight-chart-note')).toBeVisible();
});

test('with many weigh-ins the line carries them, and a weigh-in standing alone keeps its mark', async ({ page }) => {
  await openAt(page, '2026-10-08T09:00', '#weight');
  const weights = [];
  // Daily from 1 to 31 Jul, one on 15 Aug (more than a week from either side), daily again from 1 Sep.
  for (let d = 1; d <= 31; d++) weights.push({ date: `2026-07-${String(d).padStart(2, '0')}`, kg: 104 - d * 0.02 });
  weights.push({ date: '2026-08-15', kg: 103 });
  for (let d = 1; d <= 30; d++) weights.push({ date: `2026-09-${String(d).padStart(2, '0')}`, kg: 102 - d * 0.02 });
  for (let d = 1; d <= 7; d++) weights.push({ date: `2026-10-0${d}`, kg: 101.4 });
  await seed(page, { weights, settings: settings({ installedAt: ms('2026-07-01T08:00'), weightRange: '6m' }) });
  const chart = page.locator('[data-block="chart"] svg.chart');
  // Too close together for a mark each: the lone 15 Aug and the latest keep theirs.
  await expect(chart.locator('rect')).toHaveCount(2);
  await expect(chart.locator('rect.latest')).toHaveCount(1);
  expect(((await chart.locator('path').getAttribute('d')).match(/M/g) || []).length).toBe(2);
  // Chosen on the chart, the big box shows that single weigh-in as its 7-day average.
  await chart.focus();
  for (let i = 0; i < 37; i++) await chart.press('ArrowLeft');
  await expect(page.getByTestId('weight-average')).toHaveText('103.0 kg');
  await expect(page.getByTestId('weight-notes')).toContainText('15 Aug');
  await expect(page.getByTestId('weight-notes')).toContainText('1 of 7');
});

test('touching the chart moves the big box to that day; Back to latest, a new time frame or leaving returns', async ({ page }) => {
  await openAt(page, '2026-10-08T09:00', '#weight');
  const weights = [];
  // Daily from 1 to 30 Sep at 100 kg, then 1 to 7 Oct at 98 kg.
  for (let d = 1; d <= 30; d++) weights.push({ date: `2026-09-${String(d).padStart(2, '0')}`, kg: 100 });
  for (let d = 1; d <= 7; d++) weights.push({ date: `2026-10-0${d}`, kg: 98 });
  await seed(page, { weights, settings: settings({ installedAt: ms('2026-09-01T08:00'), weightRange: '1m' }) });
  const average = page.getByTestId('weight-average');
  const notes = page.getByTestId('weight-notes');
  const back = page.locator('[data-action="weight-latest"]');
  await expect(average).toHaveText('98.0 kg');
  await expect(notes).toContainText('7 Oct');
  await expect(back).toBeHidden();
  await expect(page.locator('.chart-readout')).toHaveText('Touch the chart to see a day above.');

  // Touch near the start of the chart (8 Sep): its 7 days were all 100 kg.
  const chart = page.locator('[data-block="chart"] svg.chart');
  const box = await chart.boundingBox();
  await page.mouse.click(box.x + box.width * (40 / 340), box.y + box.height / 2);
  await expect(average).toHaveText('100.0 kg');
  await expect(notes).toContainText('Sep');
  await expect(notes).toContainText('7 of 7');
  await expect(back).toBeVisible();
  // 3 Oct (day 25 of 30 along the month) holds 3 days at 98 and 4 at 100.
  await page.mouse.click(box.x + box.width * ((38 + (25 / 30) * 256) / 340), box.y + box.height / 2);
  await expect(notes).toContainText('3 Oct');
  await expect(average).toHaveText('99.1 kg');
  await expect(page.getByTestId('weight-change')).toHaveText('Change from the 7 days before: −0.9 kg.');

  // Back to latest.
  await back.click();
  await expect(average).toHaveText('98.0 kg');
  await expect(back).toBeHidden();

  // A new time frame returns to the latest too.
  await chart.focus();
  await chart.press('ArrowLeft');
  await expect(back).toBeVisible();
  await choose(page, 'weight-range', '3m');
  await expect(average).toHaveText('98.0 kg');
  await expect(back).toBeHidden();

  // So does leaving Weight.
  await page.locator('[data-block="chart"] svg.chart').focus();
  await page.locator('[data-block="chart"] svg.chart').press('ArrowLeft');
  await expect(back).toBeVisible();
  await page.evaluate(() => { window.location.hash = '#today'; });
  await expect(page.locator('.today')).toBeVisible();
  await page.evaluate(() => { window.location.hash = '#weight'; });
  await expect(average).toHaveText('98.0 kg');
  await expect(back).toBeHidden();
});

test('a finger dragged along the chart moves the box with it; a scroll that starts on it changes nothing', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch drags are sent through the Chromium DevTools protocol');
  await openAt(page, '2026-10-08T09:00', '#weight');
  const weights = [];
  for (let d = 1; d <= 30; d++) weights.push({ date: `2026-09-${String(d).padStart(2, '0')}`, kg: 100 });
  for (let d = 1; d <= 7; d++) weights.push({ date: `2026-10-0${d}`, kg: 98 });
  await seed(page, { weights, settings: settings({ installedAt: ms('2026-09-01T08:00'), weightRange: '1m' }) });
  const notes = page.getByTestId('weight-notes');
  const back = page.locator('[data-action="weight-latest"]');
  const chart = page.locator('[data-block="chart"] svg.chart');
  await chart.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  // Drag from a fifth of the way along to 70%: the box ends on 1 Oct (day 23 of the month shown).
  let box = await chart.boundingBox();
  const along = (f) => box.x + box.width * f;
  const mid = box.y + box.height / 2;
  await touch('touchStart', along(0.2), mid);
  for (let i = 1; i <= 10; i++) await touch('touchMove', along(0.2 + i * 0.05), mid);
  await touch('touchEnd');
  await expect(notes).toContainText('1 Oct');
  await expect(back).toBeVisible();

  // Back to latest, then an upward swipe that starts on the chart: the page scrolls, the box stays put.
  await back.click();
  await expect(back).toBeHidden();
  await chart.scrollIntoViewIfNeeded();
  box = await chart.boundingBox();
  const low = box.y + box.height * 0.7;
  await touch('touchStart', along(0.35), low);
  for (let i = 1; i <= 10; i++) await touch('touchMove', along(0.35), low - i * 30);
  await touch('touchEnd');
  await expect(notes).toContainText('7 Oct');
  await expect(back).toBeHidden();
});
