// In-memory copy of the data plus every change the screens can make.
// Each change is written to IndexedDB first, then applied here and announced.

import * as db from './db.js';
import { now, addDays, dayKey, floorToMinute, fmtDayLong, fmtTime, MIN, setZones } from './core/time.js';
import { DEFAULT_WINDOW_HOURS, isOpen, lastBiteTs } from './core/rules.js';

export const DEFAULTS = {
  workdayStart: '17:30',
  weekendStart: '14:00',
  holdTime: '13:00',
  trainingTime: '16:30',
  installedAt: null,
  lastBackupAt: null,
  lastImportAt: null,
  icsSequence: 0,
  icsTimes: null,
  persisted: null,
  goalChanges: [], // [{ from: 'YYYY-MM-DD', hours }]: the eating-window goal from that day on
  alarms: false, // timers through the Fast Timer shortcut
};

export const FULLNESS_DELAY = 20 * MIN;

export const state = {
  ready: false,
  days: new Map(),
  meals: new Map(),
  outside: new Map(),
  temptations: new Map(),
  weights: new Map(),
  settings: { ...DEFAULTS },
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  for (const fn of listeners) fn();
}

export async function load() {
  const all = await db.readAll();
  state.days = new Map(all.days.map((r) => [r.day, r]));
  state.meals = new Map(all.meals.map((m) => [m.id, m]));
  state.outside = new Map(all.outside.map((o) => [o.id, o]));
  state.temptations = new Map(all.temptations.map((t) => [t.id, t]));
  state.weights = new Map(all.weights.map((w) => [w.date, w.kg]));
  state.settings = { ...DEFAULTS, ...Object.fromEntries(all.settings.map((s) => [s.key, s.value])) };
  // Which time zone was in force when: every clock time and day reads from it.
  setZones(state.settings.zones);
  state.ready = true;
}

/** Plain snapshot for the pure functions in core/. */
export function data() {
  return {
    days: state.days,
    meals: [...state.meals.values()],
    outside: [...state.outside.values()],
    temptations: [...state.temptations.values()],
    weights: state.weights,
    settings: state.settings,
  };
}

const stamp = (ts) => floorToMinute(ts == null ? now() : ts);

// ---------- Undo ----------

/** The given records as they are now: [key, record or null] per store. */
function snapshot({ days = [], meals = [], outside = [] }) {
  return {
    days: [...new Set(days)].map((k) => [k, state.days.get(k) || null]),
    meals: [...new Set(meals)].map((id) => [id, state.meals.get(id) || null]),
    outside: [...new Set(outside)].map((id) => [id, state.outside.get(id) || null]),
  };
}

/** Puts records back as a snapshot saw them, in one transaction. */
async function putBack(snap) {
  const maps = { days: state.days, meals: state.meals, outside: state.outside };
  const ops = [];
  for (const name of Object.keys(maps)) {
    for (const [key, rec] of snap[name]) ops.push(rec ? { store: name, put: rec } : { store: name, remove: key });
  }
  if (!ops.length) return;
  await db.batch(ops);
  for (const name of Object.keys(maps)) {
    for (const [key, rec] of snap[name]) {
      if (rec) maps[name].set(key, rec);
      else maps[name].delete(key);
    }
  }
  changed();
}

/**
 * Remembers these records as they are now. The returned function puts them
 * back, so the change that follows can be undone in one tap. Records are
 * always replaced, never changed in place, so remembering them is enough.
 */
export function undoPoint(keys) {
  const snap = snapshot(keys);
  return () => putBack(snap);
}

export const mealIdsOf = (key) => [...state.meals.values()].filter((m) => m.day === key).map((m) => m.id);

// ---------- Settings ----------

export async function setSettings(values) {
  // In memory first, so a redraw while the write is under way already shows
  // the new value (a time wheel rebuilt from the old one would undo a roll).
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, state.settings[k]]));
  Object.assign(state.settings, values);
  if ('zones' in values) setZones(state.settings.zones);
  try {
    await db.putMany('settings', Object.entries(values).map(([key, value]) => ({ key, value })));
  } catch (err) {
    Object.assign(state.settings, before);
    if ('zones' in values) setZones(state.settings.zones);
    changed();
    throw err;
  }
  changed();
}

