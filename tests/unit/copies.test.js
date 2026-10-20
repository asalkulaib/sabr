// Copies on this iPhone: which ones the keep rule keeps (docs/js/core/copies.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiesToDrop, copiesToKeep } from '../../docs/js/core/copies.js';
import { addDays, daysBetween, weekday } from '../../docs/js/core/time.js';

const T = (s) => Date.parse(`${s}:00+03:00`);
let nextId = 1;
const copy = (kind, day, time = '07:30') => ({ id: nextId++, kind, at: T(`${day}T${time}`), day });
/** One daily copy on each of n days, the last on lastDay. */
const dailies = (n, lastDay) => Array.from({ length: n }, (_, i) => copy('daily', addDays(lastDay, i - n + 1)));
const daysOf = (copies, ids) => copies.filter((c) => ids.has(c.id)).map((c) => c.day).sort();

test('copies: under seven daily copies, all of them stay', () => {
  const list = dailies(5, '2026-10-20');
  assert.equal(copiesToKeep(list).size, 5);
  assert.deepEqual(copiesToDrop(list), []);
  assert.deepEqual(copiesToDrop([]), []);
});

test('copies: a copy every day keeps the last seven, then the newest of each of the four weeks before theirs', () => {
  const list = dailies(40, '2026-10-20'); // 11 September to 20 October
  const kept = copiesToKeep(list);
  // The seven newest run 14 to 20 October. The oldest of them, Wednesday
  // the 14th, falls in the week of Sunday 11 to Saturday 17 October. The
  // four weeks before it, Sunday to Saturday, each keep their newest copy,
  // a Saturday: 10 October, 3 October, 26 and 19 September. The 11th to the
  // 13th share a week with the seven, so they go.
  assert.deepEqual(daysOf(list, kept), [
    '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10',
    '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
  ]);
  assert.equal(copiesToDrop(list).length, 40 - 11);
});

