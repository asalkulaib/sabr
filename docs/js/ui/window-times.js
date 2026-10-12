// Correcting a window after the fact: its opening time while it is open
// (or removing a window opened by mistake), one bite time from a tap on its
// note, or both times once it is closed. Every time rolls on a wheel; the
// new window shows in the footer before anything is saved.

import { h } from './dom.js';
import { clockGlyph } from './icons.js';
import { button, timeField } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { MIN, dayKey, floorToMinute, fmtDuration, fmtOnDay, fmtTime, minutesOfDay, nearestTime, now } from '../core/time.js';
import { timeOnOrAfter } from '../core/rules.js';
import { effectLine, errLine, form, missSlot, resolveFirstBite, say, timesMissLines } from './meal.js';
import { mealsOfDay } from './shared.js';

const meals = (n) => (n === 1 ? 'Its meal goes too.' : `Its ${n} meals go too.`);

const span = (first, last, key) => `Window ${fmtTime(first)} to ${fmtOnDay(last, key)}, ${fmtDuration(last - first)}.`;

const AHEAD = 'That time is still ahead.';

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
    if (!rec || !rec.firstBite) return { head: sheetHead(api, 'Window opened'), body: form(h('p', {}, 'No window is open.')) };
    const logged = mealsOfDay(ctx, key).length;
    // The sheet fits one screen, so Save stays with the wheel it saves and
    // the mistake card sits apart below it, with no footer.
    return {
      head: sheetHead(api, 'Window opened'),
      body: form(
        h('p', { class: 'form-intro' }, 'Set the time of your first bite. The countdown, your eating window and the 16:00 rule follow it.'),
        timeField({ label: 'First bite at', minutes: draft.minutes, name: 'opened-at', onChange: (m) => { draft.minutes = m; } }),
        h('div', { class: 'form-act' },
          errLine(draft.hint, 'times-hint'),
          button('Save', async () => {
            const ts = draft.minutes == null ? null : resolveFirstBite(key, draft.minutes);
            if (ts == null) { draft.hint = AHEAD; api.rerender(); return; }
            const result = await store.adjustWindow(key, ts, null);
            if (result.error) { draft.hint = result.error; api.rerender(); return; }
            key = result.key;
            await api.close();
            app.flash(`The window now opens at ${fmtTime(ts)}.`, { undo: result.undo });
          }, { block: true, name: 'save-opening' })),
        h('div', { class: 'mistake' },
          h('h3', { class: 'mistake-title' }, 'Opened by mistake?'),
          draft.confirm
            ? h('div', { class: 'mistake-confirm' },
              h('p', { class: 'confirm-question' }, `Remove the window opened at ${fmtTime(rec.firstBite)}?${logged ? ` ${meals(logged)}` : ''}`),
              // Stacked: the destructive choice first, each one full width.
              h('div', { class: 'stack-actions' },
                button('Remove window', async () => {
                  const { undo } = await store.cancelWindow(key);
                  await api.close();
                  app.flash('Window removed. Start a meal when you eat.', { undo });
                }, { kind: 'danger', block: true, name: 'confirm-remove-window' }),
                button('Keep it', () => { draft.confirm = false; api.rerender(); }, { kind: 'outline', block: true, name: 'keep-window' })))
            : button('Remove this window', () => { draft.confirm = true; api.rerender(); }, { kind: 'outline', block: true, name: 'remove-window' })),
      ),
    };
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
    if (!rec || !rec.firstBite || (which === 'last' && !rec.lastBite)) return { head: sheetHead(api, title), body: form(h('p', {}, 'This window has changed.')) };
    const times = () => {
      if (which === 'first') return { first: resolveFirstBite(key, minutes), last: rec.lastBite || null };
      return { first: rec.firstBite, last: exact ?? timeOnOrAfter(rec.firstBite, minutes) };
    };
    const ahead = () => {
      const t = times();
      return t.first == null || (t.last != null && t.last > now() + MIN);
    };
    // The new length shows in the footer before anything is saved; a time
    // still ahead says so in its place, as an error. The hint answers Save.
    const summary = effectLine('bite-summary');
    const hintEl = errLine('', 'bite-hint');
    const refresh = () => {
      const t = times();
      summary.set(ahead() ? AHEAD : t.last != null ? span(t.first, t.last, key) : `Window open since ${fmtTime(t.first)}.`, { error: ahead() });
    };
    // Just now sits beside the wheel.
    const quick = which === 'last' ? justNow((ts) => { exact = ts; minutes = minutesOfDay(ts); wheel.set(minutes); refresh(); }) : null;
    const wheel = timeField({ label: `${title} at`, srLabel: true, minutes, name: `edit-${which}-bite`, aside: quick, onChange: (m) => { minutes = m; exact = null; refresh(); } });
    refresh();
    return {
      head: sheetHead(api, title),
      body: form(wheel),
      actions: [
        summary,
        hintEl,
        button('Save', async () => {
          const t = times();
          if (ahead()) { say(hintEl, AHEAD); return; }
          const result = await store.adjustWindow(key, t.first, t.last);
          if (result.error) { say(hintEl, result.error); return; }
          key = result.key;
          await api.close();
          app.flash(`${title} saved: ${fmtTime(which === 'first' ? t.first : t.last)}.`, { undo: result.undo });
        }, { block: true, name: `save-${which}-bite` }),
      ],
    };
  }, { name: `${which}-bite-time`, label: title });
}

