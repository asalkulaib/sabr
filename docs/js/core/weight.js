// Weight import and averages. Pure functions only.
// The screens show 7-day averages and changes between them. Every weigh-in
// counts, a single one included: the owner chose that over hiding weeks
// with few weigh-ins, so nothing goes stale.

import { addDays, daysBetween, isDayKey, weekStart } from './time.js';

export const MIN_WEIGH_INS = 1;
// Plausible range for this app's single adult user. The upper bound also
// rejects most readings accidentally taken in pounds.
export const MIN_KG = 30;
export const MAX_KG = 180;
const KG_PER_LB = 0.45359237;

/** Arabic-Indic and Persian digits and separators to ASCII. */
export function normalizeDigits(s) {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
    .replace(/،/g, ',');
}

function decodeBase64(s) {
  const clean = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  try {
    const bin = atob(clean);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const LIST_START = /\d{4}-\d{2}-\d{2}\s*[:=]/;

/**
 * Accepts a URL, a hash ('#w=...'), 'w=...', 'b=<base64>', a bare list, or
 * Base64 of any of these. Returns the bare 'date:kg,...' list, or null.
 */
export function unwrapPayload(input) {
  let s = String(input == null ? '' : input).trim();
  for (let i = 0; i < 4 && s; i++) {
    const hash = s.indexOf('#');
    if (hash >= 0) s = s.slice(hash + 1);
    try { s = decodeURIComponent(s); } catch { /* keep as is */ }
    s = normalizeDigits(s.trim());
    if (/^w=/i.test(s)) return s.slice(2);
    if (/^b=/i.test(s)) { s = decodeBase64(s.slice(2)) || ''; continue; }
    if (LIST_START.test(s)) return s;
    s = decodeBase64(s) || '';
  }
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Parses a 'date:kg,...' list. Within one import the last value for a date
 * wins. Values marked 'lb' are converted. Skips impossible dates, future
 * dates and values outside MIN_KG to MAX_KG.
 * Returns { entries: Map(date -> kg), skipped, found }.
 */
export function parseEntries(list, todayKey) {
  const re = /(\d{4}-\d{2}-\d{2})\s*[:=]/g;
  const hits = [...String(list).matchAll(re)];
  const entries = new Map();
  let skipped = 0;
  hits.forEach((hit, i) => {
    const start = hit.index + hit[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : list.length;
    const segment = list.slice(start, end).replace(/[\s,;|]+$/, '');
    const pounds = /lbs?\b/i.test(segment);
    let raw = segment.replace(/[^\d.,]/g, '');
    if (raw.includes(',') && !raw.includes('.')) raw = raw.replace(',', '.');
    raw = raw.replace(/,/g, '');
    const value = raw ? Number(raw) : NaN;
    const kg = pounds ? value * KG_PER_LB : value;
    const date = hit[1];
    if (!isDayKey(date) || date > todayKey || !(kg >= MIN_KG && kg <= MAX_KG)) {
      skipped++;
      return;
    }
    entries.delete(date); // re-insert so the latest value also keeps the latest position
    entries.set(date, round2(kg));
  });
  return { entries, skipped, found: hits.length };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * True when new entries look like pounds next to the stored kilograms
 * (about 2.2 times the stored level), e.g. after Health switched to lb.
 */
export function looksLikePounds(existing, entries) {
  if (!existing.size || !entries.size) return false;
  const recent = [...existing.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30).map(([, kg]) => kg);
  const ratio = median([...entries.values()]) / median(recent);
  return ratio > 1.9 && ratio < 2.5;
}

/** Full parse of any supported input. Returns null when it holds no weight data. */
export function parseImport(input, todayKey) {
  const list = unwrapPayload(input);
  if (list == null || !LIST_START.test(list)) return null;
  return parseEntries(list, todayKey);
}

/** Compares parsed entries against stored ones. Re-imported dates replace the old value. */
export function diffEntries(existing, entries) {
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [date, kg] of entries) {
    if (!existing.has(date)) added++;
    else if (existing.get(date) !== kg) updated++;
    else unchanged++;
  }
  return { added, updated, unchanged };
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average over an inclusive day range; null with no weigh-in in it. */
export function averageBetween(weights, fromKey, toKey) {
  const values = [];
  for (const [date, kg] of weights) if (date >= fromKey && date <= toKey) values.push(kg);
  return { avg: values.length >= MIN_WEIGH_INS ? mean(values) : null, n: values.length };
}

export function latestDate(weights) {
  let latest = null;
  for (const date of weights.keys()) if (latest === null || date > latest) latest = date;
  return latest;
}

/**
 * 7-day average ending on the latest weigh-in, and its change from the
 * 7 days before. Anchoring on the latest weigh-in keeps the figure stable
 * between weekly imports.
 */
export function rollingSummary(weights) {
  return summaryOn(weights, latestDate(weights));
}

/** The same summary for the 7 days ending on any day (a day chosen on the chart). */
export function summaryOn(weights, end) {
  if (!end) return { end: null, current: { avg: null, n: 0 }, previous: { avg: null, n: 0 }, change: null };
  const current = averageBetween(weights, addDays(end, -6), end);
  const previous = averageBetween(weights, addDays(end, -13), addDays(end, -7));
  const change = current.avg != null && previous.avg != null ? current.avg - previous.avg : null;
  return { end, current, previous, change };
}

/**
 * The 7-day average on each day with a weigh-in: the weigh-ins in the 7 days
 * up to and including that day, a single one included. [{ date, avg, n }]
 * oldest first; the last is rollingSummary's figure.
 */
export function rollingSeries(weights) {
  const out = [];
  for (const date of [...weights.keys()].sort()) {
    const a = averageBetween(weights, addDays(date, -6), date);
    if (a.avg != null) out.push({ date, avg: a.avg, n: a.n });
  }
  return out;
}

/**
 * The series split where a week went by without a weigh-in: points more
 * than 7 days apart start a new run, so the chart's line breaks there.
 */
export function chartRuns(series) {
  const runs = [];
  series.forEach((p, i) => {
    if (!i || daysBetween(series[i - 1].date, p.date) > 7) runs.push([]);
    runs[runs.length - 1].push(p);
  });
  return runs;
}

/** The time frames the weight chart offers. */
export const WEIGHT_RANGES = ['1m', '3m', '6m', 'ytd', 'all'];

/** The first day a time frame covers, ending today; null for all of it. */
export function rangeStart(range, todayKey) {
  const [y, m, d] = todayKey.split('-').map(Number);
  if (range === 'ytd') return `${y}-01-01`;
  const months = { '1m': 1, '3m': 3, '6m': 6 }[range];
  if (!months) return null;
  const total = y * 12 + (m - 1) - months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Average for one week and the change from the week before. */
export function weekSummary(weights, weekStartKey) {
  const current = averageBetween(weights, weekStartKey, addDays(weekStartKey, 6));
  const previous = averageBetween(weights, addDays(weekStartKey, -7), addDays(weekStartKey, -1));
  const change = current.avg != null && previous.avg != null ? current.avg - previous.avg : null;
  return { current, previous, change };
}
