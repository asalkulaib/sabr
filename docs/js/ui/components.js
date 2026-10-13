// Shared controls: rating scales, choices, the rolling 24-hour time wheel, fields.

import * as P from './palette.js';
import { h, s } from './dom.js';
import { glyph, hatch, stopMark } from './icons.js';
import { resultRing } from './rings.js';
import { addDays, durationParts, fmtDayShort, minutesOfDay, now } from '../core/time.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// ---------- Sliding selection ----------

// A tap that is about to redraw its selector: where the pill stood, so the
// selector drawn in its place starts there and glides to the new choice.
const moves = new Map();
const GLIDE_MS = 600;

/**
 * Makes a track of buttons slide: an ink pill sits under the chosen one and
 * glides to the next. Tap a button; on a single line, the pill can also be
 * dragged along. The chosen button carries aria-checked, or aria-current for
 * the tabs. Returns { choose(button, { tap }), sync() }: choose marks a
 * button, moves the pill and calls pick(button); sync follows a choice
 * made elsewhere.
 */
export function sliding(track, buttons, { key = null, line = false, pick, current = false }) {
  const pill = h('span', { class: 'pill', 'aria-hidden': 'true', hidden: true });
  track.prepend(pill);
  const isChosen = current ? (b) => b.getAttribute('aria-current') === 'page' : (b) => b.getAttribute('aria-checked') === 'true';
  let committed = buttons.find(isChosen) || null;
  let shown = null; // the pill's place: { x, y, w, h }
  let placed = false;
  const rectOf = (b) => ({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
  const put = (r) => {
    pill.style.setProperty('--x', `${r.x}px`);
    pill.style.setProperty('--y', `${r.y}px`);
    pill.style.setProperty('--w', `${r.w}px`);
    pill.style.setProperty('--h', `${r.h}px`);
    shown = r;
  };
  const mark = (b) => {
    for (const x of buttons) {
      if (!current) x.setAttribute('aria-checked', String(x === b));
      else if (x === b) x.setAttribute('aria-current', 'page');
      else x.removeAttribute('aria-current');
    }
  };
  const show = (b) => {
    pill.hidden = !b;
    if (b && track.clientWidth) put(rectOf(b));
  };
  // First drawn, or drawn again after a tap redrew the screen: glide from
  // where the pill stood, if the tap was just now on a track this wide.
  const first = () => {
    if (!track.clientWidth) return;
    placed = true;
    if (!committed) return;
    pill.hidden = false;
    const move = key && moves.get(key);
    if (key) moves.delete(key);
    if (move && Date.now() - move.at < GLIDE_MS && move.width === track.clientWidth) {
      put(move.from);
      void pill.offsetWidth; // settle the start before the glide begins
      pill.classList.add('glide');
      put(rectOf(committed));
    } else {
      put(rectOf(committed));
      requestAnimationFrame(() => pill.classList.add('glide'));
    }
  };
  new ResizeObserver(() => { if (!placed) first(); else if (committed) show(committed); }).observe(track);

  const choose = (b, { tap = false } = {}) => {
    const changed = b !== committed;
    if (key && shown && changed) moves.set(key, { from: shown, at: Date.now(), width: track.clientWidth });
    committed = b;
    mark(b);
    if (!pill.classList.contains('glide') && shown) pill.classList.add('glide');
    show(b);
    // A tap always counts, as it always has; a drag only when it lands elsewhere.
    if (tap || changed) pick(b);
  };

  if (line) {
    track.classList.add('line');
    let drag = null;
    let swallow = false;
    const under = (clientX) => {
      const x = clientX - track.getBoundingClientRect().left;
      return buttons.find((b) => x < b.offsetLeft + b.offsetWidth) || buttons[buttons.length - 1];
    };
    track.addEventListener('pointerdown', (e) => {
      // A track stacked into one column picks by tap only: dragging reads x.
      if (track.classList.contains('stacked')) return;
      if (e.button === 0) drag = { id: e.pointerId, x: e.clientX, moved: false };
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x) < 8) return;
        drag.moved = true;
        try { track.setPointerCapture(e.pointerId); } catch { /* a finished pointer */ }
      }
      const b = under(e.clientX);
      mark(b);
      show(b);
    });
    const end = (e, keep) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return; // a tap: the button's own click chooses
      swallow = true;
      setTimeout(() => { swallow = false; }, 0);
      if (keep) choose(under(e.clientX));
      else { mark(committed); show(committed); } // the page scrolled instead
    };
    track.addEventListener('pointerup', (e) => end(e, true));
    track.addEventListener('pointercancel', (e) => end(e, false));
    track.addEventListener('click', (e) => { if (swallow) e.stopPropagation(); }, true);
  }
  // A choice made elsewhere: glide to it.
  const sync = (relayout = false) => {
    const b = buttons.find(isChosen) || null;
    if (b === committed) {
      if (relayout && placed && b) show(b);
      return;
    }
    committed = b;
    if (!placed) return;
    if (shown) pill.classList.add('glide');
    show(b);
  };
  return { choose, sync };
}

