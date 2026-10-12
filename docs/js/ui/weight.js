// Weight: the 7-day average leads on the page, then its change, the 7-day
// average over time and the import. Every weigh-in counts toward the
// averages, a single one included; there is no way to type a weight in.

import { h } from './dom.js';
import { button, choice, figureParts } from './components.js';
import * as store from '../store.js';
import { metricSwitch } from './history.js';
import { fmtDayMonth } from '../core/time.js';
import { WEIGHT_RANGES, latestDate, rangeStart, rollingSeries, summaryOn } from '../core/weight.js';
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
  return h('section', { class: 'section import-card', 'data-block': 'import' },
    h('h2', { class: 'card-title' }, 'Import'),
    h('p', { class: 'small quiet import-status' }, last ? `Last import ${ago(last, ctx.nowTs)}.` : 'Nothing imported yet.'),
    h('div', { class: 'import-main' }, button('Import weight', () => app.importWeight(), { block: true, name: 'import-weight' })),
    app.ui.showPaste
      ? h('div', { class: 'import-paste', 'data-block': 'paste' },
        h('p', { class: 'small' }, 'If the clipboard could not be read, paste here instead. Nothing you paste is shown.'),
        pasteTarget(app))
      : null,
    h('div', { class: 'import-more' },
      h('a', { class: 'btn outline block', href: SHORTCUT_URL, 'data-action': 'run-shortcut' }, 'Run the Fast Weight shortcut'),
      button('How to set up the Shortcut', () => app.go('help'), { kind: 'outline', block: true, name: 'shortcut-help' })),
  );
}

/**
 * The lead on the page: the 7-day average up to a day, its weigh-ins and the
 * change from the 7 days before. Built once and filled in place, so a finger
 * moving along the chart changes the words without redrawing the screen.
 * show(day, latest): latest false while a day chosen on the chart is shown,
 * which brings Back to latest.
 */
function summaryBox(ctx, app) {
  const back = button('Back to latest', () => { app.ui.weightDay = null; app.refresh(); }, { kind: 'secondary', name: 'weight-latest', disabled: true });
  back.classList.add('hit-44');
  // Shown only for a day chosen on the chart, but its room is always kept.
  const slot = h('div', { class: 'latest-slot latest-idle' }, back);
  const figure = h('div', { class: 'lead-figure-slot' });
  const notes = h('div', { class: 'meta-pairs', 'data-testid': 'weight-notes' });
  const change = h('p', { class: 'weight-change', 'data-testid': 'weight-change' });
  const box = h('section', { class: 'hero chart-lead', 'data-block': 'weight-summary', 'aria-live': 'polite' },
    h('div', { class: 'lead-row' }, h('div', { class: 'label' }, '7-day average'), slot),
    figure,
    notes,
    change);

  let shown = null;
  box.show = (day, latest) => {
    if (shown === `${day}:${latest}`) return;
    shown = `${day}:${latest}`;
    const summary = summaryOn(ctx.weights, day);
    const cur = summary.current;
    figure.replaceChildren(cur.avg != null
      ? h('p', { class: 't-hero lead-figure', 'data-testid': 'weight-average' }, figureParts([[cur.avg.toFixed(1), ' kg']]))
      : h('p', { class: 'statement lead-none', 'data-testid': 'weight-average' }, 'No weigh-in in these 7 days.'));
    notes.replaceChildren(note('Up to', fmtDayMonth(summary.end)), note('Weigh-ins', `${cur.n} of 7`));
    // Both lines take one line of the same size, so the lead keeps its height from day to day.
    if (summary.change != null) {
      change.classList.remove('none');
      change.replaceChildren(h('span', { class: 'change-label' }, 'Change from the 7 days before:'), ' ', h('span', { class: 'change-value' }, `${signedKg(summary.change)}.`));
    } else {
      change.classList.add('none');
      change.replaceChildren('No weigh-in in the 7 days before.');
    }
    slot.classList.toggle('latest-idle', latest);
    back.disabled = latest;
  };
  return box;
}

/** The time frames. On two rows (a narrow screen) they are picked by tap: dragging reads one row only. */
function rangeTrack(track) {
  const wrap = h('div', { class: 'weight-range' }, track);
  wrap.addEventListener('pointerdown', (e) => {
    if (matchMedia('(max-width: 374px)').matches) e.stopPropagation();
  }, true);
  return wrap;
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
      h('section', { class: 'hero weight-empty' },
        h('h2', { class: 't-title-1' }, 'No weigh-ins yet'),
        h('p', { class: 'weight-empty-words' }, 'Your scale sends each weigh-in to Apple Health. A Shortcut brings them here, and Sabr shows your 7-day average.')),
      importSection(ctx, app));
  }

  // Touching the chart moves the lead to that day, in place, as the finger moves.
  const box = summaryBox(ctx, app);
  box.show(chosen || latest, !chosen);
  const onSelect = (date) => {
    const isLatest = date === latest;
    app.ui.weightDay = isLatest ? null : date;
    box.show(date, isLatest);
  };
  return h('div', { class: 'weight' },
    head,
    box,
    h('section', { class: 'weight-chart-block', 'data-block': 'chart' },
      h('div', { class: 'label field-label' }, 'Over time'),
      rangeTrack(choice({ options: RANGES, value: range, cols: 5, name: 'weight-range', slim: true, ariaLabel: 'Time shown',
        onChange: (v) => { app.ui.weightDay = null; store.setSettings({ weightRange: v }); } })),
      shown.length
        ? h('div', { class: 'weight-plot' }, weightChart(shown, { from, to: ctx.todayKey, selected: chosen, onSelect }))
        : h('p', { class: 'statement weight-plot', 'data-testid': 'weight-chart-empty' }, 'No 7-day average in this time yet.'),
      // What the line is, and why it has gaps, right under it.
      h('p', { class: 'small quiet weight-note', 'data-testid': 'weight-chart-note' },
        'Each point is your 7-day average on a day you weighed in, the same figure as at the top: the average of every weigh-in in the 7 days up to it, even a single one. A week with no weigh-in breaks the line.'),
      shown.length
        ? [h('div', { class: 'table-toggle' },
          button(app.ui.showTable ? 'Hide the table' : 'Show as a table', () => { app.ui.showTable = !app.ui.showTable; app.refresh(); }, { kind: 'secondary', name: 'toggle-table' })),
        app.ui.showTable ? h('div', { class: 'card table-card' }, weightTable(shown)) : null]
        : null),
    importSection(ctx, app),
  );
}
