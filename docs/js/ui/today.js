// Today: the eating window.

import { h, s, live } from './dom.js';
import { button, choice, closeButton, durationFigure, figureParts, hatch, key, legend, scale, timeField, TRAINING_OPTIONS, STOP_TEXT } from './components.js';
import * as store from '../store.js';
import {
  HOUR, MIN, addDays, dayStart, fmtCountdown, fmtDayLong, fmtDayShort, fmtDateLong, weekdayName, fmtDuration, fmtMinutes, fmtTime, fmtWhen, isWorkweekday, minutesOfDay, now,
} from '../core/time.js';
import {
  CUTOFF_MIN, GRACE_MS, canReopen, cutoffApplies, fastHoursFor, goalLabelFor, isFlexible, isWorkday, lastEatingSource, lastEatingTs, lateNightDay, longFastAhead, plannedStartMin, timeOnOrAfter, windowPhase,
} from '../core/rules.js';
import { dailySeries } from '../core/history.js';
import * as P from './palette.js';
import { ringsSvg, celebrate } from './rings.js';
import { weekRow } from './week.js';
import { forgotCloseDefault, showAddMealSheet, showDoneEatingSheet, showFinishMealSheet, showMealEditSheet, showStartMealSheet } from './meal.js';
import { showOutsideSheet } from './outside.js';
import { showBiteTimeSheet, showOpeningSheet, showOutsideTimeSheet, showWindowTimesSheet } from './window-times.js';
import { dayRings, ringHero, stagesSection } from './stages.js';
import { currentPause, endPause, pauseToday, showPauseSheet } from './pause.js';
import { showBeginFastSheet } from './begin-fast.js';
import { showGoalSheet } from './goal.js';
import { dayTypeText, header, mealInProgress, nextWindowLine, note, notices, runningFullness, tapNote, timePill } from './shared.js';

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
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
  return parts.join('|');
}

/** The fasting goal in hours: a long fast, or the day less today's eating window. */
const goalHoursOf = (ctx, key = ctx.todayKey) => fastHoursFor(key, ctx.settings);

const fasting = (mode) => mode === 'before' || mode === 'closed' || mode === 'noEating';

export function renderToday(ctx, app) {
  const { mode, rec } = ctx.mode;
  const todayRec = ctx.days.get(ctx.todayKey);
  const src = fasting(mode) ? lastEatingSource(ctx) : null;
  // Once the window closes, the new fast leads Today, as it does before the
  // window: the full dial and its two times, the stage, and only then the
  // window just closed, with its hours, result and buttons. While a meal is
  // still being eaten after it, no fast has begun: the window's card, with
  // Finished this meal, stays on top.
  const fastFirst = mode === 'closed' && !!src && !mealInProgress(ctx, rec.day);
  let main;
  if (mode === 'open') main = openBlock(ctx, app, rec);
  else if (mode === 'forgot') main = forgotBlock(ctx, app, rec);
  else if (mode === 'closed') main = closedBlock(ctx, app, rec, { lead: !fastFirst });
  else if (mode === 'noEating') main = noEatingBlock(ctx, app);
  else if (mode === 'paused') main = pausedBlock(ctx, app);
  else main = beforeBlock(ctx, app);

  // Meals, fullness checks and how the day ended live on the Satiety tab;
  // Today points there while a fullness check is running: above the fast,
  // since it lasts only minutes and asks for a tap.
  const pointer = satietyPointer(ctx, app);
  // While fasting, the stage panel; when the fast is not put first (a day
  // without eating, or a closed window still leading) it carries a smaller dial too.
  const ringBelow = mode === 'noEating' || (mode === 'closed' && !fastFirst);
  // The rings show the window and fullness of the day on the card: last
  // night's, between midnight and 04:00, else today's.
  const ringDay = rec ? rec.day : ctx.todayKey;
  const stages = src ? stagesSection(ctx, app, src.ts, { withRing: ringBelow, times: ringBelow ? fastTimes(ctx, app, src) : null, day: ringDay }) : null;
  return h('div', { class: 'today', 'data-mode': mode },
    // The weekday as the title, the date and the kind of day above it.
    header(ctx, app, { title: weekdayName(ctx.todayKey), sub: `${fmtDateLong(ctx.todayKey)} · ${dayTypeText(ctx.todayKey, todayRec)}` }),
    weekRow(ctx, app),
    notices(ctx, app),
    mode === 'open' ? fastDone(ctx, rec) : null,
    fastFirst ? [pointer, fastCard(ctx, app, src, ringDay), stages, main] : [main, pointer, stages],
    streakSection(ctx),
    // A paused day tracks nothing.
    mode === 'paused' ? null : checkinSection(ctx, app),
  );
}

