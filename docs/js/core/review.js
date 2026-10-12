// Weekly review (weeks run Sunday to Saturday). Pure functions only.

import { addDays, minutesOfDay } from './time.js';
import { CUTOFF_MIN, isPaused, isWorkday, makeEvaluator, streaks } from './rules.js';
import { weekSummary } from './weight.js';
import { LEFT_WANTING, dayFullness, mealsByDay } from './fullness.js';

export const TRIGGERS = ['hunger', 'boredom', 'social', 'stress', 'tired', 'other'];

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Did any eating on this day happen before 16:00? (The first bite opens the day's eating.) */
export function ateBefore4pm(rec) {
  return !!(rec && rec.firstBite && minutesOfDay(rec.firstBite) < CUTOFF_MIN);
}

/**
 * Energy at 4 PM on workdays, split by whether eating started before 16:00.
 * Past days count only when their eating is known (a window, or no eating).
 * Paused days are left out.
 */
export function energySplit(keys, days, todayKey) {
  const without = [];
  const withEating = [];
  for (const key of keys) {
    const rec = days.get(key);
    if (!rec || rec.energy4pm == null || !isWorkday(key, rec) || isPaused(rec)) continue;
    const known = rec.firstBite || rec.noEating || key === todayKey;
    if (!known) continue;
    (ateBefore4pm(rec) ? withEating : without).push(rec.energy4pm);
  }
  return {
    without: { avg: mean(without), n: without.length },
    with: { avg: mean(withEating), n: withEating.length },
  };
}

/** Counts per key, most frequent first. */
function rank(items, keyOf) {
  const counts = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
}

/**
 * data: { days: Map, meals: [], outside: [], temptations: [], weights: Map }
 * opts: { weekStartKey, todayKey, nowTs, startKey }
 */
export function weekReview(data, { weekStartKey, todayKey, nowTs, startKey }) {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
  const inWeek = new Set(keys);
  const evaluate = makeEvaluator({ days: data.days, outside: data.outside, meals: data.meals, nowTs, todayKey, startKey, settings: data.settings });
  const evals = keys.map((k) => ({ ...evaluate(k), future: k > todayKey }));

  const successCount = evals.filter((e) => e.result === 'success').length;
  // Paused days are not tracked: they leave the counts and the averages.
  const pausedCount = evals.filter((e) => e.result === 'paused').length;
  const tracked = (day) => !isPaused(data.days.get(day));
  const closed = evals.filter((e) => e.state === 'closed');
  const avgWindowMs = mean(closed.map((e) => e.lengthMs));

  const endKey = keys[6] < todayKey ? keys[6] : todayKey;
  const streak = endKey >= startKey ? streaks(evaluate, endKey, startKey) : { current: 0, best: 0 };

  // Workday rule
  // Flexible days have no 16:00 rule, so they stay out of this count.
  const workdayWindows = evals.filter((e) => e.workday && !e.flexible && !e.future && e.firstBite);
  const onTime = workdayWindows.filter((e) => !e.openedEarly).length;

  // Energy at 4 PM: this week and all time
  const energyWeek = energySplit(keys, data.days, todayKey);
  const energyAll = energySplit([...data.days.keys()], data.days, todayKey);

  // Training
  const trainedDays = keys.map((k) => data.days.get(k)).filter((r) => r && !isPaused(r) && r.trained === true);
  const trainingTypes = rank(trainedDays, (r) => r.trainingType || 'unspecified');

  // Satiety
  const meals = data.meals.filter((m) => inWeek.has(m.day) && tracked(m.day));
  const withStop = meals.filter((m) => m.stop);
  const beforeFull = withStop.filter((m) => m.stop === 'before_full').length;
  const pairs = meals.filter((m) => m.fullnessNow != null && m.fullness20 != null);
  const avgRise = mean(pairs.map((m) => m.fullness20 - m.fullnessNow));
  const avgAt20 = mean(meals.filter((m) => m.fullness20 != null).map((m) => m.fullness20));
  // Fullness counts on every day, paused ones included.
  const byDay = mealsByDay(data.meals);
  const leftWantingDays = keys.filter((k) => dayFullness(byDay.get(k) || [], data.days.get(k)) === LEFT_WANTING).length;

  // Temptations
  const temptations = data.temptations.filter((t) => inWeek.has(t.day) && tracked(t.day));
  const decided = temptations.filter((t) => t.outcome);
  const held = decided.filter((t) => t.outcome === 'held').length;

  return {
    keys,
    days: evals,
    successCount,
    pausedCount,
    avgWindowMs,
    closedCount: closed.length,
    streak,
    workday: { windows: workdayWindows.length, onTime },
    weight: weekSummary(data.weights, weekStartKey),
    energy: { week: energyWeek, all: energyAll },
    training: { sessions: trainedDays.length, types: trainingTypes },
    satiety: {
      meals: meals.length,
      rated: withStop.length,
      beforeFull,
      beforeFullShare: withStop.length ? beforeFull / withStop.length : null,
      pairs: pairs.length,
      avgRise,
      avgAt20,
      leftWantingDays,
    },
    temptations: {
      count: temptations.length,
      decided: decided.length,
      held,
      holdRate: decided.length ? held / decided.length : null,
      triggers: rank(temptations, (t) => t.trigger),
    },
  };
}
