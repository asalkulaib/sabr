// Correcting a window after the fact: its opening time while it is open
// (or removing a window opened by mistake), one bite time from a tap on its
// note, or both times once it is closed. Every time rolls on a wheel.

import { h } from './dom.js';
import { clockGlyph } from './icons.js';
import { button, timeField } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { MIN, floorToMinute, fmtDuration, fmtOnDay, fmtTime, minutesOfDay, nearestTime, now } from '../core/time.js';
import { timeOnOrAfter } from '../core/rules.js';
import { resolveFirstBite } from './meal.js';
import { mealsOfDay } from './shared.js';

const meals = (n) => (n === 1 ? 'Its meal goes too.' : `Its ${n} meals go too.`);

const span = (first, last, key) => `Window ${fmtTime(first)} to ${fmtOnDay(last, key)}, ${fmtDuration(last - first)}.`;

/** This minute, for Just now. */
const thisMinute = () => floorToMinute(now());

/**
 * Just now, a pill beside a last-bite wheel: sets the wheel to this minute
 * and keeps the moment itself, so a fast of days still lands on today.
 */
function justNow(onPick) {
  return button([clockGlyph(), 'Just now'], () => onPick(thisMinute()), { kind: 'chip', name: 'last-bite-now' });
}

/** While the window is open: change when it opened, or remove it. */
export function showOpeningSheet(app, initialKey) {
  let key = initialKey;
  const start = store.state.days.get(key);
  const draft = { minutes: start && start.firstBite ? minutesOfDay(start.firstBite) : null, hint: '', confirm: false };
  openSheet((api) => {
    const ctx = app.ctx();
    const rec = ctx.days.get(key);
    if (!rec || !rec.firstBite) return h('div', {}, sheetHead(api, 'Window opened'), h('p', {}, 'No window is open.'));
    const logged = mealsOfDay(ctx, key).length;
    return h('div', {},
      sheetHead(api, 'Window opened'),
      h('p', {}, 'Set the time of your first bite. The countdown, your eating window and the 16:00 rule follow it.'),
      h('section', { class: 'section gap' },
        timeField({ label: 'First bite at', minutes: draft.minutes, name: 'opened-at', onChange: (m) => { draft.minutes = m; } })),
      draft.hint ? h('p', { class: 'small', 'data-testid': 'times-hint' }, draft.hint) : null,
      h('div', { class: 'gap' }, button('Save', async () => {
        const ts = draft.minutes == null ? null : resolveFirstBite(key, draft.minutes);
        if (ts == null) { draft.hint = 'That time is still ahead.'; api.rerender(); return; }
        const result = await store.adjustWindow(key, ts, null);
        if (result.error) { draft.hint = result.error; api.rerender(); return; }
        key = result.key;
        await api.close();
        app.flash(`The window now opens at ${fmtTime(ts)}.`, { undo: result.undo });
      }, { block: true, name: 'save-opening' })),
      h('section', { class: 'section gap-l' },
        h('div', { class: 'label' }, 'Opened by mistake?'),
        draft.confirm
          ? h('div', { class: 'gap-s' },
            h('p', {}, `Remove the window opened at ${fmtTime(rec.firstBite)}?${logged ? ` ${meals(logged)}` : ''}`),
            h('div', { class: 'btn-row' },
              button('Remove window', async () => {
                const { undo } = await store.cancelWindow(key);
                await api.close();
                app.flash('Window removed. Start a meal when you eat.', { undo });
              }, { kind: 'secondary', name: 'confirm-remove-window' }),
              button('Keep it', () => { draft.confirm = false; api.rerender(); }, { kind: 'secondary', name: 'keep-window' })))
          : h('div', { class: 'gap-s' },
            button('Remove this window', () => { draft.confirm = true; api.rerender(); }, { kind: 'secondary', name: 'remove-window' }))),
    );
  }, { name: 'opening', label: 'Window opened' });
}

/**
 * One bite time, from a tap on its note on Today.
 * which: 'first' or 'last'. A window still open has no last bite to edit.
 */
