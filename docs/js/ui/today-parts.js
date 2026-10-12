// Today's parts: the three rings that lead it, the readout beside them, the
// stage card and the week row. The fast is the outer red ring, timed from
// the last bite (or when the fast began) and filling towards the fasting
// goal; past the goal it laps itself. The green ring is the day's eating
// window and the blue ring its fullness. The stage the fast is in sits in
// the middle of the rings and moves. The stages are never a target.

import { h, live } from './dom.js';
import { button, figureParts, key, legend } from './components.js';
import { HOUR, MIN, addDays, durationParts, fmtDayShort, fmtDuration, fmtMinutes, weekStart, weekdayShort } from '../core/time.js';
import { fastHoursFor, isFlexible, plannedStartMin } from '../core/rules.js';
import { STAGES, fastingState } from '../core/stages.js';
import { LEFT_WANTING, dayFullness, mealsByDay } from '../core/fullness.js';
import { glyph, stageDisc, stageGlyph, stageIcon } from './icons.js';
import { RING, celebrate, miniRing, ringsSvg } from './rings.js';
import { showStagesSheet } from './stages.js';

/**
 * The current stage as a tertiary pill under the rings: its icon moving, its
 * name, and a chevron. It opens the stages at this one.
 */
function stageChip(stage) {
  return h('button', {
    type: 'button',
    class: 'stage-chip',
    'data-action': 'open-stages',
    'data-testid': 'stage-name',
    'aria-label': `Stage: ${stage.name}. About the stages`,
    onclick: () => showStagesSheet(stage.key),
  }, stageGlyph(stage.key, { mark: false, live: true }), h('span', { class: 'stage-chip-name' }, stage.name), glyph('chevron'));
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

/**
 * A ring's name with its key: the readout is the rings' legend. miss: the
 * ring is drawn in stripes, so its key is the striped ring and its name is
 * in the colour of a miss.
 */
export const ringName = (kind, name, miss = false) => (miss
  ? h('span', { class: 'legend-item is-miss' }, key('day-miss'), name)
  : h('span', { class: 'legend-item' }, key(`ring-${kind}`), name));

/**
 * The size the hero rings are drawn at: 184, or 120 below 375 wide, so the
 * readout keeps room for its lead figure and the ring stays on the gutter.
 */
export const heroRingSize = () => (typeof matchMedia === 'function' && matchMedia('(max-width: 374px)').matches ? RING.md.size : RING.hero.size);

/**
 * A duration as a figure with small units. A long one (days, or more than
 * seven characters) steps down a size so it never runs out of its column.
 */
export function fitFigure(ms) {
  const parts = durationParts(ms);
  const fig = figureParts(parts);
  const text = parts.map(([n, u]) => n + u).join(' ');
  if (text.includes('day') || text.length > 7) fig.style.setProperty('--fig-size', 'var(--t-title-1-size)');
  return fig;
}

/**
 * The rings with the readout beside them: the time fasted in the fast's red,
 * how it stands against the goal, then the window's and fullness' words.
 * compact: the smaller rings, for the stage card.
 */
function fastingRing(ctx, state, lastBiteTs, compact, goalHours, day, animate) {
  const d = dayRings(ctx, day);
  const frac = state.elapsedMs / (goalHours * HOUR);
  const reached = frac >= 1;
  const size = compact ? RING.md.size : heroRingSize();
  const small = size === RING.md.size;
  const svg = ringsSvg({
    fast: { frac, testid: 'stage-marker', hours: (state.elapsedMs / HOUR).toFixed(1) },
    win: d.win,
    full: d.full,
  }, {
    size,
    key: 'hero',
    animate,
    centre: (c) => stageIcon(state.stage.key, { x: c, y: c, size: small ? 24 : 36, live: true, mark: false }),
  });
  const wrap = h('div', {
    class: `ring-wrap${compact ? ' compact' : ''}`,
    'data-testid': 'fasting-ring',
    'data-stage': state.stage.key,
    'data-goal': String(goalHours),
  },
    svg,
    h('div', { class: 'ring-readout', 'data-testid': 'ring-legend' },
      h('div', { class: 'ring-row', 'data-ring-row': 'fast' },
        ringName('fast', 'Fast'),
        // Redrawn each minute: large digits, small units.
        live('div', { class: 'value tabular', 'data-testid': 'fasting-for' }, (t) => String(Math.round(Math.max(0, t - lastBiteTs) / MIN)), (mins) => fitFigure(Number(mins) * MIN)),
        h('div', { class: `ring-goal${reached ? ' reached' : ''}`, 'data-testid': 'ring-goal' }, reached ? `Goal of ${goalHours} h reached` : `of your ${goalHours} h goal`)),
      h('div', { class: 'ring-row', 'data-ring-row': 'win', 'data-testid': 'ring-window' },
        ringName('win', 'Window', !!d.win.miss), h('div', { class: `value${d.win.miss ? ' is-miss' : ''}` }, d.winText)),
      h('div', { class: 'ring-row', 'data-ring-row': 'full', 'data-testid': 'ring-fullness' },
        ringName('full', 'Fullness'), h('div', { class: 'value' }, d.fullText))));
  // A goal reached, a window kept, a day left wanting: each celebrated once.
  const moments = [];
  if (reached) moments.push({ key: `fast:${lastBiteTs}:${goalHours}`, kind: 'fast' });
  if (d.e.result === 'success' && d.rec.lastBite) moments.push({ key: `win:${day}:${d.rec.lastBite}`, kind: 'win' });
  if (d.full.frac >= 1) moments.push({ key: `full:${day}`, kind: 'full' });
  return celebrate(wrap, moments);
}

/** How far the fasting goal is, then the next stage: two live rows. */
function ringLines(state, lastBiteTs, goalHours) {
  const reached = state.elapsedMs >= goalHours * HOUR;
  return h('div', { class: 'stage-lines tabular' },
    reached
      ? h('div', { class: 'stage-line', 'data-testid': 'goal-line' }, `Fasting goal of ${goalHours} h reached.`)
      : live('div', { class: 'stage-line', 'data-testid': 'goal-line' }, (t) => {
        const left = goalHours * HOUR - (t - lastBiteTs);
        return left > 0 ? `Fasting goal ${goalHours} h: ${fmtDuration(left)} to go.` : `Fasting goal of ${goalHours} h reached.`;
      }),
    state.next
      ? live('div', { class: 'stage-line', 'data-testid': 'stage-next' },
        (t) => `Next: ${state.next.name.toLowerCase()}, in about ${fmtDuration(Math.max(0, state.next.from * HOUR - (t - lastBiteTs)))}.`)
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

/**
 * The rings lead Today, in one order in every mode that has them: the ring
 * row, the stage chip, then what the caller puts under them (the 16:00
 * warning, the way in), then the fast's two times. day: the day whose window
 * and fullness the rings show. animate: a user action changed a ring.
 */
export function ringHero(ctx, lastBiteTs, { times = null, day = ctx.todayKey, middle = null, animate = false } = {}) {
  const state = fastingState(lastBiteTs, ctx.nowTs);
  return markStage(h('div', { class: 'ring-hero' },
    fastingRing(ctx, state, lastBiteTs, false, goalHoursFor(ctx), day, animate),
    stageChip(state.stage),
    middle,
    times), state, ctx.nowTs);
}

/**
 * The stage card: the stage on its still disc, how far the goal and the next
 * stage are, what happens in it, and the way to the stages. On a day without
 * eating, or while a meal goes on after the window, it holds the smaller
 * rings, the stage chip and the fast's times first; otherwise the rings lead
 * Today above.
 */
export function stagesSection(ctx, app, lastBiteTs, { withRing, times = null, day = ctx.todayKey, animate = false }) {
  if (!lastBiteTs) return null;
  const state = fastingState(lastBiteTs, ctx.nowTs);
  const goalHours = goalHoursFor(ctx);
  return markStage(h('section', { class: `section stage-card-today${withRing ? ' with-ring' : ''}`, 'data-block': 'stages', 'data-stage': state.stage.key },
    withRing ? [fastingRing(ctx, state, lastBiteTs, true, goalHours, day, animate), stageChip(state.stage), times] : null,
    // With the rings, the chip above already names the stage and moves its
    // icon: under the hairline, a quiet count says only where it falls.
    withRing
      ? h('div', { class: 'label stage-count' }, `Stage ${state.index + 1} of ${STAGES.length}`)
      : h('div', { class: 'stage-head' },
        stageDisc(state.stage.key, { size: 48, state: 'now', live: false }),
        h('div', { class: 'stage-head-words' },
          h('div', { class: 'label' }, `Stage ${state.index + 1} of ${STAGES.length}`),
          h('h2', { class: 'stage-title' }, state.stage.name))),
    ringLines(state, lastBiteTs, goalHours),
    h('p', { class: 'stage-text' }, state.stage.text),
    h('div', { class: 'stage-about' }, button('About the stages', () => showStagesSheet(state.stage.key), { kind: 'secondary', name: 'about-stages' })),
  ), state, ctx.nowTs);
}

// The same words as the Week schedule (week.js) for each day's result.
const RESULT_WORD = { success: 'success', miss: 'miss', paused: 'paused', pending: 'in progress', unlogged: 'nothing logged' };

/**
 * The week on Today: Sunday to Saturday, each day's result in the same marks
 * as the schedule, today's name on an ink pill, and a legend naming only the
 * marks in the row. Tap a day to open it.
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
    }, h('span', { class: 'wd' }, weekdayShort(day)), miniRing(result, lw));
  });
  return h('div', { class: 'week-today', 'data-testid': 'today-week' },
    h('div', { class: 'week-row' }, cells),
    legend([
      seen.has('success') ? ['day-success', 'Success'] : null,
      seen.has('miss') ? ['day-miss', 'Miss'] : null,
      seen.has('paused') ? ['day-paused', 'Paused'] : null,
      seen.has('open') ? ['day-open', 'Open or not logged'] : null,
      seen.has('future') ? ['day-ahead', 'Still ahead'] : null,
      seen.has('wanting') ? ['left-wanting', 'Left wanting'] : null,
    ], 'today-week-legend'));
}
