// The three rings: the day at a glance, in the manner of activity rings.
// Outside, red: the fast, filling towards its goal and lapping past it.
// Middle, green: the eating window, filling as it is used and closed full
// when the day succeeds. Inside, blue: fullness, closed when every meal of
// the day was left wanting. A miss is never colour alone: its ring is
// orange stripes, and the words beside the rings say so.
//
// Every arc is a full circle path from 12 o'clock with pathLength 1, so a
// value is only a dash offset (1 - frac): the path never changes, and an arc
// can draw to its value by moving that offset.

import { s } from './dom.js';
import { hatch } from './icons.js';
import * as P from './palette.js';

/**
 * Every ring in the app, size and stroke in px: the same numbers as the
 * --ring-* tokens in css/tokens.css (a unit test keeps them equal).
 */
export const RING = {
  key: { size: 14, stroke: 3 },
  mark: { size: 28, stroke: 4 },
  inline: { size: 56, stroke: 6 },
  md: { size: 120, stroke: 12 },
  hero: { size: 184, stroke: 18 },
  focus: { size: 224, stroke: 14 },
};

/** Room round a ring picture for its rays (--ring-ray-room). */
const RAY_ROOM = 16;

const strokeFor = (size) => (Object.values(RING).find((r) => r.size === size) || { stroke: Math.max(2, Math.round(size / 10)) }).stroke;

