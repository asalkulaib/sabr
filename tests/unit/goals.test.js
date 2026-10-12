import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../docs/js/core/rules.js';
import { dailySeries } from '../../docs/js/core/history.js';
import { LEFT_WANTING, dayFullness } from '../../docs/js/core/fullness.js';

// Goals and fullness.

const T = (s) => Date.parse(`${s}:00+03:00`);
const H = 3_600_000;
const MIN = 60_000;
const win = (day, first, last, extra = {}) => ({ day, firstBite: T(`${day}T${first}`), lastBite: last ? T(`${day}T${last}`) : null, ...extra });
const days = (...recs) => new Map(recs.map((r) => [r.day, r]));

test('the eating-window goal: 4 hours unless changed, and a change applies from its day on', () => {
  assert.equal(rules.windowMsFor('2026-09-20', {}), 4 * H);
  const settings = { goalChanges: [{ from: '2026-09-22', hours: 8 }, { from: '2026-09-25', hours: 6 }] };
  assert.equal(rules.windowMsFor('2026-09-21', settings), 4 * H);
  assert.equal(rules.windowMsFor('2026-09-22', settings), 8 * H);
  assert.equal(rules.windowMsFor('2026-09-24', settings), 8 * H);
  assert.equal(rules.windowMsFor('2026-09-30', settings), 6 * H);
  assert.equal(rules.goalLabel(8 * H), '16:8');
  assert.equal(rules.goalLabel(H), '23:1');
});

test('a fasting goal: 12 to 23 hours is the rest of the day; 24 to 72 hours is a long fast that keeps the window', () => {
  const settings = { goalChanges: [{ from: '2026-09-22', hours: 6 }, { from: '2026-09-25', hours: 6, fast: 48 }] };
  assert.equal(rules.fastHoursFor('2026-09-21', settings), 20);
  assert.equal(rules.fastHoursFor('2026-09-22', settings), 18);
  assert.equal(rules.longFastHours('2026-09-22', settings), null);
  assert.equal(rules.fastHoursFor('2026-09-26', settings), 48);
  assert.equal(rules.longFastHours('2026-09-26', settings), 48);
  assert.equal(rules.windowMsFor('2026-09-26', settings), 6 * H); // each eating day keeps its window
  assert.equal(rules.goalLabelFor('2026-09-22', settings), '18:6');
  assert.equal(rules.goalLabelFor('2026-09-26', settings), '48 h fast');
  assert.equal(rules.noWindowAlerts('2026-09-22', settings), false);
  assert.equal(rules.noWindowAlerts('2026-09-26', settings), true);
});

test('a long fast: a day that begins inside its goal is a success; past the goal it is not logged', () => {
  const settings = { goalChanges: [{ from: '2026-09-20', hours: 6, fast: 48 }] };
  // Last bite Sat 21:00; the goal is reached Mon 21:00. Sunday begins inside it.
  const d = days(win('2026-09-26', '16:00', '21:00'));
  const at = (now, todayKey) => rules.makeEvaluator({ days: d, outside: [], nowTs: T(now), todayKey, startKey: '2026-09-26', settings });
  const mon = at('2026-09-28T10:00', '2026-09-28');
  assert.equal(mon('2026-09-27').result, 'success');
  assert.equal(mon('2026-09-27').state, 'fasted');
  assert.equal(mon('2026-09-28').result, 'pending'); // today waits
  // Fasting on past the goal: Monday began inside it, Tuesday did not.
  const wed = at('2026-09-30T10:00', '2026-09-30');
  assert.equal(wed('2026-09-28').state, 'fasted');
  assert.equal(wed('2026-09-29').result, 'unlogged');
  // Eating outside on a fasted day is still a miss.
  const slip = rules.makeEvaluator({ days: d, outside: [{ day: '2026-09-27', at: T('2026-09-27T13:00') }], nowTs: T('2026-09-28T10:00'), todayKey: '2026-09-28', startKey: '2026-09-26', settings });
  assert.equal(slip('2026-09-27').result, 'miss');
  // A pause in between makes the fast unknown.
  const paused = days(win('2026-09-26', '16:00', '21:00'), { day: '2026-09-27', paused: 'travel' });
  const p = rules.makeEvaluator({ days: paused, outside: [], nowTs: T('2026-09-29T10:00'), todayKey: '2026-09-29', startKey: '2026-09-26', settings });
  assert.equal(p('2026-09-28').result, 'unlogged');
  // On a daily goal, the same day is not logged.
  const daily = rules.makeEvaluator({ days: d, outside: [], nowTs: T('2026-09-28T10:00'), todayKey: '2026-09-28', startKey: '2026-09-26', settings: { goalChanges: [{ from: '2026-09-20', hours: 6 }] } });
  assert.equal(daily('2026-09-27').result, 'unlogged');
  // Eating days keep the window rules: breaking the fast early is no miss, a long window is.
  const ate = days(win('2026-09-26', '16:00', '21:00'), win('2026-09-27', '17:00', '20:00'), win('2026-09-29', '16:00', '23:00'));
  const e = rules.makeEvaluator({ days: ate, outside: [], nowTs: T('2026-09-30T10:00'), todayKey: '2026-09-30', startKey: '2026-09-26', settings });
  assert.equal(e('2026-09-27').result, 'success');
  assert.equal(e('2026-09-28').state, 'fasted');
  assert.equal(e('2026-09-29').result, 'miss');
});

