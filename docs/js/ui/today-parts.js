// Today's parts: the three rings that lead it, the stage panel and the week
// row. The fast is the outer red ring, timed from the last bite (or when the
// fast began) and filling towards the fasting goal; past the goal it laps
// itself. The green ring is the day's eating window and the blue ring its
// fullness. The stage the fast is in sits in the middle of the rings and
// moves. The stages are never a target.

import { h, live } from './dom.js';
import { button, durationFigure, key, legend } from './components.js';
import { HOUR, MIN, addDays, fmtDayShort, fmtDuration, fmtMinutes, weekStart, weekdayShort } from '../core/time.js';
import { fastHoursFor, isFlexible, plannedStartMin } from '../core/rules.js';
import { STAGES, fastingState } from '../core/stages.js';
import { LEFT_WANTING, dayFullness, mealsByDay } from '../core/fullness.js';
import { stageGlyph, stageIcon } from './icons.js';
import { celebrate, miniRing, ringsSvg } from './rings.js';
import { showStagesSheet } from './stages.js';

/** The current stage as a small button beside the time: it opens the stages at this one. */
function stageChip(stage) {
  return h('button', {
    type: 'button',
    class: 'stage-chip',
    'data-action': 'open-stages',
    'data-testid': 'stage-name',
    'aria-label': `Stage: ${stage.name}. About the stages`,
    onclick: () => showStagesSheet(stage.key),
  }, stageGlyph(stage.key, { mark: false, live: true }), h('span', {}, stage.name));
}

const FULL_WORD = { before_full: 'Left wanting', full: 'Satisfied', stuffed: 'Overfull' };

/**
 * The window and fullness rings for a day, with their words. The window
 * ring fills as the window is used and is closed full on a successful day;
 * a miss is orange stripes. Fullness closes on a day left wanting.
 */
export function dayRings(ctx, day) {
  const rec = ctx.days.get(day) || {};
  const e = ctx.evaluate(day);
  const goalMs = ctx.windowMsFor(day);
  let win;
  let winText;
  if (e.result === 'miss') {
    win = { frac: 1, miss: true };
    winText = 'Miss';
  } else if (e.result === 'success') {
    win = { frac: 1 };
    winText = e.state === 'noEating' ? 'No eating' : e.state === 'fasted' ? 'Fasted' : rec.lastBite ? `Kept, ${fmtDuration(rec.lastBite - rec.firstBite)}` : 'Success';
  } else if (rec.firstBite) {
    const used = (rec.lastBite || ctx.nowTs) - rec.firstBite;
    win = { frac: Math.min(1, used / goalMs) };
    winText = rec.lastBite ? fmtDuration(used) : 'Open';
  } else {
    win = { frac: 0 };
    const hours = Math.round(goalMs / HOUR);
    winText = e.result === 'paused' ? 'Paused'
      : isFlexible(day, ctx.settings) ? `${hours} h, when you choose`
        : `${hours} h, planned ${fmtMinutes(plannedStartMin(day, rec, ctx.settings))}`;
  }
  const fullness = dayFullness(ctx.meals.filter((m) => m.day === day), ctx.days.get(day));
  const full = { frac: fullness === LEFT_WANTING ? 1 : 0 };
  return { win, winText, full, fullText: FULL_WORD[fullness] || 'Not rated yet', fullness, rec, e };
}

/** One line beside the rings: the ring's name in its colour, then its words. */
const ringStat = (kind, name, text, testid) => h('div', { class: `ring-stat stat-${kind}`, 'data-testid': testid },
  h('div', { class: 'label' }, name), h('div', { class: 'ring-stat-text' }, text));

/**
 * The rings with the time fasted beside them, the stage, and the window's
 * and fullness' words. compact: a smaller version, for the stage panel.
 */
