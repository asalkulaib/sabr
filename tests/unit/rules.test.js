import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../../docs/js/core/time.js';
import * as rules from '../../docs/js/core/rules.js';

// Kuwait local time -> epoch ms
const T = (s) => Date.parse(`${s}:00+03:00`);
const MIN = 60000;

// 2026-09-20 is a Sunday; 2026-09-25 is a Friday.
const SUN = '2026-09-20';
const FRI = '2026-09-25';
const SAT = '2026-09-26';

function evalWindow(key, first, last, { outside = 0, dayOff = false, now = T(`${time.addDays(key, 2)}T12:00`) } = {}) {
  const rec = { day: key, firstBite: T(first), lastBite: last ? T(last) : null, dayOff };
  return rules.evaluateDay(key, rec, outside, now, time.dayKey(now), '2026-01-01');
}

test('time: Kuwait day boundaries and week start on Sunday', () => {
  assert.equal(time.dayKey(Date.parse('2026-09-25T20:59:59Z')), '2026-09-25');
  assert.equal(time.dayKey(Date.parse('2026-09-25T21:00:00Z')), '2026-09-26');
  assert.equal(time.at(SUN, '17:30'), Date.parse('2026-09-20T17:30:00+03:00'));
  assert.equal(time.weekday(SUN), 0);
  assert.equal(time.weekday(FRI), 5);
  assert.equal(time.isWorkweekday('2026-09-24'), true); // Thursday
  assert.equal(time.isWorkweekday(FRI), false);
  assert.equal(time.weekStart(FRI), SUN);
  assert.equal(time.weekStart(SUN), SUN);
  assert.equal(time.weekStart(SAT), SUN);
  assert.equal(time.weekStart('2026-09-27'), '2026-09-27');
  assert.equal(time.fmtWeekRange('2026-09-27'), '27 September to 3 October');
});

test('time: a duration as a figure, number and unit apart so the unit can be set small', () => {
  assert.deepEqual(time.durationParts(15 * 60 * MIN + 10 * MIN), [['15', 'h'], ['10', 'm']]);
  assert.deepEqual(time.durationParts(45 * MIN), [['45', 'm']]);
  assert.deepEqual(time.durationParts(20 * 60 * MIN), [['20', 'h']]);
  assert.deepEqual(time.durationParts(0), [['0', 'm']]);
  assert.equal(time.fmtFigure(15 * 60 * MIN + 10 * MIN + 29000), '15h 10m');
  // Past two days, days and whole hours, as the dial has always counted them.
  assert.equal(time.fmtFigure(6 * 24 * 60 * MIN + 12 * 60 * MIN + 40 * MIN), '6 days 12h');
  assert.equal(time.fmtFigure(3 * 24 * 60 * MIN + 20 * MIN), '3 days');
});

test('time: formatting and parsing', () => {
  assert.equal(time.fmtDuration(4 * 60 * MIN + 10 * MIN), '4 h 10 min');
  assert.equal(time.fmtDuration(52 * MIN), '52 min');
  assert.equal(time.fmtDuration(4 * 60 * MIN), '4 h');
  assert.equal(time.fmtCountdown(2 * 60 * MIN + 41 * MIN + 30000), '2:42');
  assert.equal(time.fmtCountdown(30000), '0:01');
  assert.equal(time.fmtCountdown(0), '0:00');
  assert.equal(time.fmtTimer(9 * MIN + 59500), '10:00');
  assert.equal(time.fmtTime(T('2026-09-20T07:05')), '07:05');
  assert.equal(time.fmtDayLong(FRI), 'Friday 25 September');
  assert.equal(time.fmtWhen(T('2026-09-24T21:05'), FRI), '21:05 yesterday');
  assert.equal(time.fmtOnDay(T('2026-09-26T01:30'), FRI), '01:30 next day');
  assert.equal(time.fmtOnDay(T('2026-09-25T23:10'), FRI), '23:10');
  assert.equal(time.floorToMinute(T('2026-09-20T17:30') + 59999), T('2026-09-20T17:30'));
});

