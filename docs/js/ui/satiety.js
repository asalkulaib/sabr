// Satiety: its own tab, after the person's earlier satiety page. Three views,
// insights first: Insights (the drift and what drives it, four charts,
// findings, a table), Now (the running fullness check and how the day ended)
// and Meals (one list, newest first). Every colour is named in a legend, and
// each way of finishing a meal also has its own shape: a triangle for left
// wanting, a square for satisfied, a diamond for overfull (ink, never orange:
// an overfull meal is not a miss).

import * as C from './palette.js';
import { h, s, live, dimOthers } from './dom.js';
import { button, choice, figureParts, focusLine, key, legend, nowrapTerms, STOP_TEXT } from './components.js';
import * as store from '../store.js';
import { addDays, fmtDayShort, fmtDuration, fmtTime } from '../core/time.js';
import { ON_TIME, STOPS, ZONE, completed, readingKind, satietyStats, stopPoint, stopPointWords } from '../core/satiety.js';
import { satietyInsights } from '../core/insights.js';
import { fullnessCard } from './fullness.js';
import { showAddMealSheet, showFinishMealSheet, showFullnessSheet, showMealEditSheet } from './meal.js';
import { dueFullness, header, mealInProgress, runningFullness } from './shared.js';
import { STOP_MARKS, stopIcon, stopMark } from './icons.js';
import { RING, progressRing } from './rings.js';

const GRID = C.GRID;
const W = 340;
const MIN = 60_000;

// Each way of finishing: its word, colour and shape (the shapes live in icons.js).
export const STOP_STYLE = {
  before_full: { word: 'Left wanting', ...STOP_MARKS.before_full },
  full: { word: 'Satisfied', ...STOP_MARKS.full },
  stuffed: { word: 'Overfull', ...STOP_MARKS.stuffed },
};

/** A small mark centred on (x, y). */
const mark = (stop, x, y, r = 5) => stopMark(stop, { x, y, r });

// A 20-minute reading not taken on time says how it was taken, in a word.
const HOW = { early: 'early', late: 'late', recalled: 'added' };
const howTaken = (m) => HOW[readingKind(m)] || null;

/** The card's ground under a mark, so a line passing behind stops short of it. */
const halo = (x, y, r) => s('circle', { class: 'mark-halo', cx: x, cy: y, r, fill: C.CARD });

export { stopIcon };

// One way of finishing can be shown on its own, across every chart and the
// meal list at once: F holds the choice for the render under way.
let F = { focus: null, pick: () => {}, clear: () => {} };

/** The chips, then the plain keys together on their own row under them. */
function stopLegend(extra = [], testid) {
  const lg = legend([...STOPS.map((k) => [stopIcon(k), STOP_STYLE[k].word, k]), ...extra], testid, { focus: F.focus, onPick: F.pick });
  const plain = [...lg.children].filter((el) => !el.classList.contains('legend-pick'));
  if (plain.length) lg.append(h('div', { class: 'legend-keys' }, plain));
  return lg;
}

/** Fades what is not in focus; tapping a mark, bar, line or its row picks its way of finishing. */
function focusable(svg) {
  const pick = F.pick;
  const focus = F.focus;
  svg.classList.add('pickable');
  svg.addEventListener('click', (e) => {
    // The lag chart's end marks carry their way as data-ends, so they never count as a series of their own.
    const el = e.target.closest('[data-series], [data-ends]');
    const stop = el && (el.dataset.series || el.dataset.ends);
    if (STOPS.includes(stop)) pick(focus === stop ? null : stop);
  });
  return dimOthers(svg, focus);
}

/** A duration token in ms (tokens.css), or the fallback before styles load. */
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? (v.endsWith('ms') ? n : n * 1000) : fallback;
}

/** Whether the person asked for less motion. */
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

/**
 * Motion that plays once a session (the lag lines rising, a new meal's row):
 * it starts the first time it is drawn and carries on through any redraw
 * that comes while it runs, so a redraw never cuts it off or replays it.
 * Returns how far in it is (ms), or null once it has played.
 */
const started = new Map();
function onceIn(id, length) {
  const t = performance.now();
  if (!started.has(id)) started.set(id, t);
  const into = t - started.get(id);
  return into < length ? into : null;
}

// ---------- Insights ----------

/** The number a chart leads with: large digits, small units. */
function lead(parts, testid) {
  return h('div', { class: 'satiety-lead', 'data-testid': testid }, figureParts(parts));
}

/** A row naming what drives the drift, its figure at the right. */
function contributor(label, value, note, testid) {
  return h('div', { class: 'contrib', 'data-testid': testid },
    h('div', {}, h('span', { class: 'contrib-label' }, label), h('span', { class: 'contrib-note' }, note)),
    h('div', { class: 'contrib-figure' }, value));
}

/** A chart's card: its heading, then what it holds. */
const card = (title, ...kids) => h('section', { class: 'section satiety-card' }, h('h2', { class: 'card-title' }, title), ...kids);

const average = (rows, value, weight) => {
  const n = rows.reduce((a, r) => a + weight(r), 0);
  return n ? rows.reduce((a, r) => a + value(r) * weight(r), 0) / n : null;
};

/**
 * Fullness 20 minutes after each meal, with the comfortable zone as a grey
 * band. Its range is read off the scale, never written beside a mark (where
 * it read as a meal's value): the scale counts in twos, the band runs under
 * its 6 and 8, and those two are in ink.
 */
