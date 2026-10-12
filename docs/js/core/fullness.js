// Fullness (شبع): how each meal ended, rolled up into a day. Pure functions.
// Ratings, stored as before: 'before_full' (left wanting, the goal),
// 'full' (satisfied) and 'stuffed' (overfull).

export const LEFT_WANTING = 'before_full';

export const FULLNESS_WORD = { before_full: 'left wanting', full: 'satisfied', stuffed: 'overfull' };

/**
 * A day's fullness: the worst rating among its meals and the day's own
 * rating (asked when its meals were not rated). Left wanting only when
 * every meal was; null while nothing is rated, or while a meal is unrated
 * and the day has no rating of its own.
 */
export function dayFullness(meals, rec) {
  const own = rec && rec.fullness;
  const ratings = meals.map((m) => m.stop).filter(Boolean);
  if (own) ratings.push(own);
  if (!ratings.length) return null;
  if (ratings.includes('stuffed')) return 'stuffed';
  if (ratings.includes('full')) return 'full';
  return meals.some((m) => !m.stop) && !own ? null : LEFT_WANTING;
}

/** Whether a day's fullness rests on its meals alone (every meal rated). */
export function ratedByMeals(meals) {
  return meals.length > 0 && meals.every((m) => m.stop);
}

/** Meals grouped by day. */
export function mealsByDay(meals) {
  const map = new Map();
  for (const m of meals) {
    if (!map.has(m.day)) map.set(m.day, []);
    map.get(m.day).push(m);
  }
  return map;
}