/**
 * A rating: the numbers on one track, an ink pill under the one chosen.
 * Tap a number or drag the pill along.
 * opts: { n, value, onChange, label, low, high, start = 1 }
 */
export function scale({ n, value, onChange, label, low, high, start = 1, name }) {
  const labelId = nextId('scale');
  const short = n <= 5;
  const row = h('div', { class: short ? 'scale short' : 'scale', role: 'radiogroup', 'aria-labelledby': labelId });
  row.style.setProperty('--n', String(n));
  const buttons = [];
  let slide = null;
  for (let i = 0; i < n; i++) {
    const v = start + i;
    const b = h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(v === value),
      'aria-label': `${v}`,
      dataset: { value: String(v), scale: name || '' },
      onclick: () => slide.choose(b, { tap: true }),
    }, String(v));
    buttons.push(b);
    row.append(b);
  }
  slide = sliding(row, buttons, { key: name ? `scale:${name}` : null, line: true, pick: (b) => onChange(Number(b.dataset.value)) });
  const wrap = h('div', { class: short ? 'scale-wrap short' : 'scale-wrap' },
    label ? h('div', { class: 'label field-label', id: labelId }, label) : null,
    row,
    low || high ? h('div', { class: 'scale-ends' }, h('span', {}, low || ''), h('span', {}, high || '')) : null,
  );
  wrap.style.setProperty('--n', String(n));
  return wrap;
}

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/**
 * A figure: large digits with small units, as in 15h 10m, 5 of 7 or 104.7 kg.
 * parts: [[number, unit], ...]; the text reads the same as it looks.
 */
export function figureParts(parts) {
  const out = [];
  parts.forEach(([num, unit], i) => {
    // WebKit draws a digit that stands alone in its text without the lining
    // form, so Cormorant's old-style 3 would drop below the line. Each number
    // keeps a second character: its leading space, or a zero-width space.
    const n = String(num);
    out.push(i ? ` ${n}` : n.length === 1 ? n + ZERO_WIDTH_SPACE : n);
    if (unit) out.push(h('span', { class: 'unit' }, unit));
  });
  return h('span', { class: 'fig' }, out);
}

/** A duration as a figure: 15h 10m, 45m, 6 days 12h. */
export const durationFigure = (ms) => figureParts(durationParts(ms));

/**
 * Text options on one sliding track (one choice). options: [{ value, label,
 * wide }]; a wide option spans two columns. On more than one line the pill
 * glides across lines too. slim: a small switch that sizes to its words,
 * for a chart's own controls. fit: each option as wide as its words; when
 * they do not fit across, the track stacks into one column (.stacked) and is
 * picked by tap only.
 */
export function choice({ options, value, onChange, label, cols = 3, name, slim = false, fit = false, ariaLabel = null }) {
  const labelId = nextId('choice');
  const line = slim || (options.length <= cols && !options.some((o) => o.wide));
  // A fit track drawn again (after a tap, say) starts as it last measured,
  // so its pill is placed, and glides, on the right boxes from the start.
  const known = fit && name ? fitShape.get(name) : undefined;
  // Five or more across: smaller words, so each keeps clear of the rounded ends.
  const cls = ['choice', slim ? 'slim' : cols >= 5 ? 'many' : '', line ? '' : 'grid', fit ? 'fit' : '',
    known !== undefined ? 'measured' : '', known ? 'stacked' : ''].filter(Boolean).join(' ');
  const grid = h('div', { class: cls, role: 'radiogroup', 'aria-labelledby': label ? labelId : null, 'aria-label': label ? null : ariaLabel });
  grid.style.setProperty('--cols', String(cols));
  let slide = null;
  const buttons = options.map((o) => {
    const b = h('button', {
      type: 'button',
      class: o.wide ? 'wide' : null,
      role: 'radio',
      'aria-checked': String(o.value === value),
      dataset: { value: String(o.value), choice: name || '' },
      onclick: () => slide.choose(b, { tap: true }),
    }, o.label);
    return b;
  });
  grid.append(...buttons);
  slide = sliding(grid, buttons, { key: name ? `choice:${name}` : null, line, pick: (b) => onChange(options[buttons.indexOf(b)].value) });
  if (fit) {
    // Stacks when the words overflow the track, and lies flat again when they
    // fit. Measured in the next frame, never inside the observer, so the
    // change of height never loops back into it.
    let width = -1;
    const measure = () => {
      if (!grid.isConnected || !grid.clientWidth) return;
      const was = grid.classList.contains('stacked');
      grid.classList.remove('stacked');
      const over = buttons.some((b) => b.scrollWidth > b.clientWidth + 1) || grid.scrollWidth > grid.clientWidth + 1;
      grid.classList.toggle('stacked', over);
      grid.classList.add('measured');
      if (name) fitShape.set(name, over);
      const pill = grid.querySelector(':scope > .pill');
      if (over !== was && pill && pill.classList.contains('glide')) {
        // The layout changed under the pill: it moves there at once, not in a glide.
        pill.classList.remove('glide');
        slide.sync(true);
        void pill.offsetWidth;
        requestAnimationFrame(() => pill.classList.add('glide'));
      } else slide.sync(true);
    };
    new ResizeObserver(() => {
      if (grid.clientWidth === width) return;
      width = grid.clientWidth;
      requestAnimationFrame(measure);
    }).observe(grid);
  }
  return h('div', { class: 'choice-wrap' }, label ? h('div', { class: 'label field-label', id: labelId }, label) : null, grid);
}

