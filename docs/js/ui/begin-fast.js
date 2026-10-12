// Begin fast: set when a fast already under way began, so no fasting hours
// are lost (a first day with Fast, after a pause or a gap, or after a bite
// that was never logged). The day it falls on keeps its result.

import { h, live } from './dom.js';
import { button, timeField } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { HOUR, addDays, at, fmtElapsed, fmtTime, fmtWhen, minutesOfDay, now } from '../core/time.js';
import { lastBiteTs, lastEatingSource, plannedStartMin } from '../core/rules.js';
import { latestAtOrBefore } from './meal.js';

/**
 * onBite(): opens the last bite on record, for a fast that began before it.
 */
export function showBeginFastSheet(app, { onBite } = {}) {
  const ctx = app.ctx();
  const today = ctx.todayKey;
  const src = lastEatingSource(ctx);
  const floor = lastBiteTs(ctx); // a fast cannot begin before the last bite on record
  let ts = src ? src.ts : now();

  // Last night: when yesterday's planned window would have closed.
  const y = addDays(today, -1);
  const lastNight = at(y, plannedStartMin(y, ctx.days.get(y), ctx.settings)) + ctx.windowMsFor(y);

  openSheet((api) => {
    const t = now();
    const presets = [
      ['Now', t],
      ['1 h ago', t - HOUR],
      ['2 h ago', t - 2 * HOUR],
      [`Last night ${fmtTime(lastNight)}`, lastNight],
    ].filter(([, v]) => v <= t && (floor == null || v >= floor));

    const hintEl = h('p', { class: 'small', 'data-testid': 'fast-hint' });
    const bite = h('div', { class: 'gap-s', hidden: true },
      button('Change that last bite', async () => { await api.close(); if (onBite) onBite(); }, { kind: 'secondary', name: 'change-last-bite' }));
    const summary = live('p', { class: 'quiet small gap-s', 'data-testid': 'fast-summary' },
      (n) => `Fasting since ${fmtWhen(ts, today)}: ${fmtElapsed(Math.max(0, n - ts))} so far.`);
    let saveBtn;
    const update = () => {
      const early = floor != null && ts < floor;
      hintEl.textContent = early ? `Your last bite on record is ${fmtWhen(floor, today)}. The fast begins after it.` : '';
      bite.hidden = !early;
      saveBtn.disabled = early;
      summary.textContent = summary.__live(now());
    };
    const field = timeField({
      label: 'Fast began at',
      minutes: minutesOfDay(ts),
      name: 'fast-start',
      onChange: (m) => { ts = latestAtOrBefore(m, now()); update(); },
    });
    saveBtn = button('Begin fast', async () => {
      if (floor != null && ts < floor) return;
      const { undo } = await store.beginFast(ts);
      await api.close();
      app.flash(`Fast began ${fmtWhen(ts, today)}.`, { undo });
    }, { block: true, name: 'save-fast' });
    const node = h('div', {},
      sheetHead(api, 'Begin fast'),
      h('p', {}, 'Already fasting? Set when your fast began, so none of it is lost.'),
      h('div', { class: 'presets gap', role: 'group', 'aria-label': 'Quick times' },
        presets.map(([label, v]) => button(label, () => { ts = v; field.set(minutesOfDay(v)); update(); }, { kind: 'secondary', name: `fast-${label.split(' ')[0].toLowerCase()}` }))),
      h('section', { class: 'section flush gap' }, field, summary),
      hintEl,
      bite,
      h('div', { class: 'gap' }, saveBtn));
    update();
    return node;
  }, { name: 'begin-fast', label: 'Begin fast' });
}
