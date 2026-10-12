import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_TYPES, guessMealType, typeOfName } from '../../docs/js/core/meal-types.js';

const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

test('the four meal types, in the order the person gave them', () => {
  assert.deepEqual(MEAL_TYPES, ['Snack', 'Breakfast', 'Lunch', 'Dinner']);
});

test('the guess from the start time: breakfast, lunch, dinner, then a snack at night', () => {
  assert.equal(guessMealType(at('04:59')), 'Snack');
  assert.equal(guessMealType(at('05:00')), 'Breakfast');
  assert.equal(guessMealType(at('10:59')), 'Breakfast');
  assert.equal(guessMealType(at('11:00')), 'Lunch');
  assert.equal(guessMealType(at('15:59')), 'Lunch');
  assert.equal(guessMealType(at('16:00')), 'Dinner');
  assert.equal(guessMealType(at('21:59')), 'Dinner');
  assert.equal(guessMealType(at('22:00')), 'Snack');
  assert.equal(guessMealType(at('00:30')), 'Snack');
});

test('a stored name reads back as its choice', () => {
  assert.equal(typeOfName('Dinner'), 'Dinner');
  assert.equal(typeOfName(' dinner '), 'Dinner'); // older typed names match whatever their case
  assert.equal(typeOfName('Dessert'), 'other');
  assert.equal(typeOfName(''), null);
  assert.equal(typeOfName(undefined), null);
});
