// Small drawings for History, Weight and the import page. Empty screens show
// the real frame of what will fill them, never partly filled rings (they
// would read as invented progress), so the one picture left is the import
// page's glyph: a filled disc in the weight's indigo beside a saved import.
// An open ring means open or not logged, so done is drawn solid.

import * as C from './palette.js';
import { s } from './dom.js';
import { RING } from './rings.js';

/** The weight's done mark: a filled indigo disc at --ring-mark (28), decorative. */
export function weightRing() {
  const { size } = RING.mark;
  return s('svg', { class: 'weight-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: size / 2, cy: size / 2, r: size / 2, fill: C.WEIGHT }));
}