/** The latest moment anything was logged, or null: where a change of zone starts when Fast never noted being open. */
export function lastActivityAt() {
  let last = null;
  const take = (v) => { if (typeof v === 'number' && v <= now() && (last == null || v > last)) last = v; };
  for (const r of state.days.values()) { take(r.firstBite); take(r.lastBite); take(r.fastFrom); take(r.updatedAt); }
  for (const m of state.meals.values()) { take(m.startedAt); take(m.finishedAt); }
  for (const o of state.outside.values()) take(o.at);
  for (const t of state.temptations.values()) { take(t.startedAt); take(t.endedAt); }
  return last;
}

/**
 * Notes that Fast is open now, without a redraw: a change of time zone
 * starts just after this moment.
 */
export async function noteSeen(ts) {
  state.settings.zoneSeenAt = ts;
  try {
    await db.put('settings', { key: 'zoneSeenAt', value: ts });
  } catch {
    /* only a hint for the next change of zone */
  }
}

// ---------- Days and windows ----------

export async function updateDay(key, patch) {
  const rec = { ...(state.days.get(key) || { day: key }), ...patch, day: key, updatedAt: now() };
  await db.put('days', rec);
  state.days.set(key, rec);
  changed();
  return rec;
}

/**
 * First bite: opens the window on the day of the bite. A day that already
 * has a window keeps it: a first bite never overwrites logged times.
 */
export function openWindow(ts) {
  const t = stamp(ts);
  const existing = state.days.get(dayKey(t));
  if (existing && existing.firstBite) return Promise.resolve(existing);
  return updateDay(dayKey(t), { firstBite: t, lastBite: null, noEating: false });
}

/**
 * Removes a window opened by mistake, together with the meals logged in it,
 * as if First bite had never been tapped. One transaction. Resolves with { undo }.
 */
export async function cancelWindow(key) {
  const old = state.days.get(key);
  if (!old) return;
  const meals = [...state.meals.values()].filter((m) => m.day === key);
  const undo = undoPoint({ days: [key], meals: meals.map((m) => m.id) });
  const rec = { ...old, firstBite: null, lastBite: null, updatedAt: now() };
  await db.batch([{ store: 'days', put: rec }, ...meals.map((m) => ({ store: 'meals', remove: m.id }))]);
  state.days.set(key, rec);
  for (const m of meals) state.meals.delete(m.id);
  changed();
  return { undo };
}

export const undoOpen = cancelWindow;

/**
 * Changes a window's first bite and last bite (null while it is open), in
 * one transaction. The window follows its first bite to that bite's day, and
 * the first meal (the one that started at the old first bite) moves with it.
 * Meals still open end at a new last bite. Refuses times that would leave
 * another meal outside the window, or that would overwrite another day's
 * record. Resolves with { key, undo } or { error }.
 */