// Whether each named fit track last stacked (choice({ fit })).
const fitShape = new Map();

// ---------- Rolling wheels ----------

const ROW = 40; // px per row (--wheel-row); five rows show, the middle one is selected
const pad2 = (i) => String(i).padStart(2, '0');

/**
 * One rolling column. Scroll-snap does the rolling; the value is committed
 * when it comes to rest, or at once on a tap or arrow key. Our own
 * positioning never counts as a choice: only touch, wheel or keys do.
 * With loop, the values repeat above and below like the iPhone clock
 * (23 rolls on to 00), and the column quietly moves back to its middle copy
 * whenever it comes to rest, so it can always roll on in both directions.
 */
function wheelColumn({ count, index, label, part, onSettle, text = pad2, keyOf = null, loop = false }) {
  const copies = loop ? 2 * Math.ceil(4000 / (count * ROW)) + 1 : 1;
  const home = ((copies - 1) / 2) * count; // position of value 0 in the middle copy
  const total = count * copies;
  const col = h('div', {
    class: 'wheel-col',
    tabindex: '0',
    role: 'spinbutton',
    'aria-label': label,
    'aria-valuemin': '0',
    'aria-valuemax': String(count - 1),
    'data-part': part,
  });
  const items = Array.from({ length: total }, (_, p) => h('div', {
    class: 'wheel-item',
    'data-value': String(p % count),
    'data-key': keyOf ? keyOf(p % count) : null,
    'aria-hidden': 'true',
  }, text(p % count)));
  col.append(h('div', { class: 'wheel-pad', 'aria-hidden': 'true' }), ...items, h('div', { class: 'wheel-pad', 'aria-hidden': 'true' }));

  let current = index; // the value
  let shown = -1; // the position painted as selected
  let touched = false;
  let picked = false; // chosen by a key or a tap: the value leads and the wheel follows it
  let timer = null;
  const clampPos = (p) => Math.max(0, Math.min(total - 1, p));
  const valueAt = (p) => p % count;
  const nearest = () => clampPos(Math.round(col.scrollTop / ROW));
  const paint = (p) => {
    if (p === shown) return;
    for (const j of [shown - 2, shown - 1, shown, shown + 1, shown + 2]) if (items[j]) items[j].className = 'wheel-item';
    for (const [j, cls] of [[p - 2, 'far'], [p - 1, 'near'], [p, 'on'], [p + 1, 'near'], [p + 2, 'far']]) {
      if (items[j]) items[j].className = `wheel-item ${cls}`;
    }
    shown = p;
    col.setAttribute('aria-valuenow', String(valueAt(p)));
    col.setAttribute('aria-valuetext', text(valueAt(p)));
  };
  const recentre = (p) => {
    const q = home + valueAt(p);
    if (q === p) return;
    col.scrollTop = q * ROW;
    paint(q);
  };
  const choose = (p) => {
    paint(p);
    const v = valueAt(p);
    if (v !== current) {
      current = v;
      onSettle();
    }
  };
  const settle = () => {
    clearTimeout(timer);
    timer = null;
    // Saving redraws the screen; a column already replaced has no position to read.
    if (!touched || !col.isConnected) return;
    // After a key or a tap, the browser's own animation or snapping may have
    // left the wheel elsewhere: put it back on the chosen value.
    if (picked) {
      place();
      return;
    }
    const p = nearest();
    choose(p);
    recentre(p);
  };
  col.addEventListener('scroll', () => {
    if (!col.isConnected) return;
    paint(nearest());
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
  }, { passive: true });
  col.addEventListener('scrollend', settle);
  for (const type of ['pointerdown', 'touchstart', 'wheel']) {
    col.addEventListener(type, () => { touched = true; picked = false; }, { passive: true });
  }
  col.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    touched = true;
    picked = true;
    // Step from the chosen value, not from a roll still under way.
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const v = loop ? (current + step + count) % count : Math.max(0, Math.min(count - 1, current + step));
    col.scrollTop = (home + v) * ROW;
    choose(home + v);
  });
  // A tap on a number picks it (one listener for the whole column).
  col.addEventListener('click', (e) => {
    const p = items.indexOf(e.target.closest('.wheel-item'));
    if (p < 0) return;
    touched = true;
    picked = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    col.scrollTo({ top: p * ROW, behavior: reduce ? 'auto' : 'smooth' });
    choose(p);
  });

  // Position once the column is on screen and has a size.
  const place = () => {
    col.scrollTop = (home + current) * ROW;
    paint(home + current);
  };
  const ro = new ResizeObserver(() => {
    if (col.clientHeight > 0) {
      if (!touched) place();
      ro.disconnect();
    }
  });
  ro.observe(col);
  paint(home + current);

  return {
    col,
    index: () => current,
    set(v) {
      current = Math.max(0, Math.min(count - 1, v));
      touched = false;
      place();
    },
  };
}

