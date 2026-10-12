// Today: the eating window.

import { h, s, live } from './dom.js';
import { button, choice, durationFigure, errorLine, figureParts, goalPair, hatch, key, legend, missLine, scale, timeField, TRAINING_OPTIONS, STOP_TEXT } from './components.js';
import * as store from '../store.js';
import {
  HOUR, MIN, addDays, dayStart, fmtCountdown, fmtDayLong, fmtDayShort, fmtDateLong, fmtFigure, weekdayName, fmtDuration, fmtMinutes, fmtTime, fmtWhen, isWorkweekday, minutesOfDay, now,
} from '../core/time.js';
import {
  CUTOFF_MIN, GRACE_MS, LATE_NIGHT_END_MIN, canReopen, cutoffApplies, fastHoursFor, goalLabelFor, isFlexible, isWorkday, lastEatingSource, lastEatingTs, lateNightDay, longFastAhead, plannedStartMin, timeOnOrAfter, windowPhase,
} from '../core/rules.js';
import { dailySeries } from '../core/history.js';
import * as P from './palette.js';
import { RING, celebrate, emptyRings, resultRing, ringsSvg } from './rings.js';
import { forgotCloseDefault, showAddMealSheet, showDoneEatingSheet, showFinishMealSheet, showMealEditSheet, showStartMealSheet } from './meal.js';
import { showOutsideSheet } from './outside.js';
import { showBiteTimeSheet, showOpeningSheet, showOutsideTimeSheet, showWindowTimesSheet } from './window-times.js';
import { dayRings, heroRingSize, ringHero, ringName, stagesSection, weekRow } from './today-parts.js';
import { currentPause, endPause, pauseToday, showPauseSheet } from './pause.js';
import { showBeginFastSheet } from './begin-fast.js';
import { showGoalSheet } from './goal.js';
import { dayTypeText, header, mealInProgress, nextWindowLine, notices, runningFullness, tapNote, timePill } from './shared.js';

const hoursWord = (ms) => { const n = Math.round(ms / HOUR); return `${n} ${n === 1 ? 'hour' : 'hours'}`; };

export function signature(ctx) {
  const { mode, rec } = ctx.mode;
  const parts = [mode, ctx.todayKey, minutesOfDay(ctx.nowTs) >= CUTOFF_MIN, !!lateNightDay(ctx)];
  // While the window is open, its band moves on every minute.
  if (mode === 'open') parts.push(windowPhase(rec, ctx.nowTs, ctx.windowMsFor(rec.day)), Math.floor((ctx.nowTs - rec.firstBite) / MIN));
  if (mode === 'closed') parts.push(canReopen(rec, ctx.nowTs, ctx.windowMsFor(rec.day)));
  parts.push(runningFullness(ctx).length);
  // While fasting, redraw the ring every 5 minutes; each stage starts on a 5-minute mark.
  // The goal turns gold on the minute it is reached.
  const last = fasting(mode) ? lastEatingTs(ctx) : null;
  if (last) parts.push(Math.floor((ctx.nowTs - last) / (5 * MIN)), ctx.nowTs >= last + goalHoursOf(ctx) * HOUR);
  // The hero's ring size follows the width (184, or 120 below 375): a phone
  // turned, or a window resized across it, redraws on the next tick.
  parts.push(heroRingSize());
  return parts.join('|');
}

/** The fasting goal in hours: a long fast, or the day less today's eating window. */
const goalHoursOf = (ctx, key = ctx.todayKey) => fastHoursFor(key, ctx.settings);

const fasting = (mode) => mode === 'before' || mode === 'closed' || mode === 'noEating';

// What the rings show that only you change: the last bite, the window's
// times, the meals, the day's rating, a day off, the goal. When one of these
// changes between two draws, a ring moved because of something you did, so
// it draws from its old value to the new one. The clock moving it never
// animates: a new day (midnight, last night giving way at 04:00, or last
// night's closed window giving way to today once it can no longer reopen)
// changes the inputs too, so a draw in which the clock's day changed stays still.
let lastInputs = null;
let lastClock = null;

const clockOf = (ctx) => JSON.stringify([ctx.todayKey, minutesOfDay(ctx.nowTs) >= LATE_NIGHT_END_MIN, !!(ctx.mode.rec && ctx.mode.rec.day !== ctx.todayKey)]);

function ringInputs(ctx, src) {
  const { mode, rec } = ctx.mode;
  const day = rec ? rec.day : ctx.todayKey;
  const r = ctx.days.get(day) || {};
  const meals = ctx.meals.filter((m) => m.day === day).map((m) => [m.id, m.startedAt, m.finishedAt, m.stop]);
  const outside = ctx.outside.filter((o) => o.day === day).length;
  return JSON.stringify([mode, day, src ? src.ts : null, r.firstBite, r.lastBite, !!r.noEating, r.fullness ?? null, !!r.dayOff, r.paused ?? null, meals, outside, goalHoursOf(ctx), ctx.windowMsFor(day)]);
}