// ---------- Before the window ----------

function beforeBlock(ctx, app) {
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
  const startMeal = button('Start a meal', () => showStartMealSheet(app), { big: true, block: true, name: 'start-meal' });
  // The fast in one card: the dial, when the fast began and when it reaches
  // its goal, then the way in, with the 16:00 warning just above it. The
  // rest of the plan follows on its own panel.
  const card = h('section', { class: 'section strong', 'data-block': 'before' },
    last
      ? h('div', { class: 'label', 'data-testid': 'before-label' }, fastingDay ? 'Fasting day' : 'Before the window')
      // Before any bite on record: a plain title, and Begin fast beside Start a meal.
      : h('div', { class: 'row' },
        h('div', { class: 'main' },
          h('div', { class: 'label' }, 'Before the window'),
          h('h1', { class: 'display gap-s' }, 'Fasting'),
          plannedLine('gap')),
        h('div', { class: 'margin' }, tapNote('Goal', goalLabelFor(key, ctx.settings), () => showGoalSheet(app), 'edit-goal'))),
    last ? ringHero(ctx, last, fastTimes(ctx, app, lastSrc)) : null,
    last ? null : h('p', { class: 'quiet small gap-s', 'data-testid': 'begin-fast-hint' }, 'Already fasting? Tap Begin fast and set when it began, so none of it is lost.'),
    workdayEarly ? h('p', { class: 'statement gap-l', 'data-testid': 'firm-reminder' }, 'Opening before 16:00 makes today a miss.') : null,
    // With a fast already known (a last bite or a fast start), a meal is the only way in;
    // Begin fast is offered only when Fast has nothing to time from.
    last
      ? h('div', { class: workdayEarly ? 'gap' : 'gap-l' }, startMeal)
      : h('div', { class: `btn-pair start-actions ${workdayEarly ? 'gap' : 'gap-l'}` },
        startMeal,
        button('Begin fast', beginFastFor(app), { kind: 'outline', big: true, block: true, name: 'begin-fast' })),
    addMealButton(app));
  const plan = h('section', { class: 'section', 'data-block': 'plan' },
    last ? plannedLine(null) : null,
    h('p', { class: last ? 'quiet small gap' : 'quiet small' }, 'Until then: water, sparkling water, black coffee, espresso, plain tea.'),
    late
      ? h('div', { class: 'gap' }, button('Eating late? Count it against last night', () => showOutsideSheet(app, { day: late }), { kind: 'secondary', name: 'late-night' }))
      : null,
    // A day off only lifts the 16:00 rule, which feasting hours do not have.
    isWorkweekday(key) && !isFlexible(key, ctx.settings) ? dayOffToggle(ctx, key) : null,
    h('div', { class: 'gap-s' }, button('Pause today', () => pauseToday(app), { kind: 'secondary', name: 'pause-today' })),
  );
  return [card, plan];
}

/** A meal already eaten, added whole with no timer. */
const addMealButton = (app) => h('div', { class: 'gap-s' }, button('Add a meal', () => showAddMealSheet(app), { kind: 'outline', block: true, name: 'add-meal' }));

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
 * Under the dial: when the fast began and the clock time it reaches its goal,
 * each a pill you tap to change. Once reached, the goal is gold.
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

