// The 7-day weight average over time: one indigo line, a dot on each day
// you weighed in while they have room, and the latest as an ink square with
// its figure. Days sit at their place in time, and the line breaks where a
// week went without a figure. Touching or dragging along it chooses a day:
// a crosshair, a ringed dot and the date at the top show which, and the big
// figure above follows. A table view carries every value, so the chart never
// gates a number.

import * as C from './palette.js';
import { h, s } from './dom.js';
import { legend } from './components.js';
import { addDays, daysBetween, fmtDayMonth, fmtDayShort, fmtMonthYear } from '../core/time.js';
import { chartRuns } from '../core/weight.js';

const W = 340;
const H = 200;
const PAD = { top: 24, right: 46, bottom: 30, left: 38 };
const LINE = C.WEIGHT; // the weight line, in indigo

/** The clear space dots need between them (in chart units); closer, the line carries those points. */
const MARK_ROOM = 4;
/** A weigh-in dot and the page ring around it. */
const DOT_R = 2.5;
const DOT_RING = 1;

/** A scale of at most four ticks that holds lo and hi. */
function yScale(lo, hi) {
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  for (const step of [0.5, 1, 2, 5, 10, 20, 50, 100]) {
    const a = Math.floor(lo / step + 1e-9) * step;
    const b = Math.ceil(hi / step - 1e-9) * step;
    if ((b - a) / step <= 3 + 1e-9) return { lo: a, hi: b, step };
  }
  return { lo, hi, step: hi - lo };
}

/**
 * points: [{ date, avg, n }] oldest first. from and to: the days the axis
 * spans (the time frame chosen, up to today). selected: a day chosen
 * earlier, marked by the crosshair; onSelect(date) as touch or the arrow
 * keys move along the days, so the screen can show that day.
 */