export async function adjustWindow(oldKey, firstTs, lastTs) {
  const old = state.days.get(oldKey);
  if (!old || !old.firstBite) return { error: 'This window no longer exists.' };
  const first = stamp(firstTs);
  const last = lastTs == null ? null : stamp(lastTs);
  if (last != null && last < first) return { error: 'The last bite comes before the first bite.' };
  const newKey = dayKey(first);
  const target = state.days.get(newKey);
  if (newKey !== oldKey && target && (target.firstBite || target.noEating)) {
    return { error: `${fmtDayLong(newKey)} already has a record. Change it from the Week screen.` };
  }
  const delta = first - old.firstBite;
  const shift = (t) => (t == null ? t : t + delta);
  const meals = [...state.meals.values()].filter((m) => m.day === oldKey).map((m) => {
    const moved = m.startedAt === old.firstBite
      ? { ...m, day: newKey, startedAt: first, finishedAt: shift(m.finishedAt), fullness20DueAt: shift(m.fullness20DueAt) }
      : { ...m, day: newKey };
    if (last != null) {
      if (!moved.finishedAt) moved.finishedAt = Math.max(last, moved.startedAt);
      else if (moved.finishedAt > last && moved.startedAt <= last) moved.finishedAt = last;
    }
    return moved;
  });
  const early = meals.find((m) => m.startedAt < first);
  if (early) return { error: `A meal is logged at ${fmtTime(early.startedAt)}, before that time. Change or delete it first.` };
  const late = last == null ? null : meals.find((m) => m.startedAt > last);
  if (late) return { error: `A meal is logged at ${fmtTime(late.startedAt)}, after that time. Change or delete it first.` };

  const at = now();
  const base = newKey === oldKey ? old : target || { day: newKey };
  const rec = { ...base, day: newKey, firstBite: first, lastBite: last, noEating: false, updatedAt: at };
  const ops = [{ store: 'days', put: rec }];
  const emptied = newKey === oldKey ? null : { ...old, firstBite: null, lastBite: null, updatedAt: at };
  if (emptied) ops.push({ store: 'days', put: emptied });
  for (const m of meals) ops.push({ store: 'meals', put: m });
  const undo = undoPoint({ days: [oldKey, newKey], meals: meals.map((m) => m.id) });
  await db.batch(ops);
  state.days.set(newKey, rec);
  if (emptied) state.days.set(oldKey, emptied);
  for (const m of meals) state.meals.set(m.id, m);
  changed();
  return { key: newKey, undo };
}

/** Moves the first bite of a window (the first-bite sheet), keeping a valid last bite. */
export function moveFirstBite(oldKey, ts) {
  const old = state.days.get(oldKey);
  const t = stamp(ts);
  return adjustWindow(oldKey, t, old && old.lastBite && old.lastBite >= t ? old.lastBite : null);
}

/** Meals still open when a window closes end at its last bite (no 20-minute check). */
async function finishOpenMeals(key, lastBite) {
  for (const m of [...state.meals.values()]) {
    if (m.day === key && !m.finishedAt) await updateMeal(m.id, { finishedAt: Math.max(lastBite, m.startedAt) });
  }
}

export async function closeWindow(key, ts) {
  const rec = await updateDay(key, { lastBite: stamp(ts) });
  await finishOpenMeals(key, rec.lastBite);
  return rec;
}

export function reopenWindow(key) {
  return updateDay(key, { lastBite: null });
}

export async function setWindowTimes(key, firstBite, lastBite) {
  const rec = await updateDay(key, { firstBite, lastBite, noEating: false });
  if (lastBite) await finishOpenMeals(key, lastBite);
  return rec;
}

export function clearWindow(key) {
  return updateDay(key, { firstBite: null, lastBite: null });
}

export function setNoEating(key, value) {
  return updateDay(key, value ? { noEating: true, firstBite: null, lastBite: null } : { noEating: false });
}

// ---------- Pauses ----------

export function daysBetween(fromKey, toKey) {
  const keys = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) keys.push(k);
  return keys;
}

/** Whether a day record still holds anything once a field is gone. */
const holdsData = (r) => !!(r.firstBite || r.lastBite || r.noEating || r.dayOff || r.energy4pm != null || r.trained != null
  || r.trainingType || r.paused || r.fullness || r.fastFrom);

/**
 * Pauses every day from fromKey to toKey, for a reason ('travel', 'illness',
 * 'ramadan', 'other', or true for none). replacing: the days of a pause
 * being changed; those outside the new dates are unpaused in the same
 * transaction. Refuses dates with a window still open.
 * Resolves with { undo } or { error }.
 */
export async function pauseDays(fromKey, toKey, reason, { replacing = [] } = {}) {
  const keys = daysBetween(fromKey, toKey);
  if (keys.some((k) => isOpen(state.days.get(k)))) return { error: 'A window is still open on one of those days. Close it first.' };
  const dropped = replacing.filter((k) => k < fromKey || k > toKey);
  const undo = undoPoint({ days: [...keys, ...dropped] });
  const at = now();
  const ops = keys.map((k) => ({ store: 'days', put: { ...(state.days.get(k) || { day: k }), day: k, paused: reason || true, updatedAt: at } }));
  ops.push(...unpauseOps(dropped, at));
  await db.batch(ops);
  apply(ops);
  return { undo };
}