/**
 * The fast the window just ended, at the top of Today while the window is
 * open: how long it was, in gold with a word when it reached the goal. Close
 * puts it away for this window (kept by its first bite, so a window removed
 * and opened again gets its own note).
 */
function fastDone(ctx, rec) {
  if (!rec || rec.fastNoteClosed === rec.firstBite) return null;
  const fastMs = dailySeries(ctx, rec.day, rec.day)[0].fastMs;
  if (fastMs == null) return null;
  const goalHours = goalHoursOf(ctx, rec.day);
  const reached = fastMs >= goalHours * HOUR;
  const ring = h('div', { class: 'done-ring' }, ringsSvg({ fast: { frac: fastMs / (goalHours * HOUR) } }, { size: 64 }));
  return h('section', { class: `section fast-done${reached ? ' reached' : ''}`, 'data-block': 'fast-done', 'data-reached': String(reached) },
    reached ? celebrate(ring, [{ key: `done:${rec.firstBite}`, kind: 'fast' }]) : ring,
    h('div', { class: 'done-words' },
      h('div', { class: 'label' }, 'Fast complete'),
      h('div', { class: `display${reached ? ' hl' : ''}`, 'data-testid': 'fast-length' }, durationFigure(fastMs)),
      reached ? h('p', { class: 'done-goal', 'data-testid': 'fast-goal' }, `Fasting goal of ${goalHours} h reached.`) : null),
    closeButton(() => store.updateDay(rec.day, { fastNoteClosed: rec.firstBite }), { name: 'close-fast-done' }));
}

// ---------- Paused ----------

/** 'Thu 1 Oct' with its last space unbreakable, so '1 Oct' stays on one line. */
const keepTogether = (text) => text.replace(/ (\S+)$/, '\u00A0$1');

const FOR_REASON = { travel: 'For travel. ', illness: 'For illness. ', ramadan: 'For Ramadan. ' };

