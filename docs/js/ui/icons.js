// Stage icons: thin line drawings on a 24 x 24 grid, stroked in the current
// text colour so CSS decides quiet or ink. On a stage disc (stageDisc), a
// stage passed sits on --fast-soft with a --fast edge and an ink icon, the
// stage the fast is in on --fast with an ink icon, and a stage ahead on white
// with an --edge outline and a quiet icon. Also the glyphs, the marks for
// each way of finishing a meal and the miss stripes. Drawn shapes only,
// never emoji.

import { h, s } from './dom.js';
import * as P from './palette.js';

const PATHS = {
  // Digesting: a plate beside a fork.
  digesting: [
    'M3.5 3.5 V8 C3.5 9.4 4.4 10.2 5.5 10.2 C6.6 10.2 7.5 9.4 7.5 8 V3.5',
    'M5.5 3.5 V8',
    'M5.5 10.2 V20.5',
    'M14.5 5.5 A6.5 6.5 0 1 1 14.49 5.5 Z',
    'M14.5 8.5 A3.5 3.5 0 1 1 14.49 8.5 Z',
  ],
  // Blood sugar settles: a drop with a level line.
  settling: [
    'M12 3 C12 3 5.5 10.2 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 10.2 12 3 12 3 Z',
    'M8.5 15.5 H15.5',
  ],
  // Metabolic switch: a flame.
  switch: [
    'M12 2.8 C12.6 6.2 17.6 8.8 17.6 14.4 A5.6 5.6 0 0 1 6.4 14.4 C6.4 11.4 8.1 9.6 9.2 8.4 C9.3 10.1 10.1 11.2 11 11.6 C10.4 8.2 11.2 5.2 12 2.8 Z',
    'M12 13.2 C12.4 14.6 14.2 15.4 14.2 17.4 A2.2 2.2 0 0 1 9.8 17.4 C9.8 15.8 11.4 15 12 13.2 Z',
  ],
  // Ketones climbing: a bolt, energy from fat.
  ketones: [
    'M13.5 2.5 L5.5 13.5 H11.5 L10.5 21.5 L18.5 10 H12.5 Z',
  ],
  // Brain on ketones: the brain seen from above, two halves with a fold in each.
  brain: [
    'M12 5 C10.8 3.6 8.4 3.4 7 4.6 C5.2 4.6 3.8 6.2 4.2 8 C2.8 9 2.6 11.2 3.8 12.4 C3 14 3.6 16 5.2 16.6 C5.4 18.6 7.4 19.8 9.2 19.2 C10 20.2 11.2 20.4 12 19.8 C12.8 20.4 14 20.2 14.8 19.2 C16.6 19.8 18.6 18.6 18.8 16.6 C20.4 16 21 14 20.2 12.4 C21.4 11.2 21.2 9 19.8 8 C20.2 6.2 18.8 4.6 17 4.6 C15.6 3.4 13.2 3.6 12 5 Z',
    'M12 5 V19.8',
    'M7.2 9 C8.6 9 9.4 10 9.2 11.4',
    'M16.8 9 C15.4 9 14.6 10 14.8 11.4',
    'M6.6 14.4 C8 14 9 14.8 9.2 16',
    'M17.4 14.4 C16 14 15 14.8 14.8 16',
  ],
  // Protein sparing: a shield, the body keeping its protein.
  sparing: [
    'M12 3 L19 5.8 V11.5 C19 16 15.9 19.4 12 21 C8.1 19.4 5 16 5 11.5 V5.8 Z',
    'M12 7 V17.4',
  ],
};

/**
 * An icon group centred on (x, y), drawn at size px. mark: false leaves out
 * the data-stage-icon tag, for a copy of an icon beside its stage's name.
 * live: the icon moves (CSS, by its icon- class and its parts p0, p1 ...).
 */
export function stageIcon(key, { x = 12, y = 12, size = 24, current = false, mark = true, live = false } = {}) {
  const k = size / 24;
  return s('g', {
    class: ['stage-icon', `icon-${key}`, current ? 'now' : '', live ? 'live' : ''].filter(Boolean).join(' '),
    transform: `translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${k.toFixed(3)})`,
    'data-stage-icon': mark ? key : null,
    'aria-hidden': 'true',
  }, current ? s('circle', { class: 'leaf', cx: 12, cy: 12, r: 14 }) : null, ...PATHS[key].map((d, i) => s('path', { class: `p${i}`, d })));
}

/** A small clock face, for Just now: the 16px clock glyph. */
export function clockGlyph() {
  return glyph('clock');
}

/** A stage icon as its own small picture, for buttons and lists. */
export function stageGlyph(key, { mark = true, live = false } = {}) {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, stageIcon(key, { mark, live }));
}

/**
 * A stage icon on its round disc. size: 48, 52 or 56; state: 'passed', 'now'
 * or 'ahead'; live: the icon moves. The disc wears its stage's shade
 * (s-<key>) until the new look lands.
 */