/**
 * 24-hour time wheel: hours and minutes that roll, like the iPhone clock,
 * always in 24-hour form. onChange(minutes) fires when a new time settles.
 * minutes may be null (not set yet): the wheel then shows `fallback` quietly
 * until it is rolled. With allowUnset, a Clear button sets it back to null.
 */
/** aside: a control beside the wheel, level with the chosen time (Just now). */
/** srLabel: the label is read out but not shown (the sheet's title already says it). */
export function timeField({ minutes, onChange, label, hint, name, fallback = null, allowUnset = false, aside = null, srLabel = false }) {
  const id = nextId('time');
  let value = minutes;
  const start = minutes ?? fallback ?? minutesOfDay(now());
  const wheel = h('div', { class: `wheel${value == null ? ' unset' : ''}`, role: 'group', 'aria-labelledby': label ? id : null, 'aria-label': label ? null : 'Time' });
  const hintEl = h('div', { class: 'field-hint' }, value == null ? (hint || 'Roll to set.') : hint || '');
  const commit = () => {
    const m = hours.index() * 60 + mins.index();
    wheel.classList.remove('unset');
    hintEl.textContent = hint || '';
    if (clearBtn) clearBtn.hidden = false;
    if (m !== value) {
      value = m;
      onChange(m);
    }
  };
  const hours = wheelColumn({ count: 24, index: Math.floor(start / 60), label: 'Hours', part: 'hour', onSettle: commit, loop: true });
  const mins = wheelColumn({ count: 60, index: start % 60, label: 'Minutes', part: 'minute', onSettle: commit, loop: true });
  wheel.append(hours.col, h('div', { class: 'wheel-sep', 'aria-hidden': 'true' }, ':'), mins.col, h('div', { class: 'wheel-lens', 'aria-hidden': 'true' }));

  const clearBtn = allowUnset
    ? h('button', {
      type: 'button',
      class: 'btn-2',
      'data-action': `clear-${name || 'time'}`,
      hidden: value == null,
      onclick: () => {
        value = null;
        wheel.classList.add('unset');
        hintEl.textContent = hint || 'Roll to set.';
        clearBtn.hidden = true;
        onChange(null);
      },
    }, 'Clear')
    : null;

  const wrap = h('div', { class: 'time-wrap time-block', dataset: { time: name || '' } },
    label ? h('div', { class: srLabel ? 'label field-label sr-only' : 'label field-label', id }, label) : null,
    aside ? h('div', { class: 'wheel-row' }, wheel, aside) : wheel,
    h('div', { class: 'time-foot' }, hintEl, clearBtn),
  );
  wrap.set = (m) => {
    value = m;
    if (m == null) {
      wheel.classList.add('unset');
      return;
    }
    wheel.classList.remove('unset');
    hours.set(Math.floor(m / 60));
    mins.set(m % 60);
  };
  Object.defineProperty(wrap, 'value', { get: () => value });
  return wrap;
}

/**
 * Rolling date wheel: one column of days from minKey to maxKey, each shown
 * as Today, Tomorrow, Yesterday or 'Sun 4 Oct'. onChange(key) when a new
 * day comes to rest.
 */
