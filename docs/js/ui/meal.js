// Meals: first bite, logging, finishing, closing the window, 20-minute check.
//
// Every form sheet has the same build: a fixed head (title and Close), a
// body of fields 24 apart that alone scrolls, and a fixed footer with what
// the change will do (an effect card, misses in words), then any error, then
// the one main action. The small builders here are shared by the window
// times, outside and Begin fast sheets.

import { h } from './dom.js';
import { clockGlyph, glyph } from './icons.js';
import { button, choice, errorLine, key, missLine, scale, textField, timeField, STOP_OPTIONS } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { MIN, HOUR, addDays, at, dayKey, floorToMinute, fmtDayLong, fmtDayShort, fmtDuration, fmtOnDay, fmtTime, fmtWhen, minutesOfDay, nearestTime, now } from '../core/time.js';
import { CUTOFF_MIN, LATE_NIGHT_END_MIN, canReopen, cutoffApplies, evaluateDay, isFlexible, plannedStartMin, timeOnOrAfter, windowMsFor, FORGOT_AFTER_MS } from '../core/rules.js';
import { placeAddedMeal } from '../core/added-meal.js';
import { editedReading } from '../core/satiety.js';
import { MEAL_TYPES, guessMealType, typeOfName } from '../core/meal-types.js';
import { mealInProgress } from './shared.js';
import { ringIn } from './alarm.js';

// ---------- The parts every form sheet is built from ----------

/** A sheet's body: its fields in one column, 24 apart. */
export const form = (...kids) => h('div', { class: 'form' }, ...kids);

/** A hairline between the groups of a long form (32 apart). */
export const formRule = () => h('div', { class: 'form-rule', 'aria-hidden': 'true' });

/** One field with the lines that belong to it (an error under its wheel), 8 apart. */
export const field = (...kids) => h('div', { class: 'form-field' }, ...kids);

/**
 * A sheet's body opens one of two ways, the same in every form sheet: a
 * heading at one size (the meal, "What set it off?"), with any note under it
 * quiet, or a quiet intro line (formIntro) with no heading.
 */
export const formHero = (text, testid = null) => h('h3', { class: 'form-hero', 'data-testid': testid }, text);

/** The quiet intro line a sheet without a heading opens with. */
export const formIntro = (text, testid = null) => h('p', { class: 'form-intro', 'data-testid': testid }, text);

/**
 * An error in words beside its alert glyph. With a testid the line hides
 * itself while it has no words; without one it is hidden here.
 */
export function errLine(text = '', testid = null) {
  const line = errorLine(text, { testid });
  if (!testid) line.hidden = !text;
  return line;
}

/** New words for an error line made by errLine (none hides it). */
export function say(line, text) {
  const words = line.querySelector('[role="alert"]');
  words.textContent = text || '';
  if (!words.hasAttribute('data-testid')) line.hidden = !text;
}

/**
 * What a change will do, in an effect card. When the words are an error
 * (error: true), they show as an error line instead, with the alert glyph;
 * the testid keeps the words either way. Empty, it hides.
 */
export function effectLine(testid, text = '') {
  const words = h('p', { class: 'effect', 'data-testid': testid }, text);
  const slot = h('div', { class: 'effect-slot' }, glyph('alert', { size: 16 }), words);
  slot.set = (next, { error = false } = {}) => {
    words.textContent = next || '';
    slot.classList.toggle('is-error', !!error);
  };
  return slot;
}

/**
 * Misses in words, one stripes key per reason, under one testid. The line is
 * drawn again for each new set of reasons; with none it hides.
 */
export function missSlot(testid) {
  const slot = h('div', { class: 'miss-slot' });
  slot.set = (reasons) => slot.replaceChildren(missLine(reasons || [], { testid }));
  slot.set([]);
  return slot;
}

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
 * titled: the sheet's title already says Meal, so the track has no label of
 * its own on screen (a screen reader still hears it).
 */
