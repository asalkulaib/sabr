// Satiety: its own tab, after the person's earlier satiety page. Three views,
// insights first: Insights (tiles, four charts, findings, a table), Now (the
// running fullness check and how the day ended) and Meals (by day, newest
// first). Every colour is named in a legend, and each way of finishing a meal
// also has its own shape: a triangle for left wanting, a square for satisfied,
// a diamond for overfull.

import * as C from './palette.js';
import { h, s, live, dimOthers } from './dom.js';
import { button, choice, figureParts, focusLine, legend, STOP_TEXT } from './components.js';
import * as store from '../store.js';
import { addDays, fmtDayShort, fmtDuration, fmtTime } from '../core/time.js';
import { STOPS, ZONE, completed, satietyStats } from '../core/satiety.js';
import { satietyInsights } from '../core/insights.js';
import { fullnessCard } from './fullness.js';
import { showAddMealSheet, showFinishMealSheet, showFullnessSheet, showMealEditSheet } from './meal.js';
import { dueFullness, header, mealInProgress, runningFullness } from './shared.js';
import { STOP_MARKS, stopIcon, stopMark } from './icons.js';

const INK = C.INK;
const BAND = C.FULL_SOFT; // the comfortable zone
const GRID = C.GRID;
const W = 340;

// Each way of finishing: its word, colour and shape (the shapes live in icons.js).
export const STOP_STYLE = {
  before_full: { word: 'Left wanting', ...STOP_MARKS.before_full },
  full: { word: 'Satisfied', ...STOP_MARKS.full },
  stuffed: { word: 'Overfull', ...STOP_MARKS.stuffed },
};

/** A small mark centred on (x, y). */
const mark = (stop, x, y, r = 5) => stopMark(stop, { x, y, r });

export { stopIcon };

// One way of finishing can be shown on its own, across every chart and the
// meal list at once: F holds the choice for the render under way.
let F = { focus: null, pick: () => {} };

const stopLegend = (extra = [], testid) => legend([...STOPS.map((k) => [stopIcon(k), STOP_STYLE[k].word, k]), ...extra], testid, { focus: F.focus, onPick: F.pick });

/** Fades what is not in focus; tapping a mark, bar or line picks its way of finishing. */
function focusable(svg) {
  const pick = F.pick;
  const focus = F.focus;
  svg.classList.add('pickable');
  svg.addEventListener('click', (e) => {
    const el = e.target.closest('[data-series]');
    if (el && STOPS.includes(el.dataset.series)) pick(focus === el.dataset.series ? null : el.dataset.series);
  });
  return dimOthers(svg, focus);
}

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

// ---------- Insights ----------

function tile(label, value, note, testid) {
  return h('div', { class: 'tile', 'data-testid': testid }, h('div', { class: 'label' }, label), h('div', { class: 'figure gap-s' }, value), h('p', { class: 'small quiet gap-s' }, note));
}

/** The number a chart leads with: large digits, small units. */
function lead(parts, testid) {
  return h('div', { class: 'figure lead gap-s', 'data-testid': testid }, figureParts(parts));
}

const average = (rows, value, weight) => {
  const n = rows.reduce((a, r) => a + weight(r), 0);
  return n ? rows.reduce((a, r) => a + value(r) * weight(r), 0) / n : null;
};

