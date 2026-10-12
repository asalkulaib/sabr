import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as w from '../../docs/js/core/weight.js';

const TODAY = '2026-09-25';
const LIST = '2026-09-19:104.6,2026-09-20:104.3,2026-09-21:104.1';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('unwraps every supported payload shape to the same list', () => {
  const shapes = [
    `w=${LIST}`,
    `#w=${LIST}`,
    `https://someone.github.io/fast/import#w=${LIST}`,
    `https://someone.github.io/fast/import/#w=${encodeURIComponent(LIST)}`,
    b64(`w=${LIST}`),
    `b=${b64(`w=${LIST}`)}`,
    `#b=${b64(`w=${LIST}`)}`,
    LIST,
    `  ${b64(`w=${LIST}`)}\n`,
  ];
  for (const s of shapes) assert.equal(w.unwrapPayload(s), LIST, s);
});

test('returns null for text that is not weight data', () => {
  for (const s of ['', 'hello there', 'https://example.com', b64('just some text'), '#w=', 'w=nothing']) {
    const parsed = w.parseImport(s, TODAY);
    assert.equal(parsed, null, s);
  }
});

test('parses entries; the last value for a duplicate date wins', () => {
  const r = w.parseImport('w=2026-09-20:104.6,2026-09-21:104.3,2026-09-21:104.1,2026-09-22:103.9', TODAY);
  assert.equal(r.found, 4);
  assert.equal(r.skipped, 0);
  assert.equal(r.entries.size, 3);
  assert.equal(r.entries.get('2026-09-21'), 104.1);
});

test('handles comma decimals, whole numbers, units and Arabic digits', () => {
  const r = w.parseImport('w=2026-09-20:104,6,2026-09-21:104,2026-09-22:103.95 kg,2026-09-23: 103,5', TODAY);
  assert.deepEqual([...r.entries.entries()], [
    ['2026-09-20', 104.6], ['2026-09-21', 104], ['2026-09-22', 103.95], ['2026-09-23', 103.5],
  ]);
  const arabic = w.parseImport('w=٢٠٢٦-٠٩-٢٤:١٠٤٫٦', TODAY);
  assert.equal(arabic.entries.get('2026-09-24'), 104.6);
  const many = w.parseImport('w=2026-09-24:104.59999999999', TODAY);
  assert.equal(many.entries.get('2026-09-24'), 104.6);
});

test('skips impossible dates, future dates and values outside the plausible kg range', () => {
  const r = w.parseImport('w=2026-02-30:104,2026-09-26:104,2026-09-20:12,2026-09-21:231.5,2026-09-22:104.2', TODAY);
  assert.equal(r.found, 5);
  assert.equal(r.skipped, 4);
  assert.deepEqual([...r.entries.keys()], ['2026-09-22']);
});

test('values marked in pounds are converted to kg', () => {
  const r = w.parseImport('w=2026-09-22:231.5 lb,2026-09-23:230.8lbs', TODAY);
  assert.equal(r.entries.get('2026-09-22'), 105.01);
  assert.equal(r.entries.get('2026-09-23'), 104.69);
});

test('a batch about 2.2 times the stored level looks like pounds', () => {
  const stored = new Map([['2026-09-10', 80.2], ['2026-09-11', 80.0], ['2026-09-12', 79.8]]);
  assert.equal(w.looksLikePounds(stored, new Map([['2026-09-20', 176.1], ['2026-09-21', 175.8]])), true);
  assert.equal(w.looksLikePounds(stored, new Map([['2026-09-20', 79.9]])), false);
  assert.equal(w.looksLikePounds(new Map(), new Map([['2026-09-20', 176.1]])), false);
});

test('diff counts new, changed and unchanged dates', () => {
  const existing = new Map([['2026-09-20', 104.6], ['2026-09-21', 104.3]]);
  const incoming = new Map([['2026-09-20', 104.6], ['2026-09-21', 104.2], ['2026-09-22', 103.9]]);
  assert.deepEqual(w.diffEntries(existing, incoming), { added: 1, updated: 1, unchanged: 1 });
});

