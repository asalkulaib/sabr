import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeAddedMeal } from '../../docs/js/core/added-meal.js';

// Kuwait local time -> epoch ms. 2026-09-26 is a Saturday, 2026-09-27 a Sunday.
const T = (s) => Date.parse(`${s}:00+03:00`);

const days = (...recs) => new Map(recs.map((r) => [r.day, r]));
const win = (day, first, last) => ({ day, firstBite: T(`${day}T${first}`), lastBite: last ? T(last.includes('T') ? last : `${day}T${last}`) : null });

function place(recs, start, finish, { meals = [], last = false, settings = {}, now = '2026-09-27T21:00' } = {}) {
  return placeAddedMeal({ days: days(...recs), meals, settings }, { start: T(start), finish: T(finish), last, nowTs: T(now) });
}

test('added meal: the first of the day opens the window at its start, left open unless it was the last', () => {
  const open = place([], '2026-09-27T13:00', '2026-09-27T13:30');
  assert.equal(open.kind, 'first');
  assert.equal(open.day, '2026-09-27');
  assert.deepEqual(open.rec, { day: '2026-09-27', firstBite: T('2026-09-27T13:00'), lastBite: null, noEating: false });
  assert.equal(open.canClose, true);
  const closed = place([], '2026-09-27T13:00', '2026-09-27T13:30', { last: true });
  assert.equal(closed.rec.lastBite, T('2026-09-27T13:30'));
});

test('added meal: a day without eating takes the meal, and says so', () => {
  const p = place([{ day: '2026-09-27', noEating: true, dayOff: true }], '2026-09-27T13:00', '2026-09-27T13:30');
  assert.equal(p.kind, 'first');
  assert.equal(p.wasNoEating, true);
  assert.equal(p.rec.noEating, false);
  assert.equal(p.rec.dayOff, true); // the rest of the record stays
});

test('added meal: before the first bite, the window opens at the meal', () => {
  const p = place([win('2026-09-27', '17:00', '20:00')], '2026-09-27T15:00', '2026-09-27T15:30');
  assert.equal(p.kind, 'earlier');
  assert.equal(p.rec.firstBite, T('2026-09-27T15:00'));
  assert.equal(p.rec.lastBite, T('2026-09-27T20:00'));
});

test('added meal: inside a closed window it changes nothing, unless it ends after the last bite', () => {
  const inside = place([win('2026-09-27', '17:00', '20:00')], '2026-09-27T18:00', '2026-09-27T18:30');
  assert.equal(inside.kind, 'inside');
  assert.equal(inside.rec, null);
  const later = place([win('2026-09-27', '17:00', '20:00')], '2026-09-27T19:45', '2026-09-27T20:15');
  assert.equal(later.rec.lastBite, T('2026-09-27T20:15'));
});

test('added meal: after a closed window, inside its goal it stretches the window; past it, eating outside', () => {
  const stretch = place([win('2026-09-27', '17:00', '18:00')], '2026-09-27T20:00', '2026-09-27T20:30');
  assert.equal(stretch.kind, 'extend');
  assert.equal(stretch.rec.lastBite, T('2026-09-27T20:30'));
  const outside = place([win('2026-09-27', '17:00', '18:00')], '2026-09-27T21:00', '2026-09-27T21:30', { now: '2026-09-27T22:00' });
  assert.equal(outside.kind, 'outside');
  assert.equal(outside.outside, true);
  assert.equal(outside.rec, null);
  // A longer goal keeps the window open to it for longer.
  const sixHours = place([win('2026-09-27', '17:00', '18:00')], '2026-09-27T21:00', '2026-09-27T21:30',
    { now: '2026-09-27T22:00', settings: { goalChanges: [{ from: '2026-09-01', hours: 6 }] } });
  assert.equal(sixHours.kind, 'extend');
});

test('added meal: an open window takes it, and closes at the latest meal only when every meal is finished', () => {
  const rec = win('2026-09-27', '17:00', null);
  const done = { id: 1, day: '2026-09-27', startedAt: T('2026-09-27T17:00'), finishedAt: T('2026-09-27T17:40') };
  const p = place([rec], '2026-09-27T18:00', '2026-09-27T18:20', { meals: [done], last: true, now: '2026-09-27T19:00' });
  assert.equal(p.kind, 'inside');
  assert.equal(p.canClose, true);
  assert.equal(p.rec.lastBite, T('2026-09-27T18:20'));
  const eating = { id: 2, day: '2026-09-27', startedAt: T('2026-09-27T18:40'), finishedAt: null };
  const q = place([rec], '2026-09-27T18:00', '2026-09-27T18:20', { meals: [done, eating], last: true, now: '2026-09-27T19:00' });
  assert.equal(q.canClose, false);
  assert.equal(q.rec, null);
});