function mealTypeSection(ctx, draft, guessAt = null, { titled = false } = {}) {
  const box = h('div', { class: 'meal-type', 'data-block': 'meal-type' });
  const draw = () => {
    const pick = draft.pick ?? (guessAt ? guessMealType(guessAt()) : null);
    draft.name = pick === 'other' ? (draft.other || '').trim() : pick || '';
    const others = pick === 'other' ? recentOtherNames(ctx) : [];
    // Snack, Breakfast and Lunch share the first line; Dinner and Other the second (sheets.css).
    box.replaceChildren(...[
      choice({ label: titled ? null : 'Meal', ariaLabel: 'Meal', options: TYPE_OPTIONS, value: pick, cols: 3, name: 'meal-type', onChange: (v) => { draft.pick = v; draw(); } }),
      pick === 'other'
        ? h('div', { class: 'meal-name' },
          textField({ label: 'Name', placeholder: 'Dessert', value: draft.other, name: 'meal-name',
            onInput: (v) => { draft.other = v; draft.name = v; } }),
          others.length
            ? h('div', { class: 'btn-row pill-row' }, others.map((n) => button(h('span', { class: 'clip' }, n), () => { draft.other = n; draw(); }, { kind: 'chip' })))
            : null)
        : null,
    ].filter(Boolean));
  };
  draw();
  box.refresh = draw;
  return box;
}

// What each number means, 1 to 10, in the words the owner approved: drawn
// from the hunger and fullness scale dietitians use (5 neutral, 7 comfortably
// full), told by how the body feels, never in the words of "How did you
// finish?". The same words show wherever a number is chosen.
const HUNGER_WORDS = [
  'Not hungry at all.',
  'Barely hungry. Could easily wait.',
  'A little hungry. Food sounds good.',
  'Getting hungry. Thinking about food.',
  'Hungry. Ready to eat.',
  'Hungry. Stomach starting to growl.',
  'Very hungry. Stomach growling.',
  'Very hungry. Low on energy.',
  'Ravenous. Irritable, hard to focus.',
  'Starving. Weak or shaky.',
];

const FULLNESS_WORDS = [
  'Empty. Very hungry.',
  'Nearly empty. Still very hungry.',
  'Hungry. Could eat a meal.',
  'A little hungry. Could eat more.',
  'Neither hungry nor full.',
  'Comfortable. No longer hungry.',
  'Comfortably full.',
  "Full. You've had enough.",
  'Too full. Uncomfortable.',
  'Stuffed. Painfully full.',
];

const hungerScale = (draft) => scale({
  n: 10, value: draft.hungerBefore, onChange: (v) => { draft.hungerBefore = v; },
  label: 'Hunger before', low: '1 not hungry', high: '10 very hungry', name: 'hunger', meanings: HUNGER_WORDS,
});

// Each option as wide as its words, so "Left wanting" never wraps, and each
// carries its way's mark (as on Satiety), so the shapes are learned where
// the rating is made. Drawn fresh for each sheet: a node sits in one place only.
const stopOptions = () => STOP_OPTIONS.map((o) => ({ ...o, label: [key(`stop-${o.value}`), h('span', {}, o.label)] }));
const stopChoice = (draft) => choice({
  options: stopOptions(), value: draft.stop, onChange: (v) => { draft.stop = v; },
  label: 'How did you finish?', cols: 3, name: 'stop', fit: true,
});

const fullnessScale = (draft, key = 'fullnessNow', label = 'Fullness now') => scale({
  n: 10, value: draft[key], onChange: (v) => { draft[key] = v; },
  label, low: '1 empty', high: '10 stuffed', name: key === 'fullnessNow' ? 'fullness-now' : 'fullness-20', meanings: FULLNESS_WORDS,
});

// ---------- How a day becomes a miss, in words ----------

/** The words for each way a day becomes a miss: the same everywhere a sheet warns of one. */
function missWords(ctx, day) {
  const hours = Math.round(ctx.windowMsFor(day) / HOUR);
  return {
    early: 'Opening before 16:00 on a workday makes the day a miss.',
    over: `That is longer than your ${hours}-hour goal, so the day becomes a miss.`,
    outside: 'Eating outside the window makes the day a miss.',
  };
}

/**
 * The misses a window's own times make, in words, before they are saved:
 * the day judged by the rules with these times. kinds: the reasons the
 * sheet's times decide ('early' needs the first bite, 'over' the last);
 * eating outside the window does not follow the times, so it is not said here.
 */
