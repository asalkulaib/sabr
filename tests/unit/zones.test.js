import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../../docs/js/core/time.js';
import { timeOnOrAfter } from '../../docs/js/core/rules.js';

// Travel: clock times and days follow the phone's zone, and every moment
// keeps the zone it happened in.

const Z = (s) => Date.parse(s); // an ISO time with its own offset
const KUWAIT = 'Asia/Kuwait';
const DUBAI = 'Asia/Dubai';
const LONDON = 'Europe/London';
// Kuwait until Friday 2 Oct 10:00 (Kuwait), Dubai until Saturday 22:00 (Dubai), then home.
const TRIP = [
  { from: null, zone: KUWAIT },
  { from: Z('2026-10-02T10:00:00+03:00'), zone: DUBAI },
  { from: Z('2026-10-03T22:00:00+04:00'), zone: KUWAIT },
];

const within = (zones, fn) => {
  time.setZones(zones);
  try { fn(); } finally { time.setZones(null); }
};

test('without travel, Kuwait time throughout', () => {
  assert.equal(time.zoneAt(Z('2026-10-02T12:00:00Z')), KUWAIT);
  assert.equal(time.fmtTime(Z('2026-10-02T15:00:00Z')), '18:00');
  assert.equal(time.dayStart('2026-10-02'), Z('2026-10-02T00:00:00+03:00'));
});

test('a Dubai weekend: times read by the phone there, Kuwait days keep theirs', () => {
  within(TRIP, () => {
    // Thursday at home, as it happened.
    assert.equal(time.fmtTime(Z('2026-10-01T18:00:00Z')), '21:00');
    assert.equal(time.dayKey(Z('2026-10-01T20:30:00Z')), '2026-10-01'); // 23:30 in Kuwait
    // Friday morning still at home; the evening in Dubai.
    assert.equal(time.at('2026-10-02', '09:00'), Z('2026-10-02T09:00:00+03:00'));
    assert.equal(time.at('2026-10-02', '19:00'), Z('2026-10-02T19:00:00+04:00'));
    assert.equal(time.fmtTime(Z('2026-10-02T15:00:00Z')), '19:00');
    // Saturday starts at Dubai midnight: 00:30 there is already Saturday.
    assert.equal(time.dayStart('2026-10-03'), Z('2026-10-03T00:00:00+04:00'));
    assert.equal(time.dayKey(Z('2026-10-02T20:30:00Z')), '2026-10-03');
    // Home again: Sunday starts at Kuwait midnight, so Saturday ran 25 hours.
    assert.equal(time.dayStart('2026-10-04'), Z('2026-10-04T00:00:00+03:00'));
    assert.equal(time.dayStart('2026-10-04') - time.dayStart('2026-10-03'), 25 * time.HOUR);
    assert.equal(time.daysBetween('2026-10-01', '2026-10-04'), 3);
    // A last bite after midnight in Dubai lands on the right moment.
    assert.equal(timeOnOrAfter(Z('2026-10-02T22:30:00+04:00'), 30), Z('2026-10-03T00:30:00+04:00'));
  });
});

test('a change of zone starts just after Fast was last open, never later than now', () => {
  const seen = Z('2026-10-02T09:00:00+03:00');
  const nowTs = Z('2026-10-02T19:00:00+04:00');
  assert.deepEqual(time.switchZone(null, DUBAI, seen, nowTs), [{ from: null, zone: KUWAIT }, { from: seen + 1, zone: DUBAI }]);
  // Nothing logged and never seen: the new zone holds throughout.
  assert.deepEqual(time.switchZone(null, DUBAI, null, nowTs), [{ from: null, zone: DUBAI }]);
  // After earlier travel but never seen: from now.
  const monday = Z('2026-10-05T12:00:00+03:00');
  assert.equal(time.switchZone(TRIP, LONDON, null, monday)[3].from, monday);
  // Same zone, or the same clock under another name (Riyadh keeps Kuwait's clock): no change.
  assert.equal(time.switchZone(null, KUWAIT, seen, nowTs), null);
  assert.equal(time.switchZone(null, 'Asia/Riyadh', seen, nowTs), null);
  assert.equal(time.switchZone(TRIP.slice(0, 2), DUBAI, seen, nowTs), null);
  // Not a zone: no change.
  assert.equal(time.switchZone(null, 'Mars/Olympus', seen, nowTs), null);
});

test('flying west late at night, the date never goes back', () => {
  const away = TRIP.slice(0, 2);
  // Last open at 00:30 Sunday in Dubai, which is still 23:30 Saturday in Kuwait.
  const seen = Z('2026-10-04T00:30:00+04:00');
  const next = time.switchZone(away, KUWAIT, seen, Z('2026-10-04T08:00:00+03:00'));
  assert.equal(next[2].from, Z('2026-10-04T00:00:00+03:00')); // Kuwait's own midnight
  within(next, () => {
    assert.equal(time.dayKey(Z('2026-10-04T00:45:00+04:00')), '2026-10-04');
    assert.equal(time.dayStart('2026-10-04'), Z('2026-10-04T00:00:00+04:00'));
  });
});

test('daylight saving: London on the night the clocks go back', () => {
  within([{ from: null, zone: LONDON }], () => {
    assert.equal(time.dayStart('2026-10-25'), Z('2026-10-25T00:00:00+01:00'));
    assert.equal(time.dayStart('2026-10-26'), Z('2026-10-26T00:00:00+00:00'));
    assert.equal(time.dayStart('2026-10-26') - time.dayStart('2026-10-25'), 25 * time.HOUR);
    assert.equal(time.at('2026-10-24', '12:00'), Z('2026-10-24T12:00:00+01:00'));
    assert.equal(time.at('2026-10-25', '12:00'), Z('2026-10-25T12:00:00+00:00'));
    assert.equal(time.fmtTime(Z('2026-10-25T00:30:00Z')), '01:30'); // still summer time
    assert.equal(time.fmtTime(Z('2026-10-25T01:30:00Z')), '01:30'); // the hour again, in winter time
    // A window from 23:00 to 03:00 across the change lasts five hours.
    const first = time.at('2026-10-24', '23:00');
    assert.equal(timeOnOrAfter(first, 3 * 60) - first, 5 * time.HOUR);
    assert.equal(time.daysBetween('2026-10-24', '2026-10-27'), 3);
  });
});

test('zone names for the header', () => {
  assert.equal(time.zoneName(DUBAI), 'Dubai');
  assert.equal(time.zoneName('America/New_York'), 'New York');
  assert.equal(time.isZone(DUBAI), true);
  assert.equal(time.isZone('Nowhere'), false);
});
