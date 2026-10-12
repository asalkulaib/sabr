// Weekly review: one screen, weeks run Sunday to Saturday.

import { h, s } from './dom.js';
import { button, figureParts, hatch, key, legend } from './components.js';
import { glyph } from './icons.js';
import * as P from './palette.js';
import { miniRing, weekRing } from './rings.js';
import { addDays, at, fmtDayShort, fmtDuration, fmtTime, fmtWeekRange, weekStart, weekdayShort, keyParts } from '../core/time.js';
import { cutoffApplies } from '../core/rules.js';
import { weekReview } from '../core/review.js';
import { header, note } from './shared.js';
import { pauseWord } from './pause.js';
import { LEFT_WANTING, dayFullness, mealsByDay } from '../core/fullness.js';

export const RESULT_WORD = { success: 'success', miss: 'miss', paused: 'paused', pending: 'in progress', unlogged: 'nothing logged' };

// ---------- The DayTrack ----------

// A day's line runs from 04:00 to 04:00, so late eating sits with its
// evening, as Sabr counts it.
const AXIS_FROM = 4 * 60;
const HOURS = [[6, '06'], [12, '12'], [18, '18'], [24, '00']];

/** Where an hour of the day falls on a line `width` long. */
const xAtHour = (hh, width) => (((hh * 60) - AXIS_FROM) / 1440) * width;

/** The moments of eating outside the window on a day. */
export function outsideMoments(ctx, day) {
  return [
    ...ctx.outside.filter((o) => o.day === day).map((o) => o.at),
    ...ctx.meals.filter((m) => m.day === day && m.outside).map((m) => m.startedAt),
  ];
}

/** A day's result as its mark shows it: a day not yet begun is still ahead. */
export const shownResult = (d) => (d.future && d.result !== 'paused' ? 'future' : d.result);

/**
 * One day on a 24-hour line: a hairline with hour ticks, the 16:00 line on
 * workdays, the window as a pill (green when kept, pale green while open,
 * orange stripes for a miss), a cross where eating fell outside the window,
 * and a grey band with the pause bars on a paused day. A day still ahead is
 * a dashed line, a day before tracking a plain line. d: the day's evaluation, with `future`. axis: the hour
 * labels above the line. Returns { svg, marks }: which marks were drawn.
 */