export function renderToday(ctx, app) {
  const { mode, rec } = ctx.mode;
  const todayRec = ctx.days.get(ctx.todayKey);
  const src = fasting(mode) ? lastEatingSource(ctx) : null;
  const inputs = ringInputs(ctx, src);
  const clock = clockOf(ctx);
  const animate = lastInputs !== null && inputs !== lastInputs && clock === lastClock;
  lastInputs = inputs;
  lastClock = clock;
  // Once the window closes, the new fast leads Today, as it does before the
  // window: the full rings and their two times, the stage, and only then the
  // window just closed, with its hours, result and buttons. While a meal is
  // still being eaten after it, no fast has begun: the window's card, with
  // Finished this meal, stays on top.
  const fastFirst = mode === 'closed' && !!src && !mealInProgress(ctx, rec.day);
  let main;
  if (mode === 'open') main = openBlock(ctx, app, rec, animate);
  else if (mode === 'forgot') main = forgotBlock(ctx, app, rec);
  else if (mode === 'closed') main = closedBlock(ctx, app, rec, { lead: !fastFirst });
  else if (mode === 'noEating') main = noEatingBlock(ctx, app);
  else if (mode === 'paused') main = pausedBlock(ctx, app);
  else main = beforeBlock(ctx, app, animate);

  // Meals, fullness checks and how the day ended live on the Satiety tab;
  // Today points there while a fullness check is running: above the fast,
  // since it lasts only minutes and asks for a tap.
  const pointer = satietyPointer(ctx, app);
  // While fasting, the stage card; when the fast is not put first (a day
  // without eating, or a closed window still leading) it carries smaller rings too.
  const ringBelow = mode === 'noEating' || (mode === 'closed' && !fastFirst);
  // The rings show the window and fullness of the day on the card: last
  // night's, between midnight and 04:00, else today's.
  const ringDay = rec ? rec.day : ctx.todayKey;
  const stages = src ? stagesSection(ctx, app, src.ts, { withRing: ringBelow, times: ringBelow ? fastTimes(ctx, app, src) : null, day: ringDay, animate }) : null;
  return h('div', { class: 'today', 'data-mode': mode },
    // The weekday as the title, the date and the kind of day above it.
    header(ctx, app, { title: weekdayName(ctx.todayKey), sub: `${fmtDateLong(ctx.todayKey)} · ${dayTypeText(ctx.todayKey, todayRec)}` }),
    weekRow(ctx, app),
    notices(ctx, app),
    mode === 'open' ? fastDone(ctx, rec) : null,
    fastFirst ? [pointer, fastCard(ctx, app, src, ringDay, animate), stages, main] : [main, pointer, stages],
    streakSection(ctx),
    // A paused day tracks nothing.
    mode === 'paused' ? null : checkinSection(ctx, app),
  );
}

// ---------- Small parts ----------

/** The context line over a hero: what state the day is in. */
const context = (text, extra = {}) => h('div', { class: `label hero-context${extra.cls ? ` ${extra.cls}` : ''}`, 'data-testid': extra.testid || null }, text);

/** A secondary action under a hero: a 48 outline. */
const outline = (label, onClick, name) => button(label, onClick, { kind: 'outline', name });

/** A meal already eaten, added whole with no timer. */
const addMealButton = (app) => outline('Add a meal', () => showAddMealSheet(app), 'add-meal');

/**
 * The secondary actions under a hero, one pattern in every mode: after the
 * primary (full width), outlines two to a row; an odd last one takes the row.
 */
const actionGrid = (...actions) => h('div', { class: 'btn-grid hero-actions' }, actions.filter(Boolean));

/**
 * The goal as a tile you tap to change: its name ('Goal 20:4') over the
 * fast's and the window's hours with their ring keys, the GoalPair at a
 * smaller size. Its words for a screen reader stay 'Goal, 20:4. Change'.
 */
function goalTile(ctx, app) {
  const key = ctx.todayKey;
  const label = goalLabelFor(key, ctx.settings);
  const tile = tapNote('Goal', label, () => showGoalSheet(app), 'edit-goal');
  const pair = goalPair({ fastHours: fastHoursFor(key, ctx.settings), windowHours: Math.round(ctx.windowMsFor(key) / HOUR) });
  // One GoalPair speaks on a screen (the Goal sheet's): this one is a picture of the tile's words.
  pair.removeAttribute('data-testid');
  pair.removeAttribute('aria-live');
  tile.classList.add('goal-tile');
  tile.replaceChildren(h('b', {}, 'Goal ', h('span', { class: 'goal-ratio' }, label)), pair);
  return tile;
}

/**
 * A row you tap, in a card: its words, a chevron. Further taps wait while
 * the action is still saving.
 */
function actionRow(label, onClick, name) {
  let busy = false;
  return h('button', {
    type: 'button',
    class: 'item plan-row',
    'data-action': name,
    onclick: async (e) => {
      if (busy) return;
      busy = true;
      try { await onClick(e); } finally { busy = false; }
    },
  }, h('span', { class: 'item-title' }, label));
}