/** The last bite was eating outside the window: change that entry's time. */
export function showOutsideTimeSheet(app, id) {
  const entry = store.state.outside.get(id);
  if (!entry) return;
  let minutes = minutesOfDay(entry.at);
  let exact = null; // Just now: the moment itself, until the wheel is rolled
  openSheet((api) => {
    const hintEl = errLine('', 'bite-hint');
    const quick = justNow((ts) => { exact = ts; minutes = minutesOfDay(ts); wheel.set(minutes); });
    const wheel = timeField({ label: 'Last bite at', srLabel: true, minutes, name: 'edit-outside-bite', aside: quick, onChange: (m) => { minutes = m; exact = null; } });
    return {
      head: sheetHead(api, 'Last bite'),
      body: form(
        h('p', { class: 'form-intro' }, 'Your last bite was logged outside the window.'),
        wheel),
      actions: [
        hintEl,
        button('Save', async () => {
          const at = exact ?? (minutes === minutesOfDay(entry.at) ? entry.at : nearestTime(entry.at, minutes));
          if (at > now() + MIN) { say(hintEl, AHEAD); return; }
          const undo = store.undoPoint({ outside: [id] });
          await store.updateOutside(id, { at });
          await api.close();
          app.flash(`Last bite saved: ${fmtTime(at)}.`, { undo });
        }, { block: true, name: 'save-outside-bite' }),
      ],
    };
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
  // Why the store refused the last Save stays until the next Save, as before;
  // a last bite still ahead speaks over it while it lasts.
  let refusal = '';
  openSheet((api) => {
    const rec = store.state.days.get(key);
    if (!rec || !rec.firstBite) return { head: sheetHead(api, 'Window times'), body: form(h('p', {}, 'This window was removed.')) };
    const firstTs = () => (draft.first == null ? null : resolveFirstBite(key, draft.first));
    const lastTs = () => (firstTs() == null || draft.last == null ? null : timeOnOrAfter(firstTs(), draft.last));
    // The footer follows both wheels: the new window, the misses these
    // times would make (in the words Add a meal uses), or why it cannot be.
    const summary = effectLine('times-summary');
    const misses = missSlot('times-miss');
    const hintEl = errLine('', 'times-hint');
    const refresh = () => {
      const first = firstTs();
      const last = lastTs();
      // A bite still ahead cannot be saved: say why, and show no window or miss.
      const aheadLast = last != null && last > now() + MIN;
      const none = first == null || last == null || aheadLast;
      summary.set(first == null ? 'That first bite is still ahead.' : none ? '' : span(first, last, key).replace(/^Window /, ''), { error: first == null });
      say(hintEl, aheadLast ? 'That last bite is still ahead.' : refusal);
      const day = first == null ? null : dayKey(first);
      misses.set(none ? [] : timesMissLines(app.ctx(), day, { ...rec, day, firstBite: first, lastBite: last }, ['early', 'over']));
    };
    const pair = h('div', { class: 'field-pair' },
      timeField({ label: 'First bite', minutes: draft.first, name: 'times-first', onChange: (m) => { draft.first = m; refresh(); } }),
      timeField({ label: 'Last bite', minutes: draft.last, name: 'times-last', onChange: (m) => { draft.last = m; refresh(); } }));
    refresh();
    return {
      head: sheetHead(api, 'Window times'),
      body: form(pair),
      actions: [
        summary,
        misses,
        hintEl,
        button('Save', async () => {
          const first = firstTs();
          const last = lastTs();
          refusal = '';
          if (first == null || last == null) { say(hintEl, 'That first bite is still ahead.'); return; }
          if (last > now() + MIN) { say(hintEl, 'That last bite is still ahead.'); return; }
          const result = await store.adjustWindow(key, first, last);
          if (result.error) { refusal = result.error; say(hintEl, refusal); return; }
          key = result.key;
          await api.close();
          app.flash('Window times saved.', { undo: result.undo });
        }, { block: true, name: 'save-times' }),
      ],
    };
  }, { name: 'window-times', label: 'Window times' });
}
