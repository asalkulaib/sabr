// Weight: the 7-day average, its change, and the 7-day average over time.
// Every weigh-in counts toward the averages, a single one included; there is
// no way to type a weight in.

import { h } from './dom.js';
import { button, choice, figureParts } from './components.js';
import * as store from '../store.js';
import { metricSwitch } from './history.js';
import { fmtDayMonth } from '../core/time.js';
import { WEIGHT_RANGES, latestDate, rangeStart, rollingSeries, summaryOn } from '../core/weight.js';
import { emptyArt } from './art.js';
import { weightChart, weightTable } from './chart.js';
import { ago, header, note } from './shared.js';

export const SHORTCUT_NAME = 'Fast Weight';
export const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

// The chart's time frames, ending today.
const RANGES = [{ value: '1m', label: '1 month' }, { value: '3m', label: '3 months' }, { value: '6m', label: '6 months' }, { value: 'ytd', label: 'This year' }, { value: 'all', label: 'All' }];

const signedKg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} kg`;

/** A paste target that accepts a paste only and never shows it. */
function pasteTarget(app) {
  const area = h('textarea', {
    class: 'paste-target',
    rows: '1',
    inputmode: 'none',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': 'Paste the weight data here',
    placeholder: 'Long-press here, then tap Paste',
    'data-testid': 'paste-target',
  });
  area.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertFromPaste') e.preventDefault();
  });
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    area.value = '';
    area.blur();
    app.importText(text);
  });
  area.addEventListener('input', () => {
    const text = area.value;
    area.value = '';
    if (text) app.importText(text);
  });
  return area;
}

function importSection(ctx, app) {
  const last = ctx.settings.lastImportAt;
  return h('section', { class: 'section', 'data-block': 'import' },
    h('div', { class: 'label' }, 'Import'),
    h('p', { class: 'small quiet gap-s' }, last ? `Last import ${ago(last, ctx.nowTs)}.` : 'Nothing imported yet.'),
    h('div', { class: 'gap' }, button('Import weight', () => app.importWeight(), { block: true, name: 'import-weight' })),
    app.ui.showPaste
      ? h('div', { class: 'gap-l', 'data-block': 'paste' },
        h('p', { class: 'small' }, 'If the clipboard could not be read, paste here instead. Nothing you paste is shown.'),
        pasteTarget(app))
      : null,
    h('div', { class: 'btn-row gap' },
      h('a', { class: 'btn-2', href: SHORTCUT_URL, 'data-action': 'run-shortcut' }, 'Run the Fast Weight shortcut'),
      button('How to set up the Shortcut', () => app.go('help'), { kind: 'secondary', name: 'shortcut-help' })),
  );
}

/**
 * The big box: the 7-day average up to a day, its weigh-ins and the change
 * from the 7 days before. latest: false while a day chosen on the chart is
 * shown, which brings Back to latest.
 */
function summaryBox(ctx, app, day, latest) {
  const summary = summaryOn(ctx.weights, day);
  const cur = summary.current;
  return [
    h('div', { class: 'row' },
      h('div', { class: 'main' },
        h('div', { class: 'label' }, '7-day average'),
        cur.avg != null
          ? h('h1', { class: 'display gap-s', 'data-testid': 'weight-average' }, figureParts([[cur.avg.toFixed(1), ' kg']]))
          : h('p', { class: 'statement gap-s', 'data-testid': 'weight-average' }, 'No weigh-in in these 7 days.')),
      h('div', { class: 'margin', 'data-testid': 'weight-notes' },
        note('Up to', fmtDayMonth(summary.end)),
        note('Weigh-ins', `${cur.n} of 7`))),
    // Both lines take one line of the same size, so the box keeps its height from day to day.
    summary.change != null
      ? h('p', { class: 'gap', 'data-testid': 'weight-change' }, `Change from the 7 days before: ${signedKg(summary.change)}.`)
      : h('p', { class: 'quiet gap', 'data-testid': 'weight-change' }, 'No weigh-in in the 7 days before.'),
    // Shown only for a day chosen on the chart, but its room is always kept.
    h('div', { class: latest ? 'gap-s latest-idle' : 'gap-s' },
      button('Back to latest', () => { app.ui.weightDay = null; app.refresh(); }, { kind: 'chip', name: 'weight-latest', disabled: latest })),
  ];
}

export function renderWeight(ctx, app) {
  const range = WEIGHT_RANGES.includes(ctx.settings.weightRange) ? ctx.settings.weightRange : '3m';
  const series = rollingSeries(ctx.weights);
  const from = rangeStart(range, ctx.todayKey) || (series.length ? series[0].date : ctx.todayKey);
  const shown = series.filter((p) => p.date >= from);
  const latest = latestDate(ctx.weights);
  // A day chosen on the chart, while it is still on the chart; otherwise the latest.
  const chosen = shown.some((p) => p.date === app.ui.weightDay) && app.ui.weightDay !== latest ? app.ui.weightDay : null;
  // Weight is the third view of History, under the same switch.
  const head = [header(ctx, app, { title: 'History' }), metricSwitch(app, 'weight')];

  if (!ctx.weights.size) {
    return h('div', { class: 'weight empty' },
      head,
      h('section', { class: 'section strong' },
        h('h1', { class: 'display' }, 'No weigh-ins yet'),
        h('p', { class: 'gap' }, 'Your scale sends each weigh-in to Apple Health. A Shortcut brings them here, and Sabr shows your 7-day average.')),
      importSection(ctx, app),
      emptyArt());
  }

  // Touching the chart moves the big box to that day, in place, as the finger moves.
  const box = h('section', { class: 'section strong', 'data-block': 'weight-summary', 'aria-live': 'polite' }, summaryBox(ctx, app, chosen || latest, !chosen));
  const onSelect = (date) => {
    const isLatest = date === latest;
    if ((isLatest ? null : date) === app.ui.weightDay && box.childElementCount) return;
    app.ui.weightDay = isLatest ? null : date;
    box.replaceChildren(...summaryBox(ctx, app, date, isLatest));
  };
  return h('div', { class: 'weight' },
    head,
    box,
    h('section', { class: 'section', 'data-block': 'chart' },
      h('div', { class: 'label' }, 'Over time'),
      h('div', { class: 'gap-s' }, choice({ options: RANGES, value: range, cols: 5, name: 'weight-range', slim: true, ariaLabel: 'Time shown',
        onChange: (v) => { app.ui.weightDay = null; store.setSettings({ weightRange: v }); } })),
      shown.length
        ? h('div', { class: 'gap' }, weightChart(shown, { from, to: ctx.todayKey, selected: chosen, onSelect }))
        : h('p', { class: 'statement gap', 'data-testid': 'weight-chart-empty' }, 'No 7-day average in this time yet.'),
      // What the line is, and why it has gaps, right under it.
      h('p', { class: 'small quiet gap-s', 'data-testid': 'weight-chart-note' },
        'Each point is your 7-day average on a day you weighed in, the same figure as at the top: the average of every weigh-in in the 7 days up to it, even a single one. A week with no weigh-in breaks the line.'),
      shown.length
        ? h('div', { class: 'gap' },
          app.ui.showTable ? weightTable(shown) : null,
          button(app.ui.showTable ? 'Hide the table' : 'Show as a table', () => { app.ui.showTable = !app.ui.showTable; app.refresh(); }, { kind: 'secondary', name: 'toggle-table' }))
        : null),
    importSection(ctx, app),
  );
}