export function dayTrack(ctx, d, { width, bar = 12, axis = false }) {
  const rec = ctx.days.get(d.day) || {};
  const result = shownResult(d);
  const top = axis ? 20 : 0; // room for the hour labels
  const H = top + Math.max(20, bar + 8);
  const mid = top + (H - top) / 2;
  const from = at(d.day, '04:00');
  const to = at(addDays(d.day, 1), '04:00');
  const x = (ts) => Math.max(0, Math.min(width, ((ts - from) / (to - from)) * width));
  const marks = { kept: false, open: false, miss: false, cutoff: false, outside: false, paused: false };
  const parts = [];
  if (axis) {
    for (const [hh, t] of HOURS) {
      const xx = xAtHour(hh, width);
      parts.push(s('text', { class: 'track-axis', x: xx.toFixed(1), y: 12, 'text-anchor': xx > width - 12 ? 'end' : 'middle' }, t));
    }
  }
  if (result === 'paused') {
    marks.paused = true;
    parts.push(s('rect', { x: 0.5, y: mid - bar / 2, width: width - 1, height: bar, rx: bar / 2, fill: P.TRACK, stroke: P.QUIET, 'stroke-width': 1 }));
    const k = bar / 12;
    const c = width / 2;
    parts.push(s('path', { d: `M${c - 3 * k} ${mid - 3.5 * k} V${mid + 3.5 * k} M${c + 3 * k} ${mid - 3.5 * k} V${mid + 3.5 * k}`, stroke: P.QUIET, 'stroke-width': 1.5 * k, 'stroke-linecap': 'round' }));
  } else {
    const ahead = result === 'future';
    // A day before tracking began: only the plain line, no hours and no 16:00.
    const before = result === 'none';
    parts.push(s('line', { x1: 0, x2: width, y1: mid, y2: mid, stroke: ahead ? P.EDGE : P.GRID, 'stroke-width': 2, 'stroke-dasharray': ahead ? '4 4' : null }));
    for (const [hh] of ahead || before ? [] : HOURS) {
      const xx = Math.min(width - 0.75, xAtHour(hh, width));
      parts.push(s('line', { x1: xx, x2: xx, y1: mid - 4, y2: mid + 4, stroke: P.EDGE, 'stroke-width': 1.5 }));
    }
    if (!d.future && !before && cutoffApplies(d.day, rec, ctx.settings)) {
      marks.cutoff = true;
      const xx = xAtHour(16, width);
      parts.push(s('line', { x1: xx, x2: xx, y1: mid - 10, y2: mid + 10, stroke: P.EDGE, 'stroke-width': 1.5, 'stroke-dasharray': '3 3', 'data-cutoff': d.day }));
    }
    if (d.firstBite) {
      const end = d.lastBite || Math.max(d.firstBite, Math.min(ctx.nowTs, to));
      const x0 = Math.min(x(d.firstBite), width - 4);
      const x1 = Math.max(x0 + 4, x(end));
      const box = { x: x0.toFixed(1), y: mid - bar / 2, width: (x1 - x0).toFixed(1), height: bar, rx: Math.min(bar / 2, (x1 - x0) / 2), 'data-window': d.day };
      if (result === 'miss') {
        marks.miss = true;
        const m = hatch();
        parts.push(m.defs, s('rect', { ...box, fill: m.fill, stroke: P.MISS_TEXT, 'stroke-width': 1.5 }));
      } else if (!d.lastBite) {
        marks.open = true;
        // Just opened, shorter than it is tall: a dot on the first bite, until it grows into a bar.
        if (x(end) - x(d.firstBite) < bar) {
          const cx = Math.max(bar / 2, Math.min(width - bar / 2, x(d.firstBite)));
          parts.push(s('circle', { cx: cx.toFixed(1), cy: mid, r: bar / 2 - 0.75, fill: P.WIN_SOFT, stroke: P.WIN_TEXT, 'stroke-width': 1.5, 'data-window': d.day }));
        } else {
          parts.push(s('rect', { ...box, fill: P.WIN_SOFT, stroke: P.WIN_TEXT, 'stroke-width': 1.5 }));
        }
      } else {
        marks.kept = true;
        parts.push(s('rect', { ...box, fill: P.WIN, stroke: P.WIN_TEXT, 'stroke-width': 1 }));
      }
    }
    const r = bar >= 16 ? 6 : 5;
    for (const ts of outsideMoments(ctx, d.day)) {
      marks.outside = true;
      const xx = x(ts);
      parts.push(s('path', { d: `M${(xx - r).toFixed(1)} ${mid - r} L${(xx + r).toFixed(1)} ${mid + r} M${(xx + r).toFixed(1)} ${mid - r} L${(xx - r).toFixed(1)} ${mid + r}`, stroke: P.MISS_TEXT, 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none', 'data-outside': d.day }));
    }
  }
  const svg = s('svg', { class: 'day-track', viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true', focusable: 'false' }, ...parts);
  return { svg, marks };
}

/** The 16:00 line's key, drawn as the track draws it. */
/** A day's mark and its window bar side by side: one key for both. */
const pairKey = (...kinds) => h('span', { class: 'key-pair' }, ...kinds.map((k) => key(k)));

/** The times a day row shows: the window, or the reason for a pause. */
export function dayTimes(d) {
  if (d.result === 'paused') return pauseWord(d.paused) || '';
  if (!d.firstBite) return '';
  return d.lastBite ? `${fmtTime(d.firstBite)} to ${fmtTime(d.lastBite)}` : `from ${fmtTime(d.firstBite)}`;
}

// ---------- The schedule ----------

/**
 * The week as a schedule: a row a day, Sunday to Saturday, each with its
 * result ring, the day, its times and result word, and the DayTrack under
 * them. Tap a row to open the day.
 */
function schedule(ctx, app, r) {
  const byDay = mealsByDay(ctx.meals);
  const seen = { cutoff: false, outside: false, open: false };
  const rows = r.days.map((d) => {
    const result = shownResult(d);
    const lw = dayFullness(byDay.get(d.day) || [], ctx.days.get(d.day)) === LEFT_WANTING;
    const { svg, marks } = dayTrack(ctx, d, { width: 290, bar: 12 });
    if (marks.cutoff) seen.cutoff = true;
    if (marks.outside) seen.outside = true;
    if (marks.open) seen.open = true;
    const res = dayResult(d);
    const { d: dd } = keyParts(d.day);
    const times = dayTimes(d);
    const words = [fmtDayShort(d.day), RESULT_WORD[result], lw ? 'left wanting' : null].filter(Boolean).join(', ');
    return h('button', {
      type: 'button',
      class: 'dayrow',
      'data-day': d.day,
      'data-result': result,
      'aria-label': times ? `${words}, ${times}` : words,
      'aria-current': d.day === ctx.todayKey ? 'date' : null,
      onclick: () => app.go(`day/${d.day}`),
    },
    miniRing(result, lw),
    h('span', { class: 'dr-line' },
      h('span', { class: 'd' }, `${weekdayShort(d.day)} ${dd}`),
      times ? h('span', { class: 't tabular' }, times) : null),
    h('span', { class: `r${res.tone ? ` ${res.tone}` : ''}` }, res.text),
    h('span', { class: 'dr-track' }, svg));
  });
  const head = h('div', { class: 'sched-head', 'aria-hidden': 'true' },
    h('span', { class: 'sched-axis' },
      ...HOURS.map(([hh, t]) => {
        const tick = h('span', { class: 'tabular' }, t);
        tick.style.setProperty('--at', String(xAtHour(hh, 1)));
        return tick;
      })));
  return h('div', { class: 'week-schedule' },
    h('div', { class: 'sched', 'data-testid': 'week-strip' }, head, rows),
    legend([
      [pairKey('day-success', 'track-window'), 'Success'],
      [pairKey('day-miss', 'bar-miss'), 'Miss'],
      [pairKey('day-paused', 'band-paused'), 'Paused'],
      ['day-open', 'Open or not logged'],
      ['day-ahead', 'Still ahead'],
      ['left-wanting', 'Left wanting'],
      seen.open ? ['track-open', 'Window still open'] : null,
      seen.cutoff ? ['cutoff', '16:00 on workdays'] : null,
      seen.outside ? [key('outside'), 'Ate outside the window'] : null,
    ], 'strip-legend'));
}

const TRIGGER_WORD = { hunger: 'hunger', boredom: 'boredom', social: 'social', stress: 'stress', tired: 'tired', other: 'other' };
const TYPE_WORD = { weights: 'weights', cardio: 'cardio', other: 'other', unspecified: 'type not set' };

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const one = (v) => v.toFixed(1);
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

/**
 * A figure written as text ("104.7 kg", "3 of 4 (75%)") with large digits
 * and small units: words and anything in brackets go to unit spans, so the
 * text reads exactly as it was given.
 */
/** A duration in its usual words ("3 h 17 min"), the digits large and the units small. */
const windowFigure = (ms) => figureParts([...fmtDuration(ms).matchAll(/(\d+)( [a-z]+)/g)].map((m) => [m[1], m[2]]));

function unitText(text) {
  const out = [];
  for (const m of String(text).matchAll(/\([^)]*\)|[−+]?\d[\d.]*|[^\d(−+]+|[−+]/g)) {
    const part = m[0];
    out.push(/^[−+]?\d/.test(part) ? part : h('span', { class: 'unit' }, part));
  }
  return h('span', { class: 'fig' }, out);
}

/**
 * A count out of a total ("3 of 4 (75%)") set as the hero sets its count:
 * only the first number large, the rest one small unit, same text.
 */
function leadText(text) {
  const m = /^([−+]?\d[\d.]*)(.*)$/.exec(String(text));
  return m ? h('span', { class: 'fig' }, m[1], m[2] ? h('span', { class: 'unit' }, m[2]) : null) : unitText(text);
}

/**
 * A stat: its label and value. size 'figure' draws the value as a figure
 * (large digits, small units), 'headline' as a stacked headline value; a
 * value with no digits ('no windows yet') reads as quiet words. A value
 * already drawn as a figure (an element) is shown as it is.
 */
function stat(label, value, testid, { size = null, keyMark = null, lead = false } = {}) {
  const empty = typeof value === 'string' && !/\d/.test(value);
  const big = size === 'figure' && !empty;
  const fig = (v) => (typeof v !== 'string' ? v : lead ? leadText(v) : unitText(v));
  return h('div', { class: `stat${size ? ' stacked' : ''}`, 'data-stat': testid || null },
    h('span', { class: 'stat-label' }, keyMark, label),
    h('span', { class: `stat-value${big ? ' figure-value' : ''}${empty ? ' empty' : ''}` }, big ? fig(value) : value));
}

/** A thin rail filled to frac, in ink: a share at a glance. */
function rail(frac, cls = '') {
  const fill = h('span', { class: 'rail-fill' });
  fill.style.setProperty('--frac', String(Math.max(0, Math.min(1, frac))));
  return h('span', { class: `rail ${cls}`.trim(), 'aria-hidden': 'true' }, fill);
}

function energyLine(label, part) {
  return h('div', { class: 'energy-line' },
    stat(label, part.n ? `${one(part.avg)} (${days(part.n)})` : 'no data yet'),
    part.n ? rail(part.avg / 5) : null);
}

function dayResult(d) {
  if (d.result === 'paused') return { text: 'Paused', tone: '' };
  if (d.future) return { text: '', tone: '' };
  switch (d.result) {
    case 'success': return { text: d.state === 'noEating' ? 'No eating' : d.state === 'fasted' ? 'Fasted' : 'Success', tone: 'ok' };
    case 'miss': return { text: 'Miss', tone: 'miss' };
    case 'pending': return { text: d.state === 'open' ? 'Open' : 'Today', tone: '' };
    case 'unlogged': return { text: 'Not logged', tone: '' };
    default: return { text: '', tone: '' };
  }
}

/** The ring of seven: each day's result as one arc, Sunday at the top. */
function weekHeroRing(r, count) {
  const ring = weekRing(r.days.map(shownResult));
  // The ring reads the count the figure beside it shows: paused days leave it.
  const label = ring.getAttribute('aria-label') || '';
  ring.setAttribute('aria-label', `${count}.${label.slice(label.indexOf('.') + 1)}`);
  return ring;
}

// Set by Previous and Next: the week the pager turns to, and its side, so
// only paging slides a week in (a tab switch or Back does not).
let paging = null;

export function renderWeek(ctx, app, weekKey) {
  const start = weekStart(weekKey || ctx.todayKey);
  const thisWeek = weekStart(ctx.todayKey);
  const r = weekReview(ctx, { weekStartKey: start, todayKey: ctx.todayKey, nowTs: ctx.nowTs, startKey: ctx.startKey });
  const isCurrent = start === thisWeek;
  const turn = paging && paging.to === start ? paging.cls : '';
  // Cleared after the frame, so a second render of the same arrival keeps it.
  if (turn) requestAnimationFrame(() => { paging = null; });

  const weightBlock = r.weight.current.avg != null
    ? [
      stat('7-day average', `${one(r.weight.current.avg)} kg`, 'weight-avg', { size: 'figure', keyMark: key('line-weight') }),
      stat('Change from last week', r.weight.change != null ? `${signed(r.weight.change)} kg` : 'needs last week', 'weight-change', { size: 'headline' }),
    ]
    : [h('p', { class: 'tile-note' }, 'No ', h('span', { class: 'nowrap' }, 'weigh-ins'), ' imported for this week.')];

  const t = r.temptations;
  return h('div', { class: 'week', 'data-week': start },
    header(ctx, app, { title: 'Week', sub: isCurrent ? 'This week' : null }),
    h('div', { class: `week-body ${turn}`.trim() },
      h('div', { class: 'week-bar' },
        h('p', { class: 'week-range', 'data-testid': 'week-range' }, fmtWeekRange(start)),
        h('div', { class: 'pill-row week-pager' },
          button('Previous', () => { paging = { to: addDays(start, -7), cls: 'turn-prev' }; app.go(`week/${paging.to}`); }, { kind: 'secondary', name: 'prev-week', icon: 'chevron-left' }),
          isCurrent ? null : button([h('span', {}, 'Next'), glyph('chevron', { size: 12 })], () => { paging = { to: addDays(start, 7), cls: 'turn-next' }; app.go(`week/${paging.to}`); }, { kind: 'secondary', name: 'next-week' }))),
      h('section', { class: 'hero week-hero' },
        weekHeroRing(r, `${r.successCount} of ${7 - r.pausedCount}`),
        h('div', { class: 'week-hero-words' },
          h('div', { class: 'label' }, 'Successful days'),
          // Paused days are not tracked, so they leave the count.
          h('div', { class: 'week-count', 'data-testid': 'success-count' }, figureParts([[r.successCount, ` of ${7 - r.pausedCount}`]])),
          h('div', { class: 'week-notes' },
            note('Best streak', days(r.streak.best)),
            r.pausedCount ? note('Paused', days(r.pausedCount)) : null))),
      schedule(ctx, app, r),
      h('div', { class: 'tiles first' },
        h('section', { class: 'tile' },
          stat('Average window', r.avgWindowMs != null ? windowFigure(r.avgWindowMs) : 'no windows yet', 'avg-window', { size: 'figure' })),
        h('section', { class: 'tile' },
          stat(isCurrent ? 'Streak' : 'Streak at week end', days(r.streak.current), 'streak', { size: 'figure' }))),
      h('section', { class: 'card week-card', 'data-block': 'workdays' },
        h('h2', { class: 'card-title' }, 'Workdays'),
        h('div', { class: 'on-time' },
          stat('Opened at 16:00 or later', r.workday.windows ? `${r.workday.onTime} of ${r.workday.windows}` : 'no workday windows', 'on-time'),
          r.workday.windows
            ? h('div', { class: 'meter', 'aria-hidden': 'true' },
              Array.from({ length: r.workday.windows }, (_, i) => h('span', { class: i < r.workday.onTime ? 'on' : null })))
            : null),
        h('h3', { class: 'week-sub' }, 'Energy at 4 PM'),
        energyLine('Nothing eaten before 4 PM', r.energy.week.without),
        energyLine('Ate before 4 PM', r.energy.week.with),
        r.energy.all.without.n || r.energy.all.with.n
          ? h('p', { class: 'energy-all', 'data-testid': 'energy-all' },
            `All time: ${r.energy.all.without.n ? one(r.energy.all.without.avg) : 'no data'} without eating before 4 PM (${days(r.energy.all.without.n)}), `
            + `${r.energy.all.with.n ? one(r.energy.all.with.avg) : 'no data'} with (${days(r.energy.all.with.n)}).`)
          : null),
      h('div', { class: 'tiles' },
        h('section', { class: 'tile', 'data-block': 'weight' },
          h('h2', { class: 'card-title in-group' }, 'Weight'),
          weightBlock),
        h('section', { class: 'tile', 'data-block': 'training' },
          h('h2', { class: 'card-title in-group' }, 'Training'),
          stat('Sessions', String(r.training.sessions), 'training', { size: 'figure' }),
          r.training.types.length
            ? h('p', { class: 'tile-note' }, r.training.types.flatMap((x, i) => [i ? ', ' : null, h('span', { class: 'nowrap' }, `${TYPE_WORD[x.key] || x.key} ${x.count}`)]))
            : null)),
      h('section', { class: 'card week-card', 'data-block': 'temptations' },
        h('h2', { class: 'card-title' }, 'Temptations'),
        h('div', { class: 'stat-pair' },
          stat('Count', String(t.count), 'temptations', { size: 'figure' }),
          stat('Held', t.decided ? `${t.held} of ${t.decided} (${Math.round(t.holdRate * 100)}%)` : 'none yet', 'hold-rate', { size: 'figure', lead: true })),
        t.decided ? rail(t.holdRate, 'thick') : null,
        t.triggers.length ? stat('Top triggers', t.triggers.slice(0, 3).map((x) => `${TRIGGER_WORD[x.key] || x.key} ${x.count}`).join(', '), 'triggers', { size: 'headline' }) : null)),
  );
}