function landingChart(st) {
  const pts = st.landings;
  const HT = 176;
  const P = { top: 10, right: 10, bottom: 24, left: 26 };
  const inner = W - P.left - P.right - 16;
  const y = (v) => P.top + (HT - P.top - P.bottom) * (1 - (v - 1) / 9);
  const x = (i) => P.left + 8 + (pts.length === 1 ? inner / 2 : (inner * i) / (pts.length - 1));
  const grid = [2, 4, 6, 8, 10].flatMap((v) => [
    s('line', { x1: P.left, x2: W - P.right, y1: y(v), y2: y(v), stroke: GRID }),
    s('text', { x: P.left - 8, y: y(v) + 4, 'text-anchor': 'end', class: ZONE.includes(v) ? 'zone-tick' : null }, String(v)),
  ]);
  const top = y(ZONE[1] + 0.5);
  const bottom = y(ZONE[0] - 0.5);
  // The zone is --shade (satiety.css), the same as its key: on this chart blue means left wanting only.
  const band = s('rect', { class: 'zone-band', x: 0, width: W - P.right, y: top, height: bottom - top, fill: C.TRACK, 'data-testid': 'zone-band' });
  const line = s('path', { class: 'meal-line', d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '), fill: 'none', stroke: C.EDGE, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'data-series': 'line' });
  // One target over the plot, under the marks (no data-stop, no data-series):
  // a tap near a mark picks the nearest one's way of finishing, never a later neighbour's.
  // It runs on to the chart's right edge, so a tap just past the latest mark still reaches it.
  const area = s('rect', { class: 'hit landing-area', x: P.left, y: P.top - 8, width: W - P.left, height: HT - P.top - P.bottom + 16, fill: 'transparent' });
  const marks = pts.map((p, i) => mark(p.stop, x(i), y(p.value), 6));
  const unrated = pts.some((p) => !p.stop);
  const svg = focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'data-testid': 'landing-chart',
    'aria-label': `Fullness 20 minutes after each of your last ${pts.length} meals, on a scale of 1 to 10.` },
  band, ...grid, line, area, ...marks,
  s('text', { x: P.left, y: HT - 4 }, `${pts.length} meals ago`), s('text', { x: x(pts.length - 1) + 8, y: HT - 4, 'text-anchor': 'end' }, 'latest')));
  const { focus, pick } = F;
  area.addEventListener('click', (e) => {
    const m = svg.getScreenCTM();
    if (!m || !pts.length) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = null;
    pts.forEach((p, i) => {
      const d = Math.hypot(at.x - x(i), at.y - y(p.value));
      if (d <= 24 && (!best || d < best.d)) best = { p, d };
    });
    // An unrated nearest mark, or none within reach: nothing changes.
    if (best && best.p.stop) pick(focus === best.p.stop ? null : best.p.stop);
  });
  return h('div', { class: 'chart-block' },
    svg,
    // The filter chips for every chart, the table and the meal list, then the plain keys.
    stopLegend([['zone', `Comfortable zone, ${ZONE[0]} to ${ZONE[1]}`], ['line-meal', 'Meal to meal'], unrated ? [key('unrated'), 'Not rated yet'] : null], 'landing-legend'));
}

/** Moves labels apart so none overlap: at least gap units between centres. */
function spread(ys, gap, lo, hi) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length ? order[order.length - 1].y - hi : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  if (order.length && order[0].y < lo) { const d = lo - order[0].y; for (const o of order) o.y += d; }
  const out = [];
  for (const o of order) out[o.i] = o.y;
  return out;
}

/**
 * Places the marks at one post side by side where their values sit close, so
 * no mark hides another: marks closer than `near` units share a row, each
 * `step` apart around the post, in the order of the ways of finishing.
 * Returns each mark's offset from the post.
 */
function dodge(ys, near = 12, step = 14) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const out = ys.map(() => 0);
  let group = [];
  const flush = () => {
    group.sort((a, b) => a.i - b.i).forEach((o, k) => { out[o.i] = (k - (group.length - 1) / 2) * step; });
    group = [];
  };
  for (const o of order) {
    if (group.length && o.y - group[group.length - 1].y >= near) flush();
    group.push(o);
  }
  flush();
  return out;
}

// Between the three lines: the rings' own step.
const lagStep = () => token('--delay-ring-step', 80);
const lagRise = () => token('--dur-chart', 600) + 2 * lagStep();
// The chart waiting to be seen before its lines rise; one at a time.
let lagWatch = null;

/**
 * The 20-minute lag, after the person's earlier page: average fullness right
 * after eating and 20 minutes on, one line per way of finishing, with its mark
 * at both ends. The steeper the line, the more the body was still catching up.
 */
