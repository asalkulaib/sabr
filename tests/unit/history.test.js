import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, hourScale, summarize } from '../../docs/js/core/history.js';

const T = (s) => Date.parse(`${s}:00+03:00`);
const H = 3_600_000;
const M = 60_000;

function data(extra = {}) {
  return {
    days: new Map([
      ['2026-09-20', { day: '2026-09-20', firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T21:00') }],
      ['2026-09-21', { day: '2026-09-21', firstBite: T('2026-09-21T17:40'), lastBite: T('2026-09-21T21:10') }],
      ['2026-09-22', { day: '2026-09-22', noEating: true }],
      ['2026-09-23', { day: '2026-09-23', firstBite: T('2026-09-23T18:00'), lastBite: null }], // still open
    ]),
    meals: [],
    outside: [],
    ...extra,
  };
}

test('feast is the day\'s window; fast is the one that ended with its first bite', () => {
  const s = dailySeries(data(), '2026-09-20', '2026-09-23');
  assert.deepEqual(s.map((d) => d.day), ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  // First tracked day: the fast before it is unknown.
  assert.equal(s[0].fastMs, null);
  assert.equal(s[0].feastMs, 3.5 * H);
  // 21:00 on the 20th to 17:40 on the 21st.
  assert.equal(s[1].fastMs, 20 * H + 40 * M);
  assert.equal(s[1].feastMs, 3.5 * H);
  // A day without eating has neither; the fast that ends on the 23rd spans it.
  assert.equal(s[2].fastMs, null);
  assert.equal(s[2].feastMs, null);
  assert.equal(s[3].fastMs, T('2026-09-23T18:00') - T('2026-09-21T21:10'));
  // A window still open has no feast yet.
  assert.equal(s[3].feastMs, null);
});

test('eating outside the window ends the fast early', () => {
  const s = dailySeries(data({ outside: [{ id: 1, day: '2026-09-20', at: T('2026-09-20T23:30') }] }), '2026-09-21', '2026-09-21');
  assert.equal(s[0].fastMs, T('2026-09-21T17:40') - T('2026-09-20T23:30'));
});

test('summary and axis', () => {
  const s = dailySeries(data(), '2026-09-20', '2026-09-23');
  assert.deepEqual(summarize(s, 'feastMs'), { count: 2, avgMs: 3.5 * H });
  assert.equal(summarize(s, 'fastMs').count, 2);
  assert.deepEqual(hourScale(20.7 * H), { step: 6, top: 24 });
  assert.deepEqual(hourScale(3.5 * H), { step: 1, top: 4 });
  assert.deepEqual(hourScale(44 * H), { step: 12, top: 48 });
});
