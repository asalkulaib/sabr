// Weekly review: one screen, weeks run Sunday to Saturday.

import { h, s } from './dom.js';
import { button, figureParts, hatch, key, legend } from './components.js';
import * as P from './palette.js';
import { miniRing } from './rings.js';
import { addDays, at, fmtDayShort, fmtDuration, fmtTime, fmtWeekRange, weekStart, weekdayShort, keyParts } from '../core/time.js';
import { cutoffApplies } from '../core/rules.js';
import { weekReview } from '../core/review.js';
import { header, note } from './shared.js';
import { pauseWord } from './pause.js';
import { LEFT_WANTING, dayFullness, mealsByDay } from '../core/fullness.js';

const RESULT_WORD = { success: 'success', miss: 'miss', paused: 'paused', pending: 'in progress', unlogged: 'nothing logged' };

// The schedule runs from 04:00 to 04:00, so late eating sits with its evening,
// as Sabr counts it.
const AXIS_FROM = 4 * 60;
const VW = 240;
const { INK, FAINT } = P;
const WIN = P.WIN; // a window kept
const MISS = P.MISS; // a miss, striped
const OPEN = P.WIN_SOFT; // a window still open, edged in green
const BAND = P.TRACK; // a paused day
const xAt = (minutes) => ((minutes - AXIS_FROM) / 1440) * VW;

/** A day's result as its window ring: green, orange stripes, grey, or dashed ahead; a blue dot when left wanting. */
const resultCell = (result, leftWanting) => miniRing(result, leftWanting);

/**
 * The week as a schedule: a row a day, Sunday to Saturday, with the eating
 * window drawn on a 24-hour line. Solid ink for a success, clay stripes for
 * a miss, sand for a paused day; a clay cross where eating fell outside the
 * window, and the 16:00 line on workdays. Tap a row to open the day.
 */
