// Fasting stages on Today, and the three rings that lead it. The fast is the
// outer red ring, timed from the last bite (or when the fast began) and
// filling towards the fasting goal; past the goal it laps itself. The green
// ring is the day's eating window and the blue ring its fullness. The stage
// the fast is in sits in the middle of the rings and moves. The stages are
// never a target.

import { h, s, live } from './dom.js';
import { button, durationFigure, legend } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import { HOUR, MIN, fmtDuration, fmtMinutes } from '../core/time.js';
import { fastHoursFor, isFlexible, plannedStartMin } from '../core/rules.js';
import { AUTOPHAGY_NOTE, SOURCES, STAGES, VARIATION_NOTE, fastingState } from '../core/stages.js';
import { STAGE_MORE, citeBy, stageSources } from '../core/stage-more.js';
import { LEFT_WANTING, dayFullness } from '../core/fullness.js';
import { stageGlyph, stageIcon } from './icons.js';
import { celebrate, ringsSvg } from './rings.js';

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

// The hours of each stage, short enough for the line across the sheet.
const SHORT_HOURS = { digesting: '0–4 h', settling: '4–12 h', switch: '12–24 h', ketones: '24–48 h', brain: '48–72 h', sparing: '72 h+' };

/**
 * The stages one at a time: all six along a line across the top, three to
 * a view, the one the fast is in now ringed in the fast's red, and a card for each below,
 * each a shade deeper, from soft grey to ink. Swipe the line, the cards, or tap
 * a stage; the sheet opens on the stage the fast is in now. Read more on a card
 * turns the sheet to that stage's longer page, and Back returns to its card.
 */
export function showStagesSheet(currentKey = null) {
  openSheet((api) => stagesView(api, currentKey, currentKey), { name: 'stages', label: 'Fasting stages' });
}

/** The line and the cards, opened on the stage openKey. */
function stagesView(api, currentKey, openKey) {
  const readMore = (st) => api.replace(() => stageMore(api, st, currentKey));
  const cards = h('ul', { class: 'stage-cards', 'data-testid': 'stage-list' }, STAGES.map((st) => h('li', {
    class: `stage-card s-${st.key}`,
    'data-stage': st.key,
  },
    stageHead(st, currentKey),
    h('h2', { class: 'h2' }, st.name),
    h('p', { class: 'gap-s' }, st.text),
    h('div', { class: 'stage-more-row' }, moreButton(st, readMore)))));
  const stops = STAGES.map((st) => h('button', {
    type: 'button',
    class: `stage-stop${st.key === currentKey ? ' now' : ''}`,
    'data-action': `stage-${st.key}`,
    'aria-label': `${st.name}, ${st.range}${st.key === currentKey ? ', now' : ''}`,
    onclick: () => show(STAGES.indexOf(st), true),
  },
    h('span', { class: `disc s-${st.key}` }, stageGlyph(st.key)),
    h('span', { class: 'name' }, st.name),
    h('span', { class: 'hrs' }, SHORT_HOURS[st.key])));
  // Three stages show at a time; the line swipes on its own, and follows the card shown.
  const line = h('div', { class: 'stage-line', role: 'group', 'aria-label': 'Stages', 'data-testid': 'stage-line' }, h('div', { class: 'stage-track' }, stops));
  const motion = (smooth) => (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto');
  let marked = -1;
  const mark = (i, smooth = true) => {
    // A timer or a frame can outlive the sheet, or the view Read more replaced.
    if (!line.isConnected || !stops[i]) return;
    stops.forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
    if (i === marked) return;
    marked = i;
    const b = stops[i];
    line.scrollTo({ left: b.offsetLeft - (line.clientWidth - b.offsetWidth) / 2, behavior: motion(smooth) });
  };
  const step = () => (cards.children[1] ? cards.children[1].offsetLeft - cards.children[0].offsetLeft : cards.clientWidth);
  const shownCard = () => Math.max(0, Math.min(STAGES.length - 1, Math.round(cards.scrollLeft / step())));
  // While the cards glide to a tapped stage, the line waits for them rather than following each card passed.
  let target = null;
  let settle = 0;
  function show(i, smooth) {
    if (!cards.isConnected) return;
    target = i;
    clearTimeout(settle);
    settle = setTimeout(() => { target = null; mark(shownCard()); }, 800);
    cards.scrollTo({ left: i * step(), behavior: motion(smooth) });
    marked = -1; // a tapped stage is centred even when it is the one marked
    mark(i, smooth);
  }
  // Swiping moves the mark along the line.
  let frame = 0;
  cards.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const i = shownCard();
      if (target !== null && i !== target) return;
      target = null;
      mark(i);
    });
  }, { passive: true });
  const start = Math.max(0, STAGES.findIndex((st) => st.key === openKey));
  stops.forEach((b, j) => b.setAttribute('aria-current', String(j === start)));
  // Open on the stage asked for, once the cards and the line have their width.
  requestAnimationFrame(() => show(start, false));
  return h('div', {},
    sheetHead(api, 'Fasting stages'),
    h('p', {}, 'Typical changes after your last bite, from human studies. Swipe the stages or the cards, or tap a stage. Read more opens the full story of a stage.'),
    line,
    cards,
    h('p', { class: 'small quiet gap' }, VARIATION_NOTE),
    h('section', { class: 'section gap' },
      h('div', { class: 'label' }, 'Autophagy'),
      h('p', { class: 'gap-s', 'data-testid': 'autophagy-note' }, AUTOPHAGY_NOTE)),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Sources'),
      h('ol', { class: 'steps gap-s small' }, SOURCES.map((src) => h('li', {}, h('span', {}, src))))));
}

