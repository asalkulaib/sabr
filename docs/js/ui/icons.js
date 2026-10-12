// Stage icons: thin line drawings on a 24 x 24 grid, stroked in the current
// text colour so CSS decides quiet or ink; the current one sits on a disc of
// gold leaf. Never emoji.

import { s } from './dom.js';

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

/** A small clock face, for Just now. */
export function clockGlyph() {
  return s('svg', { class: 'glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: 12, cy: 12, r: 8.5 }),
    s('path', { d: 'M12 7.5 V12 L15 14' }));
}

/** A stage icon as its own small picture, for buttons and lists. */
export function stageGlyph(key, { mark = true, live = false } = {}) {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, stageIcon(key, { mark, live }));
}
