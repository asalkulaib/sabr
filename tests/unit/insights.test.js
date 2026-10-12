import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satietyInsights } from '../../docs/js/core/insights.js';

let id = 0;
const meal = (day, hour, hunger, stop, at20 = null) => ({ id: ++id, day, startedAt: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`), hungerBefore: hunger, stop, fullness20: at20 });

test('no findings before ten rated meals', () => {
  const meals = Array.from({ length: 9 }, (_, i) => meal(`2026-09-${10 + i}`, 18, 5, 'before_full'));
  assert.deepEqual(satietyInsights(meals), []);
});

test('hunger, first meals and fullness at 20 minutes, from the meals themselves', () => {
  const meals = [];
  for (let i = 0; i < 6; i++) {
    const day = `2026-09-${10 + i}`;
    meals.push(meal(day, 18, i < 4 ? 5 : 8, i < 5 ? 'before_full' : 'full', i < 3 ? 6 : null)); // first meals
    meals.push(meal(day, 20, 8, i < 2 ? 'before_full' : 'stuffed', i >= 3 ? 8 : null)); // later meals
  }
  const out = satietyInsights(meals);
  assert.equal(out.length, 3);
  assert.equal(out[0], 'Left wanting at 4 of 4 meals started at hunger 6 or less, and 3 of 8 started at 7 or more.');
  assert.equal(out[1], 'Left wanting at 5 of 6 first meals of a day, and 2 of 6 later ones.');
  assert.equal(out[2], 'Twenty minutes on, fullness averaged 6.0 after meals left wanting, and 8.0 after the rest.');
});
