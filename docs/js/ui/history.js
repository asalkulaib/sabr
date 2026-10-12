// History: fast or feast hours per day, as bars or a line, over 7, 30 or
// 90 days. The average leads on the page, then the chart at full width.
// Fasts that reached the goal are the fast's red, fasts short of it hollow
// red, windows green, misses orange stripes and the selected day ink; the
// 7-day trend in ink over a dashed quiet average; paused days a grey band.
// Touch or drag along the chart to read the day under the finger; the
// readout card and Open this day follow. A table view repeats the values.

import * as C from './palette.js';
import { h, s, dimOthers } from './dom.js';
import { button, choice, durationFigure, focusLine, hatch, key, legend } from './components.js';
import * as store from '../store.js';
import { HOUR, addDays, fmtDayMonth, fmtDayShort, fmtDuration, fmtFigure, weekdayShort, keyParts } from '../core/time.js';
import { dailySeries, hourScale, rollingAverage, summarize } from '../core/history.js';
import { fastHoursFor } from '../core/rules.js';
import { header } from './shared.js';

const W = 340;
const HT = 232;
const PAD = { top: 16, right: 8, bottom: 28, left: 32 };
const LABEL_ROOM = 32; // the plot's top padding when value labels sit over the marks
const LABEL_LINE = 12; // hours over minutes in a value label
// A value label's box around its lower baseline: the halo above the hours and
// below the minutes, and half its width, so no line ever runs through it.
const LABEL_ASCENT = 13;
const LABEL_DESCENT = 5;
const LABEL_HALF = 13;
const LABEL_CLEAR = 2;

const METRICS = {
  fast: { key: 'fastMs', name: 'Fast', mark: 'Hours fasted', short: 'Short of the goal', noun: 'fast', empty: 'Fasts appear here from the day after your first logged window.', how: 'Each fast runs from one day\'s last bite to the next first bite.' },
  feast: { key: 'feastMs', name: 'Feast', mark: 'Hours in the window', noun: 'window', empty: 'Your eating windows appear here once you close one.', how: 'Each window runs from a day\'s first bite to its last.' },
};

const FOR_REASON = { travel: ' for travel', illness: ' for illness', ramadan: ' for Ramadan' };

const FOCUS_KEYS = ['bar', 'goal', 'miss', 'trend', 'avg', 'paused'];

const NBSP = ' ';

let selected = null; // the day the reader picked, kept across redraws
let drawnShape = null; // the metric, range and kind last drawn: bars rise only when it changes
let ids = 0;

function prefs(settings) {
  return {
    metric: METRICS[settings.historyMetric] ? settings.historyMetric : 'fast',
    chart: settings.historyChart === 'line' ? 'line' : 'bars',
    range: [7, 30, 90].includes(settings.historyRange) ? settings.historyRange : 30,
  };
}

/** A path through the values, broken where a day has none. */
function linePath(values, xc, y) {
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? 'L' : 'M'}${xc(i).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  return d.trim();
}