function pausedBlock(ctx, app) {
  const run = currentPause(ctx) || { from: ctx.todayKey, to: ctx.todayKey, reason: true };
  const until = run.to;
  return h('section', { class: 'section strong', 'data-block': 'paused' },
    h('div', { class: 'label' }, 'Paused'),
    h('h1', { class: 'display gap-s', 'data-testid': 'paused-until' }, until === ctx.todayKey ? 'Paused today' : `Paused until ${keepTogether(fmtDayShort(until))}`),
    h('p', { class: 'gap' }, `${FOR_REASON[run.reason] || ''}Fasting is not tracked and your streak holds; fullness still counts. Tracking resumes on ${fmtDayLong(addDays(until, 1))}.`),
    h('div', { class: 'btn-row gap' },
      button('End the pause', () => endPause(app, run), { kind: 'secondary', name: 'end-pause' }),
      button('Change', () => showPauseSheet(app, { run }), { kind: 'secondary', name: 'change-pause' })),
    // Meals still count for Satiety on a paused day.
    addMealButton(app),
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
  return h('div', { class: 'gap-s' },
    off
      ? h('div', { class: 'btn-row' },
        h('span', { class: 'small quiet' }, 'Day off: weekend rules today.'),
        button('Undo', () => store.updateDay(key, { dayOff: false }), { kind: 'secondary', name: 'day-off-undo' }))
      : button('Mark today as a day off', () => store.updateDay(key, { dayOff: true }), { kind: 'secondary', name: 'day-off' }));
}

// ---------- Window open ----------

function openBlock(ctx, app, rec) {
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
    win: { frac: Math.min(1, used / windowMs), miss: phase === 'over' || e.openedEarly, testid: 'window-ring' },
    full: d.full,
  }, { size: 150 });
  return h('section', { class: 'section strong', 'data-block': 'open', 'data-phase': phase },
    h('div', { class: 'ring-wrap window-wrap' },
      rings,
      h('div', { class: 'ring-side' },
        h('div', { class: 'label stat-win' }, 'Window open'),
        live('div', { class: 'countdown', 'data-testid': 'countdown', role: 'timer' }, (t) => fmtCountdown(closesAt - t)),
        h('div', { class: 'countdown-caption' }, `left of ${hoursWord(windowMs)}`),
        h('div', { class: 'ring-goal' }, `Closes at ${fmtTime(closesAt)}`))),
    h('div', { class: 'time-pills' },
      timePill('Opened', fmtWhen(rec.firstBite, ctx.todayKey), () => showOpeningSheet(app, rec.day), 'edit-opened'),
      h('div', { class: 'time-pill plain' }, h('div', { class: 'label' }, 'Closes'), h('div', { class: 'time-pill-value' }, fmtTime(closesAt)))),
    windowBand(rec, ctx.nowTs, windowMs),
    phase === 'warn'
      ? h('p', { class: 'gap-l', 'data-testid': 'warn-30' }, live('span', { class: 'num' }, (t) => minsLeft(t, closesAt)), ` left. The window closes at ${fmtTime(closesAt)}.`)
      : null,
    phase === 'grace'
      ? h('p', { class: 'gap-l', 'data-testid': 'grace' }, `Your ${hoursWord(windowMs)} are up. `, live('span', { class: 'num' }, (t) => minsLeft(t, rec.firstBite + windowMs + GRACE_MS)), ' of grace left.')
      : null,
    phase === 'over'
      ? h('p', { class: 'statement clay gap-l', 'data-testid': 'over' }, live('span', {}, (t) => `Over by ${fmtDuration(t - closesAt)}`))
      : null,
    e.openedEarly ? h('p', { class: 'gap' }, 'Opened before 16:00, so today counts as a miss.') : null,
    eating
      ? eatingNow(app, eating, { another: true })
      : h('div', { class: 'gap-l' }, button('Start a meal', () => showStartMealSheet(app), { kind: 'outline', block: true, name: 'start-meal' })),
    addMealButton(app),
    // One main action: finishing the meal while eating, closing the window between meals.
    h('div', { class: 'gap' }, button("I'm done eating", () => showDoneEatingSheet(app, rec.day), { kind: eating ? 'outline' : 'primary', block: true, name: 'done-eating' })),
    h('div', { class: 'gap-s' }, button('Change opening time', () => showOpeningSheet(app, rec.day), { kind: 'secondary', name: 'change-opening' })),
  );
}