export function weightChart(points, { from, to, selected = null, onSelect = () => {} }) {
  const data = points;
  const hint = h('p', { class: 'small quiet chart-readout' }, 'Touch the chart to see a day above.');
  if (!data.length) return h('div');

  const { lo, hi, step } = yScale(Math.min(...data.map((p) => p.avg)), Math.max(...data.map((p) => p.avg)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const span = Math.max(0, daysBetween(from, to));
  const x = (date) => PAD.left + (span === 0 ? plotW / 2 : (daysBetween(from, date) / span) * plotW);
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

  // Hairlines for the ticks, the lowest an edge; the unit once, over the axis.
  const grid = [];
  for (let v = lo, k = 0; v <= hi + 1e-9; v += step, k++) {
    const yy = y(v).toFixed(1);
    grid.push(s('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: k === 0 ? C.EDGE : C.GRID, 'stroke-width': '1' }));
    grid.push(s('text', { x: PAD.left - 8, y: Number(yy) + 4, 'text-anchor': 'end' }, v.toFixed(step < 1 ? 1 : 0)));
  }
  grid.push(s('text', { x: PAD.left - 8, y: PAD.top - 10, 'text-anchor': 'end' }, 'kg'));

  // The axis: its first day, its middle and today; months and years past most of a year.
  const label = span > 330 ? fmtMonthYear : fmtDayMonth;
  const ticks = [[from, 'start'], span > 1 ? [addDays(from, Math.floor(span / 2)), 'middle'] : null, span > 0 ? [to, 'end'] : null].filter(Boolean);
  const xLabels = ticks.map(([date, anchor]) => s('text', { x: x(date).toFixed(1), y: H - 8, 'text-anchor': span === 0 ? 'middle' : anchor }, label(date)));

  // One stroke per run of days no more than a week apart.
  const runs = chartRuns(data);
  const path = runs.filter((r) => r.length > 1)
    .map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.avg).toFixed(1)}`).join(' ')).join(' ');
  const last = data[data.length - 1];
  const lx = x(last.date);
  const ly = y(last.avg);

  // Every weigh-in gets a dot while there is room for them all; otherwise the
  // line carries them. A point standing alone (no line through it) keeps a
  // square, and the latest is the ink square with its figure.
  const gaps = data.slice(1).map((p, i) => x(p.date) - x(data[i].date));
  // Room means clear space between whole dots, ring and all, not just their centres apart.
  const room = !gaps.length || Math.min(...gaps) >= 2 * (DOT_R + DOT_RING) + MARK_ROOM;
  const lone = new Set(runs.filter((r) => r.length === 1).map((r) => r[0]));
  const square = (p, size, cls = null) => s('rect', {
    x: (x(p.date) - size / 2).toFixed(1), y: (y(p.avg) - size / 2).toFixed(1), width: size, height: size,
    fill: cls ? C.INK : LINE, stroke: C.PAGE, 'stroke-width': '1.5', class: cls,
  });
  const marks = data.filter((p) => p !== last).map((p) => (lone.has(p)
    ? square(p, 7)
    : room ? s('circle', { cx: x(p.date).toFixed(1), cy: y(p.avg).toFixed(1), r: DOT_R, fill: LINE, stroke: C.PAGE, 'stroke-width': 2 * DOT_RING, class: 'weigh-in' }) : null))
    .filter(Boolean)
    .concat(square(last, 10, 'latest'));

  // The day chosen: a crosshair, a ringed dot on the line and its date at the top.
  const cross = s('line', { class: 'chosen-part', x1: 0, x2: 0, y1: PAD.top, y2: H - PAD.bottom, stroke: C.INK, 'stroke-width': '1' });
  const dot = s('circle', { class: 'chosen-part', cx: 0, cy: 0, r: 5, fill: C.PAGE, stroke: C.INK, 'stroke-width': 2.5 });
  const tag = s('text', { class: 'chosen-part date-tag', x: 0, y: PAD.top - 10, 'text-anchor': 'middle' });

  const svg = s('svg', {
    class: 'chart weight-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0',
    'aria-label': `7-day weight average on ${data.length} ${data.length === 1 ? 'day' : 'days'} from ${fmtDayShort(from)} to ${fmtDayShort(to)}. Latest ${last.avg.toFixed(1)} kg on ${fmtDayShort(last.date)}.`,
  },
    ...grid,
    ...xLabels,
    cross,
    path ? s('path', { d: path, fill: 'none', stroke: LINE, 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }) : null,
    ...marks,
    s('text', { x: lx + 9, y: ly + 4, class: 'chart-end' }, last.avg.toFixed(1)),
    dot,
    tag,
  );

  // Touch and keys snap to the nearest day with a figure, and hand it to the screen.
  const chosen = data.findIndex((p) => p.date === selected);
  let active = chosen >= 0 ? chosen : data.length - 1;
  let pressing = false;
  let focused = false;
  const place = (i) => {
    const p = data[i];
    const px = x(p.date);
    cross.style.setProperty('transform', `translate(${px.toFixed(1)}px, 0)`);
    dot.style.setProperty('transform', `translate(${px.toFixed(1)}px, ${y(p.avg).toFixed(1)}px)`);
    const text = fmtDayMonth(p.date);
    const half = text.length * 3.6;
    tag.textContent = text;
    tag.style.setProperty('transform', `translate(${Math.max(PAD.left + half, Math.min(W - half, px)).toFixed(1)}px, 0)`);
  };
  // Shown while a day other than the latest is chosen, a finger is on the
  // chart, or the keyboard has brought focus to it.
  const reveal = () => {
    const on = active !== data.length - 1 || pressing || (focused && svg.matches(':focus-visible'));
    const was = svg.classList.contains('chosen-on');
    if (on && !was) {
      // It appears where it is, not gliding in from where it was last.
      svg.classList.add('chosen-still');
      place(active);
      void getComputedStyle(cross).transform;
      svg.classList.remove('chosen-still');
    } else {
      place(active);
    }
    svg.classList.toggle('chosen-on', on);
  };
  const show = (i) => {
    active = Math.max(0, Math.min(data.length - 1, i));
    reveal();
    onSelect(data[active].date);
  };
  if (chosen >= 0) reveal();
  const nearest = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    let best = 0;
    data.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(data[best].date) - px)) best = i; });
    return best;
  };
  // A tap or an arrow glides the crosshair; a drag follows the finger exactly.
  // A touch that turns out to be a scroll (the browser cancels it) puts the day back as it was.
  let before = null;
  const release = () => { pressing = false; reveal(); };
  svg.addEventListener('pointerdown', (e) => {
    before = active;
    pressing = true;
    // A mouse let go outside the chart still ends the press.
    if (e.pointerType !== 'touch') svg.setPointerCapture?.(e.pointerId);
    svg.classList.add('chosen-glide');
    show(nearest(e));
  });
  svg.addEventListener('pointermove', (e) => {
    if (!(e.buttons || e.pointerType === 'touch')) return;
    svg.classList.remove('chosen-glide');
    show(nearest(e));
  });
  svg.addEventListener('pointerup', () => { before = null; release(); });
  svg.addEventListener('lostpointercapture', () => { if (pressing) { before = null; release(); } });
  svg.addEventListener('pointercancel', () => {
    pressing = false;
    if (before != null) {
      const back = before;
      before = null;
      show(back);
    } else reveal();
  });
  svg.addEventListener('focus', () => { focused = true; show(active); });
  svg.addEventListener('blur', () => { focused = false; reveal(); });
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    svg.classList.add('chosen-glide');
    show(active + (e.key === 'ArrowLeft' ? -1 : 1));
  });

  return h('div', { class: 'chart-wrap' }, hint, svg,
    legend([['line-weight', '7-day average'], ['latest-square', 'Latest']], 'weight-legend'));
}

/** Table view of the same 7-day averages, newest first. */
export function weightTable(points) {
  return h('table', { class: 'table', 'data-testid': 'weight-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Day'), h('th', { scope: 'col' }, '7-day average'), h('th', { scope: 'col' }, 'Weigh-ins'))),
    h('tbody', {}, [...points].reverse().map((p) => h('tr', {},
      h('td', {}, fmtDayShort(p.date)), h('td', {}, `${p.avg.toFixed(1)} kg`), h('td', {}, String(p.n))))));
}