function schedule(ctx, app, r) {
  const byDay = mealsByDay(ctx.meals);
  const outsideOf = (day) => [
    ...ctx.outside.filter((o) => o.day === day).map((o) => o.at),
    ...ctx.meals.filter((m) => m.day === day && m.outside).map((m) => m.startedAt),
  ];
  let anyCutoff = false;
  let anyOutside = false;
  let anyOpen = false;
  const rows = r.days.map((d) => {
    const rec = ctx.days.get(d.day) || {};
    const result = d.future && d.result !== 'paused' ? 'future' : d.result;
    const lw = dayFullness(byDay.get(d.day) || [], ctx.days.get(d.day)) === LEFT_WANTING;
    const from = at(d.day, '04:00');
    const to = at(addDays(d.day, 1), '04:00');
    const x = (ts) => Math.max(0, Math.min(VW, ((ts - from) / (to - from)) * VW));
    const parts = [s('line', { x1: 0, x2: VW, y1: 8, y2: 8, stroke: INK, 'stroke-opacity': 0.18, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': result === 'future' ? '2 4' : null })];
    for (const hh of [6, 12, 18, 24]) parts.push(s('line', { x1: xAt(hh * 60), x2: xAt(hh * 60), y1: 5, y2: 11, stroke: INK, 'stroke-opacity': 0.18 }));
    if (result === 'paused') parts.push(s('rect', { x: 0, y: 3, width: VW, height: 10, rx: 5, fill: BAND }));
    else {
      if (!d.future && cutoffApplies(d.day, rec, ctx.settings)) {
        anyCutoff = true;
        parts.push(s('line', { x1: xAt(16 * 60), x2: xAt(16 * 60), y1: 0, y2: 16, stroke: FAINT, 'stroke-width': 1.2, 'stroke-dasharray': '2 2', 'data-cutoff': d.day }));
      }
      if (d.firstBite) {
        const end = d.lastBite || Math.max(d.firstBite, Math.min(ctx.nowTs, to));
        const x0 = x(d.firstBite);
        const x1 = Math.max(x0 + 2, x(end));
        if (result === 'miss') {
          const m = hatch();
          parts.push(m.defs, s('rect', { x: x0.toFixed(1), y: 2.5, width: (x1 - x0).toFixed(1), height: 11, rx: 5.5, fill: m.fill, stroke: MISS, 'stroke-width': 1.4, 'data-window': d.day }));
        } else {
          if (!d.lastBite) anyOpen = true;
          parts.push(s('rect', { x: x0.toFixed(1), y: 2.5, width: (x1 - x0).toFixed(1), height: 11, rx: 5.5, fill: d.lastBite ? WIN : OPEN, stroke: d.lastBite ? null : WIN, 'stroke-width': d.lastBite ? null : 1.4, 'data-window': d.day }));
        }
      }
      for (const ts of outsideOf(d.day)) {
        anyOutside = true;
        const xx = x(ts);
        parts.push(s('path', { d: `M${(xx - 3).toFixed(1)} 4 L${(xx + 3).toFixed(1)} 12 M${(xx + 3).toFixed(1)} 4 L${(xx - 3).toFixed(1)} 12`, stroke: MISS, 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none', 'data-outside': d.day }));
      }
    }
    const res = dayResult(d);
    const { d: dd } = keyParts(d.day);
    const times = d.result === 'paused'
      ? (pauseWord(d.paused) || '')
      : d.firstBite ? (d.lastBite ? `${fmtTime(d.firstBite)} to ${fmtTime(d.lastBite)}` : `from ${fmtTime(d.firstBite)}`) : '';
    const words = [fmtDayShort(d.day), RESULT_WORD[result], lw ? 'left wanting' : null].filter(Boolean).join(', ');
    return h('button', { type: 'button', class: 'dayrow', 'data-day': d.day, 'data-result': result, 'aria-label': times ? `${words}, ${times}` : words, onclick: () => app.go(`day/${d.day}`) },
      resultCell(result, lw),
      h('span', { class: 'd' }, `${weekdayShort(d.day)} ${dd}`),
      h('span', { class: 'w' },
        s('svg', { class: 'sched-line', viewBox: `0 0 ${VW} 16`, 'aria-hidden': 'true', focusable: 'false' }, ...parts),
        times ? h('span', { class: 't' }, times) : null),
      h('span', { class: `r${res.ok ? ' ok' : ''}` }, res.text));
  });
  const head = h('div', { class: 'sched-head', 'aria-hidden': 'true' },
    h('span'), h('span'),
    s('svg', { class: 'sched-line', viewBox: `0 0 ${VW} 12`, focusable: 'false' },
      ...[[6, '06'], [12, '12'], [18, '18'], [24, '00']].map(([hh, t]) => s('text', { x: xAt(hh * 60), y: 10, 'text-anchor': 'middle' }, t))),
    h('span'));
  return h('div', { class: 'gap' },
    h('div', { class: 'sched', 'data-testid': 'week-strip' }, head, rows),
    legend([
      ['success', 'Success'], [key('miss'), 'Miss'], ['paused', 'Paused'], ['outline', 'Open or not logged'], ['dashed', 'Still ahead'], ['dot', 'Left wanting'],
      anyOpen ? ['bar', 'Window still open'] : null,
      anyCutoff ? [key('cutoff'), '16:00 on workdays'] : null,
      anyOutside ? [key('outside'), 'Ate outside the window'] : null,
    ], 'strip-legend'));
}

const TRIGGER_WORD = { hunger: 'hunger', boredom: 'boredom', social: 'social', stress: 'stress', tired: 'tired', other: 'other' };
const TYPE_WORD = { weights: 'weights', cardio: 'cardio', other: 'other', unspecified: 'type not set' };

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const one = (v) => v.toFixed(1);
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

function stat(label, value, testid) {
  return h('div', { class: 'stat', 'data-stat': testid || null },
    h('span', {}, label),
    h('span', { class: 'stat-value' }, value));
}

function energyLine(label, part) {
  return stat(label, part.n ? `${one(part.avg)} (${days(part.n)})` : 'no data yet');
}

function dayResult(d) {
  if (d.result === 'paused') return { text: 'Paused', ok: false };
  if (d.future) return { text: '', ok: false };
  switch (d.result) {
    case 'success': return { text: d.state === 'noEating' ? 'No eating' : d.state === 'fasted' ? 'Fasted' : 'Success', ok: true };
    case 'miss': return { text: 'Miss', ok: false };
    case 'pending': return { text: d.state === 'open' ? 'Open' : 'Today', ok: false };
    case 'unlogged': return { text: 'Not logged', ok: false };
    default: return { text: '', ok: false };
  }
}

export function renderWeek(ctx, app, weekKey) {
  const start = weekStart(weekKey || ctx.todayKey);
  const thisWeek = weekStart(ctx.todayKey);
  const r = weekReview(ctx, { weekStartKey: start, todayKey: ctx.todayKey, nowTs: ctx.nowTs, startKey: ctx.startKey });
  const isCurrent = start === thisWeek;

  const weightBlock = r.weight.current.avg != null
    ? [
      stat('7-day average', `${one(r.weight.current.avg)} kg`, 'weight-avg'),
      stat('Change from last week', r.weight.change != null ? `${signed(r.weight.change)} kg` : 'needs last week', 'weight-change'),
    ]
    : [h('p', { class: 'quiet small' }, 'No weigh-ins imported for this week.')];

  const t = r.temptations;
  return h('div', { class: 'week', 'data-week': start },
    header(ctx, app, { title: 'Week', sub: isCurrent ? 'This week' : null }),
    h('section', { class: 'section strong' },
      h('h1', { class: 'display', 'data-testid': 'week-range' }, fmtWeekRange(start)),
      schedule(ctx, app, r),
      h('div', { class: 'btn-row gap-s' },
        button('‹ Previous', () => app.go(`week/${addDays(start, -7)}`), { kind: 'secondary', name: 'prev-week' }),
        isCurrent ? null : button('Next ›', () => app.go(`week/${addDays(start, 7)}`), { kind: 'secondary', name: 'next-week' }))),
    h('section', { class: 'section' },
      h('div', { class: 'row' },
        h('div', { class: 'main' },
          h('div', { class: 'label' }, 'Successful days'),
          // Paused days are not tracked, so they leave the count.
          h('div', { class: 'figure gap-s', 'data-testid': 'success-count' }, figureParts([[r.successCount, ` of ${7 - r.pausedCount}`]]))),
        h('div', { class: 'margin' },
          note('Best streak', days(r.streak.best)),
          r.pausedCount ? note('Paused', days(r.pausedCount)) : null)),
      h('div', { class: 'gap' },
        stat('Average window', r.avgWindowMs != null ? fmtDuration(r.avgWindowMs) : 'no windows yet', 'avg-window'),
        stat(isCurrent ? 'Streak' : 'Streak at week end', days(r.streak.current), 'streak'))),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Workdays'),
      h('div', { class: 'gap-s' },
        stat('Opened at 16:00 or later', r.workday.windows ? `${r.workday.onTime} of ${r.workday.windows}` : 'no workday windows', 'on-time')),
      h('p', { class: 'small gap' }, 'Energy at 4 PM'),
      energyLine('Nothing eaten before 4 PM', r.energy.week.without),
      energyLine('Ate before 4 PM', r.energy.week.with),
      r.energy.all.without.n || r.energy.all.with.n
        ? h('p', { class: 'quiet small gap-s', 'data-testid': 'energy-all' },
          `All time: ${r.energy.all.without.n ? one(r.energy.all.without.avg) : 'no data'} without eating before 4 PM (${days(r.energy.all.without.n)}), `
          + `${r.energy.all.with.n ? one(r.energy.all.with.avg) : 'no data'} with (${days(r.energy.all.with.n)}).`)
        : null),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Weight'),
      h('div', { class: 'gap-s' }, weightBlock)),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Training'),
      h('div', { class: 'gap-s' },
        stat('Sessions', String(r.training.sessions), 'training'),
        r.training.types.length
          ? h('p', { class: 'quiet small' }, r.training.types.map((x) => `${TYPE_WORD[x.key] || x.key} ${x.count}`).join(', '))
          : null)),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Temptations'),
      h('div', { class: 'gap-s' },
        stat('Count', String(t.count), 'temptations'),
        stat('Held', t.decided ? `${t.held} of ${t.decided} (${Math.round(t.holdRate * 100)}%)` : 'none yet', 'hold-rate'),
        t.triggers.length ? stat('Top triggers', t.triggers.slice(0, 3).map((x) => `${TRIGGER_WORD[x.key] || x.key} ${x.count}`).join(', '), 'triggers') : null)),
  );
}