test('a normal window succeeds', () => {
  const e = evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T21:00');
  assert.equal(e.result, 'success');
  assert.equal(e.state, 'closed');
  assert.equal(e.lengthMs, 210 * MIN);
  assert.equal(e.workday, true);
});

test('4 h 10 min succeeds inside the grace period; 4 h 20 min misses and is over by 20 min', () => {
  const ok = evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T21:40');
  assert.equal(ok.result, 'success');
  assert.equal(ok.overByMs, 0);

  const miss = evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T21:50');
  assert.equal(miss.result, 'miss');
  assert.deepEqual(miss.reasons, ['over']);
  assert.equal(miss.overByMs, 20 * MIN);
});

test('exactly 4 h 15 min is still a success; 4 h 16 min is not', () => {
  assert.equal(evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T21:45').result, 'success');
  const e = evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T21:46');
  assert.equal(e.result, 'miss');
  assert.equal(e.overByMs, 16 * MIN);
});

test('workday window opening at 15:30 is a miss even when short', () => {
  const e = evalWindow('2026-09-22', '2026-09-22T15:30', '2026-09-22T18:00');
  assert.equal(e.result, 'miss');
  assert.deepEqual(e.reasons, ['early']);
  assert.equal(e.openedEarly, true);
});

test('workday window opening at exactly 16:00 is allowed', () => {
  const e = evalWindow('2026-09-22', '2026-09-22T16:00', '2026-09-22T19:30');
  assert.equal(e.result, 'success');
  assert.equal(e.openedEarly, false);
});

test('weekend windows can move earlier or later', () => {
  const early = evalWindow(FRI, '2026-09-25T12:00', '2026-09-25T15:30');
  assert.equal(early.result, 'success');
  assert.equal(early.workday, false);
  const late = evalWindow(SAT, '2026-09-26T19:00', '2026-09-26T22:45');
  assert.equal(late.result, 'success');
});

test('a day off follows weekend rules', () => {
  const e = evalWindow('2026-09-21', '2026-09-21T13:00', '2026-09-21T16:30', { dayOff: true });
  assert.equal(e.workday, false);
  assert.equal(e.result, 'success');
});

test('eating after the window closes makes the day a miss', () => {
  const e = evalWindow(SUN, '2026-09-20T17:30', '2026-09-20T20:00', { outside: 1 });
  assert.equal(e.result, 'miss');
  assert.deepEqual(e.reasons, ['outside']);
});

test('a window crossing midnight counts for the day of its first bite', () => {
  const first = T('2026-09-25T23:00');
  const last = T('2026-09-26T01:30');
  assert.equal(time.dayKey(first), FRI);
  const e = evalWindow(FRI, '2026-09-25T23:00', '2026-09-26T01:30');
  assert.equal(e.result, 'success');
  assert.equal(e.lengthMs, last - first);
  assert.equal(rules.timeOnOrAfter(T('2026-09-25T22:30'), 90), T('2026-09-26T01:30'));
  assert.equal(rules.timeOnOrAfter(T('2026-09-25T17:30'), 21 * 60), T('2026-09-25T21:00'));
  assert.equal(rules.timeOnOrAfter(T('2026-09-25T17:30'), 17 * 60 + 30), T('2026-09-25T17:30'));
});

test('an open window is pending until it runs past 4 h 15 min', () => {
  const rec = { day: SUN, firstBite: T('2026-09-20T17:30'), lastBite: null };
  const pending = rules.evaluateDay(SUN, rec, 0, T('2026-09-20T21:40'), SUN, SUN);
  assert.equal(pending.result, 'pending');
  assert.equal(pending.state, 'open');
  const over = rules.evaluateDay(SUN, rec, 0, T('2026-09-20T21:46'), SUN, SUN);
  assert.equal(over.result, 'miss');
  assert.equal(over.overByMs, 16 * MIN);
});

test('no eating counts as success; unlogged past days and pending today', () => {
  assert.equal(rules.evaluateDay(SUN, { day: SUN, noEating: true }, 0, T('2026-09-22T09:00'), '2026-09-22', SUN).result, 'success');
  assert.equal(rules.evaluateDay(SUN, undefined, 0, T('2026-09-22T09:00'), '2026-09-22', SUN).result, 'unlogged');
  assert.equal(rules.evaluateDay('2026-09-22', undefined, 0, T('2026-09-22T09:00'), '2026-09-22', SUN).result, 'pending');
  assert.equal(rules.evaluateDay('2026-09-19', undefined, 0, T('2026-09-22T09:00'), '2026-09-22', SUN).result, 'none');
});

function daysMap(list) {
  return new Map(list.map((r) => [r.day, r]));
}

test('streaks: consecutive successes, today pending does not break it', () => {
  const days = daysMap([
    { day: '2026-09-20', firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T21:00') },
    { day: '2026-09-21', firstBite: T('2026-09-21T15:00'), lastBite: T('2026-09-21T18:00') }, // early: miss
    { day: '2026-09-22', firstBite: T('2026-09-22T17:30'), lastBite: T('2026-09-22T21:00') },
    { day: '2026-09-23', firstBite: T('2026-09-23T17:30'), lastBite: T('2026-09-23T21:00') },
  ]);
  const now = T('2026-09-24T10:00');
  const ev = rules.makeEvaluator({ days, outside: [], nowTs: now, todayKey: '2026-09-24', startKey: '2026-09-20' });
  assert.deepEqual(rules.streaks(ev, '2026-09-24', '2026-09-20', '2026-09-24'), { current: 2, best: 2 });
});

test('streaks: an unlogged day breaks the run; best keeps the longest', () => {
  const days = daysMap([
    { day: '2026-09-20', firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T21:00') },
    { day: '2026-09-21', firstBite: T('2026-09-21T17:30'), lastBite: T('2026-09-21T21:00') },
    { day: '2026-09-22', noEating: true },
    // 2026-09-23 unlogged
    { day: '2026-09-24', firstBite: T('2026-09-24T17:30'), lastBite: T('2026-09-24T21:00') },
  ]);
  const now = T('2026-09-24T22:00');
  const ev = rules.makeEvaluator({ days, outside: [], nowTs: now, todayKey: '2026-09-24', startKey: '2026-09-20' });
  assert.deepEqual(rules.streaks(ev, '2026-09-24', '2026-09-20', '2026-09-24'), { current: 1, best: 3 });
});

test('streaks: a miss today resets the current streak', () => {
  const days = daysMap([
    { day: '2026-09-20', firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T21:00') },
    { day: '2026-09-21', firstBite: T('2026-09-21T14:00'), lastBite: null },
  ]);
  const now = T('2026-09-21T14:30');
  const ev = rules.makeEvaluator({ days, outside: [], nowTs: now, todayKey: '2026-09-21', startKey: '2026-09-20' });
  assert.deepEqual(rules.streaks(ev, '2026-09-21', '2026-09-20', '2026-09-21'), { current: 0, best: 1 });
});

test('streaks: last night\'s window still open after midnight does not break the run', () => {
  const days = daysMap([
    { day: '2026-09-21', firstBite: T('2026-09-21T17:30'), lastBite: T('2026-09-21T21:00') },
    { day: '2026-09-22', firstBite: T('2026-09-22T17:30'), lastBite: T('2026-09-22T21:00') },
    { day: '2026-09-23', firstBite: T('2026-09-23T21:30'), lastBite: null }, // still open at 00:30
  ]);
  const now = T('2026-09-24T00:30');
  const ev = rules.makeEvaluator({ days, outside: [], nowTs: now, todayKey: '2026-09-24', startKey: '2026-09-21' });
  assert.equal(ev('2026-09-23').result, 'pending');
  assert.deepEqual(rules.streaks(ev, '2026-09-24', '2026-09-21'), { current: 2, best: 2 });
});

test('time: nearestTime keeps an edited time next to the original', () => {
  assert.equal(time.nearestTime(T('2026-09-20T17:05'), 17 * 60 + 20), T('2026-09-20T17:20'));
  assert.equal(time.nearestTime(T('2026-09-20T23:50'), 10), T('2026-09-21T00:10'));
  assert.equal(time.nearestTime(T('2026-09-21T00:10'), 23 * 60 + 50), T('2026-09-20T23:50'));
});

test('today mode: after midnight, last night\'s window stays while it can still reopen', () => {
  const days = daysMap([{ day: FRI, firstBite: T('2026-09-25T21:00'), lastBite: T('2026-09-25T23:30') }]);
  const m = rules.todayMode({ days, todayKey: SAT, nowTs: T('2026-09-26T00:30') });
  assert.equal(m.mode, 'closed');
  assert.equal(m.rec.day, FRI);
  assert.equal(rules.todayMode({ days, todayKey: SAT, nowTs: T('2026-09-26T01:05') }).mode, 'before');
});

test('today mode: before, open, forgot, closed', () => {
  const today = '2026-09-22';
  assert.equal(rules.todayMode({ days: new Map(), todayKey: today, nowTs: T('2026-09-22T10:00') }).mode, 'before');
  const open = daysMap([{ day: today, firstBite: T('2026-09-22T17:30'), lastBite: null }]);
  assert.equal(rules.todayMode({ days: open, todayKey: today, nowTs: T('2026-09-22T19:00') }).mode, 'open');
  assert.equal(rules.todayMode({ days: open, todayKey: today, nowTs: T('2026-09-22T23:30') }).mode, 'forgot');
  const closed = daysMap([{ day: today, firstBite: T('2026-09-22T17:30'), lastBite: T('2026-09-22T20:00') }]);
  assert.equal(rules.todayMode({ days: closed, todayKey: today, nowTs: T('2026-09-22T21:00') }).mode, 'closed');
  // Yesterday's window still open after midnight is the live window.
  const cross = daysMap([{ day: '2026-09-25', firstBite: T('2026-09-25T23:00'), lastBite: null }]);
  const m = rules.todayMode({ days: cross, todayKey: SAT, nowTs: T('2026-09-26T00:40') });
  assert.equal(m.mode, 'open');
  assert.equal(m.rec.day, FRI);
});

test('late night: food between 00:00 and 04:00 can go against last night', () => {
  const days = daysMap([{ day: FRI, firstBite: T('2026-09-25T14:00'), lastBite: T('2026-09-25T17:30') }]);
  assert.equal(rules.lateNightDay({ days, todayKey: SAT, nowTs: T('2026-09-26T00:30') }), FRI);
  assert.equal(rules.lateNightDay({ days, todayKey: SAT, nowTs: T('2026-09-26T04:10') }), null);
  assert.equal(rules.lateNightDay({ days: new Map(), todayKey: SAT, nowTs: T('2026-09-26T00:30') }), null);
});

test('window phases and reopening', () => {
  const rec = { firstBite: T('2026-09-20T17:30'), lastBite: null };
  assert.equal(rules.windowPhase(rec, T('2026-09-20T20:00')), 'window');
  assert.equal(rules.windowPhase(rec, T('2026-09-20T21:00')), 'warn');
  assert.equal(rules.windowPhase(rec, T('2026-09-20T21:30')), 'grace');
  assert.equal(rules.windowPhase(rec, T('2026-09-20T21:46')), 'over');
  const closed = { firstBite: T('2026-09-20T17:30'), lastBite: T('2026-09-20T19:00') };
  assert.equal(rules.canReopen(closed, T('2026-09-20T21:00')), true);
  assert.equal(rules.canReopen(closed, T('2026-09-20T21:31')), false);
});

test('planned start follows workday, weekend and day off', () => {
  const s = { workdayStart: '17:30', weekendStart: '14:00' };
  assert.equal(rules.plannedStartMin(SUN, undefined, s), 1050);
  assert.equal(rules.plannedStartMin(FRI, undefined, s), 840);
  assert.equal(rules.plannedStartMin(SUN, { dayOff: true }, s), 840);
});
