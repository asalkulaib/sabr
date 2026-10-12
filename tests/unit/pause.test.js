import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../docs/js/core/rules.js';
import { dailySeries, rollingAverage } from '../../docs/js/core/history.js';
import { weekReview } from '../../docs/js/core/review.js';
import { buildCsvFiles } from '../../docs/js/core/csv.js';

// Paused days: not tracked, neither counted nor breaking a streak.

const T = (s) => Date.parse(`${s}:00+03:00`);
const H = 3_600_000;

const win = (day, first, last, extra = {}) => ({ day, firstBite: T(`${day}T${first}`), lastBite: last ? T(`${day}T${last}`) : null, ...extra });
const days = (...recs) => new Map(recs.map((r) => [r.day, r]));

test('a paused day is neither a success nor a miss, whatever is logged', () => {
  const now = T('2026-09-30T12:00');
  const e = rules.evaluateDay('2026-09-22', { day: '2026-09-22', paused: 'travel' }, 0, now, '2026-09-30', '2026-09-01');
  assert.equal(e.result, 'paused');
  assert.equal(e.state, 'paused');
  assert.equal(e.paused, 'travel');
  // A window over 4 h 15 min and eating outside it would be a miss, but the day is paused.
  const late = rules.evaluateDay('2026-09-23', win('2026-09-23', '12:00', '20:00', { paused: true }), 2, now, '2026-09-30', '2026-09-01');
  assert.equal(late.result, 'paused');
});

test('paused days neither count towards a streak nor break it', () => {
  const d = days(
    win('2026-09-20', '17:30', '21:00'),
    { day: '2026-09-21', paused: 'illness' },
    { day: '2026-09-22', paused: 'illness' },
    win('2026-09-23', '17:30', '21:00'),
    win('2026-09-24', '17:30', '21:00'),
  );
  const nowTs = T('2026-09-24T23:00');
  const evaluate = rules.makeEvaluator({ days: d, outside: [], nowTs, todayKey: '2026-09-24', startKey: '2026-09-20' });
  assert.deepEqual(rules.streaks(evaluate, '2026-09-24', '2026-09-20'), { current: 3, best: 3 });
  // Paused today: the streak waits.
  d.set('2026-09-25', { day: '2026-09-25', paused: true });
  const evaluate2 = rules.makeEvaluator({ days: d, outside: [], nowTs: T('2026-09-25T12:00'), todayKey: '2026-09-25', startKey: '2026-09-20' });
  assert.equal(rules.streaks(evaluate2, '2026-09-25', '2026-09-20').current, 3);
  // An unlogged day still breaks it.
  const gap = days(win('2026-09-20', '17:30', '21:00'), { day: '2026-09-21', paused: true }, win('2026-09-23', '17:30', '21:00'));
  const evaluate3 = rules.makeEvaluator({ days: gap, outside: [], nowTs: T('2026-09-23T23:00'), todayKey: '2026-09-23', startKey: '2026-09-20' });
  assert.deepEqual(rules.streaks(evaluate3, '2026-09-23', '2026-09-20'), { current: 1, best: 1 });
});

test('Today shows a pause, unless a window is still open', () => {
  const d = days({ day: '2026-09-27', paused: 'travel' });
  assert.equal(rules.todayMode({ days: d, todayKey: '2026-09-27', nowTs: T('2026-09-27T12:00') }).mode, 'paused');
  d.set('2026-09-26', win('2026-09-26', '22:00', null));
  assert.equal(rules.todayMode({ days: d, todayKey: '2026-09-27', nowTs: T('2026-09-27T00:30') }).mode, 'open');
});

