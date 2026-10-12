import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, foldLine, escapeText, icsTimes } from '../../docs/js/core/ics.js';
import { buildCsvFiles, csvCell, toCsv } from '../../docs/js/core/csv.js';
import { buildBackup, parseBackup, describeBackup } from '../../docs/js/core/backup.js';
import { setZones } from '../../docs/js/core/time.js';

const T = (s) => Date.parse(`${s}:00+03:00`);
const SETTINGS = { workdayStart: '17:30', weekendStart: '14:00', holdTime: '13:00', trainingTime: '16:30' };

test('ics: four weekly events with alerts at local times that follow the phone', () => {
  const ics = buildIcs(SETTINGS, { nowTs: T('2026-09-25T10:00'), todayKey: '2026-09-25', sequence: 2 });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 4);
  assert.ok(!ics.includes('TZID'));
  // Friday 25 Sep: workday events start on Sunday 27 Sep; weekend event starts today.
  assert.ok(ics.includes('DTSTART:20260927T130000\r\n'));
  assert.ok(ics.includes('DTSTART:20260927T163000\r\n'));
  assert.ok(ics.includes('DTSTART:20260927T173000\r\n'));
  assert.ok(ics.includes('DTSTART:20260925T140000\r\n'));
  assert.equal((ics.match(/RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH/g) || []).length, 3);
  assert.equal((ics.match(/RRULE:FREQ=WEEKLY;BYDAY=FR,SA/g) || []).length, 1);
  assert.equal((ics.match(/SEQUENCE:2/g) || []).length, 4);
  assert.ok(ics.includes('UID:hold-the-line@sabr.reminders'));
  // Every physical line fits in 75 octets and lines end with CRLF only.
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(!/[^\r]\n/.test(ics));
});

test('ics: changed times move the events and change the fingerprint', () => {
  const later = { ...SETTINGS, workdayStart: '18:00' };
  const ics = buildIcs(later, { nowTs: T('2026-09-27T10:00'), todayKey: '2026-09-27' });
  assert.ok(ics.includes('DTSTART:20260927T180000'));
  assert.ok(ics.includes('opens at 18:00'));
  assert.notEqual(icsTimes(SETTINGS), icsTimes(later));
});

test('ics: a file made before alerts followed the phone counts as out of date', async () => {
  const { icsPinnedToKuwait } = await import('../../docs/js/core/ics.js');
  assert.equal(icsPinnedToKuwait('13:00|16:30|17:30|14:00'), true);
  assert.equal(icsPinnedToKuwait(icsTimes(SETTINGS)), false);
  assert.equal(icsPinnedToKuwait(null), false);
});

test('ics: escaping and folding', () => {
  assert.equal(escapeText('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = foldLine(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  assert.ok(parts.slice(1).every((p) => p.startsWith(' ')));
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), long);
});

test('csv: cells are escaped for Excel', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell(-0.5), '-0.5');
  assert.equal(csvCell(null), '');
  const text = toCsv(['a', 'b'], [[1, 'x']]);
  assert.ok(text.startsWith('﻿a,b\r\n1,x\r\n'));
});