/** Figure text such as '1 h 5 min' with large digits and small words; the text reads the same. */
const unitFigure = (text) => h('span', { class: 'fig' }, String(text).split(/(\d+)/).filter(Boolean).map((part) => (/^\d+$/.test(part) ? part : h('span', { class: 'unit' }, part))));

// ---------- Before the window ----------

function beforeBlock(ctx, app, animate) {
  const key = ctx.todayKey;
  const rec = ctx.days.get(key);
  const planned = plannedStartMin(key, rec, ctx.settings);
  const workdayEarly = cutoffApplies(key, rec, ctx.settings) && minutesOfDay(ctx.nowTs) < CUTOFF_MIN;
  const lastSrc = lastEatingSource(ctx);
  const last = lastSrc ? lastSrc.ts : null;
  const late = lateNightDay(ctx);
  // A long fast short of its goal: its goal leads the plan, and a day it fills is a fasting day.
  const ahead = longFastAhead(ctx);
  const fastingDay = !!ahead && ahead.at >= dayStart(addDays(key, 1));
  // On feasting hours there is no planned time: the window opens when you choose.
  const plannedLine = (cls) => (ahead
    ? h('p', { class: cls, 'data-testid': 'long-fast-line' }, `Your ${ahead.hours}-hour fast reaches its goal at ${fmtWhen(ahead.at, key)}.`)
    : isFlexible(key, ctx.settings)
      ? h('p', { class: cls, 'data-testid': 'flexible-line' }, `Your ${Math.round(ctx.windowMsFor(key) / HOUR)}-hour window opens when you choose.`)
      : h('p', { class: cls }, `Window planned for ${fmtMinutes(planned)}.`));
  const startMeal = button('Start a meal', () => showStartMealSheet(app), { kind: 'win', big: true, block: true, name: 'start-meal' });
  // The 16:00 warning: a miss in words, before it happens, just above the way in.
  const firm = workdayEarly ? missLine('Opening before 16:00 makes today a miss.', { testid: 'firm-reminder' }) : null;
  let card;
  if (last) {
    // The fast leads, in the one order every ring mode keeps: the rings and
    // their readout, the stage, the warning, the way in, then the fast's two times.
    card = h('section', { class: 'section strong hero', 'data-block': 'before' },
      context(fastingDay ? 'Fasting day' : 'Before the window', { testid: 'before-label' }),
      ringHero(ctx, last, {
        animate,
        middle: [firm, h('div', { class: 'hero-primary' }, startMeal), actionGrid(addMealButton(app))],
        times: fastTimes(ctx, app, lastSrc),
      }));
  } else {
    // Before any bite on record: empty ring tracks beside a plain title, and
    // Begin fast beside Start a meal.
    card = h('section', { class: 'section strong hero before-empty', 'data-block': 'before' },
      h('div', { class: 'empty-hero' },
        // The rings' names under them, one to a row.
        h('div', { class: 'empty-rings-col' },
          emptyRings(RING.md.size),
          legend([['ring-fast', 'Fast'], ['ring-win', 'Window'], ['ring-full', 'Fullness']])),
        h('div', { class: 'empty-hero-words' },
          h('div', { class: 'label' }, 'Before the window'),
          h('h2', { class: 'empty-title' }, 'Fasting'),
          plannedLine('empty-plan'))),
      goalTile(ctx, app),
      h('p', { class: 'hero-hint', 'data-testid': 'begin-fast-hint' }, 'Already fasting? Tap Begin fast and set when it began, so none of it is lost.'),
      firm,
      // With a fast already known (a last bite or a fast start), a meal is the only way in;
      // Begin fast is offered only when Sabr has nothing to time from. The
      // pair takes no box of its own: Start a meal spans the group, and Begin
      // fast and Add a meal share the row under it.
      h('div', { class: 'btn-grid hero-actions hero-primary with-start' },
        h('div', { class: 'start-actions' },
          startMeal,
          outline('Begin fast', beginFastFor(app), 'begin-fast')),
        addMealButton(app)));
  }
  const plan = h('section', { class: 'section plan-card', 'data-block': 'plan' },
    last ? plannedLine('plan-line') : null,
    h('p', { class: 'plan-drinks' }, 'Until then: water, sparkling water, black coffee, espresso, plain tea.'),
    h('div', { class: 'plan-rows' },
      late ? actionRow('Eating late? Count it against last night', () => showOutsideSheet(app, { day: late }), 'late-night') : null,
      // A day off only lifts the 16:00 rule, which feasting hours do not have.
      isWorkweekday(key) && !isFlexible(key, ctx.settings) ? dayOffToggle(ctx, key) : null,
      actionRow('Pause today', () => pauseToday(app), 'pause-today')),
  );
  return [card, plan];
}

/** Begin fast, or change when it began; a start before the last bite on record leads to that bite. */
function beginFastFor(app) {
  return () => showBeginFastSheet(app, {
    onBite: () => {
      const src = lastEatingSource(app.ctx(), { fastStarts: false });
      if (src) editLastBite(app, src);
    },
  });
}

