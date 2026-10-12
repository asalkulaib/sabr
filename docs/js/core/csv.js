// CSV exports for Excel: UTF-8 with BOM, CRLF line ends, ISO dates, 24-hour times.
// One file each for windows, meals, weight, check-ins and temptations; every
// column a single fact, so a spreadsheet can sort, filter and chart it.

import { HOUR, MIN, addDays, at, dayKey, fmtDuration, fmtMinutes, fmtTime, minutesOfDay, weekdayName, zoneAt, zoneName } from './time.js';
import { CUTOFF_MIN, GRACE_MS, fastHoursFor, isFlexible, isWorkday, makeEvaluator, plannedStartMin } from './rules.js';
import { FULLNESS_WORD, dayFullness, mealsByDay } from './fullness.js';
import { dailySeries } from './history.js';
import { typeOfName } from './meal-types.js';

const BOM = String.fromCharCode(0xfeff);

const reasonText = (r, e) => ({
  early: 'opened before 16:00',
  over: `over ${fmtDuration(e.windowMs + GRACE_MS)}`,
  outside: 'ate outside the window',
}[r]);
const OUTCOME_TEXT = { held: 'held', opened_early: 'opened window early', ate_little: 'ate a little outside the window', ate_outside: 'ate outside the window' };
const AMOUNT_TEXT = { little: 'a little', meal: 'more than a little' };
// A day with nothing to judge yet: today, or a past day with nothing logged.
const RESULT_TEXT = { pending: 'nothing yet', unlogged: 'not logged', none: null };
// Where the day stood when the temptation came.
const WHEN_TEXT = { before: 'before the window', after: 'after the window', late: "late at night, after last night's window", open: 'while the window was open' };
// The urge is rated at these minutes of the 10-minute timer.
const URGE_MINUTES = [0, 3, 6, 9];

export function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  // Text that starts like a formula is kept as text in Excel.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header, rows) {
  return BOM + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const time = (ts) => (ts ? fmtTime(ts) : null);
const minutes = (ms) => Math.round(ms / 60000);
/** A moment as date and time: '2026-09-26 21:00'. */
const stamp = (ts) => `${dayKey(ts)} ${fmtTime(ts)}`;

function dayType(key, rec) {
  if (rec && rec.dayOff) return 'day off';
  return isWorkday(key, rec) ? 'workday' : 'weekend';
}

/**
 * data: { days: Map, meals: [], outside: [], temptations: [], weights: Map, settings }
 * Returns [{ name, text }] for windows, meals, weight, check-ins and temptations.
 */
