// Meals: first bite, logging, finishing, closing the window, 20-minute check.

import { h } from './dom.js';
import { clockGlyph } from './icons.js';
import { button, choice, scale, textField, timeField, STOP_OPTIONS } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { MIN, HOUR, addDays, at, dayKey, floorToMinute, fmtDayLong, fmtDayShort, fmtDuration, fmtOnDay, fmtTime, fmtWhen, minutesOfDay, nearestTime, now } from '../core/time.js';
import { CUTOFF_MIN, LATE_NIGHT_END_MIN, canReopen, cutoffApplies, evaluateDay, isFlexible, plannedStartMin, timeOnOrAfter, windowMsFor, FORGOT_AFTER_MS } from '../core/rules.js';
import { placeAddedMeal } from '../core/added-meal.js';
import { MEAL_TYPES, guessMealType, typeOfName } from '../core/meal-types.js';
import { mealInProgress } from './shared.js';
import { ringIn } from './alarm.js';

/** Most recent moment at or before ref with this clock time (for edits after the fact). */
export function latestAtOrBefore(minutes, ref) {
  const key = dayKey(ref);
  const ts = at(key, minutes);
  return ts > ref ? at(addDays(key, -1), minutes) : ts;
}

/**
 * A corrected first-bite time lands on the window's own day. A time still
 * ahead is refused, except just after midnight, when a late clock time
 * means last night.
 */
export function resolveFirstBite(key, minutes) {
  const t = now();
  const ts = at(key, minutes);
  if (ts <= t + MIN) return ts;
  const prev = at(addDays(key, -1), minutes);
  if (minutesOfDay(t) < LATE_NIGHT_END_MIN && t - prev < 6 * HOUR) return prev;
  return null;
}

// ---------- What the meal is ----------

const TYPE_OPTIONS = [...MEAL_TYPES.map((t) => ({ value: t, label: t })), { value: 'other', label: 'Other', wide: true }];

