// Sabr's colours for SVG drawing, the same values as the tokens in
// css/tokens.css. Three ring colours, each with one meaning: red for the fast,
// green for the eating window, blue for fullness. Orange stripes mark a miss,
// indigo is weight. Everything else is ink on white and soft grey.

export const INK = '#0E0E12';
export const PAGE = '#FFFFFF';
export const CARD = '#F3F3F6';
export const TRACK = '#E4E4EA';
export const QUIET = '#5C5C66';
export const MARGINALIA = '#9A9AA4'; // decoration only, never a mark alone

export const FAST = '#FF2E63';
export const FAST_SOFT = '#FFE3EA';
export const FAST_TEXT = '#C8103F';
export const FAST_DEEP = '#A30B33';

export const WIN = '#2FCB57';
export const WIN_SOFT = '#DDF7E3';
export const WIN_TEXT = '#117534';

export const FULL = '#12AEEA';
export const FULL_SOFT = '#DCF3FC';
export const FULL_TEXT = '#05698F';

export const MISS = '#FF7A00';
export const MISS_TEXT = '#A84D00';

export const WEIGHT = '#5B5BF0';
export const WEIGHT_SOFT = '#ECECFE';
export const WEIGHT_TEXT = '#3C3CC0';

/** Grid lines: ink at low strength. */
export const GRID = 'rgba(14, 14, 18, 0.12)';
/** Outlines and quiet marks that must be seen (--edge): 3:1 on white and on the cards. */
export const EDGE = 'rgba(14, 14, 18, 0.5)';