function lagChart(st) {
  const rows = st.byStop.filter((r) => r.rises);
  const HT = 232;
  const P = { top: 36, bottom: 30 };
  const X0 = 116;
  const X1 = 236;
  const y = (v) => P.top + (HT - P.top - P.bottom) * (1 - (v - 1) / 9);
  // Grid lines run between the two posts only: the slope is what counts.
  const grid = [2, 4, 6, 8, 10].map((v) => s('line', { x1: X0, x2: X1, y1: y(v), y2: y(v), stroke: GRID }));
  const posts = [X0, X1].map((px) => s('line', { x1: px, x2: px, y1: y(10) - 6, y2: y(1), stroke: C.EDGE, 'stroke-width': 1 }));
  const leftY = spread(rows.map((r) => y(r.now)), 16, P.top, HT - P.bottom);
  const rightY = spread(rows.map((r) => y(r.at20)), 18, P.top, HT - P.bottom);
  // Marks at both ends of every line. Ends that sit on (nearly) the same value
  // stand side by side across the post, so none hides another; the figures
  // beside the post move out to make room.
  const dx0 = dodge(rows.map((r) => y(r.now)));
  const dx1 = dodge(rows.map((r) => y(r.at20)));
  const room0 = Math.max(0, ...dx0.map((d) => -d));
  const room1 = Math.max(0, ...dx1);
  const leftEnd = X0 - 14 - room0;
  const rightMark = X1 + 16 + room1;
  const step = lagStep();
  // The first time the chart is seen in a session, each line starts flat at
  // its right-after value and rises to its 20-minute value; a redraw while it
  // runs carries on. Until it is seen, the lines wait flat.
  if (lagWatch) { lagWatch.disconnect(); lagWatch = null; }
  const waiting = !still() && !started.has('lag') && typeof IntersectionObserver === 'function';
  const into = waiting ? 0 : still() ? null : onceIn('lag', lagRise());
  const halos = [];
  const ends = [];
  const lines = rows.map((r, i) => {
    const y0 = y(r.now);
    const y1 = y(r.at20);
    const ln = s('line', { x1: X0, y1: y0, x2: X1, y2: y1, stroke: STOP_STYLE[r.stop].line, 'stroke-width': 3, 'stroke-linecap': 'round', 'data-lag': r.stop });
    // The end marks sit above every line (one layer), so no line crosses a mark.
    const startMark = mark(r.stop, X0 + dx0[i], y0, 5.5);
    const endMark = mark(r.stop, X1 + dx1[i], y1, 5.5);
    for (const m of [startMark, endMark]) m.removeAttribute('data-series');
    const startHalo = halo(X0 + dx0[i], y0, 7);
    const endHalo = halo(X1 + dx1[i], y1, 7);
    halos.push(startHalo, endHalo);
    ends.push(s('g', { class: `lag-ends${F.focus && F.focus !== r.stop ? ' faded' : ''}`, 'data-ends': r.stop }, startMark, endMark));
    const label = s('g', { class: 'lag-label' },
      mark(r.stop, rightMark, rightY[i], 4),
      s('text', { x: rightMark + 10, y: rightY[i] + 4.5, class: 'chart-end lag-value' }, `${r.at20.toFixed(1)} `, s('tspan', { class: 'rise' }, signed(r.rise))));
    if (into != null) {
      // The rise shows as the line climbs, so a waiting chart never reads ahead of its lines.
      label.classList.add('lag-label-in');
      label.style.setProperty('--delay', `${i * step - into}ms`);
    }
    if (into != null && Math.abs(y0 - y1) > 0.5) {
      ln.classList.add('lag-rise', y1 < y0 ? 'up' : 'down');
      ln.style.setProperty('--skew', `${(Math.atan((y0 - y1) / (X1 - X0)) * 180) / Math.PI}deg`);
      for (const el of [endHalo, endMark]) {
        el.classList.add('lag-end');
        el.style.setProperty('--drop', `${y0 - y1}px`);
      }
      for (const el of [ln, endHalo, endMark]) el.style.setProperty('--delay', `${i * step - into}ms`);
    }
    return s('g', { 'data-series': r.stop },
      ln,
      mark(r.stop, leftEnd - 34, leftY[i], 4),
      s('text', { x: leftEnd, y: leftY[i] + 4.5, 'text-anchor': 'end', class: 'chart-end lag-value' }, r.now.toFixed(1)),
      label);
  });
  // The target: one area under every line and mark, with no data-series. A
  // tap off the lines picks the nearest way of finishing: its line between
  // the posts, its figure beside them.
  const area = s('rect', { class: 'hit lag-area', x: 0, y: P.top - 16, width: W, height: HT - P.top - P.bottom + 24, fill: 'transparent' });
  const nearest = (px, py) => {
    const gap = (r, i) => {
      if (px <= X0) return Math.abs(py - leftY[i]);
      if (px >= X1) return Math.abs(py - rightY[i]);
      return Math.abs(py - (y(r.now) + ((y(r.at20) - y(r.now)) * (px - X0)) / (X1 - X0)));
    };
    return rows.reduce((best, r, i) => (best == null || gap(r, i) < best.d ? { stop: r.stop, d: gap(r, i) } : best), null);
  };
  const words = rows.map((r) => `${STOP_STYLE[r.stop].word}: ${r.now.toFixed(1)} right after, ${r.at20.toFixed(1)} after 20 minutes`).join('. ');
  const svg = focusable(s('svg', { class: `chart${waiting ? ' waiting' : ''}`, viewBox: `0 0 ${W} ${HT}`, role: 'img', 'data-testid': 'lag-chart', 'aria-label': `Average fullness right after eating and 20 minutes on. ${words}.` },
    ...grid, ...posts,
    s('text', { class: 'col-head', x: X0, y: 14, 'text-anchor': 'middle' }, 'right after'),
    s('text', { class: 'col-head', x: X1, y: 14, 'text-anchor': 'middle' }, 'after 20 min'),
    area, ...lines, ...halos, ...ends,
    s('text', { x: 0, y: HT - 4 }, 'average fullness, 1 to 10, by how you stopped')));
  const { focus, pick } = F;
  area.addEventListener('click', (e) => {
    const m = svg.getScreenCTM();
    if (!m || !rows.length) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const hit = nearest(p.x, p.y);
    if (hit) pick(focus === hit.stop ? null : hit.stop);
  });
  if (waiting) {
    // Half the chart in view: the session's rise starts now.
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) return;
      watch.disconnect();
      if (lagWatch === watch) lagWatch = null;
      onceIn('lag', lagRise());
      svg.classList.remove('waiting');
    }, { threshold: [0, 0.5] });
    watch.observe(svg);
    lagWatch = watch;
  }
  return h('div', { class: 'chart-block' },
    svg,
    legend(rows.map((r) => [stopIcon(r.stop), `${STOP_STYLE[r.stop].word} (${r.rises})`, r.stop]), 'lag-legend', { focus: F.focus, onPick: F.pick }));
}