function fastingRing(ctx, state, lastBiteTs, compact, goalHours, day) {
  const d = dayRings(ctx, day);
  const frac = state.elapsedMs / (goalHours * HOUR);
  const reached = frac >= 1;
  const svg = ringsSvg({
    fast: { frac, testid: 'stage-marker', hours: (state.elapsedMs / HOUR).toFixed(1) },
    win: d.win,
    full: d.full,
  }, {
    size: compact ? 132 : 164,
    centre: (c, size) => stageIcon(state.stage.key, { x: c, y: c, size: size * 0.2, live: true, mark: false }),
  });
  const wrap = h('div', {
    class: `ring-wrap${compact ? ' compact' : ''}`,
    'data-testid': 'fasting-ring',
    'data-stage': state.stage.key,
    'data-goal': String(goalHours),
  },
    // The stage sits under the rings, its icon moving in their middle.
    h('div', { class: 'ring-col' }, svg, stageChip(state.stage)),
    h('div', { class: 'ring-side' },
      h('div', { class: 'label stat-fast' }, 'Fasting'),
      // Redrawn each minute: large digits, small units.
      live('div', { class: 'ring-time', 'data-testid': 'fasting-for' }, (t) => String(Math.round(Math.max(0, t - lastBiteTs) / MIN)), (mins) => durationFigure(Number(mins) * MIN)),
      h('div', { class: 'ring-goal', 'data-testid': 'ring-goal' }, reached ? `Goal of ${goalHours} h reached` : `of your ${goalHours} h goal`),
      ringStat('win', 'Window', d.winText, 'ring-window'),
      ringStat('full', 'Fullness', d.fullText, 'ring-fullness')));
  // A goal reached, a window kept, a day left wanting: each celebrated once.
  const moments = [];
  if (reached) moments.push({ key: `fast:${lastBiteTs}:${goalHours}`, kind: 'fast' });
  if (d.e.result === 'success' && d.rec.lastBite) moments.push({ key: `win:${day}:${d.rec.lastBite}`, kind: 'win' });
  if (d.full.frac >= 1) moments.push({ key: `full:${day}`, kind: 'full' });
  return celebrate(wrap, moments);
}

/** What each ring means, in one row. */
const ringLegend = () => h('div', { class: 'ring-legend' }, legend([
  ['ring-fast', 'Fast'], ['ring-win', 'Window'], ['ring-full', 'Fullness'],
], 'ring-legend'));

/** How far the fasting goal is, then the next stage; live. */
function ringLines(state, lastBiteTs, goalHours) {
  const reached = state.elapsedMs >= goalHours * HOUR;
  return h('p', { class: 'quiet small gap ring-lines' },
    reached
      ? h('span', { 'data-testid': 'goal-line' }, `Fasting goal of ${goalHours} h reached.`)
      : live('span', { 'data-testid': 'goal-line' }, (t) => {
        const left = goalHours * HOUR - (t - lastBiteTs);
        return left > 0 ? `Fasting goal ${goalHours} h: ${fmtDuration(left)} to go.` : `Fasting goal of ${goalHours} h reached.`;
      }),
    state.next
      ? [h('br'), live('span', { 'data-testid': 'stage-next' },
        (t) => `Next: ${state.next.name.toLowerCase()}, in about ${fmtDuration(Math.max(0, state.next.from * HOUR - (t - lastBiteTs)))}.`)]
      : null);
}

let shownStage = null;
let fadeAt = null; // the render in which a new stage arrived

/** A new stage arrives with a soft fade on everything drawn in that render. */
function markStage(el, state, renderTs) {
  if (shownStage !== null && shownStage !== state.stage.key) fadeAt = renderTs;
  shownStage = state.stage.key;
  if (fadeAt === renderTs) el.classList.add('fade-in');
  return el;
}

/** The fasting goal in hours: a long fast, or the day less today's eating window. */
const goalHoursFor = (ctx) => fastHoursFor(ctx.todayKey, ctx.settings);

/** The rings lead Today, with the fast's two times under them. day: the day whose window and fullness the rings show. */
export function ringHero(ctx, lastBiteTs, times = null, { day = ctx.todayKey } = {}) {
  const state = fastingState(lastBiteTs, ctx.nowTs);
  return markStage(h('div', { class: 'ring-hero gap' },
    fastingRing(ctx, state, lastBiteTs, false, goalHoursFor(ctx), day), ringLegend(), times), state, ctx.nowTs);
}

