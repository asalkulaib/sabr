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