/**
 * The window as a band: time used in dark rock, time left in sand, then the
 * dashed 15 minutes of grace. Past the grace the band turns to clay stripes,
 * the mark of a miss.
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
    x1: x(i * HOUR).toFixed(1), x2: x(i * HOUR).toFixed(1), y1: Y + BH + 3, y2: Y + BH + 8, stroke: P.FAINT, 'stroke-width': 1.5, 'stroke-linecap': 'round',
  }));
  return h('div', { class: 'gap', 'data-testid': 'window-band', 'data-used': String(Math.round(used / MIN)), 'data-over': String(over) },
    s('svg', { class: 'chart band', viewBox: `0 0 ${W} ${HT}`, 'aria-hidden': 'true', focusable: 'false' },
      miss.defs,
      s('rect', { x: X0, y: Y, width: (gx - X0 - 2).toFixed(1), height: BH, rx: BH / 2, fill: P.WIN_SOFT }),
      s('rect', { x: (gx + 2).toFixed(1), y: Y + 1, width: (X1 - gx - 3).toFixed(1), height: BH - 2, rx: (BH - 2) / 2, fill: 'none', stroke: P.QUIET, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }),
      over
        ? s('rect', { x: X0, y: Y, width: X1 - X0, height: BH, rx: BH / 2, fill: miss.fill, stroke: P.MISS, 'stroke-width': 1.5 })
        : s('rect', { x: X0, y: Y, width: Math.max(BH, x(used) - X0).toFixed(1), height: BH, rx: BH / 2, fill: P.WIN }),
      ...ticks,
      s('text', { x: X0, y: HT - 4 }, fmtTime(rec.firstBite)),
      s('text', { x: gx.toFixed(1), y: HT - 4, 'text-anchor': 'end' }, fmtTime(rec.firstBite + windowMs))),
    legend([['used', 'Time used'], ['left', 'Time left'], ['grace', '15 min grace'], over ? [key('miss'), 'Over'] : null], 'band-legend'));
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
  const block = h('section', { class: 'section strong', 'data-block': 'forgot' });
  const draw = () => {
    block.replaceChildren(...[
      h('div', { class: 'label' }, 'Window still open'),
      h('p', { class: 'statement gap-s' }, `Your window from ${fmtWhen(rec.firstBite, ctx.todayKey)} is still open.`),
      h('p', { class: 'gap' }, 'When was your last bite?'),
      h('div', { class: 'gap' }, timeField({
        minutes: draft.minutes,
        fallback: minutesOfDay(rec.firstBite + ctx.windowMsFor(rec.day)),
        hint: draft.minutes == null ? 'Roll to your last bite.' : '',
        name: 'forgot-last-bite',
        onChange: (m) => { draft.minutes = m; },
      })),
      draft.hint ? h('p', { class: 'quiet small gap-s' }, draft.hint) : null,
      h('div', { class: 'gap-l' }, button('Close the window', async () => {
        if (draft.minutes == null) { draft.hint = 'Roll the wheel to the time of your last bite.'; draw(); return; }
        const last = timeOnOrAfter(rec.firstBite, draft.minutes);
        if (last > now()) { draft.hint = 'That time is still ahead.'; draw(); return; }
        // Closing also ends any meal left open, at the last bite.
        await store.closeWindow(rec.day, last);
      }, { block: true, name: 'forgot-close' })),
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

/** The meal being eaten, with its Finished button (and Start another meal while the window is open). */
function eatingNow(app, meal, { another = false } = {}) {
  return h('div', { class: `eating-now gap-l${meal.outside ? ' outside' : ''}`, 'data-block': 'eating' },
    h('p', { class: 'eating-line' }, `${meal.outside ? 'Eating outside the window: ' : 'Eating: '}${meal.name || 'a meal'}, since ${fmtTime(meal.startedAt)}.`),
    h('div', { class: 'gap' }, button('Finished this meal', () => showFinishMealSheet(app, meal.id), { block: true, name: 'finish-meal' })),
    another ? h('div', { class: 'gap-s' }, button('Start another meal', () => showStartMealSheet(app), { kind: 'secondary', name: 'another-meal' })) : null);
}

/** After the window: the new fast on top, the full dial with when it began and when it reaches its goal. */
function fastCard(ctx, app, src, day) {
  return h('section', { class: 'section strong', 'data-block': 'fasting' },
    ringHero(ctx, src.ts, fastTimes(ctx, app, src), { day }));
}