const KIND = {
  fast: { color: P.FAST, soft: P.FAST_SOFT, deep: P.FAST_DEEP },
  win: { color: P.WIN, soft: P.WIN_SOFT, deep: P.WIN_TEXT },
  full: { color: P.FULL, soft: P.FULL_SOFT, deep: P.FULL_TEXT },
};
const ORDER = ['fast', 'win', 'full'];

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A point on a circle; 0 at the top, turning clockwise, in turns. */
function at(cx, cy, r, turn) {
  const a = (turn - 0.25) * 2 * Math.PI;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, from, to) {
  const [x0, y0] = at(cx, cy, r, from);
  const [x1, y1] = at(cx, cy, r, to);
  const large = to - from > 0.5 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** A full circle as a path that starts at 12 o'clock and runs clockwise. */
function circlePath(cx, cy, r) {
  return `M${cx} ${(cy - r).toFixed(2)}A${r} ${r} 0 1 1 ${(cx - 0.001).toFixed(3)} ${(cy - r).toFixed(2)}Z`;
}

/** An arc to frac of a turn, drawn by dash offset. */
function dashArc(cx, cy, r, w, stroke, frac, extra = {}) {
  return s('path', {
    d: circlePath(cx, cy, r),
    pathLength: 1,
    fill: 'none',
    stroke,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-dasharray': '1 1',
    'stroke-dashoffset': (1 - Math.max(0, Math.min(1, frac))).toFixed(4),
    ...extra,
  });
}

// A draw already under way when the picture is drawn again (a redraw just
// after the app starts, say) carries on from where it stands: its delay is
// pulled back by the time since it began.
let since = 0;

const delayOf = (step, after) => `calc(var(--delay-ring-step) * ${step} + var(--dur-chart) * ${after} - ${Math.round(since)}ms)`;

/** Starts an arc's draw from fromFrac, after `step` ring steps (and `after` draws). */
function drawFrom(el, fromFrac, step = 0, after = 0) {
  el.classList.add('ring-draw');
  el.style.setProperty('--from', (1 - Math.max(0, Math.min(1, fromFrac))).toFixed(4));
  el.style.setProperty('--delay', delayOf(step, after));
  return el;
}

function fadeFrom(el, step = 0, after = 0) {
  el.classList.add('ring-fade');
  el.style.setProperty('--delay', delayOf(step, after));
  return el;
}

// ---------- Drawing to a value ----------

// The last frac drawn for each ring of each picture size this session. A ring
// draws from empty on its first paint, from its old value after a user
// action (the caller passes animate), and not at all on a clock tick.
const drawn = new Map(); // id -> { frac, from, at }
const drawnOnce = new Map(); // key -> when it first drew
const DRAW_MS = 1600; // longer than any draw: the steps, the ring and its lap

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Where a ring draws from (a frac), or null; sets `since` for a draw under way. */
function drawPlan(id, frac, animate) {
  const prev = drawn.get(id);
  const t = nowMs();
  since = 0;
  if (reduced()) {
    drawn.set(id, { frac, from: null, at: t });
    return null;
  }
  if (!prev) {
    drawn.set(id, { frac, from: 0, at: t });
    return 0;
  }
  if (animate && Math.abs(prev.frac - frac) > 0.0005) {
    drawn.set(id, { frac, from: prev.frac, at: t });
    return prev.frac;
  }
  if (prev.from != null && Math.abs(prev.frac - frac) < 0.002 && t - prev.at < DRAW_MS) {
    since = t - prev.at;
    return prev.from;
  }
  drawn.set(id, { frac, from: null, at: t });
  return null;
}

/** True while a picture with this key draws for the first time this session. */
function firstShow(key) {
  since = 0;
  if (key == null || reduced()) return false;
  const t = nowMs();
  if (!drawnOnce.has(key)) {
    drawnOnce.set(key, t);
    return true;
  }
  const at = drawnOnce.get(key);
  if (t - at < DRAW_MS) {
    since = t - at;
    return true;
  }
  return false;
}

/**
 * How much of a turn an arc may show and still read as open: its round caps
 * reach half a stroke past each end, so short of a full turn the arc stops
 * where a 2px gap stays clear at 12 o'clock. A ring closes only at frac 1.
 */
const openMost = (r, w) => 1 - (w + 2) / (2 * Math.PI * r);
const shownFrac = (frac, r, w) => (frac >= 1 ? 1 : Math.min(frac, openMost(r, w)));

/** True when an arc this long is shorter than its own stroke is wide. */
const tooShort = (frac, r, w) => frac * 2 * Math.PI * r < w;

/** A disc the width of the stroke at the head of an arc of frac. */
function headDisc(c, r, w, frac, fill, extra = {}) {
  const [x, y] = at(c, c, r, frac);
  return s('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: w / 2, fill, stroke: 'none', ...extra });
}

/**
 * One ring. value: { frac, miss, testid, hours }. Past a whole turn the ring
 * laps itself: the full ring, then the current lap, (frac - 1) mod 1, in a
 * deeper shade, butt at 12 o'clock with a disc at its head that shows where
 * it stands. An arc shorter than its stroke is only that disc (the window,
 * nothing until it is a stroke long). A miss is
 * stripes to its value (the whole ring at 1), fading in rather than drawing.
 */
function oneRing(c, r, w, kind, value, from, step) {
  const k = KIND[kind];
  const out = [s('circle', { cx: c, cy: c, r, fill: 'none', stroke: k.soft, 'stroke-width': w })];
  const frac = Math.max(0, value.frac || 0);
  const tag = { 'data-testid': value.testid || null, 'data-ring': kind, 'data-frac': frac.toFixed(3), 'data-hours': value.hours ?? null };
  if (value.miss) {
    const m = hatch(P.MISS, P.PAGE);
    let ring;
    if (frac >= 1) ring = s('circle', { cx: c, cy: c, r, fill: 'none', stroke: m.fill, 'stroke-width': w, class: 'ring-miss', ...tag });
    else if (frac <= 0) ring = s('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'none', class: 'ring-miss', ...tag });
    else if (tooShort(frac, r, w)) ring = headDisc(c, r, w, frac, m.fill, { class: 'ring-miss', ...tag });
    else ring = dashArc(c, c, r, w, m.fill, shownFrac(frac, r, w), { class: 'ring-miss', ...tag });
    out.push(m.defs, from != null ? fadeFrom(ring, step) : ring);
    return out;
  }
  // The window shows nothing until it is a stroke long: just opened, its dot
  // would sit under the fast's head at 12 o'clock and read as one blob.
  if (frac <= 0 || (kind === 'win' && tooShort(frac, r, w))) {
    out.push(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'none', ...tag }));
    return out;
  }
  if (tooShort(frac, r, w)) {
    const dot = headDisc(c, r, w, frac, k.color, { class: 'ring-head', ...tag });
    out.push(from != null ? fadeFrom(dot, step) : dot);
    return out;
  }
  const main = dashArc(c, c, r, w, k.color, shownFrac(frac, r, w), { class: 'ring-arc', ...tag });
  if (from != null) drawFrom(main, Math.min(from, 1), step);
  out.push(main);
  const lap = frac > 1 ? (frac - 1) % 1 : 0;
  if (lap > 0) {
    const lapFrom = from == null ? null : from > 1 ? (from - 1) % 1 : 0;
    const after = from != null && from < 1 ? 1 : 0;
    // The lap starts square at 12 o'clock; its head disc reaches half a
    // stroke past its end, so it stops short enough to leave a gap there.
    const most = 1 - (w / 2 + 2) / (2 * Math.PI * r);
    const shownLap = Math.min(lap, most);
    if (!tooShort(lap, r, w)) {
      const arc = dashArc(c, c, r, w, k.deep, shownLap, { class: 'ring-arc ring-lap', 'stroke-linecap': 'butt' });
      if (lapFrom != null) drawFrom(arc, Math.min(lapFrom, most), step, after);
      out.push(arc);
    }
    const cap = headDisc(c, r, w, shownLap, k.deep, { class: 'ring-cap' });
    if (from != null) fadeFrom(cap, step, after + 1);
    out.push(cap);
  }
  return out;
}

/**
 * Rays round the outer ring, hidden until that ring celebrates: 12 at 30°
 * steps, 7 long, 3 out from the ring. Each ring's set sits a little turned
 * from the others, and its second set a further 15°, so bursts interleave.
 */
function rays(c, rOuter, color, kind, i, second) {
  const n = 12;
  const r0 = rOuter + 3;
  const r1 = r0 + 7;
  const offset = (i * 10 + (second ? 15 : 0)) / 360;
  return s('g', { class: `burst burst-${kind}${second ? '-2' : ''}`, 'aria-hidden': 'true' }, Array.from({ length: n }, (_, j) => {
    const [x0, y0] = at(c, c, r0, j / n + offset);
    const [x1, y1] = at(c, c, r1, j / n + offset);
    return s('line', { x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1), stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
  }));
}

/** The radii of the three rings for a picture of this size and stroke. */
function radii(size, w) {
  const r1 = size / 2 - w / 2;
  const g = w + 2;
  return { fast: r1, win: r1 - g, full: r1 - 2 * g };
}

/**
 * The three rings as one picture. size is the outer ring's diameter (a ring
 * token: 184 on Today, 120 compact, 56 inline); the picture adds room for
 * the rays round it, which CSS takes back with a negative margin.
 * rings: { fast, win, full }, each { frac, miss?, testid?, hours? }; a ring
 * left out is not drawn. centre: (c, size) => an SVG node set in the middle
 * at (c, c), such as the stage icon. animate: a user action changed a ring,
 * so it draws from its old value to the new one. key: the picture's role
 * ('hero', say), so a picture that changes size is still the same rings and
 * does not draw again from empty; without it, the size is the role.
 */
export function ringsSvg(rings, { size = RING.hero.size, centre = null, cls = '', animate = false, key = null } = {}) {
  const w = strokeFor(size);
  const box = size + RAY_ROOM * 2;
  const c = box / 2;
  const rr = radii(size, w);
  const parts = [];
  let step = 0;
  for (const kind of ORDER) {
    if (!rings[kind]) continue;
    const v = rings[kind];
    const from = drawPlan(`${key ?? size}:${kind}`, v.miss ? -1 : Math.max(0, v.frac || 0), animate);
    parts.push(s('g', { class: `ring-${kind} ring-spin spin-${kind}` }, ...oneRing(c, rr[kind], w, kind, v, from == null ? null : Math.max(0, from), step)));
    step += 1;
  }
  // The rays sit outside the outer ring, one set (twice) per ring, so each
  // ring can celebrate on its own.
  const kinds = ORDER.filter((k) => rings[k]);
  const burst = kinds.flatMap((k, i) => [rays(c, rr.fast + w / 2, KIND[k].color, k, i, false), rays(c, rr.fast + w / 2, KIND[k].color, k, i, true)]);
  return s('svg', { class: `rings ${cls}`.trim(), viewBox: `0 0 ${box} ${box}`, width: box, height: box, 'aria-hidden': 'true', focusable: 'false' },
    ...burst, ...parts, typeof centre === 'function' ? centre(c, size) : centre);
}

/** A day's mark in the week row: its window ring, with a blue dot when left wanting. */
export function miniRing(result, leftWanting) {
  const svg = resultRing(result, RING.mark.size, { leftWanting });
  svg.setAttribute('class', 'cell result-ring');
  // The hook data-result belongs to the day's row or cell, not to its mark.
  svg.removeAttribute('data-result');
  return svg;
}

// ---------- Celebrations ----------

const SEEN_KEY = 'sabr.celebrated';
let seen = null;

function seenSet() {
  if (seen) return seen;
  try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { seen = new Set(); }
  return seen;
}

// Moments celebrating now, by key: when they began. A redraw during the
// celebration carries it on from where it stands instead of cutting it off.
const running = new Map();
const CELEBRATION_MS = 2800;

/**
 * Celebrates each moment once: moments are [{ key, kind }], kind the ring
 * ('fast', 'win' or 'full'). Only the celebrated ring spins and its rays
 * burst twice; moments that coincide play in turn, fast, window, fullness.
 * Remembered on this phone, so a moment is celebrated once, not on every
 * redraw. With Reduce Motion on, nothing moves; the words and colours
 * still say it.
 */
export function celebrate(el, moments, nowMs = performance.now()) {
  const set = seenSet();
  const live = [];
  for (const m of moments) {
    if (!m.key) continue;
    if (!set.has(m.key)) {
      set.add(m.key);
      running.set(m.key, nowMs);
      live.push(m);
    } else if (running.has(m.key) && nowMs - running.get(m.key) < CELEBRATION_MS) live.push(m);
  }
  if (!live.length) return el;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-60))); } catch { /* private mode: celebrate anyway */ }
  if (reduced()) return el;
  const since = Math.min(...live.map((m) => nowMs - running.get(m.key)));
  const kinds = ORDER.filter((k) => live.some((m) => m.kind === k));
  el.classList.add('celebrate', ...kinds.map((k) => `celebrate-${k}`));
  el.dataset.celebrate = kinds.join(' ');
  el.style.setProperty('--since', `${Math.round(since)}ms`);
  kinds.forEach((k, i) => el.style.setProperty(`--step-${k}`, String(i)));
  return el;
}

