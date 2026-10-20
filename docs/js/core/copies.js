// Copies on this iPhone: which ones to keep. Pure functions only.
// A copy is a snapshot of all the data, taken once a day ('daily') and just
// before something replaces the data: a restore ('before-restore'), a reset
// ('before-reset') or bringing back a copy ('before-bring-back').

import { addDays, weekStart } from './time.js';

export const KEEP_DAILY = 7;
export const KEEP_WEEKS = 4;
export const KEEP_OTHER = 5;

const newestFirst = (a, b) => b.at - a.at || b.id - a.id;

/**
 * The ids of the copies to keep: the 7 newest daily copies, the newest daily
 * copy of each of the 4 weeks before the week the oldest of those 7 falls
 * in, and the 5 newest copies of the other kinds together. The weeks run
 * Sunday to Saturday, as Week shows them, so they stay put as days go by: a
 * week's newest copy stays its newest and ages from the first week into the
 * fourth. A week with no copy keeps none.
 * copies: [{ id, at, kind, day }], day the local day key of at.
 * protect: ids kept whatever the rule says (the copy being brought back).
 */
export function copiesToKeep(copies, protect = []) {
  const daily = copies.filter((c) => c.kind === 'daily').sort(newestFirst);
  const other = copies.filter((c) => c.kind !== 'daily').sort(newestFirst);
  const keep = new Set([...daily.slice(0, KEEP_DAILY), ...other.slice(0, KEEP_OTHER)].map((c) => c.id));
  if (daily.length > KEEP_DAILY) {
    const sunday = weekStart(daily[KEEP_DAILY - 1].day);
    const older = daily.slice(KEEP_DAILY);
    for (let w = 1; w <= KEEP_WEEKS; w++) {
      const from = addDays(sunday, -7 * w);
      const until = addDays(sunday, -7 * (w - 1));
      // Newest first, so the first one found is the week's newest.
      const pick = older.find((c) => c.day >= from && c.day < until);
      if (pick) keep.add(pick.id);
    }
  }
  for (const id of protect) keep.add(id);
  return keep;
}

/** The ids of the copies to delete, after a new one is taken; never one in protect. */
export function copiesToDrop(copies, protect = []) {
  const keep = copiesToKeep(copies, protect);
  return copies.filter((c) => !keep.has(c.id)).map((c) => c.id);
}
