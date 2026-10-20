// Satiety insights: plain findings from the person's own rated meals, the way
// the 4 PM energy comparison works. Pure functions only. A finding appears
// only when both sides of it rest on enough meals, and it states a
// difference only when the counts support one: a two-sided Fisher exact test
// at p < 0.05. Otherwise it says there is no clear difference yet, with the
// counts. The finding on the 20-minute reading uses checks taken on time.

import { LEFT_WANTING } from './fullness.js';
import { readingKind } from './satiety.js';
import { differs } from './fisher.js';

export const MIN_MEALS = 10; // rated meals before any finding shows
const MIN_SIDE = 4; // meals on each side of a comparison
const MIN_PAIRS = 3; // 20-minute ratings on each side

const wanting = (list) => list.filter((m) => m.stop === LEFT_WANTING).length;
const of = (list) => `${wanting(list)} of ${list.length}`;
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

/** Whether two groups of meals were left wanting at different rates. */
const ratesDiffer = (x, y) => differs(wanting(x), x.length, wanting(y), y.length);

/**
 * Whether two sets of fullness readings differ: the exact test on how many
 * of each lie above the middle value of them all (a median test).
 */
function valuesDiffer(xs, ys) {
  const all = [...xs, ...ys].sort((p, q) => p - q);
  const middle = (all[(all.length - 1) >> 1] + all[all.length >> 1]) / 2;
  const above = (v) => v.filter((x) => x > middle).length;
  return differs(above(xs), xs.length, above(ys), ys.length);
}

/** Up to three sentences, or [] until there are enough rated meals. */
export function satietyInsights(meals) {
  const rated = meals.filter((m) => m.stop);
  if (rated.length < MIN_MEALS) return [];
  const out = [];

  // Hunger before the meal.
  const calm = rated.filter((m) => m.hungerBefore != null && m.hungerBefore <= 6);
  const hungry = rated.filter((m) => m.hungerBefore != null && m.hungerBefore >= 7);
  if (calm.length >= MIN_SIDE && hungry.length >= MIN_SIDE) {
    out.push(ratesDiffer(calm, hungry)
      ? `Left wanting at ${of(calm)} meals started at hunger 6 or less, and ${of(hungry)} started at 7 or more.`
      : `No clear difference yet: left wanting at ${of(calm)} meals started at hunger 6 or less, against ${of(hungry)} started at 7 or more.`);
  }

  // The day's first meal against the ones after it.
  const firstIds = new Set();
  const byDay = new Map();
  for (const m of meals) if (!byDay.has(m.day) || m.startedAt < byDay.get(m.day).startedAt) byDay.set(m.day, m);
  for (const m of byDay.values()) firstIds.add(m.id);
  const first = rated.filter((m) => firstIds.has(m.id));
  const later = rated.filter((m) => !firstIds.has(m.id));
  if (first.length >= MIN_SIDE && later.length >= MIN_SIDE) {
    out.push(ratesDiffer(first, later)
      ? `Left wanting at ${of(first)} first meals of a day, and ${of(later)} later ones.`
      : `No clear difference yet: left wanting at ${of(first)} first meals of a day, against ${of(later)} later ones.`);
  }

  // Twenty minutes on: how full it really felt, from checks answered on time.
  const at20 = rated.filter((m) => readingKind(m) === 'on-time');
  const lw = at20.filter((m) => m.stop === LEFT_WANTING).map((m) => m.fullness20);
  const rest = at20.filter((m) => m.stop !== LEFT_WANTING).map((m) => m.fullness20);
  if (lw.length >= MIN_PAIRS && rest.length >= MIN_PAIRS) {
    out.push(valuesDiffer(lw, rest)
      ? `Twenty minutes on, fullness averaged ${mean(lw).toFixed(1)} after meals left wanting, and ${mean(rest).toFixed(1)} after the rest.`
      : `No clear difference yet: twenty minutes on, fullness averaged ${mean(lw).toFixed(1)} after ${lw.length} meals left wanting, against ${mean(rest).toFixed(1)} after ${rest.length} others.`);
  }
  return out;
}
