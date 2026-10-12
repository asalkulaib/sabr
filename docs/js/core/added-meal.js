// A meal added after it was eaten: which day it belongs to and what it does
// to that day's window. Pure functions only: no DOM, no storage.

import { addDays, dayKey, minutesOfDay } from './time.js';
import { FORGOT_AFTER_MS, LATE_NIGHT_END_MIN, hasWindow, isOpen, isPaused, windowMsFor } from './rules.js';

/** The day whose window takes a meal starting at start. */
function homeDay(days, settings, start) {
  const key = dayKey(start);
  const prevKey = addDays(key, -1);
  const prev = days.get(prevKey);
  // An open window takes what follows its first bite, until Fast asks for its last bite.
  for (const r of days.values()) {
    if (isOpen(r) && start >= r.firstBite && start - r.firstBite < windowMsFor(r.day, settings) + FORGOT_AFTER_MS) return r.day;
  }
  // Last night's window, closed after midnight with this meal inside it.
  if (prev && prev.firstBite && prev.lastBite && start >= prev.firstBite && start <= prev.lastBite) return prevKey;
  // Just after midnight, a meal still inside last night's goal joins its window, as Start a meal does
  // (unless the day has a window of its own that it falls in or after).
  const own = days.get(key);
  if (minutesOfDay(start) < LATE_NIGHT_END_MIN && (!hasWindow(own) || own.firstBite > start)
    && prev && prev.firstBite && prev.lastBite && start - prev.firstBite < windowMsFor(prevKey, settings)) return prevKey;
  return key;
}

/**
 * Where a finished meal added after the fact goes, and what it changes.
 * start and finish are ms; last closes a window the meal leaves open, at
 * the end of the meal. Returns { day, kind, rec, outside, canClose,
 * wasNoEating }, or { error: 'open', rec } when another day's window is
 * still open before it, or { error: 'overlap', meal } when it overlaps a
 * meal already logged. kind:
 *   'paused'  the day is paused: the meal counts for satiety only
 *   'first'   opens the day's window at the meal's start
 *   'earlier' the day's window now opens at the meal's start
 *   'inside'  inside the window
 *   'extend'  after a closed window, still inside its goal: the window runs to the meal's end
 *   'outside' after a closed window and its goal: eating outside the window, a miss
 * rec is the day record as it will be, or null when it stays as it is.
 * canClose: the window stays open after this meal, so it may be its last.
 */
export function placeAddedMeal({ days, meals, settings }, { start, finish, last = false, nowTs }) {
  const clash = meals.find((m) => m.startedAt < finish && (m.finishedAt || Math.max(nowTs, m.startedAt)) > start);
  if (clash) return { error: 'overlap', meal: clash };
  const day = homeDay(days, settings, start);
  for (const r of days.values()) {
    if (r.day !== day && isOpen(r) && r.firstBite <= start) return { error: 'open', rec: r };
  }
  const rec = days.get(day);
  const base = { day, rec: null, outside: false, canClose: false, wasNoEating: false };
  if (isPaused(rec)) return { ...base, kind: 'paused' };
  if (!hasWindow(rec)) {
    return {
      ...base,
      kind: 'first',
      canClose: true,
      wasNoEating: !!(rec && rec.noEating),
      rec: { ...(rec || { day }), day, firstBite: start, lastBite: last ? finish : null, noEating: false },
    };
  }
  if (start < rec.firstBite) {
    return { ...base, kind: 'earlier', rec: { ...rec, firstBite: start, lastBite: rec.lastBite ? Math.max(rec.lastBite, finish) : null } };
  }
  if (!rec.lastBite) {
    // Closing needs every meal in the window finished; the window then ends at the latest of them.
    const others = meals.filter((m) => m.day === day);
    const canClose = others.every((m) => m.finishedAt);
    const end = Math.max(finish, ...others.map((m) => m.finishedAt || 0));
    return { ...base, kind: 'inside', canClose, rec: canClose && last ? { ...rec, lastBite: end } : null };
  }
  if (start <= rec.lastBite) {
    return { ...base, kind: 'inside', rec: finish > rec.lastBite ? { ...rec, lastBite: finish } : null };
  }
  if (start - rec.firstBite < windowMsFor(day, settings)) {
    return { ...base, kind: 'extend', rec: { ...rec, lastBite: finish } };
  }
  return { ...base, kind: 'outside', outside: true };
}
