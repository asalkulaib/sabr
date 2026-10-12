// Eating outside the window: recorded without judgment, with its trigger.

import { h } from './dom.js';
import { button, choice, timeField, TRIGGER_OPTIONS } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { addDays, at, minutesOfDay, now } from '../core/time.js';
import { LATE_NIGHT_END_MIN, lateNightDay } from '../core/rules.js';
import { latestAtOrBefore } from './meal.js';
import { nextWindowLine } from './shared.js';

/**
 * The moment of eating outside a day's window. Logged live (today, or last
 * night just after midnight) it is the most recent such clock time. Filled
 * in for a past day, it falls on that day, and times before 04:00 belong to
 * the night that follows it.
 */
export function outsideTime(ctx, day, minutes) {
  if (day === ctx.todayKey || day === lateNightDay(ctx)) return latestAtOrBefore(minutes, now());
  return minutes < LATE_NIGHT_END_MIN ? at(addDays(day, 1), minutes) : at(day, minutes);
}

export const AMOUNT_OPTIONS = [
  { value: 'little', label: 'A little' },
  { value: 'meal', label: 'More than a little' },
];

/** After a slip: one line pointing to the next window, nothing else. */
export function slipLine(app, day, api) {
  return h('div', {},
    sheetHead(api, 'Outside the window'),
    h('p', { class: 'statement', 'data-testid': 'slip-line' }, nextWindowLine(app.ctx(), day)),
    h('div', { class: 'gap-l' }, button('Done', () => api.close(), { block: true, name: 'done' })));
}

/**
 * opts: { day (the window this eating follows), trigger }
 */
export function showOutsideSheet(app, { day, trigger = null } = {}) {
  const draft = { trigger, amount: null, minutes: minutesOfDay(now()) };
  let saved = false;
  let hint = '';
  openSheet((api) => {
    if (saved) return slipLine(app, day, api);
    return h('div', {},
      sheetHead(api, 'Outside the window'),
      h('h2', { class: 'h2' }, 'What set it off?'),
      h('section', { class: 'section gap' },
        choice({ options: TRIGGER_OPTIONS, value: draft.trigger, onChange: (v) => { draft.trigger = v; }, cols: 3, name: 'trigger' })),
      h('section', { class: 'section' },
        choice({ label: 'How much', options: AMOUNT_OPTIONS, value: draft.amount, onChange: (v) => { draft.amount = v; }, cols: 2, name: 'amount' })),
      h('section', { class: 'section' },
        timeField({ label: 'At', minutes: draft.minutes, name: 'outside-at', onChange: (m) => { draft.minutes = m; } })),
      hint ? h('p', { class: 'quiet small' }, hint) : null,
      h('div', { class: 'gap' }, button('Save', async () => {
        if (!draft.trigger) { hint = 'Pick what set it off.'; api.rerender(); return; }
        await store.addOutside({ day, at: outsideTime(app.ctx(), day, draft.minutes), trigger: draft.trigger, amount: draft.amount, source: 'today' });
        saved = true;
        api.replace((a) => slipLine(app, day, a));
      }, { block: true, name: 'save-outside' })),
    );
  }, { name: 'outside', label: 'Outside the window' });
}
