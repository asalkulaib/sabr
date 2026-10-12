// The three rings: the day at a glance, in the manner of activity rings.
// Outside, red: the fast, filling towards its goal and lapping past it.
// Middle, green: the eating window, filling as it is used and closed full
// when the day succeeds. Inside, blue: fullness, closed when every meal of
// the day was left wanting. A miss is never colour alone: its ring is
// orange stripes, and the words beside the rings say so.

import { s } from './dom.js';
import { hatch } from './components.js';
import * as P from './palette.js';

const KIND = {
  fast: { color: P.FAST, soft: P.FAST_SOFT, deep: P.FAST_DEEP },
  win: { color: P.WIN, soft: P.WIN_SOFT, deep: P.WIN_TEXT },
  full: { color: P.FULL, soft: P.FULL_SOFT, deep: P.FULL_TEXT },
};

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

/**
 * One ring. value: { frac, miss, testid, hours }. Past a whole turn the ring
 * laps itself: the full ring, then the lap in a deeper shade with a cap that
 * shows where it stands.
 */
function oneRing(cx, cy, r, w, kind, value) {
  const k = KIND[kind];
  const out = [s('circle', { cx, cy, r, fill: 'none', stroke: k.soft, 'stroke-width': w })];
  const frac = Math.max(0, value.frac || 0);
  const tag = { 'data-testid': value.testid || null, 'data-ring': kind, 'data-frac': frac.toFixed(3), 'data-hours': value.hours ?? null };
  if (value.miss) {
    const m = hatch(P.MISS, P.PAGE);
    out.push(m.defs, s('circle', { cx, cy, r, fill: 'none', stroke: m.fill, 'stroke-width': w, ...tag }));
    return out;
  }
  if (frac <= 0) {
    out.push(s('circle', { cx, cy, r, fill: 'none', stroke: 'none', ...tag }));
    return out;
  }
  if (frac < 1) {
    // A sliver still shows as a round dot at the top.
    out.push(s('path', { d: arcPath(cx, cy, r, 0, Math.max(frac, 0.002)), fill: 'none', stroke: k.color, 'stroke-width': w, 'stroke-linecap': 'round', class: 'ring-arc', ...tag }));
    return out;
  }
  out.push(s('circle', { cx, cy, r, fill: 'none', stroke: k.color, 'stroke-width': w, class: 'ring-arc', ...tag }));
  const lap = Math.min(frac - 1, 0.999);
  if (lap > 0.02) {
    out.push(s('path', { d: arcPath(cx, cy, r, 0, lap), fill: 'none', stroke: k.deep, 'stroke-width': w, 'stroke-linecap': 'round' }));
    const [ex, ey] = at(cx, cy, r, lap);
    out.push(s('circle', { cx: ex.toFixed(2), cy: ey.toFixed(2), r: w / 2, fill: k.deep, stroke: k.color, 'stroke-width': 1.5 }));
  }
  return out;
}

/** Rays around a ring, hidden until it celebrates. */
function burst(cx, cy, r0, r1, color, kind) {
  const n = 14;
  return s('g', { class: `burst burst-${kind}`, 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => {
    const [x0, y0] = at(cx, cy, r0, i / n);
    const [x1, y1] = at(cx, cy, r1, i / n);
    return s('line', { x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1), stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
  }));
}

/**
 * The three rings as one picture, size px square. rings: { fast, win, full },
 * each { frac, miss?, testid?, hours? }; a ring left out is not drawn.
 * centre: (c, size) => an SVG node set in the middle at (c, c), such as the stage icon.
 */
export function ringsSvg(rings, { size = 176, centre = null, cls = '' } = {}) {
  const pad = size * 0.09; // room for the rays
  const box = size + pad * 2;
  const c = box / 2;
  const w = size * 0.1;
  const g = w * 1.14;
  const r1 = size / 2 - w / 2;
  const radii = { fast: r1, win: r1 - g, full: r1 - 2 * g };
  const parts = [];
  for (const kind of ['fast', 'win', 'full']) {
    if (!rings[kind]) continue;
    const r = radii[kind];
    parts.push(s('g', { class: `ring-${kind}` }, ...oneRing(c, c, r, w, kind, rings[kind])));
  }
  // The rays sit outside the outer ring, one set per colour, so each ring
  // can celebrate on its own.
  const rays = ['fast', 'win', 'full'].filter((k) => rings[k]).map((k, i) => burst(c, c, r1 + w / 2 + 4 + i * 3, r1 + w / 2 + pad - 2, KIND[k].color, k));
  return s('svg', { class: `rings ${cls}`.trim(), viewBox: `0 0 ${box.toFixed(1)} ${box.toFixed(1)}`, 'aria-hidden': 'true', focusable: 'false' },
    ...rays, s('g', { class: 'ring-spin' }, ...parts), typeof centre === 'function' ? centre(c, size) : centre);
}

/** A day's mark in the week row: its window ring, with a blue dot when left wanting. */
export function miniRing(result, leftWanting) {
  const c = 16;
  const r = 11.5;
  const w = 5.5;
  const parts = [];
  if (result === 'success') parts.push(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.WIN, 'stroke-width': w }));
  else if (result === 'miss') {
    const m = hatch(P.MISS, P.PAGE);
    parts.push(m.defs, s('circle', { cx: c, cy: c, r, fill: 'none', stroke: m.fill, 'stroke-width': w }));
  } else if (result === 'paused') parts.push(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.TRACK, 'stroke-width': w }), s('path', { d: 'M13 12 V20 M19 12 V20', stroke: P.QUIET, 'stroke-width': 2, 'stroke-linecap': 'round' }));
  else if (result === 'future') parts.push(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.FAINT, 'stroke-width': 1.6, 'stroke-dasharray': '3 3' }));
  else parts.push(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.TRACK, 'stroke-width': w }));
  if (leftWanting) parts.push(s('circle', { cx: c, cy: c, r: 4.2, fill: P.FULL, 'data-testid': 'left-wanting-dot' }));
  return s('svg', { class: 'cell', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' }, ...parts);
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
const CELEBRATION_MS = 2600;

/**
 * Celebrates each moment once: moments are [{ key, kind }], kind the ring
 * ('fast', 'win' or 'full'). The rings spin and the rays of each ring with
 * a new moment burst. Remembered on this phone, so a moment is celebrated
 * once, not on every redraw. With Reduce Motion on, nothing moves; the
 * words and colours still say it.
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return el;
  const since = Math.min(...live.map((m) => nowMs - running.get(m.key)));
  const kinds = [...new Set(live.map((m) => m.kind))];
  el.classList.add('celebrate', ...kinds.map((k) => `celebrate-${k}`));
  el.dataset.celebrate = kinds.join(' ');
  el.style.setProperty('--since', `${Math.round(since)}ms`);
  return el;
}