/**
 * The stage panel: the stage, what happens in it, and how far the goal and
 * the next stage are. On a day without eating, or while a meal goes on after
 * the window, it holds smaller rings and their times as well; otherwise the
 * rings lead Today above.
 */
export function stagesSection(ctx, app, lastBiteTs, { withRing, times = null, day = ctx.todayKey }) {
  if (!lastBiteTs) return null;
  const state = fastingState(lastBiteTs, ctx.nowTs);
  const goalHours = goalHoursFor(ctx);
  return markStage(h('section', { class: 'section', 'data-block': 'stages', 'data-stage': state.stage.key },
    withRing ? [fastingRing(ctx, state, lastBiteTs, true, goalHours, day), ringLegend(), times] : null,
    h('div', { class: withRing ? 'stage-head gap-l' : 'stage-head' },
      h('span', { class: `stage-disc s-${state.stage.key}`, 'aria-hidden': 'true' }, stageGlyph(state.stage.key, { mark: false, live: true })),
      h('div', {},
        h('div', { class: 'label' }, `Stage ${state.index + 1} of ${STAGES.length}`),
        h('h2', { class: 'h2 stage-title' }, state.stage.name))),
    h('p', { class: 'gap-s' }, state.stage.text),
    ringLines(state, lastBiteTs, goalHours),
    h('div', { class: 'gap' }, button('About the stages', () => showStagesSheet(state.stage.key), { kind: 'secondary', name: 'about-stages' })),
  ), state, ctx.nowTs);
}

// The same words as the Week schedule (week.js) for each day's result.
const RESULT_WORD = { success: 'success', miss: 'miss', paused: 'paused', pending: 'in progress', unlogged: 'nothing logged' };

/** A day's result as its window ring: green, orange stripes, grey, or dashed ahead; a blue dot when left wanting. */
const resultCell = (result, leftWanting) => miniRing(result, leftWanting);

/**
 * The week on Today: Sunday to Saturday, each day's result in the same marks
 * as the schedule, today underlined, and a legend naming only the marks in
 * the row. Tap a day to open it.
 */
export function weekRow(ctx, app) {
  const start = weekStart(ctx.todayKey);
  const byDay = mealsByDay(ctx.meals);
  const seen = new Set();
  const cells = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const e = ctx.evaluate(day);
    const future = day > ctx.todayKey;
    const result = future && e.result !== 'paused' ? 'future' : e.result;
    const lw = !future && dayFullness(byDay.get(day) || [], ctx.days.get(day)) === LEFT_WANTING;
    seen.add(['success', 'miss', 'paused', 'future'].includes(result) ? result : 'open');
    if (lw) seen.add('wanting');
    const word = result === 'future' ? 'still ahead' : RESULT_WORD[result] || 'nothing logged';
    return h('button', {
      type: 'button',
      class: 'week-day',
      'data-day': day,
      'data-result': result,
      'aria-current': day === ctx.todayKey ? 'date' : null,
      'aria-label': [fmtDayShort(day), word, lw ? 'left wanting' : null].filter(Boolean).join(', '),
      onclick: () => app.go(`day/${day}`),
    }, h('span', { class: 'wd' }, weekdayShort(day)), resultCell(result, lw));
  });
  return h('div', { class: 'week-today', 'data-testid': 'today-week' },
    h('div', { class: 'week-row' }, cells),
    h('div', { class: 'week-legend' }, legend([
      seen.has('success') ? ['success', 'Success'] : null,
      seen.has('miss') ? [key('miss'), 'Miss'] : null,
      seen.has('paused') ? ['paused', 'Paused'] : null,
      seen.has('open') ? ['outline', 'Open or not logged'] : null,
      seen.has('future') ? ['dashed', 'Still ahead'] : null,
      seen.has('wanting') ? ['dot', 'Left wanting'] : null,
    ], 'today-week-legend')));
}

