// Pauses: days for travel, illness or Ramadan when fasting is not tracked.
// No window is logged, they are never a miss, and the streak holds.
// Fullness still counts: a paused day can be rated.

import { h } from './dom.js';
import { button, choice, dateField, errorLine } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { addDays, fmtDayShort } from '../core/time.js';
import { pauseRuns } from '../core/rules.js';

export const MAX_PAUSE_DAYS = 60;

const REASON_OPTIONS = [
  { value: 'travel', label: 'Travel' },
  { value: 'illness', label: 'Illness' },
  { value: 'ramadan', label: 'Ramadan' },
  { value: 'other', label: 'Other' },
];

const WORD = Object.fromEntries(REASON_OPTIONS.map((o) => [o.value, o.label]));

/** 'Travel', 'Ramadan'..., or null for a pause without a reason. */
export function pauseWord(paused) {
  return WORD[paused] || null;
}

const plural = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function rangeText(from, to) {
  return from === to ? fmtDayShort(from) : `${fmtDayShort(from)} to ${fmtDayShort(to)}`;
}

/** The pause today belongs to, or null. */
export function currentPause(ctx) {
  return pauseRuns(ctx.days).find((r) => r.from <= ctx.todayKey && r.to >= ctx.todayKey) || null;
}

/** Pauses still running or still ahead, soonest first. */
export function pausesAhead(ctx) {
  return pauseRuns(ctx.days).filter((r) => r.to >= ctx.todayKey);
}

/** One tap on Today: pause today, with Undo. */
export async function pauseToday(app) {
  const today = app.ctx().todayKey;
  const res = await store.pauseDays(today, today, true);
  if (res.error) app.flash(res.error);
  else app.flash('Today is paused.', { undo: res.undo });
}

/** Ends a pause from today on (or removes it all when it is still ahead), with Undo. */
export async function endPause(app, run) {
  const today = app.ctx().todayKey;
  const from = run.from > today ? run.from : today;
  const { undo } = await store.unpauseDays(store.daysBetween(from, run.to));
  app.flash(run.from > today ? 'Pause removed.' : 'Pause ended. Today is tracked again.', { undo });
}

/**
 * The summary under the wheels: its first clause as a figure ("30" and
 * " days:"), the rest quiet. The text reads exactly as the sentence.
 */
function fillSummary(node, text) {
  const m = /^(\d+)( days?:)(.*)$/.exec(text);
  if (!m) {
    node.textContent = text;
    return;
  }
  node.replaceChildren(
    h('span', { class: 'pause-count' }, m[1]),
    h('span', { class: 'pause-unit' }, m[2]),
    h('span', { class: 'pause-rest' }, m[3]));
}

/**
 * Adds a pause, or changes one (run). From and until roll on date wheels;
 * a reason is optional.
 */
export function showPauseSheet(app, { run = null, from = null } = {}) {
  const today = app.ctx().todayKey;
  const draft = {
    from: run ? run.from : from || today,
    to: run ? run.to : from || today,
    reason: run && pauseWord(run.reason) ? run.reason : null,
  };
  const replacing = run ? store.daysBetween(run.from, run.to) : [];
  const earliest = addDays(today, -30);
  const minFrom = draft.from < earliest ? draft.from : earliest;
  const maxFrom = addDays(today, 365);
  let hint = '';
  const title = run ? 'Change the pause' : 'Pause';

  openSheet((api) => {
    const maxTo = addDays(draft.from, MAX_PAUSE_DAYS - 1);
    if (draft.to < draft.from) draft.to = draft.from;
    if (draft.to > maxTo) draft.to = maxTo;
    const summaryText = () => {
      const keys = store.daysBetween(draft.from, draft.to);
      const logged = keys.filter((k) => !replacing.includes(k) && (store.state.days.get(k) || {}).firstBite).length;
      return [
        `${plural(keys.length)}: ${rangeText(draft.from, draft.to)}.`,
        draft.to >= today ? `Tracking resumes on ${fmtDayShort(addDays(draft.to, 1))}.` : '',
        logged ? `${plural(logged)} with a window logged: kept, but not counted.` : '',
      ].filter(Boolean).join(' ');
    };
    // The until wheel follows in place; a new start redraws both wheels.
    const summary = h('p', { class: 'pause-summary', 'data-testid': 'pause-summary' });
    fillSummary(summary, summaryText());
    return {
      head: sheetHead(api, title),
      body: h('div', { class: 'pause-form' },
        h('p', { class: 'pause-lead' }, 'Paused days are not tracked for fasting: no windows, no misses, and your streak holds. Fullness still counts.'),
        h('div', { class: 'pause-wheels' },
          h('div', { class: 'field-pair' },
            dateField({ label: 'From', value: draft.from, minKey: minFrom, maxKey: maxFrom, todayKey: today, name: 'pause-from',
              onChange: (k) => { draft.from = k; api.rerender(); } }),
            dateField({ label: 'Until', value: draft.to, minKey: draft.from, maxKey: maxTo, todayKey: today, name: 'pause-to',
              onChange: (k) => { draft.to = k; fillSummary(summary, summaryText()); } })),
          summary),
        h('div', { class: 'pause-reason' },
          // Four on one line; two by two on a narrow phone, where Ramadan would touch its pill.
          choice({ label: 'Why (optional)', options: REASON_OPTIONS, value: draft.reason, cols: matchMedia('(max-width: 359px)').matches ? 2 : 4, name: 'pause-reason', onChange: (v) => { draft.reason = v; } }))),
      actions: [
        errorLine(hint, { testid: 'pause-hint' }),
        button(run ? 'Save' : 'Pause these days', async () => {
          const res = await store.pauseDays(draft.from, draft.to, draft.reason, { replacing });
          if (res.error) { hint = res.error; api.rerender(); return; }
          await api.close();
          app.flash(`Paused: ${rangeText(draft.from, draft.to)}.`, { undo: res.undo });
        }, { block: true, name: 'save-pause' }),
        run
          ? button(run.from > today ? 'Remove this pause' : 'End the pause', async () => {
            await api.close();
            await endPause(app, run);
          }, { kind: 'outline', block: true, name: 'end-pause-sheet' })
          : null,
      ].filter(Boolean),
    };
  }, { name: 'pause', label: title });
}

/** The Pauses group on More: those running or ahead, and Add a pause. */
export function pausesSection(ctx, app) {
  const runs = pausesAhead(ctx);
  return h('div', { class: 'more-group', 'data-block': 'pauses' },
    h('h2', { class: 'group-title' }, 'Pauses'),
    h('section', { class: 'section pauses-card' },
      h('p', { class: 'more-body' }, 'For travel, illness or Ramadan. Fasting is not tracked on paused days and your streak holds; fullness still counts.'),
      runs.length
        ? h('ul', { class: 'list pause-list' }, runs.map((r) => {
          const now = r.from <= ctx.todayKey;
          return h('li', {},
            h('button', { type: 'button', class: 'item', 'data-pause': r.from, onclick: () => showPauseSheet(app, { run: r }) },
              h('span', {},
                h('span', { class: 'item-title' }, pauseWord(r.reason) || 'Paused'),
                h('br'),
                h('span', { class: 'item-meta' }, rangeText(r.from, r.to))),
              h('span', { class: 'item-side' }, h('span', { class: now ? 'status-tag now' : 'status-tag ahead' }, now ? 'Now' : 'Ahead'))));
        }))
        : null,
      button('Add a pause', () => showPauseSheet(app), { kind: 'outline', block: true, name: 'add-pause', icon: 'plus' })));
}
