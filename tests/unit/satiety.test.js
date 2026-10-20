import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ON_TIME, editedReading, readingKind, satietyStats, stopPoint, stopPointWords } from '../../docs/js/core/satiety.js';
import { buildBackup, parseBackup } from '../../docs/js/core/backup.js';
import { buildCsvFiles } from '../../docs/js/core/csv.js';

const MIN = 60_000;
const T = (s) => Date.parse(`${s}:00+03:00`);

let nextId = 0;
/**
 * A meal finished at 18:00, its 20-minute reading taken as `how` says:
 * 'on-time' (answered `after` minutes after finishing, 22 unless given),
 * 'early', 'late', 'added' (Add a meal: no check), 'edited' (entered or
 * changed in the meal sheet), 'unknown' (no answer time), or null for none.
 */
function meal({ day = '2026-09-20', stop = 'before_full', hunger = 6, now = 5, at20 = 7, how = 'on-time', after = 22 } = {}) {
  const startedAt = T(`${day}T17:30`) + nextId * 1000; // each meal a second after the one before
  const finishedAt = T(`${day}T18:00`);
  const due = finishedAt + 20 * MIN;
  const m = { id: ++nextId, day, startedAt, finishedAt, stop, hungerBefore: hunger, fullnessNow: now, fullness20: at20, fullness20DueAt: due, fullness20Skipped: false };
  if (at20 == null) return m;
  switch (how) {
    case 'on-time': return { ...m, fullness20At: finishedAt + after * MIN };
    case 'early': return { ...m, fullness20At: finishedAt + 6 * MIN };
    case 'late': return { ...m, fullness20At: finishedAt + 95 * MIN };
    case 'added': return { ...m, fullness20DueAt: null, fullness20At: due };
    case 'edited': return { ...m, fullness20At: finishedAt + 22 * MIN, fullness20Recalled: true };
    case 'unknown': return m;
    default: throw new Error(how);
  }
}

test('each 20-minute reading is sorted by how it was taken', () => {
  assert.deepEqual(ON_TIME, [15, 40]);
  // Answered in the check: 15 to 40 minutes after the meal finished is on time, both ends included.
  for (const after of [15, 20, 22, 40]) assert.equal(readingKind(meal({ after })), 'on-time', `${after} min`);
  assert.equal(readingKind(meal({ after: 15 - 1 / 60 })), 'early'); // 14 min 59 s: Score my fullness now while the timer ran
  assert.equal(readingKind(meal({ how: 'early' })), 'early');
  assert.equal(readingKind(meal({ after: 40 + 1 / 60 })), 'late'); // 40 min 1 s
  assert.equal(readingKind(meal({ how: 'late' })), 'late');
  // Entered afterwards: in Add a meal (no check, though its answer time reads 20 minutes on),
  // in the meal sheet, or with no answer time at all.
  assert.equal(readingKind(meal({ how: 'added' })), 'recalled');
  assert.equal(readingKind(meal({ how: 'edited' })), 'recalled');
  assert.equal(readingKind(meal({ how: 'unknown' })), 'recalled');
  // No reading, nothing to sort; a skipped check is no reading.
  assert.equal(readingKind(meal({ at20: null })), null);
  assert.equal(readingKind({ ...meal({ at20: null }), fullness20Skipped: true }), null);
});

test('the meal sheet: a 20-minute value entered or changed there is recalled; one left as it was keeps its kind', () => {
  const checked = meal({ at20: 7 });
  assert.deepEqual(editedReading(checked, 7), {});
  assert.deepEqual(editedReading(checked, 8), { fullness20Recalled: true });
  assert.deepEqual(editedReading(meal({ at20: null }), 6), { fullness20Recalled: true });
  assert.deepEqual(editedReading(meal({ at20: null }), null), {});
  // Changed back to the value the check gave: still entered in the sheet.
  const edited = meal({ how: 'edited', at20: 8 });
  assert.deepEqual(editedReading(edited, 7), { fullness20Recalled: true });
  assert.deepEqual(editedReading(edited, null), { fullness20Recalled: false });
  // The patch applied: the reading counts as recalled from then on.
  assert.equal(readingKind({ ...checked, fullness20: 8, ...editedReading(checked, 8) }), 'recalled');
  assert.equal(readingKind({ ...checked, ...editedReading(checked, 7) }), 'on-time');
});

