// Shared controls: rating scales, choices, the rolling 24-hour time wheel, fields.

import * as P from './palette.js';
import { h, s } from './dom.js';
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
  const sync = () => {
    const b = buttons.find(isChosen) || null;
    if (b === committed) return;
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
 * for a chart's own controls.
 */
export function choice({ options, value, onChange, label, cols = 3, name, slim = false, ariaLabel = null }) {
  const labelId = nextId('choice');
  const line = slim || (options.length <= cols && !options.some((o) => o.wide));
  // Five or more across: smaller words, so each keeps clear of the rounded ends.
  const cls = ['choice', slim ? 'slim' : cols >= 5 ? 'many' : '', line ? '' : 'grid'].filter(Boolean).join(' ');
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
  return h('div', { class: 'choice-wrap' }, label ? h('div', { class: 'label field-label', id: labelId }, label) : null, grid);
}

// ---------- Rolling wheels ----------

const ROW = 36; // px per row; five rows show, the middle one is selected
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
export function timeField({ minutes, onChange, label, hint, name, fallback = null, allowUnset = false, aside = null }) {
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

  const wrap = h('div', { class: 'time-wrap', dataset: { time: name || '' } },
    label ? h('div', { class: 'label field-label', id }, label) : null,
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
 * kind: 'primary', the one solid action on a screen; 'outline', an action
 * beside it; 'secondary', a quiet text action; 'chip', a small pill for a
 * quick value such as Just now. label may be text or nodes (an icon and text).
 */
export function button(label, onClick, { kind = 'primary', block = false, big = false, name, disabled = false } = {}) {
  const cls = kind === 'secondary' ? 'btn-2' : kind === 'chip' ? 'chip' : ['btn', kind === 'outline' ? 'outline' : '', block ? 'block' : '', big ? 'big' : ''].filter(Boolean).join(' ');
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
  if (kind !== 'secondary') {
    // Keep the pressed fill visible briefly on touch devices.
    b.addEventListener('touchstart', () => b.classList.add('pressed'), { passive: true });
    const off = () => setTimeout(() => b.classList.remove('pressed'), 180);
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
  }
  return b;
}

/** A round button with a drawn cross, to put a note away. */
export function closeButton(onClick, { name, label = 'Close' } = {}) {
  return h('button', { type: 'button', class: 'close-x', 'aria-label': label, dataset: { action: name || '' }, onclick: onClick },
    s('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: 'M2 2 L12 12 M12 2 L2 12' })));
}

// ---------- Marks drawn in SVG ----------

const { INK, MISS, FAST, PAGE } = P;

let hatches = 0;

/**
 * Orange stripes, the mark of a miss wherever it appears, so a miss never
 * rests on its colour alone. Returns the pattern to put in an SVG and its fill.
 */
export function hatch(color = MISS, ground = PAGE) {
  const id = `miss-hatch-${++hatches}`;
  return {
    fill: `url(#${id})`,
    defs: s('defs', {}, s('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 5, height: 5, fill: ground }),
      s('line', { x1: 1.25, y1: 0, x2: 1.25, y2: 5, stroke: color, 'stroke-width': 2.5 }))),
  };
}

/** A legend key drawn in SVG, like the mark it names: a miss, now, eating outside, the 16:00 line, the current stage. */
export function key(kind) {
  const box = (...kids) => s('svg', { class: 'key', viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }, ...kids);
  if (kind === 'miss') {
    const m = hatch();
    return box(m.defs, s('rect', { x: 1, y: 1, width: 12, height: 12, rx: 3, fill: m.fill, stroke: MISS, 'stroke-width': 1.5 }));
  }
  if (kind === 'sun') return box(s('circle', { cx: 7, cy: 7, r: 5, fill: FAST }));
  if (kind === 'outside') return box(s('path', { d: 'M3 3 L11 11 M11 3 L3 11', stroke: MISS, 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }));
  if (kind === 'stage') return box(s('circle', { cx: 7, cy: 7, r: 6, fill: INK }));
  if (kind === 'cutoff') return box(s('line', { x1: 7, y1: 0, x2: 7, y2: 14, stroke: INK, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }));
  return box();
}

/**
 * A legend: each colour or mark beside the word for what it means, so no mark
 * relies on colour alone. items: [key, label], where key is a swatch class
 * ('miss', 'paused', ...) or a node such as an icon. Empty items are skipped.
 */
export function legend(items, testid, { focus = null, onPick = null } = {}) {
  return h('div', { class: 'legend', 'data-testid': testid || null }, items.filter(Boolean).map(([key, label, series]) => {
    const icon = typeof key === 'string' ? h('span', { class: `swatch ${key}`, 'aria-hidden': 'true' }) : key;
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

export const TRIGGER_OPTIONS = [
  { value: 'hunger', label: 'Hunger' },
  { value: 'boredom', label: 'Boredom' },
  { value: 'social', label: 'Social' },
  { value: 'stress', label: 'Stress' },
  { value: 'tired', label: 'Tired' },
  { value: 'other', label: 'Other' },
];

// How a meal ended (fullness, شبع). The stored values stay as before.
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