test('after a pause the last bite is unknown until the next window', () => {
  const d = days(win('2026-09-20', '17:30', '21:00'), { day: '2026-09-21', paused: 'travel' }, { day: '2026-09-22', paused: 'travel' });
  const ctx = { days: d, meals: [], outside: [], todayKey: '2026-09-23' };
  assert.equal(rules.lastEatingSource(ctx), null);
  assert.equal(rules.lastEatingTs(ctx), null);
  // A pause before the last eating does not matter.
  d.set('2026-09-23', win('2026-09-23', '17:30', '21:00'));
  assert.equal(rules.lastEatingTs({ ...ctx, todayKey: '2026-09-24' }), T('2026-09-23T21:00'));
  // A pause still ahead does not matter either.
  d.set('2026-10-05', { day: '2026-10-05', paused: 'ramadan' });
  assert.equal(rules.lastEatingTs({ ...ctx, todayKey: '2026-09-24' }), T('2026-09-23T21:00'));
});

test('History leaves paused days out, and a fast across a pause is unknown', () => {
  const d = days(
    win('2026-09-20', '17:30', '21:00'),
    { day: '2026-09-21', paused: 'travel' },
    win('2026-09-22', '17:00', '20:00'),
    win('2026-09-23', '17:30', '21:30'),
  );
  const s = dailySeries({ days: d, meals: [], outside: [] }, '2026-09-20', '2026-09-23');
  assert.deepEqual(s[1], { day: '2026-09-21', fastMs: null, feastMs: null, paused: 'travel' });
  assert.equal(s[2].fastMs, null); // from the 20th across the paused 21st
  assert.equal(s[2].feastMs, 3 * H);
  assert.equal(s[3].fastMs, T('2026-09-23T17:30') - T('2026-09-22T20:00'));
});

test('the 7-day trend needs 3 values in its 7 days', () => {
  const s = [4, null, 2, 3, null, null, null, null, 6].map((h, i) => ({ day: String(i), feastMs: h == null ? null : h * H }));
  const trend = rollingAverage(s, 'feastMs');
  assert.deepEqual(trend.slice(0, 4), [null, null, null, 3 * H]); // 4 and 2 are only two values
  assert.equal(trend[6], 3 * H); // 4, 2 and 3 are all within the last 7 days
  assert.equal(trend[7], null); // the 4 fell out: only 2 and 3 are left
  assert.equal(trend[8], (11 / 3) * H); // 2, 3 and 6
});

test('the weekly review leaves paused days out of its counts', () => {
  const d = days(
    win('2026-09-20', '17:30', '21:00', { energy4pm: 4 }),
    { day: '2026-09-21', paused: 'illness', energy4pm: 1, trained: true },
    win('2026-09-22', '17:40', '21:00'),
  );
  const meals = [
    { id: 1, day: '2026-09-21', startedAt: T('2026-09-21T13:00'), stop: 'stuffed' },
    { id: 2, day: '2026-09-22', startedAt: T('2026-09-22T17:40'), stop: 'before_full' },
  ];
  const r = weekReview({ days: d, meals, outside: [], temptations: [], weights: new Map() }, {
    weekStartKey: '2026-09-20', todayKey: '2026-09-26', nowTs: T('2026-09-26T12:00'), startKey: '2026-09-20',
  });
  assert.equal(r.successCount, 2);
  assert.equal(r.pausedCount, 1);
  assert.equal(r.training.sessions, 0);
  assert.equal(r.satiety.rated, 1);
  assert.equal(r.energy.week.without.n, 1);
});

test('the windows CSV lists paused days with their reason', () => {
  const d = days(win('2026-09-20', '17:30', '21:00'), { day: '2026-09-21', paused: 'travel' }, { day: '2026-09-22', paused: true });
  const [windows] = buildCsvFiles({ days: d, meals: [], outside: [], temptations: [], weights: new Map() },
    { nowTs: T('2026-09-26T12:00'), todayKey: '2026-09-26', startKey: '2026-09-20' });
  const rows = windows.text.split('\r\n');
  assert.match(rows[2], /^2026-09-21,Monday,workday,planned start,Kuwait,,,,,,240,paused \(travel\),/);
  assert.match(rows[3], /^2026-09-22,Tuesday,workday,planned start,Kuwait,,,,,,240,paused,/);
});