/** The grid and the axis words. */
function frame(series, { step, top }, height, padTop = PAD.top) {
  const n = series.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - padTop - PAD.bottom;
  const slot = plotW / n;
  const xc = (i) => PAD.left + slot * i + slot / 2;
  const y = (ms) => padTop + plotH * (1 - ms / (top * HOUR));
  const grid = [];
  for (let v = 0; v <= top; v += step) {
    const yy = y(v * HOUR).toFixed(1);
    // The baseline is an edge; the other hours are hairlines.
    grid.push(s('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: v === 0 ? C.EDGE : C.GRID, 'stroke-width': 1 }));
    grid.push(s('text', { x: PAD.left - 6, y: Number(yy) + 4, 'text-anchor': 'end' }, v === top ? `${v} h` : String(v)));
  }
  const labelIdx = n <= 7 ? series.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = labelIdx.map((i) => {
    const d = series[i].day;
    const text = n <= 7 ? `${weekdayShort(d).slice(0, 2)} ${keyParts(d).d}` : fmtDayMonth(d);
    const anchor = n <= 7 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    const x = n <= 7 ? xc(i) : i === 0 ? PAD.left : i === n - 1 ? W - PAD.right : xc(i);
    return s('text', { x, y: height - 8, 'text-anchor': anchor, 'data-x-for': n <= 7 ? series[i].day : null }, text);
  });
  return { n, slot, xc, y, plotTop: padTop, plotH, grid, xLabels };
}

/**
 * The chart. Returns { svg, pick(i) }: pick restyles the marks for a newly
 * selected day in place, so a finger dragged along the chart never redraws
 * the screen under it. onPick(day) is called as touch, drag or the arrow keys
 * reach a day.
 */
function chart({ series, trend, metric, kind, isMiss, avgMs, onPick, focus, goalMs, rise }) {
  const valueKey = METRICS[metric].key;
  const values = series.map((d) => d[valueKey]);
  // Over 7 days each mark carries its value, so the plot leaves room above for its two lines.
  const labelled = series.length <= 7;
  const many = series.length > 30;
  const { n, slot, xc, y, plotTop, plotH, grid, xLabels } = frame(series, hourScale(Math.max(...values.filter((v) => v != null), HOUR)), HT, labelled ? LABEL_ROOM : PAD.top);
  let pickIdx = series.findIndex((d) => d.day === selected);

  // Paused days: a quiet band behind everything.
  const bands = series.map((d, i) => (d.paused
    ? { i, el: s('rect', { x: (PAD.left + slot * i).toFixed(1), y: plotTop, width: slot.toFixed(1), height: plotH, fill: C.TRACK, 'data-paused': d.day, 'data-series': 'paused' }) }
    : null)).filter(Boolean);

  // A miss is orange stripes, selected or not, so it never rests on its colour
  // alone. A fast that reached its goal is the fast's red; short of it, hollow
  // red. Windows (Feast) are the window's green. Each mark keeps an edge in its
  // darker tone, thinned on narrow bars.
  const stripes = hatch();
  const missAt = series.map((d) => isMiss(d.day));
  const reached = (i) => metric === 'fast' && values[i] != null && !missAt[i] && values[i] >= goalMs(series[i].day);
  const seriesOf = (i) => (missAt[i] ? 'miss' : reached(i) ? 'goal' : 'bar');
  const gap = Math.min(2, slot * 0.3);
  const bw = Math.min(24, slot - gap);
  const look = (i, pick, room) => {
    const thin = (w) => Math.min(w, room / 3);
    if (i === pick) return { fill: missAt[i] ? stripes.fill : C.INK, stroke: C.INK, width: thin(1.5) };
    if (missAt[i]) return { fill: stripes.fill, stroke: C.MISS_TEXT, width: thin(1) };
    if (metric === 'feast') return { fill: C.WIN, stroke: C.WIN_TEXT, width: thin(1) };
    if (reached(i)) return { fill: C.FAST, stroke: C.FAST_TEXT, width: thin(1) };
    return { fill: C.FAST_SOFT, stroke: C.FAST_TEXT, width: thin(1.5) };
  };
  const paint = (el, i, pick, room) => {
    const l = look(i, pick, room);
    el.setAttribute('fill', l.fill);
    el.setAttribute('stroke', l.stroke);
    el.setAttribute('stroke-width', String(Number(l.width.toFixed(2))));
  };

  const bars = [];
  const markers = s('g', {});
  // Over 90 days a fast that reached its goal is a small plain square on the
  // day line, under the average and the trend, so the trend stays on top.
  const goalMarks = s('g', {});
  let line = null;
  if (kind === 'bars') {
    values.forEach((v, i) => {
      if (v == null) return;
      const bar = s('rect', {
        x: (xc(i) - bw / 2).toFixed(1), y: y(v).toFixed(1), width: bw.toFixed(1), height: (y(0) - y(v)).toFixed(1),
        'data-day': series[i].day, 'data-miss': missAt[i] ? 'true' : null, 'data-goal': reached(i) ? 'true' : null, 'data-series': seriesOf(i),
      });
      paint(bar, i, pickIdx, bw);
      // Bars rise once when the metric, range or kind changes, one after another.
      if (rise) {
        bar.classList.add('bar-rise');
        bar.style.setProperty('--delay', `${Math.min(i * 4, 160)}ms`);
      }
      bars.push({ i, el: bar });
    });
  } else {
    // A line in the metric's colour that breaks over days with no value,
    // lighter over many days; square markers when they fit, and always for
    // missed days and the selected one.
    const d = linePath(values, xc, y);
    if (d) {
      line = s('path', {
        d, fill: 'none', stroke: metric === 'feast' ? C.WIN : C.FAST, 'stroke-width': many ? 1.5 : 2, 'stroke-opacity': many ? 0.45 : null,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-series': 'bar',
      });
    }
  }
  // Line markers are redrawn on a new pick: which days carry one depends on it.
  const square = (i, v, size) => {
    const x = Math.max(PAD.left, Math.min(xc(i) - size / 2, W - PAD.right - size));
    return s('rect', {
      x: x.toFixed(1), y: (y(v) - size / 2).toFixed(1), width: size, height: size,
      'data-day': series[i].day, 'data-miss': missAt[i] ? 'true' : null, 'data-goal': reached(i) ? 'true' : null, 'data-series': seriesOf(i),
    });
  };
  const drawMarkers = (pick) => {
    if (kind === 'bars') return;
    // Over 90 days the line carries the days: a fast that reached its goal
    // keeps a small plain square (2.5, clear of the 3.3 between days), a
    // miss a half square (5) and the selected day a full one (10).
    goalMarks.replaceChildren(...(many ? values.map((v, i) => {
      if (v == null || i === pick || !reached(i)) return null;
      return square(i, v, 2.5);
    }).filter(Boolean) : []));
    for (const m of goalMarks.children) {
      m.setAttribute('fill', C.FAST);
      m.setAttribute('stroke', 'none');
    }
    markers.replaceChildren(...values.map((v, i) => {
      if (v == null) return null;
      const isPick = i === pick;
      if (!isPick && !missAt[i] && many) return null;
      const size = isPick ? 10 : many ? 5 : 8;
      const m = square(i, v, size);
      paint(m, i, pick, size);
      return m;
    }).filter(Boolean));
  };
  drawMarkers(pickIdx);

  // The 7-day trend in ink over a page-coloured halo (the same path, drawn
  // twice through <use>), and the average dashed and quiet under it.
  const trendD = linePath(trend, xc, y);
  const trendId = `history-trend-${++ids}`;
  const trendPath = trendD ? s('path', { id: trendId, d: trendD, fill: 'none', 'data-testid': 'trend-line', 'data-series': 'trend' }) : null;
  const trendHalo = trendD
    ? s('use', { href: `#${trendId}`, class: 'trend-halo', stroke: C.PAGE, 'stroke-width': 5.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-series': 'trend' })
    : null;
  const trendLine = trendD ? s('g', { stroke: C.INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, trendPath) : null;
  const avgY = avgMs != null ? y(avgMs) : null;
  const avgLine = avgMs != null
    ? s('line', {
      x1: PAD.left, x2: W - PAD.right, y1: avgY.toFixed(1), y2: avgY.toFixed(1),
      stroke: C.QUIET, 'stroke-width': 1.25, 'stroke-dasharray': '4 4', 'data-testid': 'avg-line', 'data-series': 'avg',
    })
    : null;

  // Over 7 days each day carries its hours, the hours over the minutes ('20h'
  // over '32m'), haloed. In Bars they stand in one row over the plot, each
  // over its own bar, as the days stand in one row under it: the scale's top
  // is over every value and every line, so nothing meets the row. In Line each
  // sits over its own square; one that would meet the trend, the average or
  // the day line sits under its square when there is room, or else above
  // every line it would meet.
  const segY = (vals, x) => {
    // The y of a broken path through vals at x, or null where it has no segment.
    const k = (x - PAD.left) / slot - 0.5;
    const a = Math.floor(k);
    const b = a + 1;
    if (Math.abs(k - Math.round(k)) < 1e-6) {
      const j = Math.round(k);
      return vals[j] != null ? y(vals[j]) : null;
    }
    if (a < 0 || b >= n || vals[a] == null || vals[b] == null) return null;
    return y(vals[a]) + (y(vals[b]) - y(vals[a])) * (k - a);
  };
  const linesNear = (i) => {
    const ys = avgY != null ? [avgY] : [];
    for (let dx = -LABEL_HALF - 1; dx <= LABEL_HALF + 1; dx += 1) {
      const x = xc(i) + dx;
      const t1 = segY(trend, x);
      if (t1 != null) ys.push(t1);
      if (kind !== 'bars') {
        const d1 = segY(values, x);
        // The day line leaves its own marker: only where it is clear of it.
        if (d1 != null && Math.abs(dx) > 5) ys.push(d1);
      }
    }
    return ys;
  };
  const meets = (ys, base, rows) => ys.filter((ln) => ln >= base - rows - LABEL_ASCENT - LABEL_CLEAR && ln <= base + LABEL_DESCENT + LABEL_CLEAR);
  const plotBottom = plotTop + plotH;
  const labelTop = []; // the top of what stands over each day (its label or its mark), for the crosshair
  const valueLabels = labelled
    ? values.map((v, i) => {
      if (v == null) return null;
      const [hours, mins] = fmtFigure(v).split(' ');
      const rows = mins ? LABEL_LINE : 0;
      const x = xc(i).toFixed(1);
      const words = (top) => s('text', { x, y: top.toFixed(1), 'text-anchor': 'middle', class: 'bar-value', 'data-value-for': series[i].day, 'data-series': seriesOf(i) },
        // The hours keep their trailing space, so the words still read '20h 32m'.
        s('tspan', { x }, mins ? `${hours} ` : hours),
        mins ? s('tspan', { x, dy: LABEL_LINE }, mins) : null);
      if (kind === 'bars') {
        const row = plotTop - 6 - LABEL_LINE; // the hours' baseline, the minutes one line under
        labelTop[i] = row - LABEL_ASCENT;
        return words(row);
      }
      const ys = linesNear(i);
      let base = y(v) - (kind === 'bars' ? 6 : 9); // the lower line's baseline
      let below = false;
      if (meets(ys, base, rows).length) {
        const under = y(v) + 9 + LABEL_ASCENT - 3 + rows;
        if (kind !== 'bars' && !meets(ys, under, rows).length && under + LABEL_DESCENT <= plotBottom) {
          base = under;
          below = true;
        } else {
          for (let guard = 0; guard < 6; guard++) {
            const hit = meets(ys, base, rows);
            if (!hit.length) break;
            base = Math.min(...hit) - LABEL_DESCENT - LABEL_CLEAR - 0.5;
          }
        }
      }
      base = Math.max(10 + rows, base);
      const top = base - rows - LABEL_ASCENT;
      labelTop[i] = below ? y(v) - 5 : Math.min(top, y(v) - 5);
      return words(base - rows);
    }).filter(Boolean)
    : [];

  // While a finger moves along the chart: a crosshair, and over more than 7
  // days the day at the top (7 days name every day under the axis). The
  // crosshair stays on a chosen day that has no mark, and on keyboard focus.
  // Over 7 days a day with a value has no crosshair (its label stands over
  // it): its mark in ink, or a miss's ink edge, and its day under the axis
  // in ink show it is chosen.
  const cross = s('line', { class: 'scrub-part', x1: 0, x2: 0, y1: plotTop, y2: plotTop + plotH, stroke: C.INK, 'stroke-width': 1 });
  const tag = n > 7 ? s('text', { class: 'scrub-part date-tag', x: 0, y: plotTop - 6, 'text-anchor': 'middle' }) : null;

  const svg = s('svg', {
    class: 'chart history-chart',
    viewBox: `0 0 ${W} ${HT}`,
    role: 'img',
    tabindex: '0',
    'data-testid': 'history-chart',
    'data-kind': kind,
    'aria-label': `${METRICS[metric].name} hours per day, ${n} days, with the 7-day trend and the average. Tap a day to read it.`,
  }, stripes.defs, ...bands.map((b) => b.el), ...grid, ...xLabels, cross, ...bars.map((b) => b.el), line, goalMarks, avgLine, trendHalo, trendLine, markers, ...valueLabels, tag);
  dimOthers(svg, focus);

  const placeScrub = (i) => {
    const x = xc(i);
    cross.setAttribute('x1', x.toFixed(1));
    cross.setAttribute('x2', x.toFixed(1));
    cross.classList.toggle('cross-off', labelTop[i] != null);
    if (!tag) return;
    const text = fmtDayShort(series[i].day);
    const half = text.length * 3.4;
    tag.textContent = text;
    tag.setAttribute('x', Math.max(PAD.left + half, Math.min(W - half, x)).toFixed(1));
  };
  // A chosen day that has no mark (nothing recorded, or paused) keeps the
  // crosshair on it, as does a chosen miss, whose stripes stay.
  const markChosen = (i) => {
    if (i < 0) return;
    placeScrub(i);
    svg.classList.toggle('pick-bare', values[i] == null || missAt[i]);
    for (const t of xLabels) t.classList.toggle('x-chosen', t.dataset.xFor === series[i].day);
  };
  markChosen(pickIdx);
  const pick = (i) => {
    pickIdx = i;
    for (const b of bars) paint(b.el, b.i, i, bw);
    drawMarkers(i);
    markChosen(i);
    // A filter keeps fading what it faded.
    dimOthers(svg, focus);
  };

  const nearest = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    return Math.max(0, Math.min(n - 1, Math.floor((px - PAD.left) / slot)));
  };
  const reach = (i) => {
    placeScrub(i);
    if (i !== pickIdx) onPick(series[i].day);
  };
  // A touch that turns out to be a scroll (the browser cancels it) puts the day back as it was.
  let before = null;
  const end = () => svg.classList.remove('scrubbing');
  svg.addEventListener('pointerdown', (e) => {
    before = pickIdx;
    reach(nearest(e));
  });
  svg.addEventListener('pointermove', (e) => {
    if (before == null || !(e.buttons || e.pointerType === 'touch')) return;
    if (n > 7) svg.classList.add('scrubbing');
    reach(nearest(e));
  });
  svg.addEventListener('pointerup', () => { before = null; end(); });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { before = null; end(); } });
  svg.addEventListener('pointercancel', () => {
    end();
    if (before != null) {
      const back = before;
      before = null;
      if (back >= 0 && back !== pickIdx) onPick(series[back].day);
    }
  });
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = pickIdx < 0 ? n - 1 : Math.max(0, Math.min(n - 1, pickIdx + (e.key === 'ArrowRight' ? 1 : -1)));
    if (i !== pickIdx) onPick(series[i].day);
  });
  return { svg, pick };
}