/** Ends the pause on these days; a day left holding nothing is removed. Resolves with { undo }. */
export async function unpauseDays(keys) {
  const undo = undoPoint({ days: keys });
  const ops = unpauseOps(keys, now());
  if (ops.length) {
    await db.batch(ops);
    apply(ops);
  }
  return { undo };
}

function unpauseOps(keys, at) {
  const ops = [];
  for (const k of keys) {
    const cur = state.days.get(k);
    if (!cur || !cur.paused) continue;
    const { paused, ...rest } = cur;
    ops.push(holdsData(rest) ? { store: 'days', put: { ...rest, updatedAt: at } } : { store: 'days', remove: k });
  }
  return ops;
}

/** Applies day writes to the in-memory copy, then announces them. */
function apply(ops) {
  for (const op of ops) {
    if ('remove' in op) state.days.delete(op.remove);
    else state.days.set(op.put.day, op.put);
  }
  changed();
}

// ---------- Goal ----------

/**
 * Sets the goal from a day on: the eating window (hours) and, for a long
 * fast, its hours (24 to 72), kept for every fast. Earlier days keep the goal
 * they had. Resolves with { undo }.
 */
export async function setGoal(hours, fromKey, fast = null) {
  const before = state.settings.goalChanges || [];
  const kept = before.filter((c) => c.from < fromKey);
  const previous = kept.length ? kept[kept.length - 1] : { hours: DEFAULT_WINDOW_HOURS };
  const same = previous.hours === hours && (previous.fast || null) === (fast || null);
  await setSettings({ goalChanges: same ? kept : [...kept, fast ? { from: fromKey, hours, fast } : { from: fromKey, hours }] });
  return { undo: () => setSettings({ goalChanges: before }) };
}

/** Switches flexible timing on or off from a day on; earlier days keep their rule. */
export async function setFlexible(on, fromKey) {
  const before = state.settings.flexChanges || [];
  const kept = before.filter((c) => c.from < fromKey);
  const previous = kept.length ? kept[kept.length - 1].on : false;
  await setSettings({ flexChanges: previous === on ? kept : [...kept, { from: fromKey, on }] });
  return { undo: () => setSettings({ flexChanges: before }) };
}

// ---------- Begin fast ----------

/**
 * Sets when the current fast began. A start set earlier for the same fast
 * (after the last bite on record) gives way to this one. The day it falls
 * on keeps its result. Resolves with { undo }.
 */
export async function beginFast(ts) {
  const t = stamp(ts);
  const key = dayKey(t);
  const lastBite = lastBiteTs(data());
  const stale = [...state.days.values()]
    .filter((r) => r.fastFrom && r.day !== key && (lastBite == null || r.fastFrom > lastBite))
    .map((r) => r.day);
  const undo = undoPoint({ days: [key, ...stale] });
  const at = now();
  const ops = [{ store: 'days', put: { ...(state.days.get(key) || { day: key }), day: key, fastFrom: t, updatedAt: at } }];
  for (const k of stale) {
    const { fastFrom, ...rest } = state.days.get(k);
    ops.push(holdsData(rest) ? { store: 'days', put: { ...rest, updatedAt: at } } : { store: 'days', remove: k });
  }
  await db.batch(ops);
  apply(ops);
  return { undo };
}

// ---------- Fullness ----------

/** The day's own fullness rating: 'before_full', 'full', 'stuffed', or null to clear. */
export function setDayFullness(key, value) {
  return updateDay(key, { fullness: value });
}

// ---------- Meals ----------

/**
 * Starts a meal, which is what opens a window. kind:
 *   'first'   opens a window at the meal's start (the first bite),
 *   'open'    joins the window already open on that day,
 *   'reopen'  reopens that day's window, closed but still inside its goal,
 *   'outside' counts it as eating outside that day's closed window.
 * One transaction. Resolves with { meal, undo } or { error }.
 */