/**
 * Under the rings: when the fast began and the clock time it reaches its
 * goal, each a tile you tap to change. Once reached, the goal tile is red.
 */
function fastTimes(ctx, app, src) {
  const key = ctx.todayKey;
  const goalHours = goalHoursOf(ctx);
  const goalAt = src.ts + goalHours * HOUR;
  const reached = ctx.nowTs >= goalAt;
  return h('div', { class: 'time-pills', 'data-testid': 'fast-times' },
    src.kind === 'fast'
      ? timePill('Fast began', fmtWhen(src.ts, key), beginFastFor(app), 'edit-fast-start')
      : timePill('Last bite', fmtWhen(src.ts, key), () => editLastBite(app, src), 'edit-last-bite'),
    timePill(`${goalHours} h goal`, reached ? `Reached ${fmtWhen(goalAt, key)}` : fmtWhen(goalAt, key), () => showGoalSheet(app), 'edit-goal', { reached }));
}

/** The fast the window just ended, when its note is still out: its length and whether it reached the goal. */
function endedFast(ctx, rec) {
  if (!rec || rec.fastNoteClosed === rec.firstBite) return null;
  const fastMs = dailySeries(ctx, rec.day, rec.day)[0].fastMs;
  if (fastMs == null) return null;
  const goalHours = goalHoursOf(ctx, rec.day);
  return { fastMs, goalHours, reached: fastMs >= goalHours * HOUR };
}

/**
 * The fast the window just ended, at the top of Today while the window is
 * open: one quiet row over the rings, which stay the hero. The fast's key,
 * how long it was, a word when it reached the goal, and Close, which puts it
 * away for this window (kept by its first bite, so a window removed and
 * opened again gets its own note). The goal reached is celebrated on the
 * rings' red ring (openBlock).
 */
function fastDone(ctx, rec) {
  const done = endedFast(ctx, rec);
  if (!done) return null;
  const { fastMs, goalHours, reached } = done;
  return h('section', { class: `section fast-done${reached ? ' reached tint-fast' : ''}`, 'data-block': 'fast-done', 'data-reached': String(reached) },
    h('p', { class: 'done-line' },
      key('ring-fast'),
      h('span', { class: 'done-title' }, 'Fast complete'), ' ',
      h('span', { class: `done-length tabular${reached ? ' hl' : ''}`, 'data-testid': 'fast-length' }, durationFigure(fastMs))),
    // Close never waits for the save: the note goes with the redraw.
    button('Close', () => { store.updateDay(rec.day, { fastNoteClosed: rec.firstBite }); }, { kind: 'secondary', name: 'close-fast-done' }),
    reached ? h('p', { class: 'done-goal', 'data-testid': 'fast-goal' }, `Fasting goal of ${goalHours} h reached.`) : null);
}

// ---------- Paused ----------

/** 'Thu 1 Oct' with its last space unbreakable, so '1 Oct' stays on one line. */
const keepTogether = (text) => text.replace(/ (\S+)$/, '\u00a0$1');

const FOR_REASON = { travel: 'For travel. ', illness: 'For illness. ', ramadan: 'For Ramadan. ' };

function pausedBlock(ctx, app) {
  const run = currentPause(ctx) || { from: ctx.todayKey, to: ctx.todayKey, reason: true };
  const until = run.to;
  return h('section', { class: 'section strong hero', 'data-block': 'paused' },
    // The headline names the pause: no label over it repeats the word.
    h('div', { class: 'paused-hero' },
      resultRing('paused', RING.md.size),
      h('div', { class: 'paused-words' },
        h('h2', { class: 'paused-until', 'data-testid': 'paused-until' }, until === ctx.todayKey ? 'Paused today' : `Paused until ${keepTogether(fmtDayShort(until))}`))),
    h('p', { class: 'paused-text' }, `${FOR_REASON[run.reason] || ''}Fasting is not tracked and your streak holds; fullness still counts. Tracking resumes on ${fmtDayLong(addDays(until, 1))}.`),
    // Meals still count for Satiety on a paused day.
    actionGrid(
      outline('End the pause', () => endPause(app, run), 'end-pause'),
      outline('Change', () => showPauseSheet(app, { run }), 'change-pause'),
      addMealButton(app)),
  );
}

/** Opens the time of whatever was eaten last: a window's last bite, or an entry outside it. */
function editLastBite(app, src) {
  if (src.kind === 'window') return showBiteTimeSheet(app, src.day, 'last');
  if (src.kind === 'outside') return showOutsideTimeSheet(app, src.id);
  if (src.kind === 'meal') return showMealEditSheet(app, src.id, { lastBite: true });
  return showOpeningSheet(app, src.day);
}

function dayOffToggle(ctx, key) {
  const rec = ctx.days.get(key);
  const off = !!(rec && rec.dayOff);
  return off
    ? h('div', { class: 'plan-row day-off-line' },
      h('span', {}, 'Day off: weekend rules today.'),
      button('Undo', () => store.updateDay(key, { dayOff: false }), { kind: 'secondary', name: 'day-off-undo' }))
    : actionRow('Mark today as a day off', () => store.updateDay(key, { dayOff: true }), 'day-off');
}

