import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekReview } from '../../docs/js/core/review.js';

const T = (s) => Date.parse(`${s}:00+03:00`);
const MIN = 60000;

function seed() {
  const day = (d, first, last, extra = {}) => ({ day: `2026-09-${d}`, firstBite: first && T(`2026-09-${d}T${first}`), lastBite: last && T(`2026-09-${d}T${last}`), ...extra });
  const days = new Map([
    day(20, '17:30', '21:00', { energy4pm: 4, trained: true, trainingType: 'weights' }), // success
    day(21, '15:00', '18:00', { energy4pm: 2 }), // workday, opened before 16:00: miss
    day(22, '17:40', '21:50', { energy4pm: 5, trained: true, trainingType: 'cardio' }), // 4 h 10: success
    day(23, '17:30', '21:50', { energy4pm: 4, trained: false }), // 4 h 20: miss
    day(24, '18:00', '20:00', { energy4pm: 3, trained: true, trainingType: 'weights' }), // outside eating: miss
    day(25, '14:00', '17:00'), // weekend success
    day(26, '19:00', '22:00'), // weekend success
  ].map((r) => [r.day, r]));
  const meals = [
    { id: 1, day: '2026-09-20', startedAt: T('2026-09-20T17:30'), stop: 'before_full', fullnessNow: 5, fullness20: 7 },
    { id: 2, day: '2026-09-22', startedAt: T('2026-09-22T17:40'), stop: 'full', fullnessNow: 6, fullness20: 7 },
    { id: 3, day: '2026-09-23', startedAt: T('2026-09-23T17:30'), stop: 'stuffed', fullnessNow: 8, fullness20: 9 },
    { id: 4, day: '2026-09-24', startedAt: T('2026-09-24T18:00'), stop: 'before_full', fullnessNow: 5, fullness20: null },
    { id: 5, day: '2026-09-19', startedAt: T('2026-09-19T18:00'), stop: 'stuffed', fullnessNow: 9, fullness20: 10 }, // last week
  ];
  const outside = [{ id: 1, day: '2026-09-24', at: T('2026-09-24T22:00'), trigger: 'boredom' }];
  const temptations = [
    { id: 1, day: '2026-09-21', startedAt: T('2026-09-21T13:00'), trigger: 'boredom', outcome: 'held' },
    { id: 2, day: '2026-09-22', startedAt: T('2026-09-22T13:00'), trigger: 'social', outcome: 'held' },
    { id: 3, day: '2026-09-24', startedAt: T('2026-09-24T21:50'), trigger: 'boredom', outcome: 'ate_little' },
    { id: 4, day: '2026-09-25', startedAt: T('2026-09-25T11:00'), trigger: 'stress', outcome: 'held' },
    { id: 5, day: '2026-09-19', startedAt: T('2026-09-19T11:00'), trigger: 'tired', outcome: 'ate_outside' }, // last week
  ];
  const weights = new Map([
    ['2026-09-14', 106], ['2026-09-16', 105.5], ['2026-09-18', 105], // last week: 105.5
    ['2026-09-21', 104.9], ['2026-09-23', 104.7], ['2026-09-25', 104.5], // this week: 104.7
  ]);
  return { days, meals, outside, temptations, weights };
}

test('weekly review maths for a Sunday to Saturday week', () => {
  const r = weekReview(seed(), { weekStartKey: '2026-09-20', todayKey: '2026-09-26', nowTs: T('2026-09-26T23:00'), startKey: '2026-09-20' });

  assert.deepEqual(r.keys, ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']);
  assert.deepEqual(r.days.map((d) => d.result), ['success', 'miss', 'success', 'miss', 'miss', 'success', 'success']);
  assert.equal(r.successCount, 4);
  assert.equal(r.closedCount, 7);
  assert.equal(Math.round(r.avgWindowMs / MIN), Math.round((210 + 180 + 250 + 260 + 120 + 180 + 180) / 7));
  assert.deepEqual(r.streak, { current: 2, best: 2 });

  assert.deepEqual(r.workday, { windows: 5, onTime: 4 });

  assert.deepEqual(r.energy.week.without, { avg: 4, n: 4 });
  assert.deepEqual(r.energy.week.with, { avg: 2, n: 1 });

  assert.equal(r.training.sessions, 3);
  assert.deepEqual(r.training.types, [{ key: 'weights', count: 2 }, { key: 'cardio', count: 1 }]);

  assert.equal(r.satiety.meals, 4);
  assert.equal(r.satiety.rated, 4);
  assert.equal(r.satiety.beforeFull, 2);
  assert.equal(r.satiety.beforeFullShare, 0.5);
  assert.equal(r.satiety.pairs, 3);
  assert.ok(Math.abs(r.satiety.avgRise - 4 / 3) < 1e-9);
  assert.ok(Math.abs(r.satiety.avgAt20 - 23 / 3) < 1e-9);

  assert.equal(r.temptations.count, 4);
  assert.equal(r.temptations.held, 3);
  assert.equal(r.temptations.holdRate, 0.75);
  assert.deepEqual(r.temptations.triggers.map((t) => [t.key, t.count]), [['boredom', 2], ['social', 1], ['stress', 1]]);

  assert.ok(Math.abs(r.weight.current.avg - 104.7) < 1e-9);
  assert.ok(Math.abs(r.weight.previous.avg - 105.5) < 1e-9);
  assert.ok(Math.abs(r.weight.change - -0.8) < 1e-9);
});

test('a mid-week review leaves future days out and keeps today pending', () => {
  const data = seed();
  for (const k of ['2026-09-24', '2026-09-25', '2026-09-26']) data.days.delete(k);
  data.outside = [];
  const r = weekReview(data, { weekStartKey: '2026-09-20', todayKey: '2026-09-24', nowTs: T('2026-09-24T12:00'), startKey: '2026-09-20' });
  assert.deepEqual(r.days.map((d) => d.result), ['success', 'miss', 'success', 'miss', 'pending', 'none', 'none']);
  assert.deepEqual(r.days.map((d) => d.future), [false, false, false, false, false, true, true]);
  assert.equal(r.successCount, 2);
  assert.deepEqual(r.workday, { windows: 4, onTime: 3 });
});

test('energy all-time counts a day-off as not a workday', () => {
  const data = seed();
  data.days.get('2026-09-21').dayOff = true;
  const r = weekReview(data, { weekStartKey: '2026-09-20', todayKey: '2026-09-26', nowTs: T('2026-09-26T23:00'), startKey: '2026-09-20' });
  assert.deepEqual(r.energy.week.with, { avg: null, n: 0 });
  assert.equal(r.days[1].result, 'success'); // day off: the 16:00 rule does not apply
  assert.deepEqual(r.workday, { windows: 4, onTime: 4 });
});
