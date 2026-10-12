// Satiety insights: plain findings from the person's own rated meals, the way
// the 4 PM energy comparison works. Pure functions only. A finding appears
// only when both sides of it rest on enough meals.

import { LEFT_WANTING } from './fullness.js';

export const MIN_MEALS = 10; // rated meals before any finding shows
const MIN_SIDE = 4; // meals on each side of a comparison
const MIN_PAIRS = 3; // 20-minute ratings on each side

const of = (list) => `${list.filter((m) => m.stop === LEFT_WANTING).length} of ${list.length}`;
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

/** Up to three sentences, or [] until there are enough rated meals. */
export function satietyInsights(meals) {
  const rated = meals.filter((m) => m.stop);
  if (rated.length < MIN_MEALS) return [];
  const out = [];

  // Hunger before the meal.
  const calm = rated.filter((m) => m.hungerBefore != null && m.hungerBefore <= 6);
  const hungry = rated.filter((m) => m.hungerBefore != null && m.hungerBefore >= 7);
  if (calm.length >= MIN_SIDE && hungry.length >= MIN_SIDE) {
    out.push(`Left wanting at ${of(calm)} meals started at hunger 6 or less, and ${of(hungry)} started at 7 or more.`);
  }

  // The day's first meal against the ones after it.
  const firstIds = new Set();
  const byDay = new Map();
  for (const m of meals) if (!byDay.has(m.day) || m.startedAt < byDay.get(m.day).startedAt) byDay.set(m.day, m);
  for (const m of byDay.values()) firstIds.add(m.id);
  const first = rated.filter((m) => firstIds.has(m.id));
  const later = rated.filter((m) => !firstIds.has(m.id));
  if (first.length >= MIN_SIDE && later.length >= MIN_SIDE) {
    out.push(`Left wanting at ${of(first)} first meals of a day, and ${of(later)} later ones.`);
  }

  // Twenty minutes on: how full it really felt.
  const at20 = rated.filter((m) => m.fullness20 != null);
  const lw = at20.filter((m) => m.stop === LEFT_WANTING).map((m) => m.fullness20);
  const rest = at20.filter((m) => m.stop !== LEFT_WANTING).map((m) => m.fullness20);
  if (lw.length >= MIN_PAIRS && rest.length >= MIN_PAIRS) {
    out.push(`Twenty minutes on, fullness averaged ${mean(lw).toFixed(1)} after meals left wanting, and ${mean(rest).toFixed(1)} after the rest.`);
  }
  return out;
}