// ---------- Window open ----------

function openBlock(ctx, app, rec, animate) {
  const windowMs = ctx.windowMsFor(rec.day);
  const closesAt = rec.firstBite + windowMs;
  const phase = windowPhase(rec, ctx.nowTs, windowMs);
  const e = ctx.evaluate(rec.day);
  const eating = mealInProgress(ctx, rec.day);
  const minsLeft = (t, end) => `${Math.max(0, Math.ceil((end - t) / MIN))} min`;
  // The rings: the fast just ended (closed when it reached its goal), the
  // window filling as it is used, and the day's fullness so far.
  const fastMs = dailySeries(ctx, rec.day, rec.day)[0].fastMs;
  const d = dayRings(ctx, rec.day);
  const used = Math.max(0, ctx.nowTs - rec.firstBite);
  const rings = ringsSvg({
    fast: { frac: fastMs == null ? 0 : fastMs / (goalHoursOf(ctx, rec.day) * HOUR) },
    // It keeps measuring the window when it opened early: the bar under the
    // rings says that miss in words. Past the grace it is stripes.
    win: { frac: Math.min(1, used / windowMs), miss: phase === 'over', testid: 'window-ring' },
    full: d.full,
  }, { size: heroRingSize(), key: 'hero', animate });
  if (phase !== 'over') startCap(rings, used / windowMs);
  const caption = `left of ${hoursWord(windowMs)}`;
  const countdown = (cls) => live(cls === 'value' ? 'div' : 'span', { class: `countdown tabular${cls === 'value' ? ' value' : ''}`, 'data-testid': 'countdown', role: 'timer' }, (t) => fmtCountdown(closesAt - t));
  // The window's row leads the readout: the time left, or, once the hours are
  // up, the grace left, or how far over it is. Past the hours the readout
  // says it all: the countdown, at 0:00, stays only for a screen reader.
  let winRow;
  let countdownBelow = null;
  if (phase === 'grace') {
    winRow = h('p', { class: 'grace-lead', 'data-testid': 'grace' },
      h('span', { class: 'grace-intro' }, `Your ${hoursWord(windowMs)} are up.`), ' ',
      live('span', { class: 'value tabular' }, (t) => String(Math.max(0, Math.ceil((rec.firstBite + windowMs + GRACE_MS - t) / MIN))), (n) => h('span', { class: 'fig' }, n, h('span', { class: 'unit' }, ' min'))), ' ',
      h('span', { class: 'grace-tail' }, 'of grace left.'));
  } else if (phase === 'over') {
    winRow = h('p', { class: 'statement clay over-lead', 'data-testid': 'over' },
      h('span', { class: 'over-words' }, 'Over by'), ' ',
      live('span', { class: 'value tabular' }, (t) => fmtDuration(t - closesAt), unitFigure));
  } else {
    winRow = [countdown('value'), h('div', { class: 'countdown-caption' }, caption)];
  }
  if (phase === 'grace' || phase === 'over') countdownBelow = h('div', { class: 'countdown-line sr-only' }, countdown('line'), ' ', h('span', { class: 'countdown-caption' }, caption));
  // Past the grace the window ring is stripes, so its key is the striped ring.
  const winName = ringName('win', 'Window', phase === 'over');
  const readout = h('div', { class: 'ring-readout open-readout', 'data-testid': 'open-ring-legend' },
    h('div', { class: 'ring-row', 'data-ring-row': 'win' }, winName, winRow),
    h('div', { class: 'ring-row', 'data-ring-row': 'fast' }, ringName('fast', 'Fast'), fastMs == null ? null : h('div', { class: 'value' }, fmtFigure(fastMs))),
    h('div', { class: 'ring-row', 'data-ring-row': 'full' }, ringName('full', 'Fullness'), h('div', { class: 'value' }, d.fullText)));
  const doneEating = eating
    ? outline("I'm done eating", () => showDoneEatingSheet(app, rec.day), 'done-eating')
    : button("I'm done eating", () => showDoneEatingSheet(app, rec.day), { block: true, big: true, name: 'done-eating' });
  const changeOpening = outline('Change opening time', () => showOpeningSheet(app, rec.day), 'change-opening');
  // The fast just ended reached its goal: the rings' red ring celebrates it, once.
  const ended = endedFast(ctx, rec);
  const ringRow = h('div', { class: 'ring-wrap window-wrap' }, rings, readout);
  return h('section', { class: 'section strong hero', 'data-block': 'open', 'data-phase': phase },
    context('Window open', { cls: phase === 'over' ? 'ctx-ink' : 'ctx-win' }),
    ended && ended.reached ? celebrate(ringRow, [{ key: `done:${rec.firstBite}`, kind: 'fast' }]) : ringRow,
    countdownBelow,
    phase === 'warn'
      ? h('div', { class: 'phase-bar' }, h('span', { 'data-testid': 'warn-30' }, live('span', { class: 'phase-figure tabular' }, (t) => minsLeft(t, closesAt)), ` left. The window closes at ${fmtTime(closesAt)}.`))
      : null,
    e.openedEarly ? h('div', { class: 'phase-bar miss' }, key('miss'), h('span', {}, 'Opened before 16:00, so today counts as a miss.')) : null,
    // One main action: finishing the meal while eating (on the meal's card),
    // closing the window between meals. The rest are outlines under it.
    eating
      ? [eatingNow(app, eating, { another: true }), actionGrid(doneEating, addMealButton(app), changeOpening)]
      : [h('div', { class: 'hero-primary' }, doneEating),
        actionGrid(outline('Start a meal', () => showStartMealSheet(app), 'start-meal'), addMealButton(app), changeOpening)],
    h('div', { class: 'time-pills' },
      timePill('Opened', fmtWhen(rec.firstBite, ctx.todayKey), () => showOpeningSheet(app, rec.day), 'edit-opened'),
      h('div', { class: 'time-pill plain' }, h('div', { class: 'label' }, 'Closes'), h('div', { class: 'time-pill-value tabular' }, fmtTime(closesAt)))),
    windowBand(rec, ctx.nowTs, windowMs),
  );
}