/** How often each way of finishing happens: one share bar, then a labelled row per way. */
function stopChart(st) {
  const BAR = 24;
  const ROW = 44;
  const TOP = BAR + 16;
  const HT = TOP + ROW * st.byStop.length;
  const total = st.byStop.reduce((a, r) => a + r.count, 0);
  const shown = st.byStop.filter((r) => r.count);
  const room = W - 2 * Math.max(0, shown.length - 1); // 2u of page between segments
  let at = 0;
  const seg = {};
  for (const r of shown) {
    const width = total ? (room * r.count) / total : 0;
    seg[r.stop] = { x: at, width };
    at += width + 2;
  }
  // The rules between rows stay outside the rows, so a faded row never fades them.
  const rules = st.byStop.slice(1).map((r, i) => s('line', { class: 'row-rule', x1: 0, x2: W, y1: TOP + (i + 1) * ROW, y2: TOP + (i + 1) * ROW, stroke: GRID }));
  return focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Number of meals by how they ended.', 'data-testid': 'stop-chart' },
    ...rules,
    ...st.byStop.map((r, i) => {
      const top = TOP + i * ROW;
      const cy = top + ROW / 2;
      const way = STOP_STYLE[r.stop];
      const sg = seg[r.stop];
      return s('g', { 'data-series': r.stop },
        // The whole row and its segment are tap targets, drawn first: 48 units, 44 px in the card.
        s('rect', { class: 'hit', x: 0, y: top - 2, width: W, height: ROW + 4, fill: 'transparent' }),
        sg ? s('rect', { class: 'hit', x: sg.x, y: 0, width: sg.width, height: BAR, fill: 'transparent' }) : null,
        sg ? s('rect', { class: 'share', x: (sg.x + 0.5).toFixed(1), y: 0.5, width: Math.max(0, sg.width - 1).toFixed(1), height: BAR - 1, rx: 4, fill: way.colour, stroke: way.edge, 'stroke-width': 1 }) : null,
        mark(r.stop, 9, cy, 6),
        s('text', { class: 'row-word', x: 26, y: cy + 5 }, way.word),
        s('text', { class: 'chart-end', x: W, y: cy + 4.5, 'text-anchor': 'end' }, `${r.count} (${Math.round(r.share * 100)}%)`));
    })));
}

/** Arriving hungry: each way of finishing on its own 1 to 10 rail, its mark at the mean. */
function hungerChart(st) {
  const ROW = 44;
  const HT = ROW * st.byStop.length + 22;
  const R0 = 128;
  const R1 = 280;
  const x = (v) => R0 + ((R1 - R0) * (v - 1)) / 9;
  return focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Average hunger before meals, by how they ended.', 'data-testid': 'hunger-chart' },
    ...st.byStop.map((r, i) => {
      const cy = i * ROW + ROW / 2;
      const has = r.hunger != null;
      return s('g', { 'data-series': r.stop },
        s('rect', { class: 'hit', x: 0, y: i * ROW - 2, width: W, height: ROW + 4, fill: 'transparent' }),
        mark(r.stop, 9, cy, 6),
        s('text', { class: 'row-word', x: 26, y: cy + 5 }, STOP_STYLE[r.stop].word),
        has ? s('line', { class: 'rail', x1: R0, x2: R1, y1: cy, y2: cy, stroke: C.TRACK, 'stroke-width': 4, 'stroke-linecap': 'round' }) : null,
        has ? halo(x(r.hunger), cy, 10) : null,
        has ? mark(r.stop, x(r.hunger), cy, 7) : null,
        has
          ? s('text', { class: 'chart-end', x: W, y: cy + 4.5, 'text-anchor': 'end' }, `${r.hunger.toFixed(1)} (${r.hungers})`)
          : s('text', { x: R0, y: cy + 4.5 }, 'not enough yet'));
    }),
    ...[1, 5, 10].flatMap((v) => [
      s('line', { x1: x(v), x2: x(v), y1: HT - 22, y2: HT - 17, stroke: C.EDGE }),
      s('text', { x: x(v), y: HT - 3, 'text-anchor': 'middle' }, String(v)),
    ])));
}