// ---------- Rings as their own pictures ----------

/**
 * Three empty ring tracks, no arcs: Today's nothing-on-record picture. Each
 * track in its ring's soft tint, as under the hero's arcs, so the legend's
 * red, green and blue name what is drawn.
 */
export function emptyRings(size) {
  const w = strokeFor(size);
  const c = size / 2;
  const rr = radii(size, w);
  return s('svg', { class: 'empty-rings', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    ORDER.map((k) => s('circle', { cx: c, cy: c, r: rr[k], fill: 'none', stroke: KIND[k].soft, 'stroke-width': w })));
}

/**
 * A timer ring: an ink arc on a track, drawn by dash offset (pathLength 1).
 * Returns the svg; svg.set(frac) moves the arc.
 */
export function progressRing({ size, stroke = strokeFor(size), frac = 0 }) {
  const c = size / 2;
  const r = c - stroke / 2;
  const arc = s('path', { class: 'progress-arc', d: circlePath(c, c, r), pathLength: 1, fill: 'none', stroke: P.INK, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': '1 1' });
  const svg = s('svg', { class: 'progress-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.TRACK, 'stroke-width': stroke }), arc);
  svg.set = (f) => {
    const v = Math.max(0, Math.min(1, Number(f) || 0));
    arc.style.setProperty('stroke-dashoffset', String(1 - v));
    arc.setAttribute('visibility', v > 0 ? 'visible' : 'hidden');
  };
  svg.set(frac);
  return svg;
}

const KEPT = ['success', 'noEating', 'fasted'];

/**
 * A day's result as a ring, at any of the ring sizes (14, 28 or 120):
 * success, no eating and fasted a green ring with dark edges, a miss orange
 * stripes with dark edges, open or not logged a quiet outline, still ahead
 * a dashed outline, paused a grey ring with two bars. Left wanting adds a
 * blue dot in the middle. draw: a key; the first time a ring with that key
 * is shown this session, it draws to its value.
 */
export function resultRing(result, size, { leftWanting = false, draw = null } = {}) {
  const c = size / 2;
  const w = size >= RING.md.size ? RING.md.stroke : size >= RING.mark.size ? RING.mark.stroke : RING.key.stroke;
  const r = c - w / 2 - 1;
  const animate = firstShow(draw);
  const parts = [];
  const ring = (stroke, width, extra = {}) => s('circle', { cx: c, cy: c, r, fill: 'none', stroke, 'stroke-width': width, ...extra });
  if (KEPT.includes(result)) {
    // A closed ring is one closed circle: two dash ends meeting at 12
    // o'clock leave a hairline seam in some engines. Only while it draws is
    // it a dash, and the dash goes once the draw ends.
    if (animate) {
      const arcs = [dashArc(c, c, r, w, P.WIN_TEXT, 1, { 'stroke-linecap': 'butt' }), dashArc(c, c, r, w - 2, P.WIN, 1, { 'stroke-linecap': 'butt' })];
      for (const a of arcs) {
        drawFrom(a, 0);
        a.addEventListener('animationend', () => { a.removeAttribute('stroke-dasharray'); a.classList.remove('ring-draw'); }, { once: true });
      }
      parts.push(...arcs);
    } else parts.push(ring(P.WIN_TEXT, w), ring(P.WIN, w - 2));
  } else if (result === 'miss') {
    const m = hatch(P.MISS, P.PAGE);
    const g = s('g', {}, ring(P.MISS_TEXT, w), ring(m.fill, w - 2));
    parts.push(m.defs, animate ? fadeFrom(g) : g);
  } else if (result === 'paused') {
    // The bars scale with the ring, but never thinner than 1.5 (at key size they would vanish).
    const k = size / 28;
    parts.push(ring(P.TRACK, w), s('path', { d: `M${c - 3 * k} ${c - 4 * k} V${c + 4 * k} M${c + 3 * k} ${c - 4 * k} V${c + 4 * k}`, stroke: P.QUIET, 'stroke-width': Math.max(1.5, 2 * k), 'stroke-linecap': 'round' }));
  } else if (result === 'future' || result === 'ahead') {
    // The dash scales with the ring, so a key still reads as a dashed ring.
    const k = size / 28;
    parts.push(ring(P.EDGE, 2, { 'stroke-dasharray': `${Math.max(2, 3 * k)} ${Math.max(1.5, 3 * k)}` }));
  }
  else parts.push(ring(P.QUIET, 2));
  if (leftWanting) {
    const dot = size >= RING.md.size ? 12 : (size * 4.5) / 28;
    parts.push(s('circle', { cx: c, cy: c, r: dot, fill: P.FULL, stroke: P.FULL_TEXT, 'stroke-width': 1, 'data-testid': 'left-wanting-dot' }));
  }
  return s('svg', { class: 'result-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', focusable: 'false', 'data-result': result }, ...parts);
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_WORD = { success: 'success', noEating: 'success', fasted: 'success', miss: 'miss', paused: 'paused', pending: 'in progress', open: 'in progress', future: 'still ahead', unlogged: 'nothing logged' };

/**
 * The week as one ring of seven arcs, Sunday at 12 o'clock and clockwise,
 * 6° apart with butt ends. results: seven result words, Sunday to Saturday.
 * The first time a week is shown this session, its arcs draw in turn.
 */
export function weekRing(results) {
  const size = RING.md.size;
  const w = 14;
  const c = size / 2;
  const r = c - w / 2 - 1;
  const gap = 6 / 360;
  const animate = firstShow(`week:${results.join(',')}`);
  const parts = [];
  results.slice(0, 7).forEach((result, i) => {
    const from = i / 7 + gap / 2;
    const to = (i + 1) / 7 - gap / 2;
    const d = arcPath(c, c, r, from, to);
    const tag = { 'data-day-index': String(i), 'data-result': result };
    const solid = (stroke, width, extra = {}) => {
      const p = s('path', { d, fill: 'none', stroke, 'stroke-width': width, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 0, ...extra });
      return animate ? drawFrom(p, 0, i) : p;
    };
    if (KEPT.includes(result)) {
      parts.push(solid(P.WIN_TEXT, w, tag), solid(P.WIN, w - 2));
    } else if (result === 'miss') {
      const m = hatch(P.MISS, P.PAGE);
      const g = s('g', {}, s('path', { d, fill: 'none', stroke: P.MISS_TEXT, 'stroke-width': w, ...tag }), s('path', { d, fill: 'none', stroke: m.fill, 'stroke-width': w - 2 }));
      parts.push(m.defs, animate ? fadeFrom(g, i) : g);
    } else if (result === 'paused') parts.push(solid(P.TRACK, w, tag));
    else if (result === 'future') parts.push(s('path', { d, fill: 'none', stroke: P.EDGE, 'stroke-width': 2, 'stroke-dasharray': '3 3', ...tag }));
    else parts.push(s('path', { d, fill: 'none', stroke: P.QUIET, 'stroke-width': 2, ...tag }));
  });
  const kept = results.filter((x) => KEPT.includes(x)).length;
  const words = results.slice(0, 7).map((x, i) => `${WEEK_DAYS[i]} ${WEEK_WORD[x] || 'nothing logged'}`).join(', ');
  return s('svg', { class: 'week-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${kept} of 7. ${words}`, focusable: 'false' }, ...parts);
}