export function stageDisc(key, { size = 48, state = null, live = false } = {}) {
  const disc = h('span', {
    class: ['stage-disc', `s-${key}`, state ? `is-${state}` : ''].filter(Boolean).join(' '),
    'data-state': state,
    'aria-hidden': 'true',
  }, stageGlyph(key, { mark: false, live }));
  disc.style.setProperty('--disc', `${size}px`);
  return disc;
}

// ---------- Glyphs: drawn in the current colour, stroke 2 ----------

const GLYPHS = {
  chevron: { box: '0 0 8 14', d: ['M1.5 1.5 L6.5 7 L1.5 12.5'] },
  'chevron-left': { box: '0 0 8 14', d: ['M6.5 1.5 L1.5 7 L6.5 12.5'] },
  plus: { box: '0 0 14 14', d: ['M7 2 V12 M2 7 H12'] },
  trash: { box: '0 0 18 18', d: ['M3 5 H15', 'M7 5 V3 H11 V5', 'M4.5 5 L5.5 15.5 H12.5 L13.5 5', 'M7.5 8 V13 M10.5 8 V13'] },
  book: { box: '0 0 20 20', d: ['M10 5 C8 3.6 5 3.4 2.5 4 V16 C5 15.4 8 15.6 10 17 C12 15.6 15 15.4 17.5 16 V4 C15 3.4 12 3.6 10 5 Z', 'M10 5 V17'] },
  clock: { box: '0 0 16 16', d: ['M8 1.5 A6.5 6.5 0 1 1 7.99 1.5 Z', 'M8 4.5 V8 L10.5 9.5'] },
  alert: { box: '0 0 16 16', d: ['M8 1.5 A6.5 6.5 0 1 1 7.99 1.5 Z', 'M8 4.5 V8.5', 'M8 11.2 V11.3'] },
  'pause-bars': { box: '0 0 14 14', d: ['M4.5 3 V11 M9.5 3 V11'] },
};

/** A small drawn glyph (chevron, chevron-left, plus, trash, book, clock, alert, pause-bars), aria-hidden. */
export function glyph(name, { size = null } = {}) {
  const g = GLYPHS[name];
  const svg = s('svg', { class: `glyph glyph-${name}`, viewBox: g.box, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...g.d.map((d) => s('path', { d })));
  if (size) {
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
  }
  return svg;
}

// ---------- Marks ----------

let hatches = 0;

/**
 * Orange stripes, the mark of a miss wherever it appears, so a miss never
 * rests on its colour alone. Returns the pattern to put in an SVG and its fill.
 */
export function hatch(color = P.MISS, ground = P.PAGE) {
  const id = `miss-hatch-${++hatches}`;
  return {
    fill: `url(#${id})`,
    defs: s('defs', {}, s('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 5, height: 5, fill: ground }),
      s('line', { x1: 1.25, y1: 0, x2: 1.25, y2: 5, stroke: color, 'stroke-width': 2.5 }))),
  };
}

// Each way of finishing a meal has its colour and its own shape: a blue
// triangle for left wanting, a grey square for satisfied, an ink diamond for
// overfull (the owner's choice: overfull is not a miss, so never orange).
// Each small mark has a 1px edge in its darker tone, so it reaches 3:1.
// line: the colour for a line or bar with no edge of its own (Satisfied's
// light grey fill would miss 3:1 there, so its lines are quiet grey).
export const STOP_MARKS = {
  before_full: { colour: P.FULL, edge: P.FULL_TEXT, line: P.FULL, shape: 'triangle' },
  full: { colour: P.MARGINALIA, edge: P.QUIET, line: P.QUIET, shape: 'square' },
  stuffed: { colour: P.INK, edge: P.INK, line: P.INK, shape: 'diamond' },
};

/**
 * The mark for a way of finishing, centred on (x, y): the same drawing in the
 * Satiety charts, the meal list and the legend keys. An unrated meal is an
 * open ink circle. Ink parts carry k-ink, so a selected legend chip can
 * turn them white.
 */
export function stopMark(stop, { x = 7, y = 7, r = 5 } = {}) {
  const st = STOP_MARKS[stop];
  if (!st) return s('circle', { class: 'k-ink-line', cx: x, cy: y, r: r - 1, fill: 'none', stroke: P.INK, 'stroke-width': 1.5 });
  const d = {
    triangle: `M${x} ${y - r} L${x + r} ${y + r * 0.8} L${x - r} ${y + r * 0.8} Z`,
    square: `M${x - r * 0.85} ${y - r * 0.85} h${r * 1.7} v${r * 1.7} h${-r * 1.7} Z`,
    diamond: `M${x} ${y - r * 1.1} L${x + r * 1.1} ${y} L${x} ${y + r * 1.1} L${x - r * 1.1} ${y} Z`,
  }[st.shape];
  return s('path', { class: st.colour === P.INK ? 'k-ink' : null, d, fill: st.colour, stroke: st.edge, 'stroke-width': 1, 'stroke-linejoin': 'round', 'data-stop': stop, 'data-series': stop });
}

/** The mark as a legend key or an inline icon. */
export function stopIcon(stop) {
  return s('svg', { class: 'stop-icon', viewBox: '0 0 14 14', 'aria-hidden': 'true' }, stopMark(stop, { x: 7, y: 7, r: 5 }));
}