test('every weigh-in counts: one gives itself, two their average, none no figure', () => {
  const weights = new Map([['2026-09-20', 100]]);
  assert.deepEqual(w.averageBetween(weights, '2026-09-19', '2026-09-25'), { avg: 100, n: 1 });
  weights.set('2026-09-21', 101);
  assert.deepEqual(w.averageBetween(weights, '2026-09-19', '2026-09-25'), { avg: 100.5, n: 2 });
  assert.deepEqual(w.averageBetween(weights, '2026-09-26', '2026-10-02'), { avg: null, n: 0 });
  assert.equal(w.MIN_WEIGH_INS, 1);
});

test('rolling 7-day average ends on the latest weigh-in and compares with the 7 days before', () => {
  const weights = new Map();
  for (let d = 5; d <= 18; d++) weights.set(`2026-09-${String(d).padStart(2, '0')}`, 110 - d * 0.1);
  const s = w.rollingSummary(weights);
  assert.equal(s.end, '2026-09-18');
  assert.equal(s.current.n, 7);
  assert.equal(s.previous.n, 7);
  assert.ok(Math.abs(s.current.avg - (110 - 1.5)) < 1e-9);
  assert.ok(Math.abs(s.change - -0.7) < 1e-9);
});

test("a week's weight, as on the Week tab: Sunday to Saturday, a single weigh-in included", () => {
  const weights = new Map([
    ['2026-09-19', 105], // Saturday, week of 13 Sep
    ['2026-09-20', 104], ['2026-09-22', 103], ['2026-09-26', 102], // week of 20 Sep
    ['2026-09-29', 101], // week of 27 Sep: one weigh-in
  ]);
  const s = w.weekSummary(weights, '2026-09-27');
  assert.deepEqual(s.current, { avg: 101, n: 1 });
  assert.equal(s.previous.avg, 103);
  assert.equal(s.change, -2);
  const t = w.weekSummary(weights, '2026-09-20');
  assert.equal(t.previous.avg, 105); // the week before held one weigh-in too
  assert.equal(t.change, -2);
});

test('the chart line breaks where a week went by without a weigh-in', () => {
  const at = (date) => ({ date, avg: 100, n: 1 });
  // 7 days apart: joined. 8 days apart: a full week without one, so a new run.
  assert.deepEqual(w.chartRuns([at('2026-09-01'), at('2026-09-08'), at('2026-09-16')]).map((r) => r.map((p) => p.date)),
    [['2026-09-01', '2026-09-08'], ['2026-09-16']]);
  assert.deepEqual(w.chartRuns([]), []);
});

test('the 7-day average on each weigh-in day, a single weigh-in included', () => {
  const weights = new Map([
    ['2026-08-20', 104], ['2026-08-22', 103], ['2026-08-26', 102], ['2026-08-27', 101],
    ['2026-10-05', 100], ['2026-10-06', 99], ['2026-10-07', 98],
  ]);
  assert.deepEqual(w.rollingSeries(weights), [
    { date: '2026-08-20', avg: 104, n: 1 },
    { date: '2026-08-22', avg: 103.5, n: 2 },
    { date: '2026-08-26', avg: 103, n: 3 },
    { date: '2026-08-27', avg: 102, n: 3 },
    { date: '2026-10-05', avg: 100, n: 1 },
    { date: '2026-10-06', avg: 99.5, n: 2 },
    { date: '2026-10-07', avg: 99, n: 3 },
  ]);
  // Its last point is the figure at the top of the Weight screen.
  const s = w.rollingSummary(weights);
  assert.equal(s.current.avg, 99);
  assert.deepEqual(w.rollingSeries(new Map()), []);
});

test('time frames for the weight chart end today', () => {
  assert.equal(w.rangeStart('1m', '2026-10-08'), '2026-09-08');
  assert.equal(w.rangeStart('1m', '2026-03-31'), '2026-02-28'); // no 31 February
  assert.equal(w.rangeStart('3m', '2026-01-15'), '2025-10-15'); // back across the year
  assert.equal(w.rangeStart('6m', '2026-10-08'), '2026-04-08');
  assert.equal(w.rangeStart('ytd', '2026-10-08'), '2026-01-01');
  assert.equal(w.rangeStart('all', '2026-10-08'), null);
  assert.deepEqual(w.WEIGHT_RANGES, ['1m', '3m', '6m', 'ytd', 'all']);
});