/** Line mode's key: the day line in the metric's colour through the square the chart draws for that day. */
const lineKey = (metric, { square = null, many = false }) => key(metric === 'feast' ? 'line-win' : 'line-fast', { square, dense: many });

/** Which marks are on the chart, so identity never rests on colour alone. */
// Tap an item to show only that series; the chart itself still picks a day.
function chartLegend(m, metric, kind, n, { anyTrend, anyPaused, anyPick, anyGoal }, focus, onPick) {
  const line = kind === 'line';
  const many = n > 30; // over 90 days the line carries the days short of the goal with no squares
  const dayLook = metric === 'feast' ? 'win' : 'short';
  return legend([
    anyGoal ? [line ? lineKey(metric, { square: 'goal', many }) : 'bar-fast', 'Goal reached', 'goal'] : null,
    [line ? lineKey(metric, { square: many ? null : dayLook, many }) : metric === 'feast' ? 'bar-win' : 'bar-fast-short', anyGoal ? m.short : m.mark, 'bar'],
    [line ? lineKey(metric, { square: 'miss', many }) : 'bar-miss', 'Miss', 'miss'],
    anyPick ? [line ? 'latest-square' : 'bar-selected', 'Selected day'] : null,
    anyTrend ? ['line-trend', '7-day trend', 'trend'] : null,
    ['line-average', 'Average', 'avg'],
    anyPaused ? ['band-paused', 'Paused', 'paused'] : null,
  ], 'history-legend', { focus, onPick });
}