/** Names typed under Other before, most used first, for one-tap reuse. */
function recentOtherNames(ctx) {
  const counts = new Map();
  for (const m of ctx.meals) if (typeOfName(m.name) === 'other') counts.set(m.name, (counts.get(m.name) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
}

/** The draft's pick from a stored name: the choice, and any name typed under Other. */
function pickFromName(name) {
  const pick = typeOfName(name);
  return { pick, other: pick === 'other' ? name : '' };
}

/**
 * What the meal is: Snack, Breakfast, Lunch, Dinner, or Other with a typed
 * name, stored as the meal's name. Until one is tapped, the start time picks
 * it (guessAt gives that time in minutes since midnight); box.refresh()
 * follows a change of time. Redraws itself, so the wheels stay put.
 */
function mealTypeSection(ctx, draft, guessAt = null) {
  const box = h('section', { class: 'section', 'data-block': 'meal-type' });
  const draw = () => {
    const pick = draft.pick ?? (guessAt ? guessMealType(guessAt()) : null);
    draft.name = pick === 'other' ? (draft.other || '').trim() : pick || '';
    const others = pick === 'other' ? recentOtherNames(ctx) : [];
    box.replaceChildren(...[
      choice({ label: 'Meal', options: TYPE_OPTIONS, value: pick, cols: 3, name: 'meal-type', onChange: (v) => { draft.pick = v; draw(); } }),
      pick === 'other'
        ? h('div', { class: 'gap' }, textField({ label: 'Name', placeholder: 'Dessert', value: draft.other, name: 'meal-name',
          onInput: (v) => { draft.other = v; draft.name = v; } }))
        : null,
      others.length ? h('div', { class: 'btn-row gap-s' }, others.map((n) => button(n, () => { draft.other = n; draw(); }, { kind: 'secondary' }))) : null,
    ].filter(Boolean));
  };
  draw();
  box.refresh = draw;
  return box;
}

const hungerScale = (draft) => scale({
  n: 10, value: draft.hungerBefore, onChange: (v) => { draft.hungerBefore = v; },
  label: 'Hunger before', low: '1 not hungry', high: '10 very hungry', name: 'hunger',
});

const stopChoice = (draft) => choice({
  options: STOP_OPTIONS, value: draft.stop, onChange: (v) => { draft.stop = v; },
  label: 'How did you finish?', cols: 3, name: 'stop',
});

const fullnessScale = (draft, key = 'fullnessNow', label = 'Fullness now') => scale({
  n: 10, value: draft[key], onChange: (v) => { draft[key] = v; },
  label, low: '1 empty', high: '10 stuffed', name: key === 'fullnessNow' ? 'fullness-now' : 'fullness-20',
});

// ---------- Start a meal ----------

/**
 * Where a meal started now goes (see store.startMealAs): 'open' joins the
 * open window; after a window has closed, 'reopen' inside its goal and
 * 'outside' past it; 'first' opens a window when there is none.
 */
export function mealSituation(ctx) {
  const { mode, rec } = ctx.mode;
  if (mode === 'open' || mode === 'forgot') return { kind: 'open', rec };
  if (mode === 'closed') return { kind: canReopen(rec, ctx.nowTs, ctx.windowMsFor(rec.day)) ? 'reopen' : 'outside', rec };
  return { kind: 'first', rec: null };
}

const QUICK = [[0, 'Now'], [30, '30 min ago'], [60, '1 h ago'], [120, '2 h ago']];

/**
 * Start a meal: the first meal of the day opens the window, and each meal
 * keeps its own satiety. One meal at a time, so a meal still open is
 * finished first. 'Already finished?' opens Add a meal, for a meal eaten whole.
 */
export function showStartMealSheet(app) {
  const ctx0 = app.ctx();
  const sit0 = mealSituation(ctx0);
  const running = sit0.rec ? mealInProgress(ctx0, sit0.rec.day) : null;
  if (running) {
    showFinishMealSheet(app, running.id, { next: () => showStartMealSheet(app), lead: 'One meal at a time. First, how did this one finish?' });
    return;
  }
  const draft = { name: '', pick: null, other: '', hungerBefore: null, ts: floorToMinute(now()), moved: false };
  let hint = '';
  openSheet((api) => {
    const ctx = app.ctx();
    const sit = mealSituation(ctx);
    // Until a meal is tapped, its start time picks it.
    const typeBox = mealTypeSection(ctx, draft, () => minutesOfDay(draft.ts ?? now()));
    const rec = sit.rec;
    // Only a first meal before 16:00 on a workday makes the day a miss.
    const warnEl = h('p', { class: 'statement gap', 'data-testid': 'meal-warning' });
    const aheadEl = h('p', { class: 'small', 'data-testid': 'meal-ahead' });
    const updateWarn = () => {
      const key = draft.ts == null ? null : dayKey(draft.ts);
      const early = key != null && sit.kind === 'first' && cutoffApplies(key, ctx.days.get(key), ctx.settings) && minutesOfDay(draft.ts) < CUTOFF_MIN;
      warnEl.textContent = early ? 'Before 16:00 on a workday: today will count as a miss.' : '';
      warnEl.hidden = !early;
      aheadEl.textContent = draft.ts == null ? 'That time is still ahead.' : '';
    };
    // A clock time means today, or last night just after midnight; never a time still ahead.
    const field = timeField({
      label: 'Started at',
      minutes: draft.ts == null ? minutesOfDay(now()) : minutesOfDay(draft.ts),
      name: 'meal-start',
      onChange: (m) => { draft.ts = resolveFirstBite(app.ctx().todayKey, m); draft.moved = true; updateWarn(); typeBox.refresh(); },
    });
    const presets = h('div', { class: 'presets gap-s', role: 'group', 'aria-label': 'Quick times' },
      QUICK.map(([mins, label]) => button(label, () => {
        draft.ts = floorToMinute(now() - mins * MIN);
        draft.moved = true;
        field.set(minutesOfDay(draft.ts));
        updateWarn();
        typeBox.refresh();
      }, { kind: 'secondary', name: `meal-start-${mins}` })));
    updateWarn();
    const context = {
      first: 'Your first meal opens the window.',
      reopen: rec && `This reopens your window from ${fmtTime(rec.firstBite)}.`,
      outside: rec && `Your window closed at ${fmtTime(rec.lastBite)} and its hours are over, so this meal counts as eating outside it and the day becomes a miss.`,
    }[sit.kind];

    const save = async () => {
      const cur = mealSituation(app.ctx());
      const ts = draft.ts;
      const refuse = (text) => { hint = text; api.rerender(); };
      if (ts == null || ts > now() + MIN) return refuse('That time is still ahead.');
      if ((cur.kind === 'open' || cur.kind === 'reopen') && ts < cur.rec.firstBite) {
        return refuse(`Your window opened at ${fmtTime(cur.rec.firstBite)}. A meal in it starts after that.`);
      }
      if (cur.kind === 'outside' && ts < cur.rec.lastBite) {
        return refuse(`Your window closed at ${fmtTime(cur.rec.lastBite)}. Pick a later time, or change the window's times.`);
      }
      const res = await store.startMealAs(cur.kind, { day: cur.rec ? cur.rec.day : null, name: draft.name, startedAt: ts, hungerBefore: draft.hungerBefore });
      if (res.error) return refuse(res.error);
      await api.close();
      const at = fmtTime(res.meal.startedAt);
      app.flash(cur.kind === 'first' ? `Window open from ${at}.` : `Meal started at ${at}.`, { undo: res.undo });
      return null;
    };

    return h('div', {},
      sheetHead(api, 'Start a meal'),
      h('p', { 'data-testid': 'meal-context' }, context),
      h('div', { class: 'stanza gap' },
        h('p', { class: 'statement' }, 'Protein and vegetables first.'),
        h('p', { class: 'statement' }, 'Eat slowly.'),
        h('p', { class: 'statement' }, 'Pause halfway.')),
      h('section', { class: 'section gap' }, presets, field, aheadEl),
      warnEl,
      typeBox,
      h('section', { class: 'section' }, hungerScale(draft)),
      hint ? h('p', { class: 'small', 'data-testid': 'meal-hint' }, hint) : null,
      h('div', { class: 'gap' }, button('Start eating', save, { block: true, name: 'start-eating' })),
      h('div', { class: 'gap-s' }, button('Already finished? Add a meal', () => showAddMealSheet(app, { from: {
        pick: draft.pick, other: draft.other, hungerBefore: draft.hungerBefore,
        // A start left at now would make a meal of no length: Add a meal then starts an hour ago.
        ts: draft.moved && draft.ts != null && draft.ts < floorToMinute(now()) - MIN ? draft.ts : null,
      } }), { kind: 'outline', block: true, name: 'already-finished' })),
    );
  }, { name: 'start-meal', label: 'Start a meal' });
}

// ---------- Add a meal ----------

const AGO = [[30, '30 min ago'], [60, '1 h ago'], [120, '2 h ago']];
const LENGTHS = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']];

/** 'Your window', "Yesterday's window" or 'The window on Thu 1 Oct', as seen from today. */
function windowName(ctx, key) {
  if (key === ctx.todayKey) return 'Your window';
  if (key === addDays(ctx.todayKey, -1)) return "Yesterday's window";
  return `The window on ${fmtDayShort(key)}`;
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/** Why an added meal cannot go where it is: a meal it overlaps, or a window still open. */
function placeError(ctx, place) {
  if (place.error === 'overlap') {
    const m = place.meal;
    const span = m.finishedAt ? `from ${fmtWhen(m.startedAt, ctx.todayKey)} to ${fmtTime(m.finishedAt)}` : `since ${fmtWhen(m.startedAt, ctx.todayKey)}`;
    return `That overlaps ${m.name || 'a meal'} ${span}. Change the time, or edit that meal.`;
  }
  return `Your window from ${fmtWhen(place.rec.firstBite, ctx.todayKey)} is still open. Close it on Today first.`;
}

/** What an added meal does to its day's window, in a sentence. */
function placeText(ctx, place, start) {
  const name = windowName(ctx, place.day);
  const span = (r) => `${fmtTime(r.firstBite)} to ${fmtOnDay(r.lastBite, place.day)}, ${fmtDuration(r.lastBite - r.firstBite)}`;
  const r = place.rec;
  switch (place.kind) {
    case 'paused': return 'This day is paused, so the meal counts for Satiety only.';
    case 'first': return (r.lastBite ? `${name}: ${span(r)}.` : `This meal opens ${lowerFirst(name)} at ${fmtTime(start)}.`)
      + (place.wasNoEating ? ' It replaces the day without eating.' : '');
    case 'earlier': return r.lastBite ? `${name} becomes ${span(r)}.` : `${name} now opens at ${fmtTime(start)}.`;
    case 'extend': return `${name} becomes ${span(r)}.`;
    case 'outside': {
      const cur = ctx.days.get(place.day);
      return `${name} closed at ${fmtOnDay(cur.lastBite, place.day)} and its hours were over, so this meal counts as eating outside it.`;
    }
    default: return r && r.lastBite ? `${name} becomes ${span(r)}.` : `This meal goes in ${lowerFirst(name)}.`;
  }
}

/** A day the added meal would make a miss, in words: only reasons the day did not have before. */
function missLines(ctx, place) {
  if (place.kind === 'paused') return [];
  const before = ctx.evaluate(place.day);
  const after = evaluateDay(place.day, place.rec || ctx.days.get(place.day), before.outsideCount + (place.outside ? 1 : 0),
    ctx.nowTs, ctx.todayKey, ctx.startKey, ctx.windowMsFor(place.day), isFlexible(place.day, ctx.settings));
  const hours = Math.round(ctx.windowMsFor(place.day) / HOUR);
  const text = {
    early: 'Opening before 16:00 on a workday makes the day a miss.',
    over: `That is longer than your ${hours}-hour goal, so the day becomes a miss.`,
    outside: 'Eating outside the window makes the day a miss.',
  };
  return after.reasons.filter((r) => !before.reasons.includes(r)).map((r) => text[r]);
}

/**
 * Where Add a meal starts: a start Start a meal already holds; for an
 * earlier day, the end of its last meal, else its first bite or planned
 * time; otherwise an hour ago. A start of its own steps past meals already logged.
 */
function defaultStart(ctx, day, ts) {
  if (ts != null) return ts;
  let t;
  if (day && day !== ctx.todayKey) {
    const rec = ctx.days.get(day);
    const ends = ctx.meals.filter((m) => m.day === day && m.finishedAt).map((m) => m.finishedAt);
    t = ends.length ? Math.max(...ends) : rec && rec.firstBite ? rec.firstBite : at(day, plannedStartMin(day, rec, ctx.settings));
  } else {
    t = floorToMinute(now() - HOUR);
  }
  // Clear of meals already logged, over the half hour it first takes: after a finished one, before one still being eaten.
  for (let i = 0; i < ctx.meals.length; i++) {
    const clash = ctx.meals.find((m) => m.startedAt < t + 30 * MIN && t < (m.finishedAt || now()));
    if (!clash) break;
    t = clash.finishedAt || clash.startedAt - 30 * MIN;
  }
  return t;
}

/**
 * Add a meal already eaten, whole and in one go: when it started, how long
 * it took, what it was, hunger before, how it ended and both fullness
 * readings. No timer. day: the day to add it to (from the Day screen);
 * otherwise today or yesterday. from: what Start a meal already holds
 * ({ pick, other, hungerBefore, ts }, ts only once its start was moved).
 * Before saving, the sheet says what the meal does to that day's window
 * (see placeAddedMeal).
 */
export function showAddMealSheet(app, { day = null, from = null } = {}) {
  const ctx0 = app.ctx();
  const today = ctx0.todayKey;
  const yesterday = addDays(today, -1);
  const fixed = day && day !== today && day !== yesterday ? day : null;
  const start0 = defaultStart(ctx0, day, from ? from.ts : null);
  const draft = {
    day: day && day !== today ? day : dayKey(start0),
    minutes: minutesOfDay(start0),
    length: 30, // minutes, as wanted; the meal never ends after `until`
    until: floorToMinute(now()),
    refused: '', // why the Finished at wheel's time cannot be the end; the length stays as it was
    name: '', pick: from ? from.pick ?? null : null, other: from ? from.other || '' : '',
    hungerBefore: from ? from.hungerBefore ?? null : null, stop: null, fullnessNow: null, fullness20: null,
    last: null, // unanswered: yes for a day already over, no for today
  };
  const MAX_LENGTH = 12 * 60;
  // A time just after midnight, on a day whose window reaches past midnight, is that night's.
  const startTs = () => {
    const ts = at(draft.day, draft.minutes);
    const r = store.state.days.get(draft.day);
    if (r && r.firstBite && ts < r.firstBite && draft.minutes < LATE_NIGHT_END_MIN) {
      const next = at(addDays(draft.day, 1), draft.minutes);
      const inGoal = next - r.firstBite < windowMsFor(draft.day, store.state.settings);
      // Inside a closed window, or still that late night; an open window takes its goal.
      const late = r.lastBite ? next <= r.lastBite || (minutesOfDay(now()) < LATE_NIGHT_END_MIN && inGoal) : inGoal;
      if (next <= now() + MIN && late) return next;
    }
    return ts;
  };
  const finishTs = () => Math.min(startTs() + draft.length * MIN, Math.max(startTs(), draft.until));
  // Unanswered: yes once the day's window would be past the point where Today asks for its last bite.
  const lastAnswer = () => {
    if (draft.last != null) return draft.last;
    const r = store.state.days.get(draft.day);
    const opened = Math.min(startTs(), r && r.firstBite ? r.firstBite : Infinity);
    return draft.day < today && now() - opened >= windowMsFor(draft.day, store.state.settings) + FORGOT_AFTER_MS;
  };
  const placeNow = () => placeAddedMeal(store.data(), { start: startTs(), finish: finishTs(), last: lastAnswer(), nowTs: now() });
  const finishProblem = () => draft.refused;

  openSheet((api) => {
    const ctx = app.ctx();
    const typeBox = mealTypeSection(ctx, draft, () => draft.minutes);
    const aheadEl = h('p', { class: 'small', 'data-testid': 'add-meal-ahead' });
    const finishNoteEl = h('p', { class: 'small', 'data-testid': 'add-meal-finish-note' });
    const effectEl = h('p', { class: 'gap', 'data-testid': 'add-meal-effect' });
    const missEl = h('div', { 'data-testid': 'add-meal-miss' });
    const hintEl = h('p', { class: 'small', 'data-testid': 'add-meal-hint' });
    const lastBox = h('div');
    let lastShown = null;

    // The wheels report a settled time; the lines below follow without redrawing the sheet.
    const refresh = () => {
      const c = app.ctx();
      const start = startTs();
      const ahead = start > now() + MIN;
      aheadEl.textContent = ahead ? 'That time is still ahead.' : '';
      finishNoteEl.textContent = finishProblem();
      hintEl.textContent = '';
      const place = ahead || finishProblem() ? null : placeNow();
      const ok = place && !place.error;
      effectEl.textContent = !place ? '' : place.error ? placeError(c, place) : placeText(c, place, start);
      missEl.replaceChildren(...(ok ? missLines(c, place) : []).map((t) => h('p', { class: 'statement clay gap-s' }, t)));
      const showLast = !!(ok && place.canClose);
      if (showLast !== lastShown) {
        lastShown = showLast;
        lastBox.replaceChildren(...(showLast
          ? [h('section', { class: 'section' }, choice({
            label: 'Last meal of the day?', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: lastAnswer(), cols: 2, name: 'last-meal',
            onChange: (v) => { draft.last = v; refresh(); },
          }))]
          : []));
      }
    };

    // The Finished at wheel takes what is rolled as it is (hour, then minute); only a start or a length moves it.
    const finishField = timeField({
      label: 'Finished at',
      minutes: minutesOfDay(finishTs()),
      name: 'added-finish',
      onChange: (m) => {
        draft.until = floorToMinute(now());
        const length = Math.round((timeOnOrAfter(startTs(), m) - startTs()) / MIN);
        if (length > MAX_LENGTH) draft.refused = m < draft.minutes ? 'That is before the meal started.' : 'A meal lasts at most 12 hours.';
        else if (startTs() + length * MIN > draft.until + MIN) draft.refused = 'That time is still ahead.';
        else draft.refused = '';
        if (!draft.refused) draft.length = length;
        refresh();
      },
    });
    const followStart = () => {
      draft.until = floorToMinute(now());
      draft.refused = '';
      finishField.set(minutesOfDay(finishTs()));
      refresh();
    };
    const startField = timeField({
      label: 'Started at',
      minutes: draft.minutes,
      name: 'added-start',
      onChange: (m) => { draft.minutes = m; typeBox.refresh(); followStart(); },
    });
    const moveStart = (ts) => {
      const key = dayKey(ts);
      draft.minutes = minutesOfDay(ts);
      if (key !== draft.day) {
        draft.day = key;
        draft.until = floorToMinute(now());
        draft.refused = '';
        api.rerender();
        return;
      }
      startField.set(draft.minutes);
      typeBox.refresh();
      followStart();
    };
    const ago = h('div', { class: 'presets gap-s', role: 'group', 'aria-label': 'Quick times' },
      AGO.map(([mins, label]) => button(label, () => moveStart(floorToMinute(now() - mins * MIN)), { kind: 'secondary', name: `added-start-${mins}` })));
    const lengths = h('div', { class: 'presets gap-s', role: 'group', 'aria-label': 'How long it took' },
      LENGTHS.map(([mins, label]) => button(label, () => { draft.length = mins; followStart(); }, { kind: 'secondary', name: `added-length-${mins}` })));

    const save = async () => {
      const start = startTs();
      const finish = finishTs();
      if (start > now() + MIN) { hintEl.textContent = 'That time is still ahead.'; return null; }
      if (finishProblem()) { hintEl.textContent = finishProblem(); return null; }
      const place = placeNow();
      if (place.error) { hintEl.textContent = placeError(app.ctx(), place); return null; }
      const res = await store.addFinishedMeal(place, {
        name: draft.name, startedAt: start, finishedAt: finish,
        hungerBefore: draft.hungerBefore, stop: draft.stop, fullnessNow: draft.fullnessNow, fullness20: draft.fullness20,
      });
      await api.close();
      // Alarms, as Finished this meal gives them: a fullness check still ahead.
      const due = res.meal.fullness20DueAt;
      if (due) ringIn((due - now()) / MIN);
      app.flash(due && due > now() ? `Meal saved. Fullness check at ${fmtTime(due)}.` : 'Meal saved.', { undo: res.undo });
      return null;
    };

    const node = h('div', {},
      sheetHead(api, 'Add a meal'),
      h('p', { class: 'quiet' }, 'For a meal you already ate. No timer.'),
      fixed
        ? h('p', { class: 'statement gap', 'data-testid': 'add-meal-day' }, fmtDayLong(fixed))
        : h('section', { class: 'section gap' }, choice({
          label: 'Day', options: [{ value: today, label: 'Today' }, { value: yesterday, label: 'Yesterday' }], value: draft.day, cols: 2, name: 'added-day',
          onChange: (v) => { draft.day = v; draft.until = floorToMinute(now()); draft.refused = ''; api.rerender(); },
        })),
      h('section', { class: 'section' }, draft.day === today ? ago : null, startField, aheadEl),
      h('section', { class: 'section' }, h('div', { class: 'label field-label' }, 'How long it took'), lengths, finishField, finishNoteEl),
      typeBox,
      h('section', { class: 'section' }, hungerScale(draft)),
      h('section', { class: 'section' }, stopChoice(draft)),
      h('section', { class: 'section' }, fullnessScale(draft, 'fullnessNow', 'Fullness right after')),
      h('section', { class: 'section' }, fullnessScale(draft, 'fullness20', 'Fullness at 20 minutes')),
      lastBox,
      effectEl,
      missEl,
      hintEl,
      h('div', { class: 'gap' }, button('Save meal', save, { block: true, name: 'save-added-meal' })),
    );
    refresh();
    return node;
  }, { name: 'add-meal', label: 'Add a meal' });
}

// ---------- Finish a meal ----------

/** next(): opened once the meal is saved (starting another meal). lead: a line above the questions. */
export function showFinishMealSheet(app, mealId, { next = null, lead = null } = {}) {
  const draft = { stop: null, fullnessNow: null, minutes: minutesOfDay(now()) };
  openSheet((api) => {
    const meal = store.state.meals.get(mealId);
    if (!meal) return h('div', {}, sheetHead(api, 'Finished'), h('p', {}, 'This meal was removed.'));
    return h('div', {},
      sheetHead(api, 'Finished this meal'),
      lead ? h('p', { class: 'gap-s', 'data-testid': 'finish-lead' }, lead) : null,
      h('h2', { class: 'h2' }, meal.name || 'This meal'),
      h('section', { class: 'section gap' }, stopChoice(draft)),
      h('section', { class: 'section' }, fullnessScale(draft)),
      h('section', { class: 'section' },
        timeField({ label: 'Finished at', minutes: draft.minutes, name: 'finished-at', onChange: (m) => { draft.minutes = m; } })),
      h('div', { class: 'gap' }, button('Save', async () => {
        const finishedAt = Math.min(timeOnOrAfter(meal.startedAt, draft.minutes), now());
        await store.finishMeal(mealId, { finishedAt, stop: draft.stop, fullnessNow: draft.fullnessNow });
        await api.close();
        app.flash(`Fullness check at ${fmtTime(finishedAt + store.FULLNESS_DELAY)}.`);
        ringIn((finishedAt + store.FULLNESS_DELAY - now()) / MIN);
        if (next) next();
      }, { block: true, name: 'save-finish' })),
    );
  }, { name: 'finish-meal', label: 'Finished this meal' });
}

// ---------- I'm done eating ----------

export function showDoneEatingSheet(app, windowKey) {
  const ctx0 = app.ctx();
  const open = mealInProgress(ctx0, windowKey);
  const draft = { minutes: minutesOfDay(now()), stop: null, fullnessNow: null };
  openSheet((api) => {
    const rec = store.state.days.get(windowKey);
    if (!rec || !rec.firstBite) return h('div', {}, sheetHead(api, "I'm done eating"), h('p', {}, 'No window is open.'));
    const lastBite = () => timeOnOrAfter(rec.firstBite, draft.minutes);
    const future = () => lastBite() > now() + MIN;
    const summaryText = () => (future()
      ? 'That time is still ahead.'
      : `Window ${fmtTime(rec.firstBite)} to ${fmtTime(lastBite())}, ${fmtDuration(lastBite() - rec.firstBite)}.`);
    // The summary follows the wheel without redrawing the sheet.
    const summary = h('p', { class: 'quiet small gap-s', 'data-testid': 'done-summary' }, summaryText());
    const closeBtn = button('Close the window', async () => {
      if (future()) return;
      const last = lastBite();
      if (open) await store.finishMeal(open.id, { finishedAt: Math.max(last, open.startedAt), stop: draft.stop, fullnessNow: draft.fullnessNow });
      await store.closeWindow(windowKey, last);
      api.close();
    }, { block: true, name: 'close-window', disabled: future() });
    return h('div', {},
      sheetHead(api, "I'm done eating"),
      open
        ? h('div', {},
          h('h2', { class: 'h2' }, `Finish ${open.name || 'this meal'}`),
          h('section', { class: 'section gap' }, stopChoice(draft)),
          h('section', { class: 'section' }, fullnessScale(draft)))
        : null,
      h('section', { class: 'section' },
        timeField({ label: 'Last bite at', minutes: draft.minutes, name: 'last-bite', onChange: (m) => {
          draft.minutes = m;
          summary.textContent = summaryText();
          closeBtn.disabled = future();
        } }),
        summary),
      h('div', { class: 'gap' }, closeBtn),
    );
  }, { name: 'done-eating', label: "I'm done eating" });
}

/** Forgotten close: asks for the last bite of a window left open. */
export function forgotCloseDefault(ctx, rec) {
  let last = rec.firstBite;
  for (const m of ctx.meals) if (m.day === rec.day) last = Math.max(last, m.finishedAt || m.startedAt);
  return last;
}

// ---------- 20-minute fullness ----------

export function showFullnessSheet(app, mealId) {
  const draft = { fullness20: null };
  let hint = '';
  openSheet((api) => {
    const meal = store.state.meals.get(mealId);
    if (!meal) return h('div', {}, sheetHead(api, 'Fullness check'), h('p', {}, 'This meal was removed.'));
    return h('div', {},
      sheetHead(api, 'Fullness check', 'Later'),
      h('h2', { class: 'h2' }, `20 minutes after ${meal.name || 'your meal'}`),
      h('p', { class: 'quiet gap-s' }, meal.fullnessNow != null ? `Right after eating: ${meal.fullnessNow}. Target about 7.` : 'Target about 7.'),
      h('section', { class: 'section gap' }, fullnessScale(draft, 'fullness20', 'Fullness now')),
      hint ? h('p', { class: 'quiet small' }, hint) : null,
      h('div', { class: 'gap' }, button('Save', async () => {
        if (draft.fullness20 == null) { hint = 'Pick a number from 1 to 10.'; api.rerender(); return; }
        await store.updateMeal(mealId, { fullness20: draft.fullness20, fullness20At: now() });
        api.close();
      }, { block: true, name: 'save-fullness' })),
      h('div', { class: 'gap-s' }, button('Skip this one', async () => {
        await store.updateMeal(mealId, { fullness20Skipped: true });
        api.close();
      }, { kind: 'secondary', name: 'skip-fullness' })),
    );
  }, { name: 'fullness', label: 'Fullness check' });
}

// ---------- Edit a meal ----------

/** lastBite: opened from Last bite on Today, so Just now sets when the meal finished. */
export function showMealEditSheet(app, mealId, { lastBite = false } = {}) {
  const original = store.state.meals.get(mealId);
  if (!original) return;
  const draft = { ...original, ...pickFromName(original.name), minutes: minutesOfDay(original.startedAt), finishMinutes: original.finishedAt ? minutesOfDay(original.finishedAt) : null };
  let confirming = false;
  openSheet((api) => {
    const ctx = app.ctx();
    return h('div', {},
      sheetHead(api, 'Meal'),
      mealTypeSection(ctx, draft),
      h('section', { class: 'section' },
        h('div', { class: 'btn-pair' },
          timeField({ label: 'Started', minutes: draft.minutes, name: 'edit-start', onChange: (m) => { draft.minutes = m; } }),
          timeField({ label: 'Finished', minutes: draft.finishMinutes, name: 'edit-finish', allowUnset: true, fallback: draft.minutes, hint: draft.finishMinutes == null ? 'Still eating' : '', onChange: (m) => { draft.finishMinutes = m; draft.finishExact = null; } })),
        // Just now sits under the Finished wheel, so it plainly sets when the meal finished.
        lastBite
          ? h('div', { class: 'btn-pair gap-s' }, h('span'), button([clockGlyph(), 'Just now'], () => {
            const ts = floorToMinute(now());
            draft.finishExact = ts;
            draft.finishMinutes = minutesOfDay(ts);
            api.rerender();
          }, { kind: 'chip', name: 'last-bite-now' }))
          : null),
      h('section', { class: 'section' }, hungerScale(draft)),
      h('section', { class: 'section' }, stopChoice(draft)),
      h('section', { class: 'section' }, fullnessScale(draft)),
      h('section', { class: 'section' }, fullnessScale(draft, 'fullness20', 'Fullness at 20 minutes')),
      h('div', { class: 'gap' }, button('Save', async () => {
        // Unchanged times keep their exact moment; a changed time stays next to the old one.
        const startedAt = draft.minutes === minutesOfDay(original.startedAt)
          ? original.startedAt
          : nearestTime(original.startedAt, draft.minutes);
        let finishedAt = null;
        if (draft.finishExact != null) finishedAt = draft.finishExact;
        else if (draft.finishMinutes != null) {
          if (original.finishedAt && draft.finishMinutes === minutesOfDay(original.finishedAt)) finishedAt = original.finishedAt;
          else finishedAt = timeOnOrAfter(startedAt, draft.finishMinutes);
        }
        const sameFinish = finishedAt === original.finishedAt;
        const undo = store.undoPoint({ meals: [mealId] });
        await store.updateMeal(mealId, {
          name: draft.name || '',
          startedAt,
          finishedAt,
          hungerBefore: draft.hungerBefore ?? null,
          stop: draft.stop ?? null,
          fullnessNow: draft.fullnessNow ?? null,
          fullness20: draft.fullness20 ?? null,
          fullness20DueAt: sameFinish ? original.fullness20DueAt ?? null : finishedAt ? store.fullnessDueAt(finishedAt) : null,
        });
        await api.close();
        app.flash('Meal saved.', { undo });
      }, { block: true, name: 'save-meal-edit' })),
      h('div', { class: 'gap-s' }, confirming
        ? h('div', { class: 'btn-row' },
          h('span', { class: 'small' }, 'Delete this meal?'),
          button('Delete', async () => {
            const undo = store.undoPoint({ meals: [mealId] });
            await store.deleteMeal(mealId);
            await api.close();
            app.flash('Meal deleted.', { undo });
          }, { kind: 'secondary', name: 'confirm-delete-meal' }),
          button('Keep', () => { confirming = false; api.rerender(); }, { kind: 'secondary' }))
        : button('Delete meal', () => { confirming = true; api.rerender(); }, { kind: 'secondary', name: 'delete-meal' })),
    );
  }, { name: 'edit-meal', label: 'Meal' });
}