/** A chart's one-line caption. */
const caption = (words) => h('p', { class: 'chart-note' }, nowrapTerms(words));

/**
 * The quiet line under the drift: the on-time checks every 20-minute figure
 * rests on, and the readings left out, by how they were taken ("3 late,
 * 1 early, 2 added"). Nothing is said while none is left out.
 */
function basisLine(st) {
  const out = st.leftOut;
  if (!out.total) return null;
  // Each count stays on one line with its word.
  const kinds = [[out.late, 'late'], [out.early, 'early'], [out.recalled, 'added']].filter(([n]) => n)
    .map(([n, word], i) => [i ? ', ' : '', h('span', { class: 'nowrap' }, `${n} ${word}`)]);
  return h('p', { class: 'hero-basis', 'data-testid': 'drift-basis' },
    st.done ? ['From ', h('span', { class: 'nowrap' }, `${st.done} on-time ${st.done === 1 ? 'check' : 'checks'}`), '. '] : null,
    'Left out: ', kinds, '.');
}

/** Words with the comfortable zone ("6 to 8") kept on one line. */
function keepZone(text) {
  const range = `${ZONE[0]} to ${ZONE[1]}`;
  return text.split(range).flatMap((part, i) => (i ? [h('span', { class: 'nowrap' }, range), part] : [part]));
}

/** Under Meals complete: the meals still missing a reading, and those whose 20-minute one was not on time. */
function completeNote(st) {
  if (st.done === st.meals) return 'Every meal has both readings.';
  const missing = st.meals - st.done - st.leftOut.total;
  if (!st.leftOut.total) return `${missing} still missing the 20-minute check.`;
  return missing
    ? `${missing} still missing the 20-minute check, ${st.leftOut.total} not checked on time.`
    : `${st.leftOut.total} not checked on time.`;
}


function insightsView(ctx, app, st) {
  if (!st.rated) {
    // Nothing rated yet: no key, since there is nothing for it to key.
    return h('div', { class: 'satiety-empty insights-empty', 'data-block': 'satiety-insights' },
      h('p', { class: 'empty-message' }, 'Your insights start with your first rated meal.'), ' ',
      h('p', { class: 'empty-how' }, nowrapTerms('Finish a meal and rate how it ended, then answer the fullness check 20 minutes later.')));
  }
  const pct = (n, d) => (d ? figureParts([[Math.round((n / d) * 100), '%']]) : 'none');
  // What each chart leads with.
  const landing = st.landings.length ? st.landings.reduce((a, p) => a + p.value, 0) / st.landings.length : null;
  const wanting = st.byStop.find((r) => r.stop === 'before_full');
  const hunger = average(st.byStop.filter((r) => r.hungers), (r) => r.hunger, (r) => r.hungers);
  const climbing = st.drift != null && st.drift >= 1.5;
  // Where to stop, read off the person's own on-time checks: the note's second sentence, climbing or not.
  const point = stopPointWords(stopPoint(ctx.meals));
  const note = st.drift == null
    ? (st.leftOut.total ? `Needs a fullness check answered ${ON_TIME[0]} to ${ON_TIME[1]} minutes after a meal.` : 'Needs a meal with both fullness readings.')
    : climbing ? 'Fullness keeps climbing after you stop.' : 'How much fullness rises in the 20 minutes after a meal.';
  return h('div', { 'data-block': 'satiety-insights' },
    // The hero: the drift on the page, the checks it rests on, what it means and
    // where to stop, then what drives it.
    h('section', { class: 'satiety-hero' },
      h('div', { class: 'hero-label' }, 'Satiety drift'),
      h('div', { class: `hero-figure${st.drift == null ? ' none' : ''}`, 'data-testid': 'tile-drift' },
        st.drift == null ? 'not yet' : figureParts([[signed(st.drift), ' pts']])),
      basisLine(st),
      h('p', { class: climbing ? 'hero-note climbing' : 'hero-note', 'data-testid': 'drift-note' },
        nowrapTerms(note),
        point ? [' ', h('span', { class: 'stop-point', 'data-testid': 'stop-point' }, keepZone(point))] : null),
      h('div', { class: 'group contrib-group' },
        contributor('Landed in zone', figureParts([[st.landed, ` of ${st.done}`]]), `Meals that ended between ${ZONE[0]} and ${ZONE[1]} out of 10.`, 'tile-zone'),
        contributor('Meals complete', figureParts([[st.done, ` of ${st.meals}`]]), nowrapTerms(completeNote(st)), 'tile-complete'),
        contributor('Stopped past full', pct(st.pastFull, st.rated), st.pastFull ? 'Share of rated meals that ended overfull.' : 'You have not ended a meal overfull.', 'tile-past'))),
    card('Where you land',
      landing != null ? lead([[landing.toFixed(1), ' of 10']], 'lead-landing') : null,
      caption('Average fullness 20 minutes after a meal, over the meals below. Each point is one meal; the shaded band is your comfortable zone, and the shape and colour show how the meal ended.'),
      st.landings.length ? landingChart(st) : h('p', { class: 'chart-wait' }, 'Answer one fullness check and your first point appears here.')),
    card('The 20-minute lag',
      st.drift != null ? lead([[signed(st.drift), ' pts']], 'lead-lag') : null,
      caption('The average rise in fullness over the 20 minutes after a meal. Below, by how you stopped: fullness right after and 20 minutes later. The steeper the line, the more your body was still catching up; the figure on the right is the rise.'),
      st.done ? lagChart(st) : h('p', { class: 'chart-wait' }, 'Answer one fullness check and the lines appear here.')),
    card('How often you stop where',
      lead([[wanting.count, ` of ${st.rated}`]], 'lead-stops'),
      caption('Meals you left wanting, the goal, out of every rated meal. Below, how often you stop each way.'),
      h('div', { class: 'chart-block' }, stopChart(st))),
    card('Arriving hungry',
      hunger != null ? lead([[hunger.toFixed(1), ' of 10']], 'lead-hunger') : null,
      caption('Average hunger before a meal, 1 to 10. Below, by how the meal ended.'),
      h('div', { class: 'chart-block' }, hungerChart(st))),
    findings(ctx),
    app.ui.showSatietyTable ? h('div', { class: 'section table-card' }, mealTable(ctx)) : null,
    h('div', { class: 'table-toggle' },
      button(app.ui.showSatietyTable ? 'Hide the table' : 'Show as a table', () => { app.ui.showSatietyTable = !app.ui.showSatietyTable; app.refresh(); }, { kind: 'secondary', name: 'satiety-table' })));
}

