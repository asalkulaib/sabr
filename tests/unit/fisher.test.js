import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P_MAX, differs, fisherExact } from '../../docs/js/core/fisher.js';

const near = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} is not ${expected}`);

test("Fisher's exact test, two-sided, gives the published p values", () => {
  // The lady tasting tea: 3 of 4 cups right each way.
  near(fisherExact(3, 1, 1, 3), 0.485714);
  // The textbook table [[1, 9], [11, 3]].
  near(fisherExact(1, 9, 11, 3), 0.002759);
  // Every table with these totals, counted by hand: C(4,x) C(8,7-x) / C(12,7).
  near(fisherExact(4, 0, 3, 5), (56 + 8) / 792, 12);
  near(fisherExact(5, 1, 2, 4), (6 + 90 + 90 + 6) / 792, 12);
  // The most uneven split of 3 against 3, and of 6 against 6.
  near(fisherExact(0, 3, 3, 0), 2 / 20, 12);
  near(fisherExact(6, 0, 0, 6), 2 / 924, 12);
  // Larger counts stay exact.
  near(fisherExact(60, 40, 40, 60), 0.007060, 5);
});

test('the test reads the same whichever way the table is turned', () => {
  const p = fisherExact(2, 7, 8, 3);
  for (const q of [fisherExact(7, 2, 3, 8), fisherExact(8, 3, 2, 7), fisherExact(2, 8, 7, 3)]) near(q, p, 12);
});

test('no difference shows without counts to show it', () => {
  assert.equal(fisherExact(0, 0, 0, 0), 1);
  assert.equal(fisherExact(3, 2, 0, 0), 1);
  near(fisherExact(2, 2, 2, 2), 1, 12); // an even split: every table is as likely or less
  assert.ok(fisherExact(4, 4, 4, 4) <= 1);
});

test('a difference counts below 0.05', () => {
  assert.equal(P_MAX, 0.05);
  assert.equal(differs(6, 6, 0, 6), true); // 6 of 6 against 0 of 6: p 0.002
  assert.equal(differs(0, 3, 3, 3), false); // 0 of 3 against 3 of 3: p 0.1, too few meals to tell
  assert.equal(differs(1, 4, 3, 4), false); // p 0.49
  assert.equal(differs(4, 4, 3, 8), false); // p 0.08
  assert.equal(differs(10, 12, 3, 18), true);
});