/** Fullness 20 minutes after each meal, with the comfortable zone as a band. */
function landingChart(st) {
  const pts = st.landings;
  const HT = 190;
  const P = { top: 12, right: 10, bottom: 24, left: 30 };
  const y = (v) => P.top + (HT - P.top - P.bottom) * (1 - (v - 1) / 9);
  const x = (i) => P.left + (pts.length === 1 ? (W - P.left - P.right) / 2 : ((W - P.left - P.right) * i) / (pts.length - 1));
  const grid = [1, 4, 7, 10].flatMap((v) => [
    s('line', { x1: P.left, x2: W - P.right, y1: y(v), y2: y(v), stroke: GRID }),
    s('text', { x: P.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)),
  ]);
  const band = s('rect', { x: P.left, width: W - P.left - P.right, y: y(ZONE[1] + 0.5), height: y(ZONE[0] - 0.5) - y(ZONE[1] + 0.5), fill: BAND, 'data-testid': 'zone-band' });
  const line = s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '), fill: 'none', stroke: INK, 'stroke-opacity': 0.35, 'stroke-width': 1, 'data-series': 'line' });
  return h('div', { class: 'gap' },
    focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'data-testid': 'landing-chart',
      'aria-label': `Fullness 20 minutes after each of your last ${pts.length} meals, on a scale of 1 to 10.` },
    band, ...grid, line, ...pts.map((p, i) => mark(p.stop, x(i), y(p.value))),
    s('text', { x: P.left, y: HT - 6 }, `${pts.length} meals ago`), s('text', { x: W - P.right, y: HT - 6, 'text-anchor': 'end' }, 'latest'))),
    stopLegend([['zone', `Comfortable zone, ${ZONE[0]} to ${ZONE[1]}`], ['line-faint', 'Meal to meal']], 'landing-legend'));
}

/** Moves labels apart so none overlap: at least gap units between centres. */
function spread(ys, gap, lo, hi) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length ? order[order.length - 1].y - hi : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  if (order.length && order[0].y < lo) { const d = lo - order[0].y; for (const o of order) o.y += d; }
  const out = [];
  for (const o of order) out[o.i] = o.y;
  return out;
}

/**
 * The 20-minute lag, after the person's earlier page: average fullness right
 * after eating and 20 minutes on, one line per way of finishing. The steeper
 * the line, the more the body was still catching up.
 */
function lagChart(st) {
  const rows = st.byStop.filter((r) => r.rises);
  const HT = 230;
  const P = { top: 30, bottom: 30, left: 34 };
  const X0 = 100;
  const X1 = 226;
  const y = (v) => P.top + (HT - P.top - P.bottom) * (1 - (v - 1) / 9);
  const grid = [2, 4, 6, 8, 10].flatMap((v) => [
    s('line', { x1: P.left, x2: X1 + 8, y1: y(v), y2: y(v), stroke: GRID }),
    s('text', { x: P.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)),
  ]);
  const leftY = spread(rows.map((r) => y(r.now)), 14, P.top, HT - P.bottom);
  const rightY = spread(rows.map((r) => y(r.at20)), 14, P.top, HT - P.bottom);
  const lines = rows.flatMap((r, i) => {
    const colour = STOP_STYLE[r.stop].colour;
    return s('g', { 'data-series': r.stop },
      s('line', { x1: X0, y1: y(r.now), x2: X1, y2: y(r.at20), stroke: colour, 'stroke-width': 2.5, 'data-lag': r.stop }),
      mark(r.stop, X0, y(r.now), 5),
      mark(r.stop, X1, y(r.at20), 5),
      // Each figure carries its line's shape, so close values stay told apart.
      mark(r.stop, X0 - 48, leftY[i], 4),
      s('text', { x: X0 - 12, y: leftY[i] + 4, 'text-anchor': 'end', class: 'chart-end' }, r.now.toFixed(1)),
      mark(r.stop, X1 + 16, rightY[i], 4),
      s('text', { x: X1 + 26, y: rightY[i] + 4, class: 'chart-end' }, `${r.at20.toFixed(1)} ${signed(r.rise)}`));
  });
  const words = rows.map((r) => `${STOP_STYLE[r.stop].word}: ${r.now.toFixed(1)} right after, ${r.at20.toFixed(1)} after 20 minutes`).join('. ');
  return h('div', { class: 'gap' },
    focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'data-testid': 'lag-chart', 'aria-label': `Average fullness right after eating and 20 minutes on. ${words}.` },
      ...grid,
      s('text', { x: X0, y: 14, 'text-anchor': 'middle' }, 'right after'),
      s('text', { x: X1, y: 14, 'text-anchor': 'middle' }, 'after 20 min'),
      ...lines,
      s('text', { x: P.left, y: HT - 6 }, 'average fullness, 1 to 10, by how you stopped'))),
    legend(rows.map((r) => [stopIcon(r.stop), `${STOP_STYLE[r.stop].word} (${r.rises})`, r.stop]), 'lag-legend', { focus: F.focus, onPick: F.pick }));
}