function findings(ctx) {
  const found = satietyInsights(ctx.meals);
  return h('section', { class: 'findings' },
    h('h2', { class: 'group-title' }, 'From your meals'),
    found.length
      ? h('ul', { class: 'plain finding-list', 'data-testid': 'insights' }, found.map((f) => h('li', {}, f)))
      : h('p', { class: 'findings-empty', 'data-testid': 'insights' }, 'Rate how ten meals finished and your own patterns show here.'));
}

function mealTable(ctx) {
  const rows = ctx.meals.filter((m) => completed(m) && (!F.focus || m.stop === F.focus)).sort((a, b) => b.startedAt - a.startedAt);
  return h('table', { class: 'table', 'data-testid': 'satiety-table' },
    h('thead', {}, h('tr', {}, ['Meal', 'Hunger', 'Right after', '20 min', 'Drift'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows.map((m) => {
      const how = howTaken(m);
      return h('tr', {},
        // Two lines that read as one: "Fri 25 Sep, left wanting".
        h('td', { class: 'meal-cell' },
          h('span', { class: 'meal-date' }, fmtDayShort(m.day)),
          h('span', { class: 'sr-only' }, ', '),
          h('span', { class: 'meal-stop' }, STOP_TEXT[m.stop] || 'not rated')),
        h('td', {}, m.hungerBefore ?? ''), h('td', {}, m.fullnessNow),
        // A reading not taken on time says so under it: "7, late".
        h('td', {}, m.fullness20, how ? [h('span', { class: 'sr-only' }, ', '), h('span', { class: 'read-how' }, how)] : null),
        h('td', { class: 'drift-cell' }, signed(m.fullness20 - m.fullnessNow)));
    })));
}

// ---------- Now ----------

// Checks whose dial has pulsed on coming due: each pulses once.
const pulsed = new Set();

/** The minutes left on a check, rounded as its words round them. */
const minutesLeft = (m, t) => Math.max(0, Math.round((m.fullness20DueAt - t) / MIN));
const checkWords = (m, t) => (m.fullness20DueAt > t ? `Check in ${fmtDuration(m.fullness20DueAt - t)}.` : 'Time to score it.');

/** The first check waiting: a dial counting down its 20 minutes, the meal, and its button. */
function checkHero(app, m) {
  const total = Math.max(MIN, m.fullness20DueAt - (m.finishedAt || m.fullness20DueAt - 20 * MIN));
  const size = RING.md.size;
  const stroke = RING.md.stroke;
  const dial = progressRing({ size, stroke, frac: 0 });
  // Five-minute ticks in hairline across the track, under the arc: the arc
  // covers them as it passes, so a due check is one closed ring (none at 12).
  const c = size / 2;
  const r = c - stroke / 2;
  const ticks = Math.round(total / (5 * MIN));
  for (let k = 1; k < ticks; k++) {
    const a = (k * 2 * Math.PI) / ticks;
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    dial.insertBefore(s('line', { class: 'dial-tick', x1: c + sx * (r - stroke / 2), y1: c + sy * (r - stroke / 2), x2: c + sx * (r + stroke / 2), y2: c + sy * (r + stroke / 2), stroke: GRID, 'stroke-width': 2 }), dial.querySelector('.progress-arc'));
  }
  const score = button('Score my fullness now', () => showFullnessSheet(app, m.id), { kind: 'secondary', name: 'score-now' });
  const hero = h('section', { class: 'check-hero', 'data-testid': 'fullness-check' });
  let wasDue = null;
  const centre = live('div', { class: 'dial-figure', 'aria-hidden': 'true' }, (t) => {
    const due = m.fullness20DueAt <= t;
    dial.set(due ? 1 : Math.min(1, Math.max(0, 1 - (m.fullness20DueAt - t) / total)));
    if (due !== wasDue) {
      const before = wasDue;
      wasDue = due;
      hero.classList.toggle('due', due);
      // Due: the button becomes the one main action.
      score.className = due ? 'btn block' : 'btn-2';
      // A check that comes due while in view pulses once; one already due stays still.
      if (due && before === false && !pulsed.has(m.id)) {
        pulsed.add(m.id);
        hero.classList.add('pulse');
      }
    }
    // The minutes left: at 0 once it is due.
    return String(due ? 0 : minutesLeft(m, t));
  }, (v) => figureParts([[v, ' min']]));
  hero.append(
    h('div', { class: 'check-grid' },
      h('div', { class: 'dial' }, dial, centre),
      h('div', { class: 'check-words' },
        h('div', { class: 'check-label' }, 'Fullness check'),
        h('p', { class: 'check-meal' }, `${m.name || 'A meal'}, finished ${fmtTime(m.finishedAt)}. `),
        live('p', { class: 'check-left' }, (t) => checkWords(m, t)))),
    h('div', { class: 'check-action' }, score));
  return hero;
}

/** Each further check: a row with its own button. */
function checkRow(app, m) {
  return h('div', { class: 'check-row', 'data-testid': 'fullness-check' },
    h('p', {}, h('span', { class: 'check-row-meal' }, `${m.name || 'A meal'}, finished ${fmtTime(m.finishedAt)}. `),
      live('span', { class: 'check-row-left' }, (t) => checkWords(m, t))),
    h('div', { class: 'check-row-action' }, button('Score my fullness now', () => showFullnessSheet(app, m.id), { kind: 'secondary', name: 'score-now' })));
}

function nowView(ctx, app) {
  const { mode, rec } = ctx.mode;
  const day = rec && (mode === 'open' || mode === 'forgot' || mode === 'closed') ? rec.day : ctx.todayKey;
  const eating = mealInProgress(ctx, day);
  const checks = [...dueFullness(ctx), ...runningFullness(ctx)];
  return h('div', { 'data-block': 'satiety-now' },
    checks.length
      ? [checkHero(app, checks[0]), checks.length > 1 ? h('div', { class: 'group check-group' }, checks.slice(1).map((m) => checkRow(app, m))) : null]
      : [h('div', { class: 'check-label' }, 'Fullness check'), h('p', { class: 'check-none' }, nowrapTerms('No check waiting. Finish a meal and its 20-minute check appears here.'))],
    eating
      ? h('section', { class: 'card tint-win eating-card', 'data-block': 'eating' },
        h('p', { class: 'eating-line' }, `Eating: ${eating.name || 'a meal'}, since ${fmtTime(eating.startedAt)}.`),
        h('div', { class: 'eating-action' }, button('Finished this meal', () => showFinishMealSheet(app, eating.id), { kind: 'win', block: true, name: 'finish-meal' })))
      : null,
    fullnessCard(ctx, day));
}

// ---------- Meals ----------

// The newest meal id when Add a meal was tapped here, so the meal it adds
// can show itself once in the list.
let addedAfter = null;
// The meals showing themselves, so a redraw while the shade fades carries on.
const fresh = new Set();

/**
 * Hunger before, fullness right after, fullness at 20 minutes: the last in
 * ink, the drift under it. A 20-minute reading not taken on time says how,
 * in a word before the drift: "late +2.0".
 */
function readings(m) {
  const v = (x) => String(x ?? '–');
  const how = howTaken(m);
  return h('span', { class: 'item-side readings' },
    h('span', { class: 'reads' },
      h('span', { class: 'read-quiet' }, v(m.hungerBefore)), ' → ',
      h('span', { class: 'read-quiet' }, v(m.fullnessNow)), ' → ',
      h('span', { class: 'read-ink' }, v(m.fullness20))),
    how || completed(m)
      ? h('span', { class: 'read-foot' },
        how ? h('span', { class: 'read-how' }, ` ${how}`) : null,
        completed(m) ? h('span', { class: 'drift' }, ` ${signed(m.fullness20 - m.fullnessNow)}`) : null)
      : null);
}

function mealRow(app, m) {
  const li = h('li', {},
    h('button', { type: 'button', class: 'item meal-entry', 'data-meal': String(m.id), onclick: () => showMealEditSheet(app, m.id) },
      h('span', { class: 'item-lead' }, key(m.stop ? `stop-${m.stop}` : 'unrated', { size: 16 })),
      h('span', { class: 'meal-main' },
        h('span', { class: 'item-title' }, `${fmtTime(m.startedAt)} ${m.name || 'Meal'}`),
        h('span', { class: 'item-meta' }, m.stop ? STOP_STYLE[m.stop].word : 'Not rated', m.outside ? h('span', { class: 'outside-words' }, ', outside the window') : null)),
      readings(m)));
  if (addedAfter != null && Number(m.id) > addedAfter) fresh.add(m.id);
  if (fresh.has(m.id)) {
    const into = onceIn(`added:${m.id}`, token('--dur-spin', 1100));
    if (into != null) {
      li.classList.add('fresh');
      li.style.setProperty('--delay', `${-into}ms`);
    } else fresh.delete(m.id);
  }
  return li;
}

function mealsView(ctx, app) {
  const from = addDays(ctx.todayKey, -29);
  const recent = ctx.meals.filter((m) => m.day >= from && (!F.focus || m.stop === F.focus)).sort((a, b) => b.startedAt - a.startedAt);
  if (!recent.length && F.focus) {
    return h('div', { 'data-block': 'satiety-meals' },
      h('div', { class: 'meals-key' }, stopLegend([], 'meals-legend')),
      h('p', { class: 'meals-empty' }, `No ${STOP_STYLE[F.focus].word.toLowerCase()} meals in the last 30 days.`));
  }
  if (!recent.length) {
    // Nothing listed: no key, since there is nothing for it to key.
    return h('div', { class: 'satiety-empty', 'data-block': 'satiety-meals' },
      h('p', { class: 'empty-message' }, 'No meals in the last 30 days.'), ' ',
      h('p', { class: 'empty-how' }, 'Start a meal from Today, or add one you already ate, and it collects here, newest first.'));
  }
  const days = [...new Set(recent.map((m) => m.day))];
  return h('div', { 'data-block': 'satiety-meals' },
    h('div', { class: 'meals-key' },
      stopLegend([[key('unrated'), 'Not rated yet']], 'meals-legend'),
      // Each arrow ends the reading before it, so a line never starts with one.
      h('p', { class: 'meals-reading' }, 'Each meal reads ',
        h('span', { class: 'nowrap' }, 'hunger before →'), ' ',
        h('span', { class: 'nowrap' }, 'fullness right after →'), ' ',
        h('span', { class: 'nowrap' }, 'fullness 20 minutes on;'), ' the last figure is the drift.')),
    days.map((d) => h('section', { class: 'meal-day', 'data-day': d },
      h('h3', { class: 'meal-day-head' }, fmtDayShort(d)),
      h('ul', { class: 'meal-list' }, recent.filter((m) => m.day === d).map((m) => mealRow(app, m))))));
}

// ---------- The tab ----------

const VIEWS = [{ value: 'insights', label: 'Insights' }, { value: 'now', label: 'Now' }, { value: 'meals', label: 'Meals' }];

// Whether the last Satiety drawn had the focus bar: it eases in only when it first appears.
let barShown = false;

/** Show all: everything shows again, and the bar fades out before the page redraws. */
function leave(bar) {
  const { pick, clear } = F;
  if (still() || bar.classList.contains('leaving')) { pick(null); return; }
  // The choice is cleared now, so a redraw during the fade draws everything with no bar.
  clear();
  bar.classList.remove('enter');
  bar.classList.add('leaving');
  let done = false;
  const go = () => { if (!done) { done = true; if (bar.isConnected) pick(null); } };
  bar.addEventListener('animationend', go, { once: true });
  setTimeout(go, token('--dur-fast', 160) + token('--dur-press', 100));
}

/** The focus bar above the tabs: the chosen way's mark, what shows, and Show all. */
function focusBar(focus) {
  const bar = focusLine(`Charts and meals show ${STOP_STYLE[focus].word.toLowerCase()} only.`, () => leave(bar), 'satiety-focus');
  bar.classList.add('focus-bar');
  if (!barShown) bar.classList.add('enter');
  bar.prepend(key(`stop-${focus}`));
  return bar;
}

export function renderSatiety(ctx, app) {
  // Add a meal marks only the meal its own sheet saves (drawn while the sheet
  // closes): once that sheet is gone, the mark is spent.
  if (!document.querySelector('[data-sheet="add-meal"]')) addedAfter = null;
  const view = VIEWS.some((v) => v.value === ctx.settings.satietyView) ? ctx.settings.satietyView : 'insights';
  const focus = STOPS.includes(app.ui.satietyFocus) ? app.ui.satietyFocus : null;
  F = { focus, pick: (stop) => { app.ui.satietyFocus = stop; app.refresh(); }, clear: () => { app.ui.satietyFocus = null; } };
  const st = satietyStats(ctx.meals);
  // A check running or due puts a dot after Now.
  const waiting = dueFullness(ctx).length + runningFullness(ctx).length > 0;
  const options = VIEWS.map((v) => (v.value === 'now' && waiting ? { ...v, label: h('span', { class: 'now-label' }, v.label, h('span', { class: 'dot', 'aria-hidden': 'true' })) } : v));
  const addMeal = () => {
    addedAfter = ctx.meals.reduce((a, m) => Math.max(a, Number(m.id) || 0), 0);
    return showAddMealSheet(app);
  };
  const focused = !!focus && view !== 'now';
  const bar = focused ? focusBar(focus) : null;
  barShown = focused;
  return h('div', { class: `satiety${focused ? ' focused' : ''}`, 'data-view': view },
    header(ctx, app, { title: 'Satiety' }),
    // The summary on every view, and Add a meal: a meal already eaten, added whole with no timer.
    h('div', { class: 'satiety-summary' },
      h('p', { class: 'summary-line', 'data-testid': 'satiety-count' },
        nowrapTerms(st.rated ? `${st.rated} rated ${st.rated === 1 ? 'meal' : 'meals'}; ${st.done} with the 20-minute check.` : 'How your meals end, and what 20 minutes changes.')),
      button('Add a meal', addMeal, { kind: 'outline', name: 'add-meal' })),
    h('div', { class: 'page-switch' }, choice({ options, value: view, cols: 3, name: 'satiety-view', ariaLabel: 'Satiety views', onChange: (v) => store.setSettings({ satietyView: v }) })),
    h('div', { class: 'satiety-content' },
      view === 'insights' ? insightsView(ctx, app, st) : view === 'now' ? nowView(ctx, app) : mealsView(ctx, app)),
    bar);
}