const FOCUS_WORD = { bar: 'days that were not a miss', goal: 'fasts that reached the goal', miss: 'misses', trend: 'the 7-day trend', avg: 'the average', paused: 'paused days' };

/** Fast, Feast or Weight: the three views of History, on both of its pages, above the panels. */
export function metricSwitch(app, value) {
  return h('div', { class: 'page-switch', 'data-block': 'history-metric' },
    choice({ options: [{ value: 'fast', label: 'Fast' }, { value: 'feast', label: 'Feast' }, { value: 'weight', label: 'Weight' }], value, cols: 3, name: 'history-metric',
      onChange: async (v) => { await store.setSettings({ historyMetric: v }); app.go(v === 'weight' ? 'weight' : 'history'); } }));
}

/** A duration that never breaks across lines ('3 h 31 min'). */
const whole = (ms) => fmtDuration(ms).replace(/ /g, NBSP);

/**
 * The selected day: its mark, then the day and what it held as one flowing
 * sentence, then the trend on a quieter line, as spans joined by spaces:
 * "Sat 26 Sep: fast 26 h, goal reached. 7-day trend 20 h 35 min."
 */
function readoutLines(d, m, trendMs, miss, reached, metric, kind) {
  if (!d) return [];
  const v = d.paused ? null : d[m.key];
  // The key of the day's mark: a bar in Bars, its square on the line in Line.
  const look = miss ? 'miss' : metric === 'feast' ? 'win' : reached ? 'goal' : 'short';
  const bar = { miss: 'bar-miss', win: 'bar-win', goal: 'bar-fast', short: 'bar-fast-short' };
  const mark = d.paused ? key('band-paused', { size: 12 }) : v == null ? null : kind === 'line' ? lineKey(metric, { square: look }) : key(bar[look], { size: 12 });
  const day = h('span', { class: 'read-day' }, mark, `${fmtDayShort(d.day)}:`);
  if (d.paused) return [day, ' ', h('span', { class: 'read-value' }, `paused${FOR_REASON[d.paused] || ''}.`)];
  if (v == null) return [day, ' ', h('span', { class: 'read-value' }, `no ${m.noun} recorded.`)];
  const value = h('span', { class: 'read-value' }, `${m.noun} ${whole(v)}`,
    miss ? [', ', h('span', { class: 'clay' }, 'a miss')] : reached ? ', goal reached' : '', '.');
  return trendMs != null
    ? [day, ' ', value, ' ', h('span', { class: 'read-trend nowrap' }, `7-day trend ${whole(trendMs)}.`)]
    : [day, ' ', value];
}