/**
 * Just opened, the window's arc is shorter than its stroke and the rings
 * draw none of it: a round cap in the window's green at 12 o'clock shows
 * the window is open, as the fast's ring shows its head.
 */
function startCap(svg, frac) {
  const g = svg.querySelector('.ring-win');
  const track = g && g.querySelector('circle');
  if (!track) return;
  const r = Number(track.getAttribute('r'));
  const w = Number(track.getAttribute('stroke-width'));
  if (frac * 2 * Math.PI * r >= w) return;
  g.append(s('circle', { class: 'ring-start', cx: track.getAttribute('cx'), cy: (Number(track.getAttribute('cy')) - r).toFixed(2), r: w / 2, fill: P.WIN, stroke: 'none' }));
}

/**
 * The window as a band: time used in green, time left in pale green, then
 * the dashed 15 minutes of grace. Past the grace the band turns to orange
 * stripes, the mark of a miss, and the legend says only Over.
 */
function windowBand(rec, nowTs, windowMs) {
  const W = 340;
  const HT = 46;
  const X0 = 1;
  const X1 = 339;
  const Y = 4;
  const BH = 16;
  const total = windowMs + GRACE_MS;
  const x = (ms) => X0 + (X1 - X0) * Math.min(1, Math.max(0, ms / total));
  const used = Math.max(0, nowTs - rec.firstBite);
  const over = used > total;
  const gx = x(windowMs);
  const miss = hatch();
  const ticks = Array.from({ length: Math.floor(windowMs / HOUR) + 1 }, (_, i) => s('line', {
    x1: x(i * HOUR).toFixed(1), x2: x(i * HOUR).toFixed(1), y1: Y + BH + 3, y2: Y + BH + 8, stroke: P.EDGE, 'stroke-width': 1.5, 'stroke-linecap': 'round',
  }));
  return h('div', { class: 'band-wrap', 'data-testid': 'window-band', 'data-used': String(Math.round(used / MIN)), 'data-over': String(over) },
    s('svg', { class: 'chart band', viewBox: `0 0 ${W} ${HT}`, 'aria-hidden': 'true', focusable: 'false' },
      miss.defs,
      // Time left: pale green, its edge drawn inside it.
      s('rect', { x: X0 + 0.5, y: Y + 0.5, width: (gx - X0 - 3).toFixed(1), height: BH - 1, rx: (BH - 1) / 2, fill: P.WIN_SOFT, stroke: P.WIN, 'stroke-width': 1 }),
      s('rect', { x: (gx + 2).toFixed(1), y: Y + 1, width: (X1 - gx - 3).toFixed(1), height: BH - 2, rx: (BH - 2) / 2, fill: 'none', stroke: P.QUIET, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }),
      over
        ? s('rect', { x: X0 + 0.5, y: Y + 0.5, width: X1 - X0 - 1, height: BH - 1, rx: (BH - 1) / 2, fill: miss.fill, stroke: P.MISS_TEXT, 'stroke-width': 1 })
        : s('rect', { x: X0, y: Y, width: Math.max(BH, x(used) - X0).toFixed(1), height: BH, rx: BH / 2, fill: P.WIN }),
      ...ticks,
      s('text', { x: X0, y: HT - 4 }, fmtTime(rec.firstBite)),
      s('text', { x: gx.toFixed(1), y: HT - 4, 'text-anchor': 'end' }, fmtTime(rec.firstBite + windowMs))),
    // Past the grace the stripes cover the whole band: the legend names only them.
    legend(over ? [['band-over', 'Over']] : [['band-used', 'Time used'], ['band-left', 'Time left'], ['band-grace', '15 min grace']], 'band-legend'));
}

// ---------- Forgotten close ----------

// The typed last bite survives re-renders until the window is closed.
let forgotDraft = null;