/** One horizontal bar per way of finishing, each row labelled in words. */
function stopBars(rows, { max, value, text, testid, label }) {
  const HT = rows.length * 34;
  const LEFT = 118;
  return focusable(s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': label, 'data-testid': testid },
    ...rows.map((r, i) => {
      const v = value(r);
      const yy = i * 34 + 8;
      const width = v == null ? 0 : Math.max(2, ((W - LEFT - 70) * v) / max);
      return s('g', { 'data-series': r.stop },
        s('rect', { x: 0, y: yy - 4, width: W, height: 30, fill: 'transparent' }), // the whole row is the tap target
        mark(r.stop, 7, yy + 9, 5),
        s('text', { x: 18, y: yy + 13 }, STOP_STYLE[r.stop].word),
        s('rect', { x: LEFT, y: yy + 2, width: width.toFixed(1), height: 14, fill: STOP_STYLE[r.stop].colour }),
        s('text', { x: LEFT + width + 6, y: yy + 13 }, v == null ? 'not enough yet' : text(r)));
    })));
}

function insightsView(ctx, app, st) {
  if (!st.rated) {
    return h('section', { class: 'section', 'data-block': 'satiety-insights' },
      h('p', { class: 'quiet' }, 'Your insights start with your first rated meal. Finish a meal and rate how it ended, then answer the fullness check 20 minutes later.'));
  }
  const pct = (n, d) => (d ? figureParts([[Math.round((n / d) * 100), '%']]) : 'none');
  // What each chart leads with.
  const landing = st.landings.length ? st.landings.reduce((a, p) => a + p.value, 0) / st.landings.length : null;
  const wanting = st.byStop.find((r) => r.stop === 'before_full');
  const hunger = average(st.byStop.filter((r) => r.hungers), (r) => r.hunger, (r) => r.hungers);
  return h('div', { 'data-block': 'satiety-insights' },
    h('section', { class: 'section' },
      h('div', { class: 'tiles' },
        tile('Satiety drift', st.drift == null ? 'not yet' : figureParts([[signed(st.drift), ' pts']]),
          st.drift == null ? 'Needs a meal with both fullness readings.' : st.drift >= 1.5 ? 'Fullness keeps climbing after you stop. Stopping earlier would still land you satisfied.' : 'How much fullness rises in the 20 minutes after a meal.', 'tile-drift'),
        tile('Landed in zone', figureParts([[st.landed, ` of ${st.done}`]]), `Meals that ended between ${ZONE[0]} and ${ZONE[1]} out of 10.`, 'tile-zone'),
        tile('Meals complete', figureParts([[st.done, ` of ${st.meals}`]]), st.done === st.meals ? 'Every meal has both readings.' : `${st.meals - st.done} still missing the 20-minute check.`, 'tile-complete'),
        tile('Stopped past full', pct(st.pastFull, st.rated), st.pastFull ? 'Share of rated meals that ended overfull.' : 'You have not ended a meal overfull.', 'tile-past'))),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Where you land'),
      landing != null ? lead([[landing.toFixed(1), ' of 10']], 'lead-landing') : null,
      h('p', { class: 'small quiet gap-s' }, 'Average fullness 20 minutes after a meal, over the meals below. Each point is one meal; the shaded band is your comfortable zone, and the shape and colour show how the meal ended.'),
      st.landings.length ? landingChart(st) : h('p', { class: 'small gap' }, 'Answer one fullness check and your first point appears here.')),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'The 20-minute lag'),
      st.drift != null ? lead([[signed(st.drift), ' pts']], 'lead-lag') : null,
      h('p', { class: 'small quiet gap-s' }, 'The average rise in fullness over the 20 minutes after a meal. Below, by how you stopped: fullness right after and 20 minutes later. The steeper the line, the more your body was still catching up; the figure on the right is the rise.'),
      st.done ? lagChart(st) : h('p', { class: 'small gap' }, 'Answer one fullness check and the lines appear here.')),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'How often you stop where'),
      lead([[wanting.count, ` of ${st.rated}`]], 'lead-stops'),
      h('p', { class: 'small quiet gap-s' }, 'Meals you left wanting, the goal, out of every rated meal. Below, how often you stop each way.'),
      h('div', { class: 'gap' }, stopBars(st.byStop, { max: Math.max(1, ...st.byStop.map((r) => r.count)), value: (r) => r.count, text: (r) => `${r.count} (${Math.round(r.share * 100)}%)`, testid: 'stop-chart', label: 'Number of meals by how they ended.' }))),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Arriving hungry'),
      hunger != null ? lead([[hunger.toFixed(1), ' of 10']], 'lead-hunger') : null,
      h('p', { class: 'small quiet gap-s' }, 'Average hunger before a meal, 1 to 10. Below, by how the meal ended.'),
      h('div', { class: 'gap' }, stopBars(st.byStop, { max: 10, value: (r) => r.hunger, text: (r) => `${r.hunger.toFixed(1)} (${r.hungers})`, testid: 'hunger-chart', label: 'Average hunger before meals, by how they ended.' }))),
    findings(ctx),
    h('section', { class: 'section' },
      app.ui.showSatietyTable ? mealTable(ctx) : null,
      button(app.ui.showSatietyTable ? 'Hide the table' : 'Show as a table', () => { app.ui.showSatietyTable = !app.ui.showSatietyTable; app.refresh(); }, { kind: 'secondary', name: 'satiety-table' })));
}