export function timesMissLines(ctx, day, rec, kinds) {
  const after = evaluateDay(day, rec, 0, ctx.nowTs, ctx.todayKey, ctx.startKey, ctx.windowMsFor(day), isFlexible(day, ctx.settings));
  const words = missWords(ctx, day);
  return after.reasons.filter((r) => kinds.includes(r)).map((r) => words[r]);
}

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
    const warnEl = missLine('', { testid: 'meal-warning' });
    const aheadEl = errLine('', 'meal-ahead');
    const updateWarn = () => {
      const key = draft.ts == null ? null : dayKey(draft.ts);
      const early = key != null && sit.kind === 'first' && cutoffApplies(key, ctx.days.get(key), ctx.settings) && minutesOfDay(draft.ts) < CUTOFF_MIN;
      warnEl.set(early ? 'Before 16:00 on a workday: today will count as a miss.' : '');
      say(aheadEl, draft.ts == null ? 'That time is still ahead.' : '');
    };
    // The quick times stand beside the wheel, a stack as tall as it.
    const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Quick times' },
      QUICK.map(([mins, label]) => button(label, () => {
        draft.ts = floorToMinute(now() - mins * MIN);
        draft.moved = true;
        startField.set(minutesOfDay(draft.ts));
        updateWarn();
        typeBox.refresh();
      }, { kind: 'chip', name: `meal-start-${mins}` })));
    // A clock time means today, or last night just after midnight; never a time still ahead.
    const startField = timeField({
      label: 'Started at',
      minutes: draft.ts == null ? minutesOfDay(now()) : minutesOfDay(draft.ts),
      name: 'meal-start',
      aside: presets,
      onChange: (m) => { draft.ts = resolveFirstBite(app.ctx().todayKey, m); draft.moved = true; updateWarn(); typeBox.refresh(); },
    });
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

    return {
      head: sheetHead(api, 'Start a meal'),
      body: form(
        // Eating after the window's hours is a miss, said beside its stripes;
        // while Save refuses the time picked, only the refusal speaks.
        sit.kind === 'outside'
          ? Object.assign(missLine(context, { testid: 'meal-context' }), { hidden: !!hint })
          : formIntro(context || null, 'meal-context'),
        h('div', { class: 'coach' },
          h('p', {}, 'Protein and vegetables first.'),
          h('p', {}, 'Eat slowly.'),
          h('p', {}, 'Pause halfway.')),
        field(startField, aheadEl, warnEl),
        typeBox,
        hungerScale(draft),
        button('Already finished? Add a meal', () => showAddMealSheet(app, { from: {
          pick: draft.pick, other: draft.other, hungerBefore: draft.hungerBefore,
          // A start left at now would make a meal of no length: Add a meal then starts an hour ago.
          ts: draft.moved && draft.ts != null && draft.ts < floorToMinute(now()) - MIN ? draft.ts : null,
        } }), { kind: 'outline', block: true, name: 'already-finished' }),
      ),
      actions: [
        errLine(hint, 'meal-hint'),
        button('Start eating', save, { block: true, name: 'start-eating' }),
      ],
    };
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
  const text = missWords(ctx, place.day);
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
    const aheadEl = errLine('', 'add-meal-ahead');
    const finishNoteEl = errLine('', 'add-meal-finish-note');
    const effectEl = effectLine('add-meal-effect');
    // What the meal does stands in the body under the times that decide it;
    // why it cannot go there stands over Save, in sight wherever the form is scrolled.
    const effectBody = h('div', { class: 'effect-home' });
    const effectFoot = h('div', { class: 'effect-home' });
    const missEl = missSlot('add-meal-miss');
    const hintEl = errLine('', 'add-meal-hint');
    const lastBox = h('div', { class: 'last-meal' });
    let lastShown = null;

    // The wheels report a settled time; the lines below follow without redrawing the sheet.
    const refresh = () => {
      const c = app.ctx();
      const start = startTs();
      const ahead = start > now() + MIN;
      say(aheadEl, ahead ? 'That time is still ahead.' : '');
      say(finishNoteEl, finishProblem());
      say(hintEl, '');
      const place = ahead || finishProblem() ? null : placeNow();
      const ok = place && !place.error;
      effectEl.set(!place ? '' : place.error ? placeError(c, place) : placeText(c, place, start), { error: !!(place && place.error) });
      (place && place.error ? effectFoot : effectBody).append(effectEl);
      missEl.set(ok ? missLines(c, place) : []);
      const showLast = !!(ok && place.canClose);
      if (showLast !== lastShown) {
        lastShown = showLast;
        lastBox.hidden = !showLast;
        lastBox.replaceChildren(...(showLast
          ? [choice({
            label: 'Last meal of the day?', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: lastAnswer(), cols: 2, name: 'last-meal',
            onChange: (v) => { draft.last = v; refresh(); },
          })]
          : []));
      }
    };

    // The Finished at wheel takes what is rolled as it is (hour, then minute); only a start or a length moves it.
    const lengths = h('div', { class: 'presets lengths', role: 'group', 'aria-label': 'How long it took' },
      LENGTHS.map(([mins, label]) => button(label, () => { draft.length = mins; followStart(); }, { kind: 'chip', name: `added-length-${mins}` })));
    const finishField = timeField({
      label: 'Finished at',
      minutes: minutesOfDay(finishTs()),
      name: 'added-finish',
      // How long it took sits beside the wheel it sets.
      // Its label stands on the line of Finished at (sheets.css), so the four sit beside the wheel's centre.
      aside: h('div', { class: 'length-aside' }, h('div', { class: 'label field-label', 'aria-hidden': 'true' }, 'How long it took'), lengths),
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
    // Today has quick times beside the wheel; another day has none, and the
    // wheel keeps the column of the Finished at wheel under it (sheets.css),
    // so the two wheels of the form line up.
    const ago = draft.day === today
      ? h('div', { class: 'presets', role: 'group', 'aria-label': 'Quick times' },
        AGO.map(([mins, label]) => button(label, () => moveStart(floorToMinute(now() - mins * MIN)), { kind: 'chip', name: `added-start-${mins}` })))
      : null;
    const startField = timeField({
      label: 'Started at',
      minutes: draft.minutes,
      name: 'added-start',
      aside: ago,
      onChange: (m) => { draft.minutes = m; typeBox.refresh(); followStart(); },
    });

    const save = async () => {
      const start = startTs();
      const finish = finishTs();
      if (start > now() + MIN) { say(hintEl, 'That time is still ahead.'); return null; }
      if (finishProblem()) { say(hintEl, finishProblem()); return null; }
      const place = placeNow();
      // The refusal shows once, as the hint; the next change brings the effect back.
      if (place.error) { effectEl.set(''); say(hintEl, placeError(app.ctx(), place)); return null; }
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

    const built = {
      head: sheetHead(api, 'Add a meal'),
      body: form(
        formIntro('For a meal you already ate. No timer.'),
        fixed
          ? h('p', { class: 'form-fixed', 'data-testid': 'add-meal-day' }, fmtDayLong(fixed))
          : choice({
            label: 'Day', options: [{ value: today, label: 'Today' }, { value: yesterday, label: 'Yesterday' }], value: draft.day, cols: 2, name: 'added-day',
            onChange: (v) => { draft.day = v; draft.until = floorToMinute(now()); draft.refused = ''; api.rerender(); },
          }),
        field(startField, aheadEl),
        field(finishField, finishNoteEl),
        // What the meal does to the window follows the times and the last-meal
        // answer that decide it; the footer keeps misses, refusals and Save.
        lastBox,
        effectBody,
        formRule(),
        typeBox,
        formRule(),
        hungerScale(draft),
        stopChoice(draft),
        fullnessScale(draft, 'fullnessNow', 'Fullness right after'),
        fullnessScale(draft, 'fullness20', 'Fullness at 20 minutes'),
      ),
      actions: [
        effectFoot,
        missEl,
        hintEl,
        button('Save meal', save, { block: true, name: 'save-added-meal' }),
      ],
    };
    refresh();
    return built;
  }, { name: 'add-meal', label: 'Add a meal' });
}