export function dateField({ value, minKey, maxKey, todayKey, onChange, label, name }) {
  const id = nextId('date');
  const keys = [];
  for (let k = minKey; k <= maxKey; k = addDays(k, 1)) keys.push(k);
  const word = (k) => {
    if (k === todayKey) return 'Today';
    if (k === addDays(todayKey, 1)) return 'Tomorrow';
    if (k === addDays(todayKey, -1)) return 'Yesterday';
    return fmtDayShort(k);
  };
  const column = wheelColumn({
    count: keys.length,
    index: Math.max(0, keys.indexOf(value)),
    label: label || 'Date',
    part: 'date',
    text: (i) => word(keys[i]),
    keyOf: (i) => keys[i],
    onSettle: () => onChange(keys[column.index()]),
  });
  const wrap = h('div', { class: 'time-wrap', dataset: { date: name || '' } },
    label ? h('div', { class: 'label field-label', id }, label) : null,
    h('div', { class: 'wheel date', role: 'group', 'aria-labelledby': label ? id : null, 'aria-label': label ? null : 'Date' },
      column.col, h('div', { class: 'wheel-lens', 'aria-hidden': 'true' })));
  wrap.set = (key) => column.set(Math.max(0, keys.indexOf(key)));
  return wrap;
}

/**
 * A rolling wheel over a short list of options ([{ value, label }]).
 * onChange(value) when a new option comes to rest.
 */
export function optionWheel({ options, value, onChange, label, name }) {
  const id = nextId('pick');
  const column = wheelColumn({
    count: options.length,
    index: Math.max(0, options.findIndex((o) => o.value === value)),
    label: label || 'Choice',
    part: 'option',
    text: (i) => options[i].label,
    keyOf: (i) => String(options[i].value),
    onSettle: () => onChange(options[column.index()].value),
  });
  return h('div', { class: 'time-wrap', dataset: { pick: name || '' } },
    label ? h('div', { class: 'label field-label', id }, label) : null,
    h('div', { class: 'wheel date', role: 'group', 'aria-labelledby': label ? id : null, 'aria-label': label ? null : 'Choice' },
      column.col, h('div', { class: 'wheel-lens', 'aria-hidden': 'true' })));
}

export function textField({ value, onInput, label, placeholder, name }) {
  const id = nextId('text');
  const input = h('input', {
    id,
    class: 'field',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'sentences',
    placeholder: placeholder || '',
    maxlength: '60',
    dataset: { field: name || '' },
    value: value || '',
    oninput: () => onInput(input.value.trim()),
  });
  return h('div', { class: 'text-wrap' }, label ? h('label', { class: 'label field-label', for: id }, label) : null, input);
}

/**
 * kind: 'primary', the one solid action on a screen (ink, 56); 'win', Start
 * a meal and Finished this meal (green, 56); 'outline', an action beside it
 * (48); 'danger', something that cannot be undone (ink with a trash glyph,
 * never red); 'secondary', a tertiary pill (44); 'chip', a small pill for a
 * quick value such as Just now. icon: a glyph from icons.js drawn before the
 * label. label may be text or nodes (an icon and text).
 */
export function button(label, onClick, { kind = 'primary', block = false, big = false, name, disabled = false, icon = null } = {}) {
  const cls = kind === 'secondary' ? 'btn-2' : kind === 'chip' ? 'chip'
    : ['btn', { outline: 'outline', win: 'win', danger: 'danger' }[kind] || '', block ? 'block' : '', big ? 'big' : ''].filter(Boolean).join(' ');
  const mark = icon || (kind === 'danger' ? 'trash' : null);
  if (mark) label = [glyph(mark, kind === 'danger' && mark === 'trash' ? { size: 18 } : {}), typeof label === 'string' ? h('span', {}, label) : label];
  // While an action is still saving, further taps are ignored (no double
  // records). The action itself starts inside the tap, so iOS still allows
  // the clipboard and the share sheet.
  let busy = false;
  const run = (e) => {
    if (busy) return;
    const result = onClick(e);
    if (result && typeof result.then === 'function') {
      busy = true;
      b.setAttribute('aria-busy', 'true');
      result.finally(() => {
        busy = false;
        b.removeAttribute('aria-busy');
      });
    }
  };
  const b = h('button', { type: 'button', class: cls, dataset: { action: name || '' }, disabled, onclick: run }, label);
  // Keep the pressed fill visible briefly on touch devices, for every kind.
  b.addEventListener('touchstart', () => b.classList.add('pressed'), { passive: true });
  const off = () => setTimeout(() => b.classList.remove('pressed'), 180);
  b.addEventListener('touchend', off);
  b.addEventListener('touchcancel', off);
  return b;
}

/** A round button with a drawn cross, to put a note away. */
export function closeButton(onClick, { name, label = 'Close' } = {}) {
  return h('button', { type: 'button', class: 'close-x', 'aria-label': label, dataset: { action: name || '' }, onclick: onClick },
    s('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
      s('circle', { cx: 16, cy: 16, r: 15 }),
      s('path', { d: 'M10 10 L22 22 M22 10 L10 22' })));
}