function findings(ctx) {
  const found = satietyInsights(ctx.meals);
  return h('section', { class: 'section' },
    h('div', { class: 'label' }, 'From your meals'),
    found.length
      ? h('ul', { class: 'plain gap-s', 'data-testid': 'insights' }, found.map((f) => h('li', { class: 'gap-s' }, f)))
      : h('p', { class: 'small quiet gap-s', 'data-testid': 'insights' }, 'Rate how ten meals finished and your own patterns show here.'));
}

function mealTable(ctx) {
  const rows = ctx.meals.filter((m) => completed(m) && (!F.focus || m.stop === F.focus)).sort((a, b) => b.startedAt - a.startedAt);
  return h('table', { class: 'table gap-s', 'data-testid': 'satiety-table' },
    h('thead', {}, h('tr', {}, ['Meal', 'Hunger', 'Right after', '20 min', 'Drift'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows.map((m) => h('tr', {},
      h('td', {}, `${fmtDayShort(m.day)}, ${STOP_TEXT[m.stop] || 'not rated'}`),
      h('td', {}, m.hungerBefore ?? ''), h('td', {}, m.fullnessNow), h('td', {}, m.fullness20),
      h('td', {}, signed(m.fullness20 - m.fullnessNow))))));
}

// ---------- Now ----------

function nowView(ctx, app) {
  const { mode, rec } = ctx.mode;
  const key = rec && (mode === 'open' || mode === 'forgot' || mode === 'closed') ? rec.day : ctx.todayKey;
  const eating = mealInProgress(ctx, key);
  const checks = [...dueFullness(ctx), ...runningFullness(ctx)];
  return h('div', { 'data-block': 'satiety-now' },
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Fullness check'),
      checks.length
        ? checks.map((m) => h('div', { class: 'gap', 'data-testid': 'fullness-check' },
          h('p', {}, `${m.name || 'A meal'}, finished ${fmtTime(m.finishedAt)}. `,
            live('span', {}, (t) => (m.fullness20DueAt > t ? `Check in ${fmtDuration(m.fullness20DueAt - t)}.` : 'Time to score it.'))),
          h('div', { class: 'gap-s' }, button('Score my fullness now', () => showFullnessSheet(app, m.id), { kind: 'secondary', name: 'score-now' }))))
        : h('p', { class: 'small quiet gap-s' }, 'No check waiting. Finish a meal and its 20-minute check appears here.')),
    eating
      ? h('section', { class: 'section', 'data-block': 'eating' },
        h('p', {}, `Eating: ${eating.name || 'a meal'}, since ${fmtTime(eating.startedAt)}.`),
        h('div', { class: 'gap' }, button('Finished this meal', () => showFinishMealSheet(app, eating.id), { block: true, name: 'finish-meal' })))
      : null,
    fullnessCard(ctx, key));
}

// ---------- Meals ----------

function mealsView(ctx, app) {
  const from = addDays(ctx.todayKey, -29);
  const recent = ctx.meals.filter((m) => m.day >= from && (!F.focus || m.stop === F.focus)).sort((a, b) => b.startedAt - a.startedAt);
  if (!recent.length && F.focus) return h('section', { class: 'section', 'data-block': 'satiety-meals' }, stopLegend([], 'meals-legend'), h('p', { class: 'quiet gap' }, `No ${STOP_STYLE[F.focus].word.toLowerCase()} meals in the last 30 days.`));
  if (!recent.length) return h('section', { class: 'section', 'data-block': 'satiety-meals' }, h('p', { class: 'quiet' }, 'No meals in the last 30 days. Start a meal from Today, or add one you already ate, and it collects here, newest first.'));
  const days = [...new Set(recent.map((m) => m.day))];
  return h('div', { 'data-block': 'satiety-meals' },
    stopLegend([[stopIcon(null), 'Not rated yet']], 'meals-legend'),
    days.map((d) => h('section', { class: 'section', 'data-day': d },
      h('div', { class: 'label' }, fmtDayShort(d)),
      h('ul', { class: 'list gap-s' }, recent.filter((m) => m.day === d).map((m) => h('li', {},
        h('button', { type: 'button', class: 'item meal-entry', 'data-meal': String(m.id), onclick: () => showMealEditSheet(app, m.id) },
          h('span', {},
            h('span', { class: 'item-title' }, `${fmtTime(m.startedAt)} ${m.name || 'Meal'}`),
            h('br'),
            h('span', { class: 'item-meta' }, m.stop ? stopIcon(m.stop) : null, ` ${m.stop ? STOP_STYLE[m.stop].word : 'Not rated'}${m.outside ? ', outside the window' : ''}`)),
          h('span', { class: 'item-side' },
            `${m.hungerBefore ?? '–'} → ${m.fullnessNow ?? '–'} → ${m.fullness20 ?? '–'}`,
            completed(m) ? h('span', { class: 'drift' }, ` ${signed(m.fullness20 - m.fullnessNow)}`) : null))))))),
    h('p', { class: 'small quiet gap' }, 'Each meal reads hunger before → fullness right after → fullness 20 minutes on; the last figure is the drift.'));
}

// ---------- The tab ----------

const VIEWS = [{ value: 'insights', label: 'Insights' }, { value: 'now', label: 'Now' }, { value: 'meals', label: 'Meals' }];

export function renderSatiety(ctx, app) {
  const view = VIEWS.some((v) => v.value === ctx.settings.satietyView) ? ctx.settings.satietyView : 'insights';
  const focus = STOPS.includes(app.ui.satietyFocus) ? app.ui.satietyFocus : null;
  F = { focus, pick: (stop) => { app.ui.satietyFocus = stop; app.refresh(); } };
  const filtered = focus && view !== 'now'
    ? focusLine(`Charts and meals show ${STOP_STYLE[focus].word.toLowerCase()} only.`, () => F.pick(null), 'satiety-focus')
    : null;
  const st = satietyStats(ctx.meals);
  return h('div', { class: 'satiety', 'data-view': view },
    header(ctx, app, { title: 'Satiety' }),
    h('section', { class: 'section strong' },
      h('h1', { class: 'display' }, 'Satiety'),
      h('p', { class: 'gap' }, st.rated ? `${st.rated} rated ${st.rated === 1 ? 'meal' : 'meals'}; ${st.done} with the 20-minute check.` : 'How your meals end, and what 20 minutes changes.'),
      h('div', { class: 'gap' }, choice({ options: VIEWS, value: view, cols: 3, name: 'satiety-view', onChange: (v) => store.setSettings({ satietyView: v }) })),
      filtered,
      // A meal already eaten, added whole with no timer.
      h('div', { class: 'gap' }, button('Add a meal', () => showAddMealSheet(app), { kind: 'outline', block: true, name: 'add-meal' }))),
    view === 'insights' ? insightsView(ctx, app, st) : view === 'now' ? nowView(ctx, app) : mealsView(ctx, app));
}

