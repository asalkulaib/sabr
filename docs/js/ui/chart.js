// The 7-day weight average over time: one series, a recessive rock line
// with a mark on each day you weighed in and the latest emphasised and
// labelled. Days sit at their place in time, and the line breaks where a
// week went without a figure. Solid hairline grid. A touch readout and a
// table view carry every value, so the chart never gates a number.

import * as C from './palette.js';
import { h, s } from './dom.js';
import { legend } from './components.js';
import { addDays, daysBetween, fmtDayMonth, fmtDayShort, fmtMonthYear } from '../core/time.js';
import { chartRuns } from '../core/weight.js';

const W = 340;
const H = 190;
const PAD = { top: 18, right: 46, bottom: 30, left: 38 };
const LINE = C.WEIGHT; // the weight line, in indigo
const LATEST = C.INK; // the latest point
const INK = C.INK;
const SURFACE = C.PAGE; // ring around markers
const GRID = C.GRID;

function niceStep(range) {
  const steps = [0.2, 0.5, 1, 2, 5, 10];
  return steps.find((st) => range / st <= 4) || 10;
}

/** Marks closer than this (in chart units) would overlap: the line carries those points. */
const MARK_ROOM = 10;

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

  let lo = Math.min(...data.map((p) => p.avg));
  let hi = Math.max(...data.map((p) => p.avg));
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const span = Math.max(0, daysBetween(from, to));
  const x = (date) => PAD.left + (span === 0 ? plotW / 2 : (daysBetween(from, date) / span) * plotW);
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const yy = y(v).toFixed(1);
    grid.push(s('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: GRID, 'stroke-width': '1' }));
    grid.push(s('text', { x: PAD.left - 8, y: Number(yy) + 4, 'text-anchor': 'end' }, v.toFixed(step < 1 ? 1 : 0)));
  }

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

  const marker = (p, latest) => {
    const size = latest ? 10 : 7;
    return s('rect', {
      x: (x(p.date) - size / 2).toFixed(1), y: (y(p.avg) - size / 2).toFixed(1), width: size, height: size,
      fill: latest ? LATEST : LINE, stroke: latest ? SURFACE : 'none', 'stroke-width': '1.5', class: latest ? 'latest' : null,
    });
  };
  // Every point gets a mark when there is room for them all; otherwise the line
  // carries them, and a point standing alone (no line through it) keeps its mark.
  const gaps = data.slice(1).map((p, i) => x(p.date) - x(data[i].date));
  const room = !gaps.length || Math.min(...gaps) >= MARK_ROOM;
  const lone = new Set(runs.filter((r) => r.length === 1).map((r) => r[0]));
  const marks = data.filter((p) => p !== last && (room || lone.has(p))).map((p) => marker(p, false)).concat(marker(last, true));

  const cross = s('line', { y1: PAD.top, y2: H - PAD.bottom, stroke: C.FAINT, 'stroke-width': '1', visibility: 'hidden' });
  const svg = s('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0',
    'aria-label': `7-day weight average on ${data.length} ${data.length === 1 ? 'day' : 'days'} from ${fmtDayShort(from)} to ${fmtDayShort(to)}. Latest ${last.avg.toFixed(1)} kg on ${fmtDayShort(last.date)}.`,
  },
    ...grid,
    ...xLabels,
    path ? s('path', { d: path, fill: 'none', stroke: LINE, 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }) : null,
    cross,
    ...marks,
    s('text', { x: lx + 9, y: ly + 4, class: 'chart-end', fill: INK }, last.avg.toFixed(1)),
  );

  // Touch and keys snap to the nearest day with a figure, and hand it to the screen.
  const chosen = data.findIndex((p) => p.date === selected);
  let active = chosen >= 0 ? chosen : data.length - 1;
  const place = (i) => {
    const p = data[i];
    cross.setAttribute('x1', x(p.date));
    cross.setAttribute('x2', x(p.date));
    cross.setAttribute('visibility', 'visible');
  };
  const show = (i) => {
    active = Math.max(0, Math.min(data.length - 1, i));
    place(active);
    onSelect(data[active].date);
  };
  if (chosen >= 0) place(chosen);
  const nearest = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    let best = 0;
    data.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(data[best].date) - px)) best = i; });
    return best;
  };
  // A touch that turns out to be a scroll (the browser cancels it) puts the day back as it was.
  let before = null;
  svg.addEventListener('pointerdown', (e) => { before = active; show(nearest(e)); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') show(nearest(e)); });
  svg.addEventListener('pointerup', () => { before = null; });
  svg.addEventListener('pointercancel', () => {
    if (before != null) {
      const back = before;
      before = null;
      show(back);
    }
  });
  svg.addEventListener('focus', () => show(active));
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(active - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(active + 1); }
  });

  return h('div', { class: 'chart-wrap' }, svg,
    legend([['rock-line', '7-day average'], ['pick', 'Latest']], 'weight-legend'), hint);
}

/** Table view of the same 7-day averages, newest first. */
export function weightTable(points) {
  return h('table', { class: 'table', 'data-testid': 'weight-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Day'), h('th', { scope: 'col' }, '7-day average'), h('th', { scope: 'col' }, 'Weigh-ins'))),
    h('tbody', {}, [...points].reverse().map((p) => h('tr', {},
      h('td', {}, fmtDayShort(p.date)), h('td', {}, `${p.avg.toFixed(1)} kg`), h('td', {}, String(p.n))))));
}