function sample() {
  return {
    days: new Map([
      ['2026-09-20', { day: '2026-09-20', firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T21:50'), energy4pm: 4, trained: true, trainingType: 'weights' }],
      ['2026-09-25', { day: '2026-09-25', firstBite: T('2026-09-25T23:00'), lastBite: T('2026-09-26T01:30') }],
    ]),
    meals: [{ id: 1, day: '2026-09-20', name: 'Dinner, with rice', startedAt: T('2026-09-20T17:30'), finishedAt: T('2026-09-20T18:00'), hungerBefore: 7, stop: 'before_full', fullnessNow: 6, fullness20: 7 }],
    outside: [{ id: 1, day: '2026-09-20', at: T('2026-09-20T22:30'), trigger: 'boredom', amount: 'little' }],
    temptations: [{ id: 1, day: '2026-09-20', startedAt: T('2026-09-20T13:00'), endedAt: T('2026-09-20T13:10'), trigger: 'social', outcome: 'held', context: 'before', urges: [{ min: 0, value: 7 }, { min: 3, value: 4 }] }],
    weights: new Map([['2026-09-20', 104.6], ['2026-09-21', 104.3]]),
    settings: { ...SETTINGS, installedAt: T('2026-09-20T08:00') },
  };
}

test('csv: five files with the expected rows', () => {
  const files = buildCsvFiles(sample(), { nowTs: T('2026-09-26T12:00'), todayKey: '2026-09-26', startKey: '2026-09-20' });
  assert.deepEqual(files.map((f) => f.name), ['sabr-windows.csv', 'sabr-meals.csv', 'sabr-weight.csv', 'sabr-checkins.csv', 'sabr-temptations.csv']);
  const rows = (name) => files.find((f) => f.name === name).text.replace('﻿', '').trim().split('\r\n');
  const line = (...cells) => cells.join(',');
  const windows = rows('sabr-windows.csv');
  assert.equal(windows[0], line('date', 'weekday', 'day_type', 'timing', 'time_zone', 'planned_start', 'first_bite', 'last_bite', 'last_bite_date', 'length_min', 'window_goal_min',
    'result', 'reasons', 'over_by_min', 'opened_before_16', 'outside_eating', 'fast_from', 'fast_min', 'fast_goal_min', 'fast_goal_reached', 'fullness'));
  // Every day from the start of tracking to today, gaps included.
  assert.equal(windows.length, 8);
  const day = (key) => windows.find((r) => r.startsWith(`${key},`));
  // The first day has no eating before it on record, so no fast is known.
  assert.equal(day('2026-09-20'), line('2026-09-20', 'Sunday', 'workday', 'planned start', 'Kuwait', '17:30', '17:30', '21:50', '2026-09-20', '260', '240',
    'miss', 'over 4 h 15 min; ate outside the window', '20', 'no', '1', '', '', '1200', '', 'left wanting'));
  // A day with nothing logged, and today with nothing yet.
  assert.equal(day('2026-09-21'), line('2026-09-21', 'Monday', 'workday', 'planned start', 'Kuwait', '17:30', '', '', '', '', '240',
    'not logged', '', '', '', '0', '', '', '1200', '', ''));
  assert.equal(day('2026-09-26'), line('2026-09-26', 'Saturday', 'weekend', 'planned start', 'Kuwait', '14:00', '', '', '', '', '240',
    'nothing yet', '', '', '', '0', '', '', '1200', '', ''));
  // Friday's fast ran from the snack outside the window on the 20th: 5 days and 30 minutes.
  assert.equal(day('2026-09-25'), line('2026-09-25', 'Friday', 'weekend', 'planned start', 'Kuwait', '14:00', '23:00', '01:30', '2026-09-26', '150', '240',
    'success', '', '', 'no', '0', '2026-09-20 22:30', '7230', '1200', 'yes', ''));
  const meals = rows('sabr-meals.csv');
  assert.equal(meals[0], line('date', 'kind', 'type', 'name', 'start', 'finish', 'minutes', 'hunger_before', 'stopped', 'fullness_after', 'fullness_20min', 'rise_20min', 'check_20min_skipped', 'trigger', 'amount'));
  assert.equal(meals[1], line('2026-09-20', 'meal', 'Other', '"Dinner, with rice"', '17:30', '18:00', '30', '7', 'left wanting', '6', '7', '1', '', '', ''));
  assert.equal(meals[2], line('2026-09-20', 'outside the window', '', '', '22:30', '', '', '', '', '', '', '', '', 'boredom', 'a little'));
  assert.deepEqual(rows('sabr-weight.csv'), ['date,kg', '2026-09-20,104.6', '2026-09-21,104.3']);
  assert.deepEqual(rows('sabr-checkins.csv'), ['date,weekday,day_type,energy_4pm,trained,training_type', '2026-09-20,Sunday,workday,4,yes,weights']);
  assert.deepEqual(rows('sabr-temptations.csv'), [
    line('date', 'time', 'when', 'trigger', 'outcome', 'urge_0min', 'urge_3min', 'urge_6min', 'urge_9min', 'minutes'),
    line('2026-09-20', '13:00', 'before the window', 'social', 'held', '7', '4', '', '', '10'),
  ]);
});

test('csv: feasting hours, a pause, a day away, meal types and a skipped check', () => {
  setZones([{ from: null, zone: 'Asia/Kuwait' }, { from: T('2026-10-01T10:00'), zone: 'Asia/Dubai' }]);
  try {
    const data = {
      days: new Map([
        ['2026-09-28', { day: '2026-09-28', paused: 'travel' }],
        ['2026-10-02', { day: '2026-10-02', firstBite: T('2026-10-02T17:00'), lastBite: T('2026-10-02T20:00') }],
      ]),
      meals: [{ id: 1, day: '2026-10-02', name: 'Dinner', startedAt: T('2026-10-02T17:00'), finishedAt: T('2026-10-02T17:40'), hungerBefore: 6, stop: 'full', fullnessNow: 7, fullness20Skipped: true }],
      outside: [],
      temptations: [],
      weights: new Map(),
      settings: { ...SETTINGS, installedAt: T('2026-09-27T08:00'), flexChanges: [{ from: '2026-10-01', on: true }] },
    };
    const files = buildCsvFiles(data, { nowTs: T('2026-10-03T12:00'), todayKey: '2026-10-03', startKey: '2026-09-27' });
    const rows = (name) => files.find((f) => f.name === name).text.replace('﻿', '').trim().split('\r\n');
    const line = (...cells) => cells.join(',');
    const windows = rows('sabr-windows.csv');
    const day = (key) => windows.find((r) => r.startsWith(`${key},`));
    // A paused day: its reason in the result, no planned start.
    assert.equal(day('2026-09-28'), line('2026-09-28', 'Monday', 'workday', 'planned start', 'Kuwait', '', '', '', '', '', '240',
      'paused (travel)', '', '', '', '0', '', '', '1200', '', ''));
    // Feasting hours from 1 October, and the times on Dubai's clock while there.
    assert.equal(day('2026-10-02'), line('2026-10-02', 'Friday', 'weekend', 'feasting hours', 'Dubai', '', '18:00', '21:00', '2026-10-02', '180', '240',
      'success', '', '', 'no', '0', '', '', '1200', '', 'satisfied'));
    const meals = rows('sabr-meals.csv');
    assert.equal(meals[1], line('2026-10-02', 'meal', 'Dinner', 'Dinner', '18:00', '18:40', '40', '6', 'satisfied', '7', '', '', 'yes', '', ''));
  } finally {
    setZones([{ from: null, zone: 'Asia/Kuwait' }]);
  }
});

test('backup: round trip and validation messages', () => {
  const data = sample();
  const backup = buildBackup(data, { nowTs: T('2026-09-26T12:00'), version: 'test' });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.data, JSON.parse(JSON.stringify(backup)).data);
  assert.equal(parsed.skipped, 0);
  assert.deepEqual(describeBackup(parsed), { exportedAt: '2026-09-26T09:00:00.000Z', windows: 2, meals: 1, weighIns: 2, temptations: 1, skipped: 0 });

  assert.throws(() => parseBackup('not json'), /not a backup from Sabr or Fast/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other' })), /not a backup from Sabr or Fast/);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, schema: 99 })), /newer version/);
  const broken = JSON.parse(JSON.stringify(backup));
  delete broken.data.meals;
  assert.throws(() => parseBackup(JSON.stringify(broken)), /incomplete/);
  // A damaged entry is left out instead of blocking the whole restore.
  const damaged = JSON.parse(JSON.stringify(backup));
  damaged.data.weights[0].kg = 'heavy';
  damaged.data.meals.push({ fullness20: 7 }); // a half-empty record
  const partial = parseBackup(JSON.stringify(damaged));
  assert.equal(partial.skipped, 2);
  assert.equal(partial.data.weights.length, 1);
  assert.equal(partial.data.meals.length, 1);
  assert.equal(describeBackup(partial).skipped, 2);
});