export async function startMealAs(kind, { day, name, startedAt, hungerBefore }) {
  const t = stamp(startedAt);
  const key = kind === 'first' ? dayKey(t) : day;
  const cur = state.days.get(key);
  if (kind === 'first' && cur && cur.firstBite) return { error: `${fmtDayLong(key)} already has a window. Pick a later time.` };
  const snap = snapshot({ days: [key] });
  const meal = {
    day: key,
    name: name || '',
    startedAt: t,
    finishedAt: null,
    hungerBefore: hungerBefore ?? null,
    stop: null,
    fullnessNow: null,
    fullness20DueAt: null,
    fullness20: null,
    fullness20Skipped: false,
    ...(kind === 'outside' ? { outside: true } : {}),
  };
  const at = now();
  let rec = null;
  if (kind === 'first') rec = { ...(cur || { day: key }), day: key, firstBite: t, lastBite: null, noEating: false, updatedAt: at };
  if (kind === 'reopen') rec = { ...cur, lastBite: null, updatedAt: at };
  const ops = [...(rec ? [{ store: 'days', put: rec }] : []), { store: 'meals', put: meal }];
  const keys = await db.batch(ops);
  const saved = { ...meal, id: keys[keys.length - 1] };
  if (rec) state.days.set(key, rec);
  state.meals.set(saved.id, saved);
  changed();
  snap.meals.push([saved.id, null]); // undo removes the meal
  return { meal: saved, undo: () => putBack(snap) };
}

async function saveRecord(store, map, rec) {
  const id = await db.put(store, rec);
  const saved = { ...rec, id };
  map.set(id, saved);
  changed();
  return saved;
}

export function startMeal({ day, name, startedAt, hungerBefore }) {
  return saveRecord('meals', state.meals, {
    day,
    name: name || '',
    startedAt: stamp(startedAt),
    finishedAt: null,
    hungerBefore: hungerBefore ?? null,
    stop: null,
    fullnessNow: null,
    fullness20DueAt: null,
    fullness20: null,
    fullness20Skipped: false,
  });
}

/**
 * Saves a finished meal added after it was eaten, together with what it
 * does to its day (place, from placeAddedMeal: the window's new times, or
 * eating outside it), in one transaction. Without a fullness at 20 minutes,
 * a meal that has only just ended still gets its check. Resolves with { meal, undo }.
 */
export async function addFinishedMeal(place, { name, startedAt, finishedAt, hungerBefore, stop, fullnessNow, fullness20 }) {
  const key = place.day;
  const snap = snapshot({ days: [key] });
  const end = stamp(finishedAt);
  const meal = {
    day: key,
    name: name || '',
    startedAt: stamp(startedAt),
    finishedAt: end,
    hungerBefore: hungerBefore ?? null,
    stop: stop ?? null,
    fullnessNow: fullnessNow ?? null,
    fullness20DueAt: fullness20 == null ? fullnessDueAt(end) : null,
    fullness20: fullness20 ?? null,
    fullness20Skipped: false,
    ...(fullness20 != null ? { fullness20At: end + FULLNESS_DELAY } : {}),
    ...(place.outside ? { outside: true } : {}),
  };
  const rec = place.rec ? { ...place.rec, day: key, updatedAt: now() } : null;
  const ops = [...(rec ? [{ store: 'days', put: rec }] : []), { store: 'meals', put: meal }];
  const keys = await db.batch(ops);
  const saved = { ...meal, id: keys[keys.length - 1] };
  if (rec) state.days.set(key, rec);
  state.meals.set(saved.id, saved);
  changed();
  snap.meals.push([saved.id, null]); // undo removes the meal
  return { meal: saved, undo: () => putBack(snap) };
}

/**
 * When to ask for fullness 20 minutes after a meal. A meal logged long
 * after the fact gets no prompt (its 20-minute moment is past); its
 * fullness at 20 minutes can still be entered by editing the meal.
 */