/** A card's top line: its hours, and Now on the stage the fast is in. */
function stageHead(st, currentKey) {
  return h('div', { class: 'stage-card-head' },
    h('div', { class: 'label' }, st.range),
    st.key === currentKey ? h('span', { class: 'now-badge', 'data-testid': 'stage-now' }, 'Now') : null);
}

function moreButton(st, readMore) {
  const b = button('Read more', () => readMore(st), { kind: 'outline', name: `more-${st.key}` });
  b.setAttribute('aria-label', `Read more about ${st.name}`);
  return b;
}

/**
 * One stage at length: what happens in the body, what the studies found,
 * plain advice, and the studies it draws on, by name only (no links: the
 * app never leaves itself). Back returns to the cards at this stage.
 */
function stageMore(api, st, currentKey) {
  const more = STAGE_MORE[st.key];
  const back = (name) => button('Back to the stages', () => api.replace(() => stagesView(api, currentKey, st.key)), { kind: 'outline', name });
  const part = (label, ...body) => h('section', { class: 'section' }, h('div', { class: 'label' }, label), ...body);
  return h('div', { 'data-testid': 'stage-more', 'data-stage': st.key },
    sheetHead(api, 'Fasting stages'),
    back('stages-back'),
    h('div', { class: `stage-card stage-hero s-${st.key}` },
      stageHead(st, currentKey),
      h('h2', { class: 'h2' }, st.name),
      h('p', { class: 'gap-s' }, st.text)),
    part('What happens', ...more.body.map((t) => h('p', { class: 'gap-s' }, t))),
    part('What the studies found', h('ul', { class: 'findings gap-s', 'data-testid': 'stage-findings' }, more.findings.map((f) => h('li', {},
      h('p', {}, f.text),
      h('p', { class: 'small quiet' }, citeBy(f.by)))))),
    part('Good to know', ...more.good.map((t) => h('p', { class: 'gap-s' }, t))),
    part('Sources', h('ol', { class: 'steps gap-s small' }, stageSources(st.key).map((src) => h('li', {}, h('span', {}, src))))),
    h('div', { class: 'gap' }, back('stages-back-end')));
}
