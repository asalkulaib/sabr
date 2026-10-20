import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satietyInsights } from '../../docs/js/core/insights.js';

const MIN = 60_000;
let id = 0;
/**
 * A meal at an hour of a day. Its 20-minute reading is answered in the check
 * 22 minutes after it finished, unless `how` says it came late or was added.
 */
const meal = (day, hour, hunger, stop, at20 = null, how = 'on-time') => {
  const startedAt = Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`);
  const finishedAt = startedAt + 30 * MIN;
  const reading = at20 == null ? {}
    : how === 'added' ? { fullness20DueAt: null, fullness20At: finishedAt + 20 * MIN }
    : { fullness20DueAt: finishedAt + 20 * MIN, fullness20At: finishedAt + (how === 'late' ? 90 : 22) * MIN };
  return { id: ++id, day, startedAt, finishedAt, hungerBefore: hunger, stop, fullnessNow: at20 == null ? null : 5, fullness20: at20, ...reading };
};

test('no findings before ten rated meals', () => {
  const meals = Array.from({ length: 9 }, (_, i) => meal(`2026-09-${10 + i}`, 18, 5, 'before_full'));
  assert.deepEqual(satietyInsights(meals), []);
});

/** Six days of two meals: the first calm, left wanting and 6 at 20 minutes; the later one hungry, satisfied and 8. */
function clearCut(how = 'on-time') {
  const meals = [];
  for (let i = 0; i < 6; i++) {
    const day = `2026-09-${10 + i}`;
    meals.push(meal(day, 18, 5, 'before_full', 6, how));
    meals.push(meal(day, 20, 8, 'full', 8, how));
  }
  return meals;
}

test('a difference the counts support is stated as it stands', () => {
  // 6 of 6 against 0 of 6, each way: Fisher's exact test gives p 0.002.
  assert.deepEqual(satietyInsights(clearCut()), [
    'Left wanting at 6 of 6 meals started at hunger 6 or less, and 0 of 6 started at 7 or more.',
    'Left wanting at 6 of 6 first meals of a day, and 0 of 6 later ones.',
    'Twenty minutes on, fullness averaged 6.0 after meals left wanting, and 8.0 after the rest.',
  ]);
});

test('otherwise there is no clear difference yet, with the counts', () => {
  const meals = [];
  for (let i = 0; i < 6; i++) {
    const day = `2026-09-${10 + i}`;
    meals.push(meal(day, 18, i < 4 ? 5 : 8, i < 5 ? 'before_full' : 'full', i < 3 ? 6 : null)); // first meals
    meals.push(meal(day, 20, 8, i < 2 ? 'before_full' : 'stuffed', i >= 3 ? 8 : null)); // later meals
  }
  // 4 of 4 against 3 of 8 (p 0.08), 5 of 6 against 2 of 6 (p 0.24), and three
  // readings of 6 against three of 8 (p 0.1): none is enough to tell yet.
  assert.deepEqual(satietyInsights(meals), [
    'No clear difference yet: left wanting at 4 of 4 meals started at hunger 6 or less, against 3 of 8 started at 7 or more.',
    'No clear difference yet: left wanting at 5 of 6 first meals of a day, against 2 of 6 later ones.',
    'No clear difference yet: twenty minutes on, fullness averaged 6.0 after 3 meals left wanting, against 8.0 after 3 others.',
  ]);
});

test('twenty minutes on rests on checks answered on time', () => {
  // Late and added readings, however telling, are left out of the average.
  const meals = [
    ...clearCut(),
    meal('2026-09-16', 18, 5, 'before_full', 10, 'late'),
    meal('2026-09-17', 18, 5, 'before_full', 10, 'added'),
    meal('2026-09-18', 18, 8, 'full', 1, 'added'),
  ];
  assert.equal(satietyInsights(meals)[2], 'Twenty minutes on, fullness averaged 6.0 after meals left wanting, and 8.0 after the rest.');
  // With no reading on time, there is no finding on them.
  const added = satietyInsights(clearCut('added'));
  assert.equal(added.length, 2);
  assert.ok(added.every((f) => !f.includes('Twenty minutes on') && !f.includes('twenty minutes on')));
});