test("added meal: last night's window keeps what falls inside it and, just after midnight, inside its goal", () => {
  const late = win('2026-09-26', '21:00', '2026-09-27T00:30');
  const inside = place([late], '2026-09-27T00:10', '2026-09-27T00:20');
  assert.equal(inside.day, '2026-09-26');
  assert.equal(inside.kind, 'inside');
  const after = place([late], '2026-09-27T00:45', '2026-09-27T01:00');
  assert.equal(after.day, '2026-09-26');
  assert.equal(after.kind, 'extend');
  // Past last night's goal, the meal opens the new day's window, as Start a meal would.
  const next = place([late], '2026-09-27T01:30', '2026-09-27T01:45');
  assert.equal(next.day, '2026-09-27');
  assert.equal(next.kind, 'first');
  // The new day's own window later on does not take a snack from last night.
  const both = place([late, win('2026-09-27', '17:00', '20:00')], '2026-09-27T00:45', '2026-09-27T01:00');
  assert.equal(both.day, '2026-09-26');
  assert.equal(both.kind, 'extend');
  assert.equal(both.rec.lastBite, T('2026-09-27T01:00'));
});

test('added meal: an earlier day takes its own meal while a later window is still open', () => {
  const recs = [win('2026-09-24', '18:00', '20:00'), win('2026-09-26', '13:00', '15:00'), win('2026-09-27', '17:00', null)];
  const meals = [{ id: 1, day: '2026-09-27', startedAt: T('2026-09-27T17:00'), finishedAt: T('2026-09-27T17:30') }];
  for (const [start, finish, day] of [['2026-09-26T14:00', '2026-09-26T14:20', '2026-09-26'], ['2026-09-24T18:40', '2026-09-24T19:00', '2026-09-24']]) {
    const p = place(recs, start, finish, { meals, now: '2026-09-27T19:00' });
    assert.equal(p.error, undefined);
    assert.equal(p.day, day);
    assert.equal(p.kind, 'inside');
  }
});

test('added meal: closing an open window waits for its latest meal', () => {
  const meals = [{ id: 1, day: '2026-09-27', startedAt: T('2026-09-27T18:00'), finishedAt: T('2026-09-27T18:40') }];
  const p = place([win('2026-09-27', '17:00', null)], '2026-09-27T17:05', '2026-09-27T17:20', { meals, last: true, now: '2026-09-27T19:00' });
  assert.equal(p.kind, 'inside');
  assert.equal(p.canClose, true);
  assert.equal(p.rec.lastBite, T('2026-09-27T18:40'));
});

test('added meal: a paused day takes it for satiety only', () => {
  const p = place([{ day: '2026-09-27', paused: 'travel' }], '2026-09-27T13:00', '2026-09-27T13:30');
  assert.equal(p.kind, 'paused');
  assert.equal(p.rec, null);
  assert.equal(p.outside, false);
});

test('added meal: refused over a meal already logged, or while an earlier window is still open', () => {
  const lunch = { id: 1, day: '2026-09-27', name: 'Lunch', startedAt: T('2026-09-27T13:00'), finishedAt: T('2026-09-27T13:30') };
  const clash = place([win('2026-09-27', '13:00', '15:00')], '2026-09-27T13:20', '2026-09-27T13:50', { meals: [lunch] });
  assert.equal(clash.error, 'overlap');
  assert.equal(clash.meal.id, 1);
  // Back to back is fine.
  assert.equal(place([win('2026-09-27', '13:00', '15:00')], '2026-09-27T13:30', '2026-09-27T14:00', { meals: [lunch] }).error, undefined);
  // A meal still being eaten runs to now.
  const eating = { id: 2, day: '2026-09-27', startedAt: T('2026-09-27T20:00'), finishedAt: null };
  assert.equal(place([win('2026-09-27', '20:00', null)], '2026-09-27T20:30', '2026-09-27T20:40', { meals: [eating], now: '2026-09-27T20:50' }).error, 'overlap');
  // A window from yesterday left open long past its goal: close it first.
  const forgot = place([win('2026-09-26', '17:00', null)], '2026-09-27T13:00', '2026-09-27T13:30');
  assert.equal(forgot.error, 'open');
  assert.equal(forgot.rec.day, '2026-09-26');
});
