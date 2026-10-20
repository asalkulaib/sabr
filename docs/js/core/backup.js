// Full JSON backup and restore validation. Pure functions only.

import { isDayKey } from './time.js';

export const SCHEMA = 1;
export const STORES = ['days', 'meals', 'outside', 'temptations', 'weights', 'settings'];

/**
 * data: { days: Map, meals: [], outside: [], temptations: [], weights: Map(date -> kg), settings: {} }
 */
export function buildBackup(data, { nowTs, version }) {
  return {
    app: 'sabr',
    schema: SCHEMA,
    version,
    exportedAt: new Date(nowTs).toISOString(),
    data: {
      days: [...data.days.values()],
      meals: data.meals,
      outside: data.outside,
      temptations: data.temptations,
      weights: [...data.weights.entries()].map(([date, kg]) => ({ date, kg })),
      settings: Object.entries(data.settings).map(([key, value]) => ({ key, value })),
    },
  };
}

export function backupFileName(nowTs, dayKeyOf) {
  return `sabr-backup-${dayKeyOf(nowTs)}.json`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v) => v == null || isNum(v);

class BackupError extends Error {}

function check(cond, message) {
  if (!cond) throw new BackupError(message);
}

const VALID = {
  days: (r) => isDayKey(r.day) && optNum(r.firstBite) && optNum(r.lastBite),
  meals: (m) => isNum(m.id) && isDayKey(m.day) && isNum(m.startedAt),
  outside: (o) => isNum(o.id) && isDayKey(o.day) && isNum(o.at),
  temptations: (t) => isNum(t.id) && isDayKey(t.day) && isNum(t.startedAt),
  weights: (w) => isDayKey(w.date) && isNum(w.kg),
  settings: (s) => typeof s.key === 'string',
};

/**
 * Parses and validates a backup file's text. Throws with a readable message
 * when the file is not a usable backup. A damaged entry is left out rather
 * than blocking the whole restore; obj.skipped counts them.
 */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a backup from Sabr or Fast.');
  }
  return checkBackup(obj);
}

/**
 * Validates a backup as parseBackup does, from the object itself: a file
 * already parsed, or a copy kept on this iPhone in the same shape.
 */
export function checkBackup(obj) {
  check(obj && (obj.app === 'sabr' || obj.app === 'fast') && obj.data && typeof obj.schema === 'number', 'This file is not a backup from Sabr or Fast.');
  check(obj.schema <= SCHEMA, 'This backup comes from a newer version of the app.');
  for (const s of STORES) check(Array.isArray(obj.data[s]), 'This backup is incomplete.');
  let skipped = 0;
  const data = {};
  for (const s of STORES) {
    data[s] = obj.data[s].filter((r) => {
      const ok = !!r && typeof r === 'object' && VALID[s](r);
      if (!ok) skipped++;
      return ok;
    });
  }
  return { ...obj, data, skipped };
}

/** Short description for the restore confirmation, with counts only. */
export function describeBackup(obj) {
  const d = obj.data;
  const windows = d.days.filter((r) => r.firstBite).length;
  return { exportedAt: obj.exportedAt, windows, meals: d.meals.length, weighIns: d.weights.length, temptations: d.temptations.length, skipped: obj.skipped || 0 };
}

/** A day record that holds anything: a window, a day with no eating, a check-in, a pause, a fast start. */
const holds = (r) => !!(r && (r.firstBite || r.lastBite || r.noEating || r.dayOff || r.energy4pm != null || r.trained != null
  || r.trainingType || r.paused || r.fullness || r.fastFrom));

/**
 * The days that hold history, oldest first: a day record with anything in
 * it, a meal, eating outside the window, a temptation or a weigh-in. Takes a
 * backup's data (arrays) or the app's own (days and weights as Maps).
 */
export function historyDays(data) {
  const out = new Set();
  const days = data.days instanceof Map ? [...data.days.values()] : data.days || [];
  for (const r of days) if (holds(r)) out.add(r.day);
  for (const name of ['meals', 'outside', 'temptations']) for (const r of data[name] || []) out.add(r.day);
  const weights = data.weights instanceof Map ? [...data.weights.keys()] : (data.weights || []).map((w) => w.date);
  for (const k of weights) out.add(k);
  return [...out].filter(isDayKey).sort();
}

/**
 * The days a backup runs over: its first and last day with history, or null
 * when it holds none. Nothing can be logged after the day a backup was made,
 * so a day after it (a pause set ahead) does not stretch the span.
 * dayKeyOf turns the moment it was made into a day.
 */
export function backupSpan(obj, dayKeyOf) {
  const made = Date.parse(obj.exportedAt);
  const madeOn = Number.isFinite(made) ? dayKeyOf(made) : null;
  const days = historyDays(obj.data).filter((k) => !madeOn || k <= madeOn);
  return days.length ? { first: days[0], last: days[days.length - 1] } : null;
}

/**
 * How many days up to today hold history after lastKey (every one with no
 * lastKey): on this iPhone, what a restore of a backup ending there removes
 * that the backup does not hold.
 */
export function daysAfter(data, lastKey, todayKey) {
  return historyDays(data).filter((k) => (lastKey == null || k > lastKey) && k <= todayKey).length;
}