test('drift, landing in the zone and the lag rest on on-time checks; how often and how hungry count every rated meal', () => {
  const s = satietyStats([
    meal({ stop: 'before_full', hunger: 6, now: 5, at20: 7 }),
    meal({ stop: 'before_full', hunger: 5, now: 5, at20: 6 }),
    meal({ stop: 'full', hunger: 7, now: 7, at20: 8 }),
    meal({ stop: 'stuffed', hunger: 9, now: 8, at20: 10 }),
    meal({ stop: 'full', hunger: 8, now: 6, at20: null }), // no 20-minute reading yet
    // Left out of every 20-minute figure: late, early and added.
    meal({ stop: 'before_full', hunger: 4, now: 3, at20: 9, how: 'late' }),
    meal({ stop: 'full', hunger: 6, now: 6, at20: 4, how: 'early' }),
    meal({ stop: 'stuffed', hunger: 7, now: 9, at20: 2, how: 'added' }),
    meal({ stop: 'stuffed', hunger: 7, now: 9, at20: 2, how: 'edited' }),
  ]);
  assert.equal(s.meals, 9);
  assert.equal(s.rated, 9);
  assert.equal(s.done, 4); // both readings, the 20-minute one on time
  assert.equal(s.both, 8); // both readings, however the 20-minute one was taken: the count at the top
  assert.deepEqual(s.leftOut, { late: 1, early: 1, recalled: 2, total: 4 });
  assert.equal(s.drift, (2 + 1 + 1 + 2) / 4);
  assert.equal(s.landed, 3); // 7, 6 and 8 are in the 6 to 8 zone
  assert.equal(s.pastFull, 3); // how a meal ended counts for every rated meal
  const [lw, sat, over] = s.byStop;
  assert.deepEqual([lw.count, sat.count, over.count], [3, 3, 3]);
  assert.deepEqual([lw.share, sat.share, over.share], [1 / 3, 1 / 3, 1 / 3]);
  assert.equal(lw.rise, 1.5);
  assert.deepEqual([lw.now, lw.at20, lw.rises], [5, 6.5, 2]);
  assert.deepEqual([sat.now, sat.at20, sat.rises], [7, 8, 1]); // the early check and the meal without one are left out
  assert.deepEqual([over.now, over.at20, over.rises], [8, 10, 1]);
  // Arriving hungry counts every rated meal, whatever its 20-minute reading.
  assert.equal(lw.hunger, 5);
  assert.equal(sat.hunger, 7);
  assert.equal(s.landings.length, 4);
  assert.deepEqual(s.landings.map((x) => x.value), [7, 6, 8, 10]);
});

test('with no on-time check there is no drift, and what was left out is still counted', () => {
  const s = satietyStats([meal({ how: 'added' }), meal({ how: 'late' }), meal({ at20: null })]);
  assert.equal(s.drift, null);
  assert.equal(s.done, 0);
  assert.equal(s.both, 2);
  assert.deepEqual(s.leftOut, { late: 1, early: 0, recalled: 1, total: 2 });
  assert.deepEqual(s.landings, []);
  assert.ok(s.byStop.every((r) => r.rises === 0 && r.rise == null));
});

/** n on-time meals stopped at fullness `now`, landing at each value of `lands` in turn. */
const at = (now, n, lands, extra = {}) => Array.from({ length: n }, (_, i) => meal({ now, at20: lands[i % lands.length], ...extra }));

test('the stop point: the fullness right after whose meals most often landed in 6 to 8', () => {
  const point = stopPoint([
    ...at(5, 10, [7, 7, 7, 6, 8, 7, 6, 7, 5, 5]), // 8 of 10 in the zone, none past it
    ...at(6, 6, [7, 9, 8, 9, 7, 9]), // 3 of 6
    ...at(4, 3, [6]), // 3 of 3, but fewer than 5 meals stopped there
  ]);
  assert.deepEqual(point, { value: 5, meals: 10, inZone: 8, past: 0 });
  assert.equal(stopPointWords(point), 'Stop near 5: 8 of your 10 meals stopped there landed in 6 to 8, none past 8.');
});

test('the stop point is rough under 10 meals, and nothing before any value has 5', () => {
  assert.equal(stopPoint(at(5, 4, [7])), null);
  assert.equal(stopPointWords(null), '');
  const rough = stopPoint(at(6, 6, [7, 7, 7, 9, 5, 8]));
  assert.deepEqual(rough, { value: 6, meals: 6, inZone: 4, past: 1 });
  assert.equal(stopPointWords(rough), 'Rough so far, stop near 6: 4 of your 6 meals stopped there landed in 6 to 8, 1 past 8.');
  // A value none of whose meals landed in the zone is never named.
  assert.equal(stopPoint(at(3, 6, [4, 5])), null);
});