// ---------- Marks drawn in SVG ----------

const { INK, FAST } = P;

// Orange stripes for a miss: drawn in icons.js, the same pattern everywhere.
export { hatch };

const RESULT_KEYS = { 'day-success': 'success', 'day-miss': 'miss', 'day-open': 'unlogged', 'day-ahead': 'future', 'day-paused': 'paused' };

/**
 * A legend key drawn in SVG in the exact shape of the mark it names, 14px by
 * default (--ring-key). Kinds: miss, sun, outside, stage, cutoff; ring-fast,
 * ring-win, ring-full; day-success, day-miss, day-open, day-ahead,
 * day-paused, left-wanting; bar-fast, bar-fast-short, bar-win, bar-miss,
 * bar-selected, band-paused, line-trend, line-average, line-weight,
 * line-meal, latest-square, zone; line-fast and line-win (History's Line
 * view, with { square }); band-used, band-left, band-grace, band-over;
 * track-window, track-open; stop-before_full, stop-full, stop-stuffed,
 * unrated; progress-fast. Small marks keep a 1px edge in their darker tone,
 * so each reaches 3:1. Ink parts carry k-ink, so a chosen legend chip can
 * turn them white.
 */
export function key(kind, { size = 14, square = null } = {}) {
  const sized = (svg) => {
    if (size !== 14) {
      svg.style.setProperty('width', `${size}px`);
      svg.style.setProperty('height', `${size}px`);
    }
    return svg;
  };
  const box = (...kids) => sized(s('svg', { class: 'key', viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }, ...kids));
  const rect = (fill, extra = {}) => s('rect', { x: 1, y: 3, width: 12, height: 8, rx: 2, fill, ...extra });
  const line = (stroke, width, extra = {}) => s('line', { x1: 1, y1: 7, x2: 13, y2: 7, stroke, 'stroke-width': width, 'stroke-linecap': 'round', ...extra });
  if (kind === 'miss') {
    const m = hatch();
    return box(m.defs, s('rect', { x: 1, y: 1, width: 12, height: 12, rx: 3, fill: m.fill, stroke: P.MISS_TEXT, 'stroke-width': 1 }));
  }
  if (kind === 'sun') return box(s('circle', { cx: 7, cy: 7, r: 5, fill: FAST, stroke: P.FAST_TEXT, 'stroke-width': 1 }));
  if (kind === 'outside') return box(s('path', { d: 'M3 3 L11 11 M11 3 L3 11', stroke: P.MISS_TEXT, 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }));
  if (kind === 'stage') return box(s('circle', { class: 'k-ink', cx: 7, cy: 7, r: 6, fill: INK }));
  // The 16:00 line as the day track draws it: --edge, dashed 3 3.
  if (kind === 'cutoff') return box(s('line', { x1: 7, y1: 0.5, x2: 7, y2: 13.5, stroke: P.EDGE, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }));
  const ring = { 'ring-fast': P.FAST, 'ring-win': P.WIN, 'ring-full': P.FULL }[kind];
  if (ring) return box(s('circle', { cx: 7, cy: 7, r: 5.5, fill: 'none', stroke: ring, 'stroke-width': 3 }));
  if (RESULT_KEYS[kind] || kind === 'left-wanting') {
    const svg = kind === 'left-wanting'
      ? s('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }, s('circle', { cx: 7, cy: 7, r: 4.5, fill: P.FULL, stroke: P.FULL_TEXT, 'stroke-width': 1 }))
      : resultRing(RESULT_KEYS[kind], 14);
    svg.removeAttribute('data-result');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('class', 'key');
    for (const dot of svg.querySelectorAll('[data-testid]')) dot.removeAttribute('data-testid');
    return sized(svg);
  }
  if (kind === 'bar-fast') return box(rect(P.FAST, { stroke: P.FAST_TEXT, 'stroke-width': 1 }));
  if (kind === 'bar-fast-short') return box(rect(P.FAST_SOFT, { stroke: P.FAST_TEXT, 'stroke-width': 1.5 }));
  if (kind === 'bar-win' || kind === 'band-used' || kind === 'track-window') return box(rect(P.WIN, { stroke: P.WIN_TEXT, 'stroke-width': 1 }));
  if (kind === 'band-left' || kind === 'track-open') return box(rect(P.WIN_SOFT, { stroke: P.WIN_TEXT, 'stroke-width': 1 }));
  if (kind === 'bar-miss' || kind === 'band-over') {
    const m = hatch();
    return box(m.defs, rect(m.fill, { stroke: P.MISS_TEXT, 'stroke-width': 1 }));
  }
  if (kind === 'bar-selected') return box(rect(INK, { class: 'k-ink', stroke: INK, 'stroke-width': 1.5 }));
  if (kind === 'band-paused') return box(rect(P.TRACK, { stroke: P.QUIET, 'stroke-width': 1 }));
  if (kind === 'band-grace') return box(rect('none', { stroke: P.QUIET, 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }));
  if (kind === 'line-trend') return box(line(INK, 2.5, { class: 'k-ink-line' }));
  if (kind === 'line-average') return box(line(P.QUIET, 1.25, { 'stroke-dasharray': '4 4', 'stroke-linecap': 'butt' }));
  if (kind === 'line-weight') return box(line(P.WEIGHT, 2.5));
  if (kind === 'line-meal') return box(line(P.EDGE, 1.5));
  if (kind === 'progress-fast') return box(s('rect', { x: 0, y: 5, width: 14, height: 4, rx: 2, fill: P.FAST }));
  if (kind === 'latest-square') return box(s('rect', { class: 'k-ink', x: 3, y: 3, width: 8, height: 8, fill: INK }));
  // The comfortable zone is a band across the chart, so its key is a short
  // band too (--shade with an --edge rim), never a square like a mark.
  if (kind === 'zone') return box(s('rect', { x: 0.5, y: 3.5, width: 13, height: 7, fill: P.EDGE, 'fill-opacity': 0.12, stroke: P.EDGE, 'stroke-width': 1 }));
  // History's Line view: the day line in its ring colour, with the square a
  // day carries on it (square: goal, short, win or miss).
  if (kind === 'line-fast' || kind === 'line-win') {
    const colour = kind === 'line-win' ? P.WIN : P.FAST;
    const looks = { goal: [P.FAST, P.FAST_TEXT, 1], short: [P.FAST_SOFT, P.FAST_TEXT, 1.5], win: [P.WIN, P.WIN_TEXT, 1] };
    const stripes = square === 'miss' ? hatch() : null;
    const [fill, edge, width] = stripes ? [stripes.fill, P.MISS_TEXT, 1] : square ? looks[square] : [];
    return box(stripes ? stripes.defs : null,
      line(colour, 2),
      square ? s('rect', { x: 3.5, y: 3.5, width: 7, height: 7, fill, stroke: edge, 'stroke-width': width }) : null);
  }
  if (kind === 'unrated' || kind.startsWith('stop-')) {
    const mark = stopMark(kind === 'unrated' ? null : kind.slice(5), { x: 7, y: 7, r: 5 });
    mark.removeAttribute('data-stop');
    mark.removeAttribute('data-series');
    return box(mark);
  }
  // A kind with no drawing would leave its word with no mark beside it.
  throw new Error(`key(): no key is drawn for "${kind}"`);
}

/** Every kind key() draws (tests/unit/legend.test.js holds the screens to it). */
export const KEY_KINDS = [
  'miss', 'sun', 'outside', 'stage', 'cutoff',
  'ring-fast', 'ring-win', 'ring-full',
  ...Object.keys(RESULT_KEYS), 'left-wanting',
  'bar-fast', 'bar-fast-short', 'bar-win', 'bar-miss', 'bar-selected', 'band-paused',
  'line-trend', 'line-average', 'line-weight', 'line-meal', 'latest-square', 'zone',
  'line-fast', 'line-win',
  'band-used', 'band-left', 'band-grace', 'band-over', 'track-window', 'track-open',
  'stop-before_full', 'stop-full', 'stop-stuffed', 'unrated', 'progress-fast',
];

/**
 * A legend: each colour or mark beside the word for what it means, so no mark
 * relies on colour alone. items: [key, label, series?], where key is a key()
 * kind ('ring-fast', 'day-miss', ...) or a node such as an icon. Empty items
 * are skipped. With onPick, an item with a series is a chip that shows only
 * that series.
 */
export function legend(items, testid, { focus = null, onPick = null } = {}) {
  return h('div', { class: 'legend', 'data-testid': testid || null }, items.filter(Boolean).map(([mark, label, series]) => {
    const icon = typeof mark === 'string' ? key(mark) : mark;
    // With a series and onPick, the item is a button: tap to show only that
    // series, tap again to show everything.
    if (!onPick || series == null) return h('span', { class: 'legend-item' }, icon, label);
    return h('button', {
      type: 'button', class: 'legend-item legend-pick', 'data-series': series, 'aria-pressed': String(focus === series),
      onclick: () => onPick(focus === series ? null : series),
    }, icon, label);
  }));
}

/** 'Showing Overfull only.' with Show all, above a filtered view. */
export function focusLine(text, onClear, testid) {
  return h('div', { class: 'btn-row focus-line gap', 'data-testid': testid },
    h('span', { class: 'small' }, text),
    button('Show all', onClear, { kind: 'secondary', name: 'show-all' }));
}

/**
 * A miss in words beside its stripes key. The testid sits on the words, so
 * code that sets textContent keeps the key; an empty line hides itself.
 * text may be a list of reasons: each gets its own key, and the words span
 * reads them as one sentence, joined by spaces.
 */
export function missLine(text, { testid } = {}) {
  let line;
  let words;
  if (Array.isArray(text)) {
    const reasons = text.filter(Boolean);
    words = h('span', { 'data-testid': testid || null });
    reasons.forEach((r, i) => {
      if (i) words.append(' ');
      words.append(h('span', { class: 'miss-reason' }, key('miss', { size: 16 }), h('span', {}, r)));
    });
    line = h('div', { class: 'miss-line multi' }, words);
  } else {
    words = h('span', { 'data-testid': testid || null }, text || null);
    line = h('div', { class: 'miss-line' }, key('miss', { size: 16 }), words);
  }
  watchMissLine(line, words, testid);
  /** New words for a single-sentence line; it eases in when they go from none to some. */
  line.set = (next) => { words.textContent = next || ''; };
  return line;
}

// The words each miss line last showed, by its testid (or by the words when
// it has none): a line eases in only when its words are new, never because
// the screen was drawn again with the same ones.
const missShown = new Map();

function watchMissLine(line, words, testid) {
  const enter = () => {
    line.classList.remove('appear');
    void line.offsetWidth; // restart the entrance
    line.classList.add('appear');
  };
  const t = words.textContent;
  if (t && missShown.get(testid || t) !== t) enter();
  if (t) missShown.set(testid || t, t);
  if (typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => {
    const now = words.textContent;
    const k = testid || now;
    if (now && missShown.get(k) !== now) enter();
    if (testid) missShown.set(testid, now);
    else if (now) missShown.set(now, now);
  }).observe(words, { childList: true, characterData: true, subtree: true });
}

/** An error in words beside an alert glyph, in ink (never red or orange). */
export function errorLine(text, { testid } = {}) {
  return h('div', { class: 'error-line' }, glyph('alert', { size: 16 }), h('span', { 'data-testid': testid || null, role: 'alert' }, text || null));
}

/**
 * The goal as two figures: the fast and the window, each with its ring key
 * and its word (the legend). node.set({ fastHours, windowHours }) updates it.
 */
export function goalPair({ fastHours, windowHours }) {
  const fastFig = h('div', { class: 'goal-pair-figure' });
  const winFig = h('div', { class: 'goal-pair-figure' });
  const node = h('div', { class: 'goal-pair', 'data-testid': 'goal-pair', 'aria-live': 'polite' },
    h('div', { class: 'goal-pair-item', 'data-ring': 'fast' }, h('div', { class: 'goal-pair-label' }, key('ring-fast'), h('span', {}, 'Fast')), fastFig),
    h('div', { class: 'goal-pair-item', 'data-ring': 'win' }, h('div', { class: 'goal-pair-label' }, key('ring-win'), h('span', {}, 'Window')), winFig));
  node.set = ({ fastHours: f, windowHours: w }) => {
    fastFig.replaceChildren(figureParts([[f, 'h']]));
    winFig.replaceChildren(figureParts([[w, 'h']]));
  };
  node.set({ fastHours, windowHours });
  return node;
}

/** Text with compound terms ("7-day", "20-minute") kept on one line; textContent is unchanged. */
export function nowrapTerms(text) {
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const m of String(text).matchAll(/\b\d+-(?:day|minute|hour|week)\b/g)) {
    if (m.index > at) frag.append(text.slice(at, m.index));
    frag.append(h('span', { class: 'nowrap' }, m[0]));
    at = m.index + m[0].length;
  }
  if (at < text.length) frag.append(text.slice(at));
  return frag;
}

export const TRIGGER_OPTIONS = [
  { value: 'hunger', label: 'Hunger' },
  { value: 'boredom', label: 'Boredom' },
  { value: 'social', label: 'Social' },
  { value: 'stress', label: 'Stress' },
  { value: 'tired', label: 'Tired' },
  { value: 'other', label: 'Other' },
];

// How a meal ended (fullness). The stored values stay as before.
export const STOP_OPTIONS = [
  { value: 'before_full', label: 'Left wanting' },
  { value: 'full', label: 'Satisfied' },
  { value: 'stuffed', label: 'Overfull' },
];

export const STOP_TEXT = { before_full: 'left wanting', full: 'satisfied', stuffed: 'overfull' };

export const TRAINING_OPTIONS = [
  { value: 'weights', label: 'Weights' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

export const OUTCOME_TEXT = {
  held: 'Held',
  opened_early: 'Opened the window early',
  ate_little: 'Ate a little outside the window',
  ate_outside: 'Ate outside the window',
};
