// Copies on this iPhone: which ones to keep. Pure functions only.
// A copy is a snapshot of all the data, taken once a day ('daily') and just
// before something replaces the data: a restore ('before-restore'), a reset
// ('before-reset') or bringing back a copy ('before-bring-back').

import { addDays } from './time.js';

export const KEEP_DAILY = 7;
export const KEEP_WEEKS = 4;
export const KEEP_OTHER = 5;

const newestFirst = (a, b) => b.at - a.at || b.id - a.id;

/**
 * The ids of the copies to keep: the 7 newest daily copies, the newest daily
 * copy of each of the 4 weeks before them, and the 5 newest copies of the
 * other kinds together. The weeks count back from the day of the oldest of
 * the 7: the first is the 7 days before it, the next the 7 before those, and
 * so on; a week with no copy keeps none.
 * copies: [{ id, at, kind, day }], day the local day key of at.
 */
export function copiesToKeep(copies) {
  const daily = copies.filter((c) => c.kind === 'daily').sort(newestFirst);
  const other = copies.filter((c) => c.kind !== 'daily').sort(newestFirst);
  const keep = new Set([...daily.slice(0, KEEP_DAILY), ...other.slice(0, KEEP_OTHER)].map((c) => c.id));
  if (daily.length > KEEP_DAILY) {
    const anchor = daily[KEEP_DAILY - 1].day;
    const older = daily.slice(KEEP_DAILY);
    for (let w = 1; w <= KEEP_WEEKS; w++) {
      const from = addDays(anchor, -7 * w);
      const until = addDays(anchor, -7 * (w - 1));
      // Newest first, so the first one found is the week's newest.
      const pick = older.find((c) => c.day >= from && c.day < until);
      if (pick) keep.add(pick.id);
    }
  }
  return keep;
}

/** The ids of the copies to delete, after a new one is taken. */
export function copiesToDrop(copies) {
  const keep = copiesToKeep(copies);
  return copies.filter((c) => !keep.has(c.id)).map((c) => c.id);
}