/** A day for a narrow cell: the weekday may sit over the date, which stays whole ('Sat' over '26 Sep'). */
function dayCell(day) {
  const [weekday, ...date] = fmtDayShort(day).split(' ');
  return [weekday, ' ', h('span', { class: 'nowrap' }, date.join(' '))];
}

function table(series, trend, m, isMiss) {
  const rows = series.map((d, i) => ({ d, t: trend[i] })).reverse().filter(({ d }) => d[m.key] != null || d.paused);
  return h('table', { class: 'table', 'data-testid': 'history-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Day'), h('th', { scope: 'col' }, m.name), h('th', { scope: 'col' }, '7-day trend'))),
    h('tbody', {}, rows.map(({ d, t }) => h('tr', {},
      h('td', {}, dayCell(d.day),
        isMiss(d.day) ? h('span', { class: 'clay' }, ', ', h('span', { class: 'nowrap' }, 'miss', key('miss', { size: 12 }))) : null),
      h('td', {}, d.paused ? 'Paused' : whole(d[m.key])),
      h('td', {}, t != null && !d.paused ? whole(t) : '')))));
}

/** Which days the average covers. */
function summaryLine(sum, range) {
  return sum.count === range ? `Over the last ${range} days.` : `From ${sum.count} of the last ${range} days.`;
}