test('a long fast: a window past midnight, a window left open, and eating on a paused day', () => {
  const settings = { goalChanges: [{ from: '2026-09-20', hours: 4, fast: 24 }] };
  const judge = (recs, now, todayKey, meals = []) => rules.makeEvaluator({ days: days(...recs), outside: [], meals, nowTs: T(now), todayKey, startKey: '2026-09-26', settings });
  // Sunday's dinner runs 23:30 to 00:10: the fast is timed from it, so Monday begins inside a 24-hour goal.
  const late = { day: '2026-09-27', firstBite: T('2026-09-27T23:30'), lastBite: T('2026-09-28T00:10') };
  const e = judge([win('2026-09-26', '17:00', '20:00'), late], '2026-10-01T10:00', '2026-10-01');
  assert.equal(e('2026-09-28').state, 'fasted');
  assert.equal(e('2026-09-29').state, 'fasted'); // begins 23 h 50 min after the last bite, at 00:10
  assert.equal(e('2026-09-30').result, 'unlogged');
  // A window still open: when eating ended is unknown, so no day after it counts as fasted.
  const open = judge([win('2026-09-26', '17:00', '20:00'), win('2026-09-27', '18:00', null)], '2026-09-29T10:00', '2026-09-29');
  assert.equal(open('2026-09-28').result, 'unlogged');
  // A meal on a paused day: eating then went unrecorded, so the next day is not judged fasted.
  const paused = [win('2026-09-26', '17:00', '20:00'), { day: '2026-09-27', paused: 'travel' }];
  const meal = [{ id: 1, day: '2026-09-27', startedAt: T('2026-09-27T13:00'), finishedAt: T('2026-09-27T13:30') }];
  assert.equal(judge(paused, '2026-09-29T10:00', '2026-09-29', meal)('2026-09-28').result, 'unlogged');
  // A fast begun on the paused day itself still counts.
  const begun = [win('2026-09-26', '17:00', '20:00'), { day: '2026-09-27', paused: 'travel', fastFrom: T('2026-09-27T22:00') }];
  assert.equal(judge(begun, '2026-09-29T10:00', '2026-09-29')('2026-09-28').state, 'fasted');
});

test('a long fast still short of its goal, from the last bite or Begin fast', () => {
  const settings = { goalChanges: [{ from: '2026-09-20', hours: 6, fast: 36 }] };
  const data = (nowTs, d) => ({ days: d, meals: [], outside: [], todayKey: '2026-09-27', nowTs: T(nowTs), settings });
  const d = days(win('2026-09-26', '16:00', '21:00'));
  assert.deepEqual(rules.longFastAhead(data('2026-09-27T12:00', d)), { hours: 36, at: T('2026-09-28T09:00') });
  assert.equal(rules.longFastAhead(data('2026-09-28T09:00', d)), null);
  const begun = days({ day: '2026-09-26', fastFrom: T('2026-09-26T22:00') });
  assert.equal(rules.longFastAhead(data('2026-09-27T12:00', begun)).at, T('2026-09-28T10:00'));
  assert.equal(rules.longFastAhead({ ...data('2026-09-27T12:00', d), settings: {} }), null);
});

test('a day is judged by the goal it had: 7 h passes on 16:8, not on 20:4', () => {
  const d = days(win('2026-09-21', '16:00', '23:00'), win('2026-09-22', '16:00', '23:00'), win('2026-09-23', '16:00', '00:30'));
  d.set('2026-09-23', { ...d.get('2026-09-23'), lastBite: T('2026-09-24T00:30') });
  const settings = { goalChanges: [{ from: '2026-09-22', hours: 8 }] };
  const evaluate = rules.makeEvaluator({ days: d, outside: [], nowTs: T('2026-09-26T12:00'), todayKey: '2026-09-26', startKey: '2026-09-21', settings });
  assert.equal(evaluate('2026-09-21').result, 'miss'); // 7 h on the old 4-hour goal
  assert.equal(evaluate('2026-09-21').overByMs, 3 * H);
  assert.equal(evaluate('2026-09-22').result, 'success'); // 7 h on 16:8
  assert.equal(evaluate('2026-09-23').result, 'miss'); // 8 h 30 min is past 8 h 15 min
  assert.equal(evaluate('2026-09-23').overByMs, 30 * MIN);
});