export function fullnessDueAt(finishedAt) {
  const due = finishedAt + FULLNESS_DELAY;
  return now() - due > 15 * MIN ? null : due;
}

export function finishMeal(id, { finishedAt, stop, fullnessNow }) {
  const t = stamp(finishedAt);
  return updateMeal(id, { finishedAt: t, stop: stop ?? null, fullnessNow: fullnessNow ?? null, fullness20DueAt: fullnessDueAt(t) });
}

// Updates to a record that no longer exists are ignored, so a sheet left
// open after a delete can never write a half-empty record back.
export async function updateMeal(id, patch) {
  const cur = state.meals.get(id);
  if (!cur) return null;
  const rec = { ...cur, ...patch };
  await db.put('meals', rec);
  state.meals.set(id, rec);
  changed();
  return rec;
}

export async function deleteMeal(id) {
  await db.remove('meals', id);
  state.meals.delete(id);
  changed();
}

// ---------- Eating outside the window ----------

export function addOutside({ day, at, trigger, amount, source }) {
  return saveRecord('outside', state.outside, { day, at: stamp(at), trigger: trigger || null, amount: amount || null, source: source || 'today' });
}

export async function updateOutside(id, patch) {
  const cur = state.outside.get(id);
  if (!cur) return null;
  const rec = { ...cur, ...patch };
  await db.put('outside', rec);
  state.outside.set(id, rec);
  changed();
  return rec;
}

export async function deleteOutside(id) {
  await db.remove('outside', id);
  state.outside.delete(id);
  changed();
}

// ---------- Temptations ----------

export function addTemptation(rec) {
  return saveRecord('temptations', state.temptations, rec);
}

export async function updateTemptation(id, patch) {
  const cur = state.temptations.get(id);
  if (!cur) return null;
  const rec = { ...cur, ...patch };
  await db.put('temptations', rec);
  state.temptations.set(id, rec);
  changed();
  return rec;
}

export async function deleteTemptation(id) {
  await db.remove('temptations', id);
  state.temptations.delete(id);
  changed();
}

// ---------- Weight ----------

/** Saves imported entries (a re-imported date replaces its old value). */
export async function saveWeights(entries) {
  const at = now();
  await db.putMany('weights', [...entries].map(([date, kg]) => ({ date, kg, importedAt: at })));
  for (const [date, kg] of entries) state.weights.set(date, kg);
  await setSettings({ lastImportAt: at });
}

// ---------- Reset ----------

/**
 * Deletes all history (windows, meals, eating outside the window,
 * temptations, weigh-ins) and keeps the settings. Tracking starts again now.
 */
export async function resetHistory() {
  const kept = { ...state.settings, installedAt: now(), lastBackupAt: null, lastImportAt: null };
  await db.replaceAll({
    days: [], meals: [], outside: [], temptations: [], weights: [],
    settings: Object.entries(kept).map(([key, value]) => ({ key, value })),
  });
  await load();
  changed();
}

// ---------- Restore ----------

export async function restore(backup) {
  const d = backup.data;
  // The file is itself a backup, made when it was exported, so the backup
  // reminder counts from the latest of that, the file's own record and ours.
  const recorded = d.settings.find((s) => s.key === 'lastBackupAt');
  const exported = Date.parse(backup.exportedAt);
  const lastBackupAt = Math.max(
    state.settings.lastBackupAt || 0,
    (recorded && recorded.value) || 0,
    Number.isFinite(exported) ? exported : 0,
  ) || null;
  const seen = d.settings.find((s) => s.key === 'zoneSeenAt');
  const zoneSeenAt = Math.max((seen && seen.value) || 0, Number.isFinite(exported) ? exported : 0) || null;
  const keep = { installedAt: state.settings.installedAt, persisted: state.settings.persisted, lastBackupAt, zoneSeenAt };
  const settings = d.settings.filter((s) => !(s.key in keep));
  await db.replaceAll({ ...d, settings: [...settings, ...Object.entries(keep).map(([key, value]) => ({ key, value }))] });
  await load();
  changed();
}