function forgotBlock(ctx, app, rec) {
  const id = `${rec.day}|${rec.firstBite}`;
  if (!forgotDraft || forgotDraft.id !== id) {
    // Suggest the last logged meal time; with none logged, ask for a real answer.
    const known = forgotCloseDefault(ctx, rec);
    forgotDraft = { id, minutes: known > rec.firstBite ? minutesOfDay(known) : null, hint: '' };
  }
  const draft = forgotDraft;
  const block = h('section', { class: 'section strong hero', 'data-block': 'forgot' });
  const draw = () => {
    block.replaceChildren(...[
      context('Window still open'),
      h('p', { class: 'statement forgot-statement' }, `Your window from ${fmtWhen(rec.firstBite, ctx.todayKey)} is still open.`),
      h('p', { class: 'forgot-question' }, 'When was your last bite?'),
      h('div', { class: 'forgot-wheel' }, timeField({
        minutes: draft.minutes,
        fallback: minutesOfDay(rec.firstBite + ctx.windowMsFor(rec.day)),
        hint: draft.minutes == null ? 'Roll to your last bite.' : '',
        name: 'forgot-last-bite',
        onChange: (m) => { draft.minutes = m; },
      })),
      draft.hint ? h('div', { class: 'forgot-error' }, errorLine(draft.hint)) : null,
      h('div', { class: 'hero-primary' }, button('Close the window', async () => {
        if (draft.minutes == null) { draft.hint = 'Roll the wheel to the time of your last bite.'; draw(); return; }
        const last = timeOnOrAfter(rec.firstBite, draft.minutes);
        if (last > now()) { draft.hint = 'That time is still ahead.'; draw(); return; }
        // Closing also ends any meal left open, at the last bite.
        await store.closeWindow(rec.day, last);
      }, { block: true, big: true, name: 'forgot-close' })),
    ].filter(Boolean));
  };
  draw();
  return block;
}

// ---------- Window closed ----------

function reasonLine(reason, e) {
  if (reason === 'over') return `Over by ${fmtDuration(e.overByMs)}.`;
  if (reason === 'early') return `Opened at ${fmtTime(e.firstBite)}, before 16:00.`;
  return 'Ate outside the window.';
}

/**
 * The meal being eaten, on its own card, with Finished this meal (and Start
 * another meal while the window is open). Inside the window the card is the
 * window's pale green; a meal eaten after it is grey, with the stripes of a
 * miss beside its words.
 */
function eatingNow(app, meal, { another = false } = {}) {
  const words = `${meal.outside ? 'Eating outside the window: ' : 'Eating: '}${meal.name || 'a meal'}, since ${fmtTime(meal.startedAt)}.`;
  return h('div', { class: `eating-now card ${meal.outside ? 'outside' : 'tint-win'}`, 'data-block': 'eating' },
    h('p', { class: 'eating-line' }, meal.outside ? key('miss', { size: 16 }) : null, h('span', {}, words)),
    h('div', { class: 'eating-finish' }, button('Finished this meal', () => showFinishMealSheet(app, meal.id), { kind: 'win', big: true, block: true, name: 'finish-meal' })),
    another ? h('div', { class: 'eating-another' }, button('Start another meal', () => showStartMealSheet(app), { kind: 'secondary', name: 'another-meal' })) : null);
}

/** After the window: the new fast on top, the full rings with when it began and when it reaches its goal. */
function fastCard(ctx, app, src, day, animate) {
  return h('section', { class: 'section strong hero', 'data-block': 'fasting' },
    context('Fasting'),
    ringHero(ctx, src.ts, { times: fastTimes(ctx, app, src), day, animate }));
}

/** The window just closed: its hours, result and buttons. lead: it heads Today (when no fast is known to put first). */
function closedBlock(ctx, app, rec, { lead = true } = {}) {
  const e = ctx.evaluate(rec.day);
  const success = e.result === 'success';
  const reopen = canReopen(rec, ctx.nowTs, ctx.windowMsFor(rec.day));
  // A meal started after the window closed, still being eaten.
  const eating = mealInProgress(ctx, rec.day);
  // Two weights: Add a meal and Start a meal as the 48 outline pair (none
  // while a meal is being eaten), then the corrections as 44 tertiary pills.
  const pair = eating ? null
    : h('div', { class: 'btn-pair' }, addMealButton(app), outline('Start a meal', () => showStartMealSheet(app), 'start-meal'));
  const pills = h('div', { class: 'pill-row' },
    button('I ate something', () => showOutsideSheet(app, { day: rec.day }), { kind: 'secondary', name: 'ate-something' }),
    button('Change times', () => showWindowTimesSheet(app, rec.day), { kind: 'secondary', name: 'change-times' }));
  return h('section', { class: `section closed-card${lead ? ' strong hero' : ''}`, 'data-block': 'closed', 'data-result': e.result },
    context('Window closed'),
    h('div', { class: 'closed-grid' },
      h('div', { class: 'closed-main' },
        h('div', { class: `closed-length tabular ${success ? 'win-ok' : 'clay'}`, 'data-testid': 'window-length' }, durationFigure(e.lengthMs))),
      h('div', { class: 'closed-times' },
        tapNote('First bite', fmtTime(rec.firstBite), () => showBiteTimeSheet(app, rec.day, 'first'), 'edit-first-bite'),
        tapNote('Last bite', fmtWhen(rec.lastBite, ctx.todayKey), () => showBiteTimeSheet(app, rec.day, 'last'), 'edit-last-bite'))),
    success
      ? h('p', { class: 'result-line', 'data-testid': 'result' }, key('day-success', { size: 16 }), h('span', {}, 'Success. All eating inside the window.'))
      : h('div', { class: 'result-miss' }, missLine(e.reasons.map((r) => reasonLine(r, e)), { testid: 'result' })),
    eating ? eatingNow(app, eating) : null,
    reopen
      ? h('div', { class: 'phase-bar reopen-bar' },
        h('span', {}, 'Still inside your window.'),
        button('Reopen window', () => store.reopenWindow(rec.day), { kind: 'secondary', name: 'reopen' }))
      : null,
    h('div', { class: 'closed-actions' }, pair, pills),
    h('p', { class: 'next-window', 'data-testid': 'next-window' }, nextWindowLine(ctx, rec.day)),
  );
}

