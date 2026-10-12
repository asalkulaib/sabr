import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satietyStats } from '../../docs/js/core/satiety.js';

const m = (id, stop, hunger, now, at20) => ({ id, day: '2026-09-2' + id, startedAt: id * 1000, stop, hungerBefore: hunger, fullnessNow: now, fullness20: at20 });

test('drift, landing in the zone, and each way of finishing', () => {
  const s = satietyStats([
    m(1, 'before_full', 6, 5, 7),
    m(2, 'before_full', 5, 5, 6),
    m(3, 'full', 7, 7, 8),
    m(4, 'stuffed', 9, 8, 10),
    m(5, 'full', 8, 6, null), // no 20-minute reading yet
  ]);
  assert.equal(s.done, 4);
  assert.equal(s.drift, (2 + 1 + 1 + 2) / 4);
  assert.equal(s.landed, 3); // 7, 6 and 8 are in the 6 to 8 zone
  assert.equal(s.pastFull, 1);
  const [lw, sat, over] = s.byStop;
  assert.deepEqual([lw.count, sat.count, over.count], [2, 2, 1]);
  assert.equal(lw.rise, 1.5);
  assert.deepEqual([lw.now, lw.at20], [5, 6.5]);
  assert.deepEqual([sat.now, sat.at20], [7, 8]); // the meal without a 20-minute reading is left out
  assert.equal(sat.hunger, 7.5);
  assert.equal(s.landings.length, 4);
  assert.deepEqual(s.landings.map((x) => x.value), [7, 6, 8, 10]);
});