// ---------- Finish a meal ----------

/** next(): opened once the meal is saved (starting another meal). lead: a line above the questions. */
export function showFinishMealSheet(app, mealId, { next = null, lead = null } = {}) {
  const draft = { stop: null, fullnessNow: null, minutes: minutesOfDay(now()) };
  openSheet((api) => {
    const meal = store.state.meals.get(mealId);
    if (!meal) return { head: sheetHead(api, 'Finished'), body: form(h('p', {}, 'This meal was removed.')) };
    return {
      head: sheetHead(api, 'Finished this meal'),
      body: form(
        // The meal leads; why this sheet came first is a quiet note under it.
        lead
          ? h('div', { class: 'form-lead' },
            formHero(meal.name || 'This meal'),
            h('p', { class: 'form-note', 'data-testid': 'finish-lead' }, lead))
          : formHero(meal.name || 'This meal'),
        stopChoice(draft),
        fullnessScale(draft),
        timeField({ label: 'Finished at', minutes: draft.minutes, name: 'finished-at', onChange: (m) => { draft.minutes = m; } }),
      ),
      actions: button('Save', async () => {
        const finishedAt = Math.min(timeOnOrAfter(meal.startedAt, draft.minutes), now());
        await store.finishMeal(mealId, { finishedAt, stop: draft.stop, fullnessNow: draft.fullnessNow });
        await api.close();
        app.flash(`Fullness check at ${fmtTime(finishedAt + store.FULLNESS_DELAY)}.`);
        ringIn((finishedAt + store.FULLNESS_DELAY - now()) / MIN);
        if (next) next();
      }, { block: true, name: 'save-finish' }),
    };
  }, { name: 'finish-meal', label: 'Finished this meal' });
}