function noEatingBlock(ctx) {
  return h('section', { class: 'section strong hero', 'data-block': 'no-eating' },
    context('No eating today'),
    h('p', { class: 'statement' }, 'Logged as a day without eating.'),
    actionGrid(outline('Undo', () => store.setNoEating(ctx.todayKey, false), 'undo-no-eating')));
}

// ---------- Streak ----------

/** The streak and the best: two stats on shared lines, a caption over a figure. */
function streakSection(ctx) {
  const stat = (caption, n, testid) => h('div', { class: 'streak-stat' },
    h('div', { class: 'caption' }, caption),
    h('div', { class: 'stat-figure tabular', 'data-testid': testid }, figureParts([[n, n === 1 ? ' day' : ' days']])));
  return h('section', { class: 'section stat-row', 'data-block': 'streak' },
    stat('Streak', ctx.streak.current, 'streak'),
    stat('Best', ctx.streak.best, 'streak-best'));
}

// ---------- Check-ins ----------

function checkinSection(ctx, app) {
  const key = ctx.todayKey;
  const rec = ctx.days.get(key) || {};
  const workday = isWorkday(key, rec);
  const after4 = minutesOfDay(ctx.nowTs) >= CUTOFF_MIN;
  return h('section', { class: 'section checkin-card', 'data-block': 'checkin' },
    h('h2', { class: 'card-title' }, 'Check-in'),
    workday
      ? (after4
        ? h('div', { class: 'checkin-field' }, scale({ n: 5, value: rec.energy4pm ?? null, label: 'Energy at 4 PM', low: '1 drained', high: '5 sharp', name: 'energy',
          onChange: (v) => store.updateDay(key, { energy4pm: v }) }))
        : h('p', { class: 'checkin-note' }, 'Energy at 4 PM: rate it here from 16:00.'))
      : null,
    h('div', { class: 'checkin-field' },
      choice({ label: 'Trained today', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: rec.trained ?? null, cols: 2, name: 'trained',
        onChange: (v) => store.updateDay(key, { trained: v, trainingType: v ? rec.trainingType || null : null }) })),
    rec.trained
      ? h('div', { class: 'checkin-field' },
        choice({ label: 'Type', options: TRAINING_OPTIONS, value: rec.trainingType || null, cols: 3, name: 'training-type',
          onChange: (v) => store.updateDay(key, { trainingType: v }) }))
      : null,
  );
}

// ---------- Satiety pointer ----------

function satietyPointer(ctx, app) {
  const running = runningFullness(ctx);
  if (!running.length) return null;
  const m = running[0];
  return h('section', { class: 'section pointer-card', 'data-block': 'satiety-pointer' },
    h('div', { class: 'pointer-words' },
      h('div', { class: 'pointer-label' }, key('ring-full'), h('span', {}, 'Fullness check')),
      live('p', { class: 'pointer-text' }, (t) => (m.fullness20DueAt > t ? `${m.name || 'Your meal'}: check in ${fmtDuration(m.fullness20DueAt - t)}.` : `${m.name || 'Your meal'}: time to score it.`))),
    button('Satiety', () => app.go('satiety'), { kind: 'secondary', name: 'open-satiety' }));
}

export function mealMeta(m) {
  const bits = [];
  if (m.outside) bits.push('outside the window');
  if (m.hungerBefore != null) bits.push(`hunger ${m.hungerBefore}`);
  if (m.stop) bits.push(STOP_TEXT[m.stop]);
  if (m.fullnessNow != null) bits.push(`fullness ${m.fullnessNow}`);
  if (m.fullness20 != null) bits.push(`at 20 min ${m.fullness20}`);
  return bits.length ? bits.join(', ') : '';
}
