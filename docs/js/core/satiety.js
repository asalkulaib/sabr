// Satiety numbers for the Satiety tab, after the person's own earlier satiety
// page: the 20-minute drift, landing in the comfortable zone, how often each
// way of finishing happens, and how hungry meals start. Pure functions only.

export const ZONE = [6, 8]; // fullness at 20 minutes: the target is about 7
export const STOPS = ['before_full', 'full', 'stuffed']; // left wanting, satisfied, overfull

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** A meal with both fullness readings: right after, and 20 minutes on. */
export const completed = (m) => m.fullnessNow != null && m.fullness20 != null;

export function satietyStats(meals) {
  const rated = meals.filter((m) => m.stop);
  const done = meals.filter(completed);
  const landed = done.filter((m) => m.fullness20 >= ZONE[0] && m.fullness20 <= ZONE[1]).length;
  const byStop = STOPS.map((stop) => {
    const all = rated.filter((m) => m.stop === stop);
    const pairs = all.filter(completed);
    const hungry = all.filter((m) => m.hungerBefore != null);
    return {
      stop,
      count: all.length,
      share: rated.length ? all.length / rated.length : 0,
      rise: mean(pairs.map((m) => m.fullness20 - m.fullnessNow)),
      // Average fullness right after and 20 minutes on, over the same meals.
      now: mean(pairs.map((m) => m.fullnessNow)),
      at20: mean(pairs.map((m) => m.fullness20)),
      rises: pairs.length,
      hunger: mean(hungry.map((m) => m.hungerBefore)),
      hungers: hungry.length,
    };
  });
  return {
    meals: meals.length,
    rated: rated.length,
    done: done.length,
    drift: mean(done.map((m) => m.fullness20 - m.fullnessNow)),
    landed,
    pastFull: rated.filter((m) => m.stop === 'stuffed').length,
    byStop,
    // Where each completed meal landed, oldest first (the last 30).
    landings: [...done].sort((a, b) => a.startedAt - b.startedAt).slice(-30)
      .map((m) => ({ id: m.id, day: m.day, at: m.startedAt, value: m.fullness20, stop: m.stop || null })),
  };
}
