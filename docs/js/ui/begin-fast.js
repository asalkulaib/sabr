// Begin fast: set when a fast already under way began, so no fasting hours
// are lost (a first day with Fast, after a pause or a gap, or after a bite
// that was never logged). The day it falls on keeps its result.

import { h, live } from './dom.js';
import { button, timeField } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import { RING, ringsSvg } from './rings.js';
import * as store from '../store.js';
import { HOUR, addDays, at, fmtElapsed, fmtTime, fmtWhen, minutesOfDay, now } from '../core/time.js';
import { fastHoursFor, lastBiteTs, lastEatingSource, plannedStartMin } from '../core/rules.js';
import { errLine, field, form, latestAtOrBefore, say } from './meal.js';

/**
 * onBite(): opens the last bite on record, for a fast that began before it.
 */
export function showBeginFastSheet(app, { onBite } = {}) {
  const ctx = app.ctx();
  const today = ctx.todayKey;
  const src = lastEatingSource(ctx);
  const floor = lastBiteTs(ctx); // a fast cannot begin before the last bite on record
  let ts = src ? src.ts : now();
  const goalMs = fastHoursFor(today, ctx.settings) * HOUR;

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

    const hintEl = errLine('', 'fast-hint');
    const bite = button('Change that last bite', async () => { await api.close(); if (onBite) onBite(); }, { kind: 'outline', block: true, name: 'change-last-bite' });
    bite.hidden = true;
    const summary = live('p', { class: 'fast-summary', 'data-testid': 'fast-summary' },
      (n) => `Fasting since ${fmtWhen(ts, today)}: ${fmtElapsed(Math.max(0, n - ts))} so far.`);
    // The fast as its ring, against today's goal, lapping past it as on
    // Today; it follows the wheel. The word beside it is its legend.
    const ring = h('div', { class: 'fast-ring' });
    let drawn = false;
    const drawRing = () => {
      ring.replaceChildren(ringsSvg({ fast: { frac: Math.max(0, now() - ts) / goalMs } }, { size: RING.inline.size, animate: drawn }));
      drawn = true;
    };
    let saveBtn;
    const update = () => {
      const early = floor != null && ts < floor;
      say(hintEl, early ? `Your last bite on record is ${fmtWhen(floor, today)}. The fast begins after it.` : '');
      bite.hidden = !early;
      saveBtn.disabled = early;
      summary.textContent = summary.__live(now());
      drawRing();
    };
    const quick = h('div', { class: 'presets', role: 'group', 'aria-label': 'Quick times' },
      presets.map(([label, v]) => button(label, () => { ts = v; wheel.set(minutesOfDay(v)); update(); }, { kind: 'secondary', name: `fast-${label.split(' ')[0].toLowerCase()}` })));
    const wheel = timeField({
      label: 'Fast began at',
      minutes: minutesOfDay(ts),
      name: 'fast-start',
      aside: quick,
      onChange: (m) => { ts = latestAtOrBefore(m, now()); update(); },
    });
    saveBtn = button('Begin fast', async () => {
      if (floor != null && ts < floor) return;
      const { undo } = await store.beginFast(ts);
      await api.close();
      app.flash(`Fast began ${fmtWhen(ts, today)}.`, { undo });
    }, { block: true, name: 'save-fast' });
    update();
    return {
      head: sheetHead(api, 'Begin fast'),
      body: form(
        h('p', { class: 'form-intro' }, 'Already fasting? Set when your fast began, so none of it is lost.'),
        h('div', { class: 'fast-hero' },
          ring,
          h('div', { class: 'fast-words' }, h('div', { class: 'fast-label' }, 'Fasting'), summary)),
        field(wheel, hintEl),
        bite,
      ),
      actions: saveBtn,
    };
  }, { name: 'begin-fast', label: 'Begin fast' });
}
