// Daily fast and feast hours for the History tab. Pure functions only.
//
// Feast: that day's window, first bite to last bite (closed windows only).
// Fast:  the fast that ended that day, from the latest eating before that
//        day's first bite to that first bite. Unknown before the first
//        eating on record, so the first tracked day has no fast.
// Paused days have neither, and a fast that spans a pause is unknown: eating
// during a pause is not recorded.

import { HOUR, addDays, dayKey } from './time.js';

/** Every moment of eating on record, and every fast start set with Begin fast, oldest first. */
function eatingTimes({ days, meals, outside }) {
  const times = [];
  for (const r of days.values()) {
    if (r.firstBite) times.push(r.firstBite);
    if (r.lastBite) times.push(r.lastBite);
    if (r.fastFrom) times.push(r.fastFrom);
  }
  for (const m of meals) {
    if (m.startedAt) times.push(m.startedAt);
    if (m.finishedAt) times.push(m.finishedAt);
  }
  for (const o of outside) times.push(o.at);
  return times.sort((a, b) => a - b);
}

/** Latest time in a sorted list strictly before ts, or null. */
function latestBefore(sorted, ts) {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < ts) {
      found = sorted[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * One entry per day from fromKey to toKey (inclusive):
 * { day, fastMs, feastMs, paused } with null where there is nothing to show.
 */
export function dailySeries(data, fromKey, toKey) {
  const times = eatingTimes(data);
  const pausedKeys = [...data.days.values()].filter((r) => r.paused).map((r) => r.day);
  // A fast started on a paused day began after that day's unrecorded eating.
  const fastStarts = new Set([...data.days.values()].map((r) => r.fastFrom).filter(Boolean));
  const out = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) {
    const rec = data.days.get(k);
    let fastMs = null;
    let feastMs = null;
    if (rec && rec.paused) {
      out.push({ day: k, fastMs, feastMs, paused: rec.paused });
      continue;
    }
    if (rec && rec.firstBite) {
      const before = latestBefore(times, rec.firstBite);
      const from = before == null ? null : fastStarts.has(before) ? addDays(dayKey(before), 1) : dayKey(before);
      if (before != null && !pausedKeys.some((p) => p >= from && p < k)) fastMs = rec.firstBite - before;
      if (rec.lastBite) feastMs = rec.lastBite - rec.firstBite;
    }
    out.push({ day: k, fastMs, feastMs, paused: null });
  }
  return out;
}

/** Average and count of the non-empty values of one metric. */
export function summarize(series, metric) {
  const values = series.map((d) => d[metric]).filter((v) => v != null);
  return {
    count: values.length,
    avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
  };
}

/**
 * The trailing 7-day average of a metric at each day, or null where those
 * 7 days hold fewer than 3 values.
 */
export function rollingAverage(series, metric, days = 7, min = 3) {
  return series.map((_, i) => {
    const values = series.slice(Math.max(0, i - days + 1), i + 1).map((d) => d[metric]).filter((v) => v != null);
    return values.length >= min ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
}

/** A clean top for the hour axis and its step. */
export function hourScale(maxMs) {
  const hours = Math.max(1, maxMs / HOUR);
  const step = [1, 2, 4, 6, 8, 12, 24].find((s) => hours / s <= 4) || 24;
  return { step, top: Math.ceil(hours / step) * step };
}
