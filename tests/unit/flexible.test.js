import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../docs/js/core/rules.js';
import { buildIcs, icsTimes } from '../../docs/js/core/ics.js';

// Feasting hours: the window opens at any hour; success is its length alone.

const T = (s) => Date.parse(`${s}:00+03:00`);
const win = (day, first, last) => ({ day, firstBite: T(`${day}T${first}`), lastBite: last ? T(`${day}T${last}`) : null });
const days = (...recs) => new Map(recs.map((r) => [r.day, r]));

test('flexible timing applies from the day it was switched on, and off again', () => {
  const settings = { flexChanges: [{ from: '2026-09-22', on: true }, { from: '2026-09-26', on: false }] };
  assert.equal(rules.isFlexible('2026-09-21', settings), false);
  assert.equal(rules.isFlexible('2026-09-22', settings), true);
  assert.equal(rules.isFlexible('2026-09-25', settings), true);
  assert.equal(rules.isFlexible('2026-09-26', settings), false);
  assert.equal(rules.isFlexible('2026-09-22', {}), false);
});

test('on feasting hours a workday window at 09:00 succeeds; before the switch it was a miss', () => {
  const settings = { flexChanges: [{ from: '2026-09-22', on: true }] };
  // Mon 21 and Tue 22 Sep 2026 are workdays; both windows open at 09:00 and last 3 h 50 min.
  const d = days(win('2026-09-21', '09:00', '12:50'), win('2026-09-22', '09:00', '12:50'), win('2026-09-23', '09:00', '13:30'));
  const evaluate = rules.makeEvaluator({ days: d, outside: [], nowTs: T('2026-09-23T20:00'), todayKey: '2026-09-23', startKey: '2026-09-21', settings });
  assert.deepEqual(evaluate('2026-09-21').reasons, ['early']);
  assert.equal(evaluate('2026-09-22').result, 'success');
  assert.equal(evaluate('2026-09-22').openedEarly, false);
  // Length still counts: 4 h 30 min is over a 4-hour goal plus grace.
  assert.deepEqual(evaluate('2026-09-23').reasons, ['over']);
  assert.equal(rules.cutoffApplies('2026-09-21', null, settings), true);
  assert.equal(rules.cutoffApplies('2026-09-22', null, settings), false);
});

test('the calendar file on feasting hours cancels the two window alerts', () => {
  const s = { holdTime: '13:00', trainingTime: '16:30', workdayStart: '17:30', weekendStart: '14:00' };
  const ics = buildIcs(s, { nowTs: T('2026-09-27T10:00'), todayKey: '2026-09-27', sequence: 1, flexible: true });
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 4);
  assert.equal(ics.match(/STATUS:CANCELLED/g).length, 2);
  assert.equal(ics.match(/BEGIN:VALARM/g).length, 2);
  assert.doesNotMatch(ics, /opens at 17:30/);
  assert.notEqual(icsTimes(s, { flexible: true }), icsTimes(s));
});