/** The window just closed: its hours, result and buttons. lead: it heads Today (when no fast is known to put first). */
function closedBlock(ctx, app, rec, { lead = true } = {}) {
  const e = ctx.evaluate(rec.day);
  const success = e.result === 'success';
  const reopen = canReopen(rec, ctx.nowTs, ctx.windowMsFor(rec.day));
  // A meal started after the window closed, still being eaten.
  const eating = mealInProgress(ctx, rec.day);
  return h('section', { class: lead ? 'section strong' : 'section', 'data-block': 'closed', 'data-result': e.result },
    h('div', { class: 'row' },
      h('div', { class: 'main' },
        h('div', { class: 'label' }, 'Window closed'),
        h('h1', { class: `display gap-s ${success ? 'win-ok' : 'clay'}`, 'data-testid': 'window-length' }, durationFigure(e.lengthMs))),
      h('div', { class: 'margin' },
        tapNote('First bite', fmtTime(rec.firstBite), () => showBiteTimeSheet(app, rec.day, 'first'), 'edit-first-bite'),
        tapNote('Last bite', fmtWhen(rec.lastBite, ctx.todayKey), () => showBiteTimeSheet(app, rec.day, 'last'), 'edit-last-bite'))),
    success
      ? h('p', { class: 'statement gap', 'data-testid': 'result' }, 'Success. All eating inside the window.')
      : h('div', { class: 'gap', 'data-testid': 'result' }, e.reasons.map((r) => h('p', { class: 'statement clay' }, reasonLine(r, e)))),
    eating ? eatingNow(app, eating) : null,
    reopen
      ? h('div', { class: 'btn-row gap' },
        h('span', { class: 'small quiet' }, 'Still inside your window.'),
        button('Reopen window', () => store.reopenWindow(rec.day), { kind: 'secondary', name: 'reopen' }))
      : null,
    eating ? null : addMealButton(app),
    h('div', { class: 'btn-row gap' },
      eating ? null : button('Start a meal', () => showStartMealSheet(app), { kind: 'secondary', name: 'start-meal' }),
      button('I ate something', () => showOutsideSheet(app, { day: rec.day }), { kind: 'secondary', name: 'ate-something' }),
      button('Change times', () => showWindowTimesSheet(app, rec.day), { kind: 'secondary', name: 'change-times' })),
    h('p', { class: 'quiet gap', 'data-testid': 'next-window' }, nextWindowLine(ctx, rec.day)),
  );
}

function noEatingBlock(ctx, app) {
  return h('section', { class: 'section strong', 'data-block': 'no-eating' },
    h('div', { class: 'label' }, 'No eating today'),
    h('p', { class: 'statement gap-s' }, 'Logged as a day without eating.'),
    h('div', { class: 'gap' }, button('Undo', () => store.setNoEating(ctx.todayKey, false), { kind: 'secondary', name: 'undo-no-eating' })));
}

// ---------- Streak ----------

function streakSection(ctx) {
  return h('section', { class: 'section', 'data-block': 'streak' },
    h('div', { class: 'row' },
      h('div', { class: 'main' },
        h('div', { class: 'label' }, 'Streak'),
        h('div', { class: 'figure gap-s', 'data-testid': 'streak' }, figureParts([[ctx.streak.current, ctx.streak.current === 1 ? ' day' : ' days']]))),
      h('div', { class: 'margin' }, note('Best', days(ctx.streak.best)))));
}

// ---------- Check-ins ----------

function checkinSection(ctx, app) {
  const key = ctx.todayKey;
  const rec = ctx.days.get(key) || {};
  const workday = isWorkday(key, rec);
  const after4 = minutesOfDay(ctx.nowTs) >= CUTOFF_MIN;
  return h('section', { class: 'section', 'data-block': 'checkin' },
    h('div', { class: 'label' }, 'Check-in'),
    workday
      ? (after4
        ? h('div', { class: 'gap' }, scale({ n: 5, value: rec.energy4pm ?? null, label: 'Energy at 4 PM', low: '1 drained', high: '5 sharp', name: 'energy',
          onChange: (v) => store.updateDay(key, { energy4pm: v }) }))
        : h('p', { class: 'quiet small gap-s' }, 'Energy at 4 PM: rate it here from 16:00.'))
      : null,
    h('div', { class: 'gap' },
      choice({ label: 'Trained today', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: rec.trained ?? null, cols: 2, name: 'trained',
        onChange: (v) => store.updateDay(key, { trained: v, trainingType: v ? rec.trainingType || null : null }) })),
    rec.trained
      ? h('div', { class: 'gap' },
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
  return h('section', { class: 'section', 'data-block': 'satiety-pointer' },
    h('div', { class: 'row' },
      h('div', { class: 'main' },
        h('div', { class: 'label' }, 'Fullness check'),
        live('p', { class: 'gap-s' }, (t) => (m.fullness20DueAt > t ? `${m.name || 'Your meal'}: check in ${fmtDuration(m.fullness20DueAt - t)}.` : `${m.name || 'Your meal'}: time to score it.`))),
      h('div', { class: 'margin' }, button('Satiety', () => app.go('satiety'), { kind: 'secondary', name: 'open-satiety' }))));
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
