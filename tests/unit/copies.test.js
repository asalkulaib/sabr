// Copies on this iPhone: which ones the keep rule keeps (docs/js/core/copies.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiesToDrop, copiesToKeep } from '../../docs/js/core/copies.js';
import { addDays } from '../../docs/js/core/time.js';

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

test('copies: a copy every day keeps the last seven, then the newest of each of the four weeks before them', () => {
  const list = dailies(40, '2026-10-20'); // 11 September to 20 October
  const kept = copiesToKeep(list);
  // The seven newest run 14 to 20 October. The four weeks before them run
  // 7 to 13 October, 30 September to 6 October, 23 to 29 and 16 to 22
  // September: each keeps its newest copy, its last day.
  assert.deepEqual(daysOf(list, kept), [
    '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13',
    '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
  ]);
  assert.equal(copiesToDrop(list).length, 40 - 11);
});

test('copies: a week with no copy keeps none, and nothing older than four weeks stays', () => {
  const list = [
    ...dailies(7, '2026-10-20'), // 14 to 20 October
    copy('daily', '2026-10-10'), copy('daily', '2026-10-08'), // the first week before: 7 to 13 October
    // the second week, 30 September to 6 October: none
    copy('daily', '2026-09-25'), // the third week: 23 to 29 September
    copy('daily', '2026-09-16'), copy('daily', '2026-09-20'), // the fourth week: 16 to 22 September
    copy('daily', '2026-09-15'), // five weeks back: goes
  ];
  const kept = daysOf(list, copiesToKeep(list));
  assert.deepEqual(kept, ['2026-09-20', '2026-09-25', '2026-10-10', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
});

test('copies: the weeks count back from the oldest of the seven newest, even with gaps between them', () => {
  // Opened on scattered days: the seven newest reach back to 1 October.
  const days = ['2026-10-01', '2026-10-04', '2026-10-09', '2026-10-12', '2026-10-15', '2026-10-18', '2026-10-20'];
  const list = [...days.map((d) => copy('daily', d)), copy('daily', '2026-09-30'), copy('daily', '2026-09-24'), copy('daily', '2026-09-23')];
  // 24 to 30 September is the first week before: its newest is the 30th. The 23rd is in the second.
  assert.deepEqual(daysOf(list, copiesToKeep(list)), ['2026-09-23', '2026-09-30', ...days]);
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
  const list = [...dailies(6, '2026-10-20'), copy('daily', '2026-10-20', '21:00'), copy('daily', '2026-10-14')];
  const kept = copiesToKeep(list);
  // Seven newest: the two on the 20th and 15 to 19 October; the 14th is the week before's newest.
  assert.equal(kept.size, 8);
});