export function showBiteTimeSheet(app, initialKey, which) {
  let key = initialKey;
  const start = store.state.days.get(key);
  const title = which === 'first' ? 'First bite' : 'Last bite';
  let minutes = minutesOfDay(which === 'first' ? start.firstBite : start.lastBite);
  let exact = null; // Just now: the moment itself, until the wheel is rolled
  openSheet((api) => {
    const rec = store.state.days.get(key);
    if (!rec || !rec.firstBite || (which === 'last' && !rec.lastBite)) return h('div', {}, sheetHead(api, title), h('p', {}, 'This window has changed.'));
    const times = () => {
      if (which === 'first') return { first: resolveFirstBite(key, minutes), last: rec.lastBite || null };
      return { first: rec.firstBite, last: exact ?? timeOnOrAfter(rec.firstBite, minutes) };
    };
    const summaryText = () => {
      const t = times();
      if (t.first == null || (t.last != null && t.last > now() + MIN)) return 'That time is still ahead.';
      return t.last != null ? span(t.first, t.last, key) : `Window open since ${fmtTime(t.first)}.`;
    };
    const summary = h('p', { class: 'quiet small gap-s', 'data-testid': 'bite-summary' }, summaryText());
    const hintEl = h('p', { class: 'small', 'data-testid': 'bite-hint' });
    // Just now sits beside the wheel; the new length shows below before anything is saved.
    const quick = which === 'last' ? justNow((ts) => { exact = ts; minutes = minutesOfDay(ts); field.set(minutes); summary.textContent = summaryText(); }) : null;
    const field = timeField({ label: `${title} at`, minutes, name: `edit-${which}-bite`, aside: quick, onChange: (m) => { minutes = m; exact = null; summary.textContent = summaryText(); } });
    return h('div', {},
      sheetHead(api, title),
      h('section', { class: 'section flush' },
        field,
        summary),
      hintEl,
      h('div', { class: 'gap' }, button('Save', async () => {
        const t = times();
        if (t.first == null || (t.last != null && t.last > now() + MIN)) { hintEl.textContent = 'That time is still ahead.'; return; }
        const result = await store.adjustWindow(key, t.first, t.last);
        if (result.error) { hintEl.textContent = result.error; return; }
        key = result.key;
        await api.close();
        app.flash(`${title} saved: ${fmtTime(which === 'first' ? t.first : t.last)}.`, { undo: result.undo });
      }, { block: true, name: `save-${which}-bite` })),
    );
  }, { name: `${which}-bite-time`, label: title });
}

/** The last bite was eating outside the window: change that entry's time. */
export function showOutsideTimeSheet(app, id) {
  const entry = store.state.outside.get(id);
  if (!entry) return;
  let minutes = minutesOfDay(entry.at);
  let exact = null; // Just now: the moment itself, until the wheel is rolled
  openSheet((api) => {
    const hintEl = h('p', { class: 'small', 'data-testid': 'bite-hint' });
    const quick = justNow((ts) => { exact = ts; minutes = minutesOfDay(ts); field.set(minutes); });
    const field = timeField({ label: 'Last bite at', minutes, name: 'edit-outside-bite', aside: quick, onChange: (m) => { minutes = m; exact = null; } });
    return h('div', {},
      sheetHead(api, 'Last bite'),
      h('p', {}, 'Your last bite was logged outside the window.'),
      h('section', { class: 'section gap' },
        field),
      hintEl,
      h('div', { class: 'gap' }, button('Save', async () => {
        const at = exact ?? (minutes === minutesOfDay(entry.at) ? entry.at : nearestTime(entry.at, minutes));
        if (at > now() + MIN) { hintEl.textContent = 'That time is still ahead.'; return; }
        const undo = store.undoPoint({ outside: [id] });
        await store.updateOutside(id, { at });
        await api.close();
        app.flash(`Last bite saved: ${fmtTime(at)}.`, { undo });
      }, { block: true, name: 'save-outside-bite' })),
    );
  }, { name: 'outside-bite-time', label: 'Last bite' });
}

/** Once the window is closed: change its first and last bite together. */
export function showWindowTimesSheet(app, initialKey) {
  let key = initialKey;
  const start = store.state.days.get(key);
  const draft = {
    first: start && start.firstBite ? minutesOfDay(start.firstBite) : null,
    last: start && start.lastBite ? minutesOfDay(start.lastBite) : null,
  };
  openSheet((api) => {
    const rec = store.state.days.get(key);
    if (!rec || !rec.firstBite) return h('div', {}, sheetHead(api, 'Window times'), h('p', {}, 'This window was removed.'));
    const firstTs = () => (draft.first == null ? null : resolveFirstBite(key, draft.first));
    const lastTs = () => (firstTs() == null || draft.last == null ? null : timeOnOrAfter(firstTs(), draft.last));
    const summaryText = () => {
      if (firstTs() == null) return 'That first bite is still ahead.';
      return lastTs() == null ? '' : span(firstTs(), lastTs(), key).replace(/^Window /, '');
    };
    const summary = h('p', { class: 'quiet small gap-s', 'data-testid': 'times-summary' }, summaryText());
    const hintEl = h('p', { class: 'small', 'data-testid': 'times-hint' });
    return h('div', {},
      sheetHead(api, 'Window times'),
      h('section', { class: 'section flush' },
        h('div', { class: 'btn-pair' },
          timeField({ label: 'First bite', minutes: draft.first, name: 'times-first', onChange: (m) => { draft.first = m; summary.textContent = summaryText(); } }),
          timeField({ label: 'Last bite', minutes: draft.last, name: 'times-last', onChange: (m) => { draft.last = m; summary.textContent = summaryText(); } })),
        summary),
      hintEl,
      h('div', { class: 'gap' }, button('Save', async () => {
        const first = firstTs();
        const last = lastTs();
        if (first == null || last == null) { hintEl.textContent = 'That first bite is still ahead.'; return; }
        if (last > now() + MIN) { hintEl.textContent = 'That last bite is still ahead.'; return; }
        const result = await store.adjustWindow(key, first, last);
        if (result.error) { hintEl.textContent = result.error; return; }
        key = result.key;
        await api.close();
        app.flash('Window times saved.', { undo: result.undo });
      }, { block: true, name: 'save-times' })),
    );
  }, { name: 'window-times', label: 'Window times' });
}