// ---------- I'm done eating ----------

export function showDoneEatingSheet(app, windowKey) {
  const ctx0 = app.ctx();
  const open = mealInProgress(ctx0, windowKey);
  const draft = { minutes: minutesOfDay(now()), stop: null, fullnessNow: null };
  openSheet((api) => {
    const rec = store.state.days.get(windowKey);
    if (!rec || !rec.firstBite) return { head: sheetHead(api, "I'm done eating"), body: form(h('p', {}, 'No window is open.')) };
    const lastBite = () => timeOnOrAfter(rec.firstBite, draft.minutes);
    const future = () => lastBite() > now() + MIN;
    // The footer follows the wheel without redrawing the sheet: the new
    // window and a miss its length would make, or, as an error, why it
    // cannot close yet.
    const summary = effectLine('done-summary');
    const misses = missSlot('done-miss');
    const closeBtn = button('Close the window', async () => {
      if (future()) return;
      const last = lastBite();
      const done = open ? await store.finishMeal(open.id, { finishedAt: Math.max(last, open.startedAt), stop: draft.stop, fullnessNow: draft.fullnessNow }) : null;
      await store.closeWindow(windowKey, last);
      await api.close();
      // A meal finished here is finished like any other: its 20-minute check
      // is told, and with Alarms on its timer starts, as Finished this meal does.
      const due = done && done.fullness20DueAt;
      if (due) {
        app.flash(`Window closed. Fullness check at ${fmtTime(due)}.`);
        ringIn((due - now()) / MIN);
      }
    }, { block: true, name: 'close-window', disabled: future() });
    const refresh = () => {
      const ahead = future();
      summary.set(ahead ? 'That time is still ahead.' : `Window ${fmtTime(rec.firstBite)} to ${fmtTime(lastBite())}, ${fmtDuration(lastBite() - rec.firstBite)}.`, { error: ahead });
      // Only the last bite is set here, so only its length can make the miss.
      misses.set(ahead ? [] : timesMissLines(app.ctx(), windowKey, { ...rec, lastBite: lastBite() }, ['over']));
      closeBtn.disabled = ahead;
    };
    const lastField = timeField({ label: 'Last bite at', minutes: draft.minutes, name: 'last-bite', onChange: (m) => { draft.minutes = m; refresh(); } });
    refresh();
    return {
      head: sheetHead(api, "I'm done eating"),
      body: form(
        ...(open
          ? [formHero(`Finish ${open.name || 'this meal'}`), stopChoice(draft), fullnessScale(draft), formRule()]
          : []),
        lastField,
      ),
      actions: [summary, misses, closeBtn],
    };
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
    if (!meal) return { head: sheetHead(api, 'Fullness check'), body: form(h('p', {}, 'This meal was removed.')) };
    // Asked for a number, the line goes once one is picked.
    const hintEl = errLine(hint);
    const rating = scale({
      n: 10, value: draft.fullness20, label: 'Fullness now', low: '1 empty', high: '10 stuffed', name: 'fullness-20', meanings: FULLNESS_WORDS,
      onChange: (v) => { draft.fullness20 = v; hint = ''; say(hintEl, ''); },
    });
    return {
      head: sheetHead(api, 'Fullness check', 'Later'),
      body: form(
        h('div', { class: 'form-lead' },
          formHero(`20 minutes after ${meal.name || 'your meal'}`),
          h('p', { class: 'form-note' }, meal.fullnessNow != null ? `Right after eating: ${meal.fullnessNow}. Target about 7.` : 'Target about 7.')),
        rating,
      ),
      actions: [
        hintEl,
        // Skip on the left, Save under the thumb on the right; both one height.
        h('div', { class: 'btn-pair' },
          button('Skip this one', async () => {
            await store.updateMeal(mealId, { fullness20Skipped: true });
            api.close();
          }, { kind: 'outline', name: 'skip-fullness' }),
          button('Save', async () => {
            if (draft.fullness20 == null) { hint = 'Pick a number from 1 to 10.'; api.rerender(); return; }
            await store.updateMeal(mealId, { fullness20: draft.fullness20, fullness20At: now() });
            api.close();
          }, { name: 'save-fullness' })),
      ],
    };
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
    const remove = confirming
      ? h('div', { class: 'confirm' },
        h('p', { class: 'confirm-question' }, 'Delete this meal?'),
        h('div', { class: 'btn-pair' },
          button('Delete', async () => {
            const undo = store.undoPoint({ meals: [mealId] });
            await store.deleteMeal(mealId);
            await api.close();
            app.flash('Meal deleted.', { undo });
          }, { kind: 'danger', name: 'confirm-delete-meal' }),
          button('Keep', () => { confirming = false; api.rerender(); }, { kind: 'outline' })))
      : h('div', { class: 'pill-row' }, button('Delete meal', () => { confirming = true; api.rerender(); }, { kind: 'secondary', name: 'delete-meal', icon: 'trash' }));
    const finishField = timeField({ label: 'Finished', minutes: draft.finishMinutes, name: 'edit-finish', allowUnset: true, fallback: draft.minutes, hint: draft.finishMinutes == null ? 'Still eating' : '', onChange: (m) => { draft.finishMinutes = m; draft.finishExact = null; } });
    // From Last bite, Just now and the Finished wheel's own Clear share one
    // row under the pair, ending on the right gutter under Finished.
    const finishRow = lastBite
      ? h('div', { class: 'pill-row finish-row' }, button([clockGlyph(), 'Just now'], () => {
        const ts = floorToMinute(now());
        draft.finishExact = ts;
        draft.finishMinutes = minutesOfDay(ts);
        api.rerender();
      }, { kind: 'chip', name: 'last-bite-now' }), finishField.querySelector('.time-foot'))
      : null;
    return {
      head: sheetHead(api, 'Meal'),
      body: form(
        mealTypeSection(ctx, draft, null, { titled: true }),
        field(
          h('div', { class: 'field-pair' },
            timeField({ label: 'Started', minutes: draft.minutes, name: 'edit-start', onChange: (m) => { draft.minutes = m; } }),
            finishField),
          finishRow),
        formRule(),
        hungerScale(draft),
        stopChoice(draft),
        fullnessScale(draft),
        fullnessScale(draft, 'fullness20', 'Fullness at 20 minutes'),
        formRule(),
        remove,
      ),
      actions: button('Save', async () => {
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
          // A 20-minute reading entered or changed here counts as recalled. One
          // already taken keeps its check's due time when the finish moves, so
          // how it was taken still reads from when it was answered.
          ...editedReading(original, draft.fullness20 ?? null),
          fullness20DueAt: sameFinish || original.fullness20 != null ? original.fullness20DueAt ?? null : finishedAt ? store.fullnessDueAt(finishedAt) : null,
        });
        await api.close();
        app.flash('Meal saved.', { undo });
      }, { block: true, name: 'save-meal-edit' }),
    };
  }, { name: 'edit-meal', label: 'Meal' });
}