test('the stop point breaks ties on fewer past 8, then the lower value', () => {
  // Same share in the zone (4 of 5): the one with none past 8 wins.
  assert.equal(stopPoint([...at(4, 5, [7, 7, 7, 7, 9]), ...at(6, 5, [7, 7, 7, 7, 5])]).value, 6);
  // Same share in the zone, same share past it: the lower value.
  assert.equal(stopPoint([...at(6, 5, [7, 7, 7, 7, 5]), ...at(4, 10, [7, 7, 7, 7, 5])]).value, 4);
  // Shares, not counts: 5 of 5 beats 8 of 10.
  assert.equal(stopPoint([...at(5, 10, [7, 7, 7, 7, 7, 7, 7, 7, 5, 5]), ...at(6, 5, [7])]).value, 6);
});

test('the stop point reads the meals themselves, never 7 minus the drift', () => {
  // The drift is +2 (meals rise 2 on average), so 7 minus the drift is 5. But
  // meals stopped at 5 mostly climbed past the zone, and meals stopped at 4 landed in it.
  const meals = [
    ...at(5, 6, [9, 9, 9, 9, 8, 8]), // rose 22 in all: 2 of 6 in the zone, 4 past it
    ...at(4, 6, [6, 6, 6, 6, 7, 6]), // rose 13: all 6 in the zone
    ...at(7, 4, [6, 6, 6, 7]), // fell 3, and too few meals to be named
  ];
  const s = satietyStats(meals);
  assert.equal(s.drift, 2);
  const point = stopPoint(meals);
  assert.equal(point.value, 4);
  assert.notEqual(point.value, 7 - s.drift);
  assert.equal(stopPointWords(point), 'Rough so far, stop near 4: 6 of your 6 meals stopped there landed in 6 to 8, none past 8.');
});

test('the stop point looks at the last 60 on-time checks only, and never at late, early or added ones', () => {
  // 60 recent meals at 6 all landed at 7; older ones at 5 did too, but they are past the last 60.
  const old = at(5, 10, [7], { day: '2026-08-01' });
  const recent = at(6, 60, [7], { day: '2026-09-20' });
  assert.equal(stopPoint([...old, ...recent]).value, 6);
  assert.equal(stopPoint([...old, ...recent]).meals, 60);
  // Readings not taken on time never count, however many there are.
  const offTime = [...at(5, 10, [7], { how: 'late' }), ...at(5, 10, [7], { how: 'added' }), ...at(5, 10, [7], { how: 'early' })];
  assert.equal(stopPoint(offTime), null);
  assert.deepEqual(stopPoint([...offTime, ...at(6, 5, [8])]), { value: 6, meals: 5, inZone: 5, past: 0 });
});

test('backups keep how each reading was taken, from Sabr and from Fast; the CSV keeps its columns', () => {
  const meals = [meal({ how: 'on-time' }), meal({ how: 'late' }), meal({ how: 'early' }), meal({ how: 'added' }), meal({ how: 'edited' })];
  const data = { days: new Map(), meals, outside: [], temptations: [], weights: new Map(), settings: {} };
  const kinds = meals.map(readingKind);
  assert.deepEqual(kinds, ['on-time', 'late', 'early', 'recalled', 'recalled']);
  const backup = buildBackup(data, { nowTs: T('2026-09-26T12:00'), version: 'test' });
  assert.deepEqual(parseBackup(JSON.stringify(backup)).data.meals.map(readingKind), kinds);
  // Fast records the same fields, without the mark the meal sheet now adds.
  const fast = { ...backup, app: 'fast', data: { ...backup.data, meals: backup.data.meals.map(({ fullness20Recalled, ...m }) => m) } };
  assert.deepEqual(parseBackup(JSON.stringify(fast)).data.meals.map(readingKind), ['on-time', 'late', 'early', 'recalled', 'on-time']);
  // The meals file has the same columns whatever the reading's kind.
  const csv = buildCsvFiles(data, { nowTs: T('2026-09-26T12:00'), todayKey: '2026-09-26', startKey: '2026-09-20' }).find((f) => f.name === 'sabr-meals.csv').text;
  const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.split(',').length === 15));
});