export function buildCsvFiles(data, { nowTs, todayKey, startKey }) {
  const evaluate = makeEvaluator({ days: data.days, outside: data.outside, meals: data.meals, nowTs, todayKey, startKey, settings: data.settings });
  const byDay = mealsByDay(data.meals);
  const dayKeys = [...data.days.keys()].sort();
  const outsideKeys = new Set(data.outside.map((o) => o.day));
  const logged = [...dayKeys.filter((k) => {
    const r = data.days.get(k);
    return r.firstBite || r.noEating || r.paused;
  }), ...outsideKeys];
  // Every day from the start of tracking to today, so a gap shows as not logged.
  const all = new Set(logged);
  if (startKey && todayKey) for (let k = startKey; k <= todayKey; k = addDays(k, 1)) all.add(k);
  const windowKeys = [...all].sort();
  // The fast that ended on each day, as History counts it: from the last
  // eating (or a fast begun) before that day's first bite.
  const fastOf = new Map(windowKeys.length
    ? dailySeries(data, windowKeys[0], windowKeys[windowKeys.length - 1]).map((d) => [d.day, d.fastMs])
    : []);

  const windows = toCsv(
    ['date', 'weekday', 'day_type', 'timing', 'time_zone', 'planned_start', 'first_bite', 'last_bite', 'last_bite_date', 'length_min', 'window_goal_min',
      'result', 'reasons', 'over_by_min', 'opened_before_16', 'outside_eating', 'fast_from', 'fast_min', 'fast_goal_min', 'fast_goal_reached', 'fullness'],
    windowKeys.map((k) => {
      const rec = data.days.get(k);
      const e = evaluate(k);
      let result = e.state === 'open' ? 'open' : e.state === 'noEating' && e.result === 'success' ? 'no eating' : e.state === 'fasted' ? 'fasted' : e.result;
      if (Object.hasOwn(RESULT_TEXT, result)) result = RESULT_TEXT[result];
      if (e.result === 'paused' && typeof e.paused === 'string') result = `paused (${e.paused})`;
      const flexible = isFlexible(k, data.settings);
      const fastMs = fastOf.get(k) ?? null;
      const fastGoalMs = fastHoursFor(k, data.settings) * HOUR;
      return [
        k, weekdayName(k), dayType(k, rec),
        flexible ? 'feasting hours' : 'planned start',
        // Times are read on the clock of where they happened.
        zoneName(zoneAt(e.firstBite || at(k, '12:00'))),
        flexible || e.result === 'paused' || !(data.settings && data.settings.workdayStart) ? null : fmtMinutes(plannedStartMin(k, rec, data.settings)),
        time(e.firstBite), time(e.lastBite), e.lastBite ? dayKey(e.lastBite) : null,
        e.firstBite && e.lastBite ? minutes(e.lengthMs) : null,
        Math.round(e.windowMs / MIN),
        result,
        e.reasons.map((r) => reasonText(r, e)).join('; ') || null,
        e.overByMs ? minutes(e.overByMs) : null,
        e.firstBite ? (minutesOfDay(e.firstBite) < CUTOFF_MIN ? 'yes' : 'no') : null,
        e.outsideCount,
        fastMs != null ? stamp(e.firstBite - fastMs) : null,
        fastMs != null ? minutes(fastMs) : null,
        minutes(fastGoalMs),
        fastMs != null ? (fastMs >= fastGoalMs ? 'yes' : 'no') : null,
        FULLNESS_WORD[dayFullness(byDay.get(k) || [], rec)] || null,
      ];
    }),
  );

  const mealRows = [
    ...data.meals.map((m) => {
      const type = typeOfName(m.name);
      return { sort: m.startedAt, row: [
        m.day, m.outside ? 'meal outside the window' : 'meal', type === 'other' ? 'Other' : type, m.name || null,
        time(m.startedAt), time(m.finishedAt), m.startedAt && m.finishedAt ? minutes(m.finishedAt - m.startedAt) : null,
        m.hungerBefore ?? null, m.stop ? FULLNESS_WORD[m.stop] : null, m.fullnessNow ?? null, m.fullness20 ?? null,
        m.fullnessNow != null && m.fullness20 != null ? m.fullness20 - m.fullnessNow : null,
        m.fullness20Skipped ? 'yes' : null,
        null, null,
      ] };
    }),
    ...data.outside.map((o) => ({ sort: o.at, row: [
      o.day, 'outside the window', null, null, time(o.at), null, null, null, null, null, null, null, null,
      o.trigger || null, AMOUNT_TEXT[o.amount] || o.amount || null,
    ] })),
  ].sort((a, b) => a.sort - b.sort).map((x) => x.row);
  const meals = toCsv(
    ['date', 'kind', 'type', 'name', 'start', 'finish', 'minutes', 'hunger_before', 'stopped', 'fullness_after', 'fullness_20min', 'rise_20min', 'check_20min_skipped', 'trigger', 'amount'],
    mealRows,
  );

  const weight = toCsv(
    ['date', 'kg'],
    [...data.weights.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, kg]) => [date, kg]),
  );

  const checkins = toCsv(
    ['date', 'weekday', 'day_type', 'energy_4pm', 'trained', 'training_type'],
    dayKeys
      .map((k) => [k, data.days.get(k)])
      .filter(([, r]) => r.energy4pm != null || r.trained != null || r.dayOff)
      .map(([k, r]) => [k, weekdayName(k), dayType(k, r), r.energy4pm ?? null, r.trained == null ? null : r.trained ? 'yes' : 'no', r.trained ? r.trainingType || null : null]),
  );

  const urge = (t, at) => {
    const u = (t.urges || []).find((x) => x.min === at);
    return u ? u.value : null;
  };
  const temptations = toCsv(
    ['date', 'time', 'when', 'trigger', 'outcome', ...URGE_MINUTES.map((m) => `urge_${m}min`), 'minutes'],
    [...data.temptations].sort((a, b) => a.startedAt - b.startedAt).map((t) => [
      t.day, time(t.startedAt), WHEN_TEXT[t.context] || t.context || null, t.trigger || null, t.outcome ? OUTCOME_TEXT[t.outcome] : null,
      ...URGE_MINUTES.map((m) => urge(t, m)),
      t.endedAt ? minutes(t.endedAt - t.startedAt) : null,
    ]),
  );

  return [
    { name: 'sabr-windows.csv', text: windows },
    { name: 'sabr-meals.csv', text: meals },
    { name: 'sabr-weight.csv', text: weight },
    { name: 'sabr-checkins.csv', text: checkins },
    { name: 'sabr-temptations.csv', text: temptations },
  ];
}