export function renderHistory(ctx, app) {
  const p = prefs(ctx.settings);
  const m = METRICS[p.metric];
  const fromKey = addDays(ctx.todayKey, -(p.range - 1));
  const from = fromKey < ctx.startKey ? ctx.startKey : fromKey;
  // Six days before the range feed the trend at its start.
  const full = dailySeries(ctx, addDays(from, -6), ctx.todayKey);
  // No trend point on a paused day: the line breaks over the pause.
  const trend = rollingAverage(full, m.key).slice(6).map((t, i) => (full[i + 6].paused ? null : t));
  const series = full.slice(6);
  const sum = summarize(series, m.key);
  const isMiss = (day) => ctx.evaluate(day).result === 'miss';
  if (!series.some((d) => d.day === selected)) {
    const latest = [...series].reverse().find((d) => d[m.key] != null);
    selected = latest ? latest.day : null;
  }
  const set = (values) => store.setSettings(values);
  const focus = FOCUS_KEYS.includes(app.ui.historyFocus) ? app.ui.historyFocus : null;
  const setFocus = (v) => { app.ui.historyFocus = v; app.refresh(); };
  // The fasting goal each day had: a long fast, or the day less its eating window.
  const goalMs = (day) => fastHoursFor(day, ctx.settings) * HOUR;
  const reachedGoal = (d) => p.metric === 'fast' && d && d.fastMs != null && !isMiss(d.day) && d.fastMs >= goalMs(d.day);

  // The number the screen leads with: the average, then the days it covers.
  const lead = h('div', { class: 'hero chart-lead' },
    h('div', { class: 'lead-row' }, h('div', { class: 'label' }, `Average ${m.noun}`)),
    sum.count ? h('p', { class: 't-hero lead-figure', 'data-testid': 'history-average' }, durationFigure(sum.avgMs)) : null,
    h('p', { class: 'lead-meta' },
      h('span', { 'data-testid': 'history-dates' }, `${fmtDayMonth(from)} to ${fmtDayMonth(ctx.todayKey)}`),
      ' ',
      h('span', { 'data-testid': 'history-summary' }, summaryLine(sum, p.range))));

  // The chart's own switches, slim, on one line under the lead.
  const controls = h('div', { class: 'chart-switches', 'data-block': 'history-controls' },
    choice({ options: [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], value: p.range, cols: 3, name: 'history-range', slim: true, ariaLabel: 'Days shown', onChange: (v) => set({ historyRange: v }) }),
    choice({ options: [{ value: 'bars', label: 'Bars' }, { value: 'line', label: 'Line' }], value: p.chart, cols: 2, name: 'history-chart', slim: true, ariaLabel: 'Chart', onChange: (v) => set({ historyChart: v }) }));

  const head = [header(ctx, app, { title: 'History' }), metricSwitch(app, p.metric)];

  if (!sum.count) {
    // Nothing to plot: a statement and a quiet line stand alone, as on the
    // empty Satiety and Weight pages, with no chart, switches or legend.
    // When an earlier fast sits within 90 days, only the days switch stays,
    // so a longer time can bring it back.
    const earlier = p.range < 90 && dailySeries(ctx, addDays(ctx.todayKey, -89) < ctx.startKey ? ctx.startKey : addDays(ctx.todayKey, -89), ctx.todayKey).some((d) => d[m.key] != null);
    return h('div', { class: 'history empty', 'data-metric': p.metric },
      head,
      h('section', { class: 'hero history-empty', 'data-block': 'history-chart' },
        h('h2', { class: 't-title-3 empty-words' }, earlier ? `No ${m.noun}s in the last ${p.range} days.` : m.empty),
        h('p', { class: 'empty-how', 'data-testid': 'history-summary' }, earlier ? 'A longer time shows the earlier ones.' : m.how)),
      earlier ? h('div', { class: 'chart-switches', 'data-block': 'history-controls' }, controls.firstChild) : null);
  }

  const shape = `${p.metric}:${p.range}:${p.chart}`;
  const rise = p.chart === 'bars' && shape !== drawnShape;
  drawnShape = shape;

  const anyGoal = p.metric === 'fast' && series.some((d) => d.fastMs != null && !isMiss(d.day) && d.fastMs >= goalMs(d.day));
  const pickIdx = series.findIndex((d) => d.day === selected);

  // The selected day, read out in a card under the legend.
  const readout = h('p', { class: 'history-readout', 'data-testid': 'history-readout', 'aria-live': 'polite' });
  let pickItem = null; // the legend's Selected day
  const fillReadout = () => {
    const i = series.findIndex((d) => d.day === selected);
    const d = i >= 0 ? series[i] : null;
    readout.replaceChildren(...readoutLines(d, m, d ? trend[i] : null, d ? isMiss(d.day) : false, reachedGoal(d), p.metric, p.chart));
    // A paused day or one with nothing recorded has no mark to key: its
    // crosshair and the reading name it.
    if (pickItem) pickItem.hidden = !d || !!d.paused || d[m.key] == null;
  };

  const plotted = chart({
    series, trend, metric: p.metric, kind: p.chart, isMiss, avgMs: sum.avgMs, focus, goalMs, rise,
    onPick: (day) => {
      selected = day;
      plotted.pick(series.findIndex((d) => d.day === day));
      fillReadout();
    },
  });

  const keys = chartLegend(m, p.metric, p.chart, series.length, { anyTrend: trend.some((t) => t != null), anyPaused: series.some((d) => d.paused), anyPick: pickIdx >= 0, anyGoal }, focus, setFocus);
  pickItem = [...keys.children].find((el) => el.textContent === 'Selected day') || null;
  fillReadout();

  return h('div', { class: 'history', 'data-metric': p.metric },
    head,
    h('section', { class: 'history-block', 'data-block': 'history-chart' },
      lead,
      controls,
      h('div', { class: 'history-plot' }, plotted.svg),
      focus ? focusLine(`Showing ${FOCUS_WORD[focus]} only.`, () => setFocus(null), 'history-focus') : null,
      keys,
      h('div', { class: 'card history-reading' },
        readout,
        pickIdx >= 0
          ? h('div', { class: 'reading-actions' }, button('Open this day', () => app.go(`day/${selected}`), { kind: 'secondary', name: 'history-open-day' }))
          : null),
      h('div', { class: 'table-toggle' },
        button(app.ui.showHistoryTable ? 'Hide the table' : 'Show as a table', () => { app.ui.showHistoryTable = !app.ui.showHistoryTable; app.refresh(); }, { kind: 'secondary', name: 'history-toggle-table' })),
      app.ui.showHistoryTable ? h('div', { class: 'card table-card' }, table(series, trend, m, isMiss)) : null),
  );
}