test('with a longer goal, the countdown phases and the forgotten close follow it', () => {
  const rec = win('2026-09-27', '16:00', null);
  assert.equal(rules.windowPhase(rec, T('2026-09-27T21:00'), 8 * H), 'window');
  assert.equal(rules.windowPhase(rec, T('2026-09-27T23:40'), 8 * H), 'warn');
  assert.equal(rules.windowPhase(rec, T('2026-09-28T00:05'), 8 * H), 'grace');
  assert.equal(rules.windowPhase(rec, T('2026-09-28T00:20'), 8 * H), 'over');
  const settings = { goalChanges: [{ from: '2026-09-27', hours: 8 }] };
  const d = days(rec);
  // Six hours in is still inside an 8-hour window; ten hours in asks for the last bite.
  assert.equal(rules.todayMode({ days: d, todayKey: '2026-09-27', nowTs: T('2026-09-27T22:00'), settings }).mode, 'open');
  assert.equal(rules.todayMode({ days: d, todayKey: '2026-09-28', nowTs: T('2026-09-28T02:00'), settings }).mode, 'forgot');
  assert.equal(rules.canReopen(win('2026-09-27', '16:00', '19:00'), T('2026-09-27T23:00'), 8 * H), true);
});

test('Begin fast: a fast start counts as the start of the current fast, and History uses it', () => {
  const d = days(win('2026-09-25', '17:00', '21:00'), { day: '2026-09-26', fastFrom: T('2026-09-26T22:30') }, win('2026-09-27', '17:30', '21:30'));
  const src = rules.lastEatingSource({ days: d, meals: [], outside: [], todayKey: '2026-09-27' });
  assert.equal(src.kind, 'window');
  const before = rules.lastEatingSource({ days: days(win('2026-09-25', '17:00', '21:00'), { day: '2026-09-26', fastFrom: T('2026-09-26T22:30') }), meals: [], outside: [], todayKey: '2026-09-27' });
  assert.deepEqual([before.kind, before.ts], ['fast', T('2026-09-26T22:30')]);
  assert.equal(rules.lastBiteTs({ days: d, meals: [], outside: [] }), T('2026-09-27T21:30'));
  const s = dailySeries({ days: d, meals: [], outside: [] }, '2026-09-27', '2026-09-27');
  assert.equal(s[0].fastMs, T('2026-09-27T17:30') - T('2026-09-26T22:30'));
  // A fast begun on the last day of a pause still counts after the pause.
  const paused = days({ day: '2026-09-26', paused: 'travel', fastFrom: T('2026-09-26T21:00') });
  assert.equal(rules.lastEatingTs({ days: paused, meals: [], outside: [], todayKey: '2026-09-27' }), T('2026-09-26T21:00'));
});

test('a first fast begun last night does not make last night a tracked day', () => {
  const d = days({ day: '2026-09-26', fastFrom: T('2026-09-26T18:00') });
  const start = rules.trackingStart({ days: d, meals: [], outside: [], temptations: [], installedAt: T('2026-09-27T09:00') }, '2026-09-27');
  assert.equal(start, '2026-09-27');
  d.set('2026-09-25', win('2026-09-25', '17:00', '20:00'));
  assert.equal(rules.trackingStart({ days: d, meals: [], outside: [], temptations: [], installedAt: T('2026-09-27T09:00') }, '2026-09-27'), '2026-09-25');
});

test('a day is left wanting only when every meal was, or the day itself was rated so', () => {
  const m = (stop) => ({ stop });
  assert.equal(dayFullness([m('before_full'), m('before_full')], null), LEFT_WANTING);
  assert.equal(dayFullness([m('before_full'), m('full')], null), 'full');
  assert.equal(dayFullness([m('stuffed'), m('full')], null), 'stuffed');
  assert.equal(dayFullness([m('before_full'), m(null)], null), null); // one meal unrated
  assert.equal(dayFullness([m('before_full'), m(null)], { fullness: 'before_full' }), LEFT_WANTING);
  assert.equal(dayFullness([], { fullness: 'full' }), 'full'); // a paused day's own rating
  assert.equal(dayFullness([], null), null);
});
