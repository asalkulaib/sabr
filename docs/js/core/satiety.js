// Satiety numbers for the Satiety tab, after the person's own earlier satiety
// page: the 20-minute drift, landing in the comfortable zone, how often each
// way of finishing happens, how hungry meals start, and where to stop eating.
// Pure functions only. Every figure that uses the 20-minute reading rests on
// readings taken on time (readingKind); the others count every rated meal.

export const ZONE = [6, 8]; // fullness at 20 minutes: the target is about 7
export const STOPS = ['before_full', 'full', 'stuffed']; // left wanting, satisfied, overfull

const MIN = 60_000;

/** A 20-minute check answered this many minutes after the meal finished is on time. */
export const ON_TIME = [15, 40];

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** A meal with both fullness readings: right after, and 20 minutes on. */
export const completed = (m) => m.fullnessNow != null && m.fullness20 != null;

/**
 * How a meal's 20-minute fullness reading was taken, or null without one:
 *   'on-time'  answered in the 20-minute check, 15 to 40 minutes after the meal finished;
 *   'early'    answered less than 15 minutes after (Score my fullness now while the timer runs);
 *   'late'     answered more than 40 minutes after;
 *   'recalled' entered afterwards: in Add a meal (its reading had no check,
 *              so fullness20DueAt is null), or entered or changed while
 *              editing the meal (fullness20Recalled). A reading with no
 *              answer time (fullness20At) counts as recalled too.
 * Only the check sheet records the answer time as it is given; Add a meal
 * sets it to the finish plus 20 minutes, which is why its readings are told
 * apart by the check they never had.
 */
export function readingKind(m) {
  if (m.fullness20 == null) return null;
  if (m.fullness20Recalled || m.fullness20DueAt == null || m.fullness20At == null || m.finishedAt == null) return 'recalled';
  const after = m.fullness20At - m.finishedAt;
  if (after < ON_TIME[0] * MIN) return 'early';
  if (after > ON_TIME[1] * MIN) return 'late';
  return 'on-time';
}

/** Both readings, the 20-minute one taken on time: what every 20-minute figure rests on. */
export const onTime = (m) => completed(m) && readingKind(m) === 'on-time';

/**
 * What saving the meal sheet does to how its 20-minute reading counts: a
 * value entered there, or changed from the saved one, is recalled from then
 * on; a reading left as it was keeps how it was taken. A patch for the meal.
 */
export function editedReading(original, fullness20) {
  if (fullness20 != null && fullness20 !== original.fullness20) return { fullness20Recalled: true };
  if (fullness20 == null && original.fullness20Recalled) return { fullness20Recalled: false };
  return {};
}

const inZone = (m) => m.fullness20 >= ZONE[0] && m.fullness20 <= ZONE[1];

export function satietyStats(meals) {
  const rated = meals.filter((m) => m.stop);
  const both = meals.filter(completed);
  const done = both.filter(onTime);
  // The meals with both readings whose 20-minute one was not taken on time,
  // by how it was taken: the 20-minute figures leave them out.
  const leftOut = { late: 0, early: 0, recalled: 0, total: both.length - done.length };
  for (const m of both) {
    const kind = readingKind(m);
    if (kind !== 'on-time') leftOut[kind]++;
  }
  const byStop = STOPS.map((stop) => {
    const all = rated.filter((m) => m.stop === stop);
    const pairs = all.filter(onTime);
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
    // Meals with both readings, the 20-minute one on time.
    done: done.length,
    leftOut,
    drift: mean(done.map((m) => m.fullness20 - m.fullnessNow)),
    landed: done.filter(inZone).length,
    pastFull: rated.filter((m) => m.stop === 'stuffed').length,
    byStop,
    // Where each of those meals landed, oldest first (the last 30).
    landings: [...done].sort((a, b) => a.startedAt - b.startedAt).slice(-30)
      .map((m) => ({ id: m.id, day: m.day, at: m.startedAt, value: m.fullness20, stop: m.stop || null })),
  };
}

/** How far back the stop point looks, the meals one value needs, and the meals that make it more than rough. */
export const STOP_POINT = { recent: 60, least: 5, sure: 10 };

/**
 * The person's own stop point. Over the last 60 meals with an on-time
 * check, each fullness right after counts its meals that landed in the
 * comfortable zone 20 minutes on, and those that went past it. The value
 * whose meals most often landed in the zone is named (ties: fewer past it,
 * then the lower value), once at least 5 meals stopped there and one of
 * them landed in the zone. It is read off the meals themselves, never
 * worked out from the drift. Returns { value, meals, inZone, past } or null.
 */
export function stopPoint(meals) {
  const recent = meals.filter(onTime).sort((a, b) => b.startedAt - a.startedAt).slice(0, STOP_POINT.recent);
  const at = new Map();
  for (const m of recent) {
    const row = at.get(m.fullnessNow) || { value: m.fullnessNow, meals: 0, inZone: 0, past: 0 };
    row.meals++;
    if (inZone(m)) row.inZone++;
    else if (m.fullness20 > ZONE[1]) row.past++;
    at.set(m.fullnessNow, row);
  }
  // Shares are compared as cross products, so equal shares tie exactly.
  const better = (a, b) => a.inZone * b.meals - b.inZone * a.meals || b.past * a.meals - a.past * b.meals || b.value - a.value;
  let best = null;
  for (const row of at.values()) {
    if (row.meals >= STOP_POINT.least && row.inZone && (!best || better(row, best) > 0)) best = row;
  }
  return best;
}

/** The stop point in one sentence, or '' without one. Under 10 meals at its value, it is rough so far. */
export function stopPointWords(point) {
  if (!point) return '';
  const evidence = `${point.inZone} of your ${point.meals} meals stopped there landed in ${ZONE[0]} to ${ZONE[1]}, ${point.past || 'none'} past ${ZONE[1]}.`;
  return point.meals < STOP_POINT.sure
    ? `Rough so far: stop near ${point.value}: ${evidence}`
    : `Stop near ${point.value}: ${evidence}`;
}
