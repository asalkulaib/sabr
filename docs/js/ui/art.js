// The picture on empty screens: the three rings, waiting to fill. Each ring
// shows a short start of its colour, so the picture says what the rings are
// before there is anything to show.

import { ringsSvg } from './rings.js';

export function emptyArt({ label = '' } = {}) {
  const svg = ringsSvg({ fast: { frac: 0.12 }, win: { frac: 0.08 }, full: { frac: 0.04 } }, { size: 132, cls: 'empty-art' });
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    svg.removeAttribute('aria-hidden');
  }
  return svg;
}