test('copies: a week with no copy keeps none, and nothing older than four weeks stays', () => {
  const list = [
    ...dailies(7, '2026-10-20'), // 14 to 20 October, in the weeks of 11 and 18 October
    copy('daily', '2026-10-12'), // the week of the seven: goes
    copy('daily', '2026-10-10'), copy('daily', '2026-10-08'), // the first week before: 4 to 10 October
    // the second week, 27 September to 3 October: none
    copy('daily', '2026-09-25'), // the third week: 20 to 26 September
    copy('daily', '2026-09-16'), copy('daily', '2026-09-19'), // the fourth week: 13 to 19 September
    copy('daily', '2026-09-12'), // five weeks back: goes
  ];
  const kept = daysOf(list, copiesToKeep(list));
  assert.deepEqual(kept, ['2026-09-19', '2026-09-25', '2026-10-10', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
});

test('copies: the weeks count back from the week of the oldest of the seven newest, even with gaps between them', () => {
  // Opened on scattered days: the seven newest reach back to Thursday 1
  // October, in the week of 27 September to 3 October.
  const days = ['2026-10-01', '2026-10-04', '2026-10-09', '2026-10-12', '2026-10-15', '2026-10-18', '2026-10-20'];
  const list = [...days.map((d) => copy('daily', d)), copy('daily', '2026-09-30'), copy('daily', '2026-09-24'), copy('daily', '2026-09-23'), copy('daily', '2026-09-18')];
  // The 30th shares the week of the 1st and goes. 20 to 26 September is the
  // first week before: its newest is the 24th, so the 23rd goes. The 18th is
  // the newest of the second week, 13 to 19 September.
  assert.deepEqual(daysOf(list, copiesToKeep(list)), ['2026-09-18', '2026-09-24', ...days]);
});

test('copies: the five newest of the other kinds stay together, whatever their kind', () => {
  const list = [
    copy('before-restore', '2026-10-01'),
    copy('before-reset', '2026-10-02'),
    copy('before-bring-back', '2026-10-03'),
    copy('before-restore', '2026-10-04'),
    copy('before-bring-back', '2026-10-05'),
    copy('before-reset', '2026-10-06'),
    copy('before-restore', '2026-10-07'),
    ...dailies(3, '2026-10-07'),
  ];
  const drop = copiesToDrop(list);
  assert.deepEqual(daysOf(list, new Set(drop)), ['2026-10-01', '2026-10-02']);
  assert.ok(drop.every((id) => list.find((c) => c.id === id).kind !== 'daily'));
});

test('copies: copies taken at the same moment order by id, the later id newer', () => {
  const at = T('2026-10-20T07:30');
  const list = Array.from({ length: 6 }, () => ({ id: nextId++, kind: 'before-restore', at, day: '2026-10-20' }));
  const drop = copiesToDrop(list);
  assert.equal(drop.length, 1);
  assert.equal(drop[0], Math.min(...list.map((c) => c.id)));
});

test('copies: two daily copies on one day keep the newer among the seven', () => {
  const list = [...dailies(6, '2026-10-20'), copy('daily', '2026-10-20', '21:00'), copy('daily', '2026-10-10')];
  // Seven newest: the two on the 20th and 15 to 19 October; the 10th is the
  // newest of the week before theirs (4 to 10 October).
  assert.deepEqual(daysOf(list, copiesToKeep(list)), [
    '2026-10-10', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-20',
  ]);
});

test('copies: the copy being brought back stays, whatever the rule says', () => {
  // Five copies of the other kinds, then the one kept just before bringing
  // back the oldest of them: the rule alone would let that oldest go.
  const list = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => copy('before-restore', d));
  list.push(copy('before-bring-back', '2026-10-06'));
  const oldest = list[0].id;
  assert.deepEqual(copiesToDrop(list), [oldest]);
  assert.deepEqual(copiesToDrop(list, [oldest]), []);
  assert.ok(copiesToKeep(list, [oldest]).has(oldest));
});

/**
 * The rule as the app runs it: one new daily copy on each day the app is
 * opened, then the copies the rule lets go are deleted. Returns, for each
 * day from the 60th on, the copies left and the day they were left on.
 */
function liveRun(opened, days = 140) {
  const start = '2026-01-04'; // a Sunday
  let kept = [];
  const seen = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    if (!opened(i, day)) continue;
    kept.push(copy('daily', day));
    const drop = new Set(copiesToDrop(kept));
    kept = kept.filter((c) => !drop.has(c.id));
    if (i >= 60) seen.push({ day, kept: kept.map((c) => c.day).sort() });
  }
  return seen;
}

test('copies: taken one a day and pruned after each, the weeks keep their copy and reach back four weeks', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ways = {
    'every day': () => true,
    'every other day': (i) => i % 2 === 0,
    'Sunday to Thursday': (i, day) => weekday(day) <= 4,
    'six days in ten': () => random() < 0.6,
  };
  for (const [way, opened] of Object.entries(ways)) {
    for (const { day, kept } of liveRun(opened)) {
      // A wrong change noticed weeks later can still be undone: the oldest
      // copy is at least four weeks old, and never more than 11 are kept.
      assert.ok(daysBetween(kept[0], day) >= 28, `${way}, ${day}: the oldest copy is from ${kept[0]}`);
      assert.ok(kept.length <= 11, `${way}, ${day}: ${kept.length} copies kept`);
    }
  }
  // Used every day: the seven newest, then one Saturday for each of the
  // four weeks before theirs, which stays as the days go by.
  for (const { day, kept } of liveRun(ways['every day'])) {
    const older = kept.slice(0, -7);
    assert.equal(older.length, 4, `${day}: ${kept.join(' ')}`);
    assert.ok(older.every((d) => weekday(d) === 6), `${day}: ${older.join(' ')}`);
    assert.deepEqual(kept.slice(-7), Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)));
  }
});
