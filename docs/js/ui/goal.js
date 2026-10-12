// The goal: an eating window of 16:8, 18:6, 20:4, 23:1 or any whole number
// of hours from 1 to 12, the fasting goal being the rest of the 24 hours.
// Custom can set it by the fast instead: 12 to 23 hours leaves the rest of
// the day to eat, and 24 to 72 hours is a long fast, kept for every fast,
// with the eating window as it was between them.
// A change applies from today on; past days keep the goal they had.

import { h } from './dom.js';
import { choice, optionWheel } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { HOUR } from '../core/time.js';
import { FAST_HOURS_MAX, FAST_HOURS_MIN, GOAL_HOURS_MAX, GOAL_PRESETS, LONG_FAST_MIN, fastHoursFor, goalLabel, longFastHours } from '../core/rules.js';

const hours = (n) => `${n} ${n === 1 ? 'hour' : 'hours'}`;

/** 'Eating window 4 hours, fasting 20 hours.', or for a long fast how long each fast and each window is. */
export function goalText(windowMs, longFast = null) {
  const w = Math.round(windowMs / HOUR);
  if (longFast) return `Fasting ${hours(longFast)} each time, with an eating window of ${hours(w)} between. A day that begins inside the fast's goal, with nothing eaten, counts as a success.`;
  return `Eating window ${hours(w)}, fasting ${hours(24 - w)}.`;
}

let customOpen = false; // the custom wheel stays open once chosen
let customBy = null; // what the custom wheel sets: 'window' or 'fast'

/** The goal choices; redraw() refreshes whatever holds them. */
function goalControls(app, redraw) {
  const ctx = app.ctx();
  const key = ctx.todayKey;
  const current = Math.round(ctx.windowMsFor(key) / HOUR);
  const long = longFastHours(key, ctx.settings);
  const custom = customOpen || !!long || !GOAL_PRESETS.includes(current);
  const by = customBy || (long ? 'fast' : 'window');
  const set = async (windowHours, fast = null) => {
    const now = app.ctx();
    if (windowHours === now.windowMsFor(key) / HOUR && longFastHours(key, now.settings) === fast) return;
    const { undo } = await store.setGoal(windowHours, key, fast);
    redraw();
    app.flash(`Goal ${goalLabel(windowHours * HOUR, fast)} from today.`, { undo });
  };
  // A fast of a day or more keeps the eating window; a shorter one leaves the rest of the day to eat.
  // The wheel in use stays on screen, even when the goal it lands on is a preset.
  const setFast = (f) => {
    customOpen = true;
    customBy = 'fast';
    return f >= LONG_FAST_MIN ? set(current, f) : set(24 - f);
  };
  const wheel = by === 'fast'
    ? optionWheel({
      label: 'Fasting',
      options: Array.from({ length: FAST_HOURS_MAX - FAST_HOURS_MIN + 1 }, (_, i) => ({ value: FAST_HOURS_MIN + i, label: hours(FAST_HOURS_MIN + i) })),
      value: fastHoursFor(key, ctx.settings),
      name: 'goal-fast',
      onChange: setFast,
    })
    : optionWheel({
      label: 'Eating window',
      options: Array.from({ length: GOAL_HOURS_MAX }, (_, i) => ({ value: i + 1, label: hours(i + 1) })),
      value: current,
      name: 'goal-hours',
      onChange: (w) => {
        customOpen = true;
        customBy = 'window';
        return set(w);
      },
    });
  return h('div', { 'data-block': 'goal-controls' },
    choice({
      options: [...GOAL_PRESETS.map((v) => ({ value: v, label: goalLabel(v * HOUR) })), { value: 'custom', label: 'Custom' }],
      value: custom ? 'custom' : current,
      cols: 5,
      name: 'goal',
      onChange: (v) => {
        customOpen = v === 'custom';
        customBy = null;
        if (customOpen) redraw();
        else set(v);
      },
    }),
    custom
      ? [
        h('div', { class: 'gap' }, choice({
          options: [{ value: 'window', label: 'Eating window' }, { value: 'fast', label: 'Fasting' }],
          value: by,
          cols: 2,
          name: 'goal-by',
          ariaLabel: 'Set the goal by',
          onChange: (v) => { customBy = v; redraw(); },
        })),
        h('div', { class: 'gap' }, wheel),
      ]
      : null,
    h('p', { class: 'gap-s', 'data-testid': 'goal-text' }, goalText(current * HOUR, long)),
    h('p', { class: 'small quiet gap-s' }, 'A change applies from today on. Past days keep the goal they had.'));
}

/** The Goal section on More. */
export function goalSection(ctx, app) {
  return h('section', { class: 'section', 'data-block': 'goal' },
    h('div', { class: 'label' }, 'Goal'),
    h('div', { class: 'gap-s' }, goalControls(app, () => app.refresh())));
}

/** The same choices in a sheet, from the Goal note on Today. */
export function showGoalSheet(app) {
  openSheet((api) => h('div', {},
    sheetHead(api, 'Goal'),
    h('p', {}, 'Choose your eating window, and the fast is the rest of the day. Or, in Custom, choose how long to fast, up to 72 hours.'),
    h('section', { class: 'section gap' }, goalControls(app, () => api.rerender()))),
  { name: 'goal', label: 'Goal' });
}
