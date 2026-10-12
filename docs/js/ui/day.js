// One day, for filling in and correcting: window times, meals, eating
// outside the window, check-ins and temptations.

import { h } from './dom.js';
import { button, choice, errorLine, key as mark, legend, scale, timeField, TRAINING_OPTIONS, TRIGGER_OPTIONS, OUTCOME_TEXT } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import * as store from '../store.js';
import { at, fmtDayLong, fmtDuration, fmtOnDay, fmtTime, isWorkweekday, minutesOfDay, nearestTime, now, weekStart } from '../core/time.js';
import { GRACE_MS, isOpen, isPaused, isWorkday, plannedStartMin, timeOnOrAfter } from '../core/rules.js';
import { LEFT_WANTING, dayFullness } from '../core/fullness.js';
import { showAddMealSheet, showMealEditSheet } from './meal.js';
import { AMOUNT_OPTIONS, showOutsideSheet } from './outside.js';
import { mealMeta } from './today.js';
import { pauseWord } from './pause.js';
import { fullnessCard } from './fullness.js';
import { resultRing } from './rings.js';
import { RESULT_WORD, dayTimes, dayTrack, shownResult } from './week.js';
import { dayTypeText, header, mealsOfDay, outsideOfDay, temptationsOfDay, zoneNoteFor } from './shared.js';

const reasonText = (r, e) => ({ early: 'opened before 16:00', over: `over ${fmtDuration(e.windowMs + GRACE_MS)}`, outside: 'ate outside the window' }[r]);

/** The day's verdict in words, coloured by what it says: green for a success, stripes and orange words for a miss. */
function resultLine(e) {
  const p = (cls, text) => h('p', { class: `day-verdict ${cls}`.trim() }, text);
  switch (e.result) {
    case 'success': return p('ok', e.state === 'noEating' ? 'Success: no eating.' : e.state === 'fasted' ? 'Success: a day of your long fast.' : 'Success.');
    // Drawn at rest: the verdict of a day opened is not news, so it does not ease in.
    case 'miss': return h('div', { class: 'miss-line day-verdict' },
      mark('miss', { size: 20 }), h('span', {}, `Miss: ${e.reasons.map((r) => reasonText(r, e)).join(', ')}.`));
    case 'pending': return p('quiet', e.state === 'open' ? 'Window open.' : 'In progress.');
    case 'unlogged': return p('quiet', 'Nothing logged yet.');
    case 'paused': return p('', 'Paused: not tracked.');
    default: return p('quiet', 'Before tracking started.');
  }
}

/** A day that happened in another zone shows its times in that zone, and says which. */
function dayZoneNote(ctx, key, rec) {
  const note = zoneNoteFor(ctx, rec && rec.firstBite ? rec.firstBite : at(key, '12:00'));
  return note ? `Times in ${note}` : null;
}

// The verdict each day last showed, so a save that changes it crossfades.
const verdictShown = new Map();

/**
 * The hero: the day's result ring beside its verdict, then the day on its
 * 24-hour line with a legend of the marks it shows.
 */
function dayHero(ctx, key, rec, e) {
  const d = { ...e, future: key > ctx.todayKey };
  const result = shownResult(d);
  const leftWanting = dayFullness(mealsOfDay(ctx, key), rec) === LEFT_WANTING;
  const verdict = resultLine(e);
  const times = result === 'paused' ? '' : dayTimes(d);
  const before = verdictShown.get(key);
  const shown = `${result}|${verdict.textContent}`;
  // Committed after the frame: a save can render the day twice in one task,
  // and both renders must see the verdict from before it to cross-fade.
  if (before !== shown) requestAnimationFrame(() => verdictShown.set(key, shown));
  const top = h('div', { class: `day-hero-top${before && before !== shown ? ' changed' : ''}` },
    resultRing(result, 120, { leftWanting, draw: `day:${key}:${result}` }),
    h('div', { class: 'day-hero-words' },
      verdict,
      times ? h('p', { class: 'day-times tabular' }, times) : null,
      d.future && result !== 'paused' ? h('p', { class: 'day-ahead' }, 'This day has not started yet.') : null));
  const { svg, marks } = dayTrack(ctx, d, { width: 358, bar: 16, axis: true });
  const showTrack = result !== 'paused' && !d.future && (marks.kept || marks.open || marks.miss || marks.outside || marks.cutoff);
  const label = [RESULT_WORD[result], leftWanting ? 'left wanting' : null, times || null].filter(Boolean).join(', ');
  return h('section', { class: 'hero day-hero', 'data-block': 'day-result' },
    top,
    showTrack ? h('div', { class: 'day-track-wrap', role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true' }, svg) : null,
    showTrack ? legend([
      marks.kept ? [mark('track-window'), 'Success'] : null,
      marks.open ? [mark('track-open'), 'Window still open'] : null,
      marks.miss ? [mark('bar-miss'), 'Miss'] : null,
      marks.cutoff ? [mark('cutoff'), '16:00 on workdays'] : null,
      marks.outside ? [mark('outside'), 'Ate outside the window'] : null,
      leftWanting ? [mark('left-wanting'), 'Left wanting'] : null,
    ], 'day-legend') : null);
}

export function renderDay(ctx, app, key) {
  const rec = ctx.days.get(key) || { day: key };
  const e = ctx.evaluate(key);
  const past = key <= ctx.todayKey;
  const paused = isPaused(rec);
  const tracked = past && !paused; // a paused day shows only its pause
  const dayOffRow = isWorkweekday(key) && !paused;
  const pauseRow = !paused && !isOpen(rec);
  return h('div', { class: 'day', 'data-day': key },
    header(ctx, app, {
      title: fmtDayLong(key),
      sub: dayTypeText(key, rec),
      zone: dayZoneNote(ctx, key, rec) || undefined,
      back: { label: 'Back to the week', name: 'back-to-week', onClick: () => app.go(`week/${weekStart(key)}`) },
    }),
    dayHero(ctx, key, rec, e),
    paused ? pausedSection(app, key, rec) : null,
    tracked ? windowSection(ctx, app, key, rec) : null,
    tracked ? outsideSection(ctx, app, key) : null,
    tracked ? mealsSection(ctx, app, key) : null,
    // Fullness counts on every day, paused ones included.
    past && (paused || rec.firstBite || mealsOfDay(ctx, key).length) ? fullnessSection(ctx, key) : null,
    tracked ? checkinSection(ctx, key, rec) : null,
    tracked ? temptationSection(ctx, app, key) : null,
    dayOffRow || pauseRow
      ? h('section', { class: 'day-group day-settings on-page' },
        h('h2', { class: 'group-title' }, 'Day settings'),
        dayOffRow ? dayOffSection(key, rec) : null,
        pauseRow ? pauseSection(app, key) : null)
      : null,
  );
}

/**
 * A block with controls: its title on the page, then a grey card holding it.
 * Only the Window, Check-in and the paused day's card take this form.
 */
function titled(block, title, ...content) {
  const card = h('div', { class: 'card day-card' }, ...content);
  return { card, section: h('section', { class: 'day-group', 'data-block': block }, h('h2', { class: 'group-title' }, title), card) };
}

/** Fullness under its own title, which carries the card's label and gloss. */
function fullnessSection(ctx, key) {
  const card = fullnessCard(ctx, key, { question: 'How did the day\'s eating end?' });
  return h('div', { class: 'day-group day-fullness' },
    h('h2', { class: 'group-title' }, 'Fullness ', h('span', { class: 'ar', lang: 'ar' }, 'شبع')),
    card);
}

function pausedSection(app, key, rec) {
  const word = pauseWord(rec.paused);
  return titled('day-paused', 'Paused',
    h('p', { class: 'day-card-text' }, `${word ? `${word}. ` : ''}This day is not tracked. Unpause it to log it.`),
    button('Unpause this day', async () => {
      const { undo } = await store.unpauseDays([key]);
      app.flash('Day unpaused.', { undo });
    }, { block: true, name: 'unpause-day' })).section;
}

/** A Day settings row on the page: what it is, what it does, and its pill. */
function dayRow(block, title, text, action) {
  return h('div', { class: 'day-row', 'data-block': block },
    h('h3', { class: 'card-title in-group' }, title),
    h('p', { class: 'day-row-text' }, text),
    action);
}

function dayOffSection(key, rec) {
  return dayRow('day-off', 'Day off',
    rec.dayOff ? 'Weekend rules apply to this day.' : 'A workday: the 16:00 rule applies.',
    button(rec.dayOff ? 'Make it a workday again' : 'Mark as a day off', () => store.updateDay(key, { dayOff: !rec.dayOff }), { kind: 'secondary', name: 'toggle-day-off' }));
}

function pauseSection(app, key) {
  return dayRow('day-pause', 'Pause',
    'Travel, illness or Ramadan: fasting is not tracked on a paused day, and your streak holds. Fullness still counts.',
    button('Pause this day', async () => {
      const res = await store.pauseDays(key, key, true);
      if (res.error) app.flash(res.error);
      else app.flash('Day paused.', { undo: res.undo });
    }, { kind: 'secondary', name: 'pause-day' }));
}

/** An inline question with the destructive choice in ink and Keep outlined. */
function confirmBox(question, yes, keep) {
  return h('div', { class: 'confirm' },
    h('p', { class: 'confirm-question' }, question),
    h('div', { class: 'btn-pair' }, yes, keep));
}

// Unsaved window times survive re-renders (for example after rating energy
// further down the same screen) until the saved record itself changes.
const windowDrafts = new Map();

function windowSection(ctx, app, key, rec) {
  const { section, card } = titled('day-window', 'Window');
  const fingerprint = `${rec.firstBite}|${rec.lastBite}|${rec.noEating}`;
  let draft = windowDrafts.get(key);
  if (!draft || draft.fingerprint !== fingerprint) {
    draft = {
      fingerprint,
      first: rec.firstBite ? minutesOfDay(rec.firstBite) : null,
      last: rec.lastBite ? minutesOfDay(rec.lastBite) : null,
      editing: !!rec.firstBite,
      confirmClear: false,
      hint: '',
    };
    windowDrafts.set(key, draft);
  }
  const draw = () => {
    const children = [];
    if (!draft.editing) {
      if (rec.noEating) {
        children.push(h('p', { class: 'day-card-text' }, 'No eating this day.'),
          h('div', { class: 'pill-row' }, button('Undo', () => store.setNoEating(key, false), { kind: 'secondary', name: 'undo-no-eating' })));
      } else {
        children.push(h('p', { class: 'day-card-text quiet' }, 'No window logged.'),
          h('div', { class: 'day-actions' },
            button("Log this day's window", () => { draft.editing = true; draw(); }, { block: true, name: 'log-window' }),
            button('No eating this day', () => store.setNoEating(key, true), { kind: 'outline', block: true, name: 'no-eating' })));
      }
    } else {
      const firstTs = () => (draft.first != null ? at(key, draft.first) : null);
      const lastTs = () => (firstTs() != null && draft.last != null ? timeOnOrAfter(firstTs(), draft.last) : null);
      const summaryText = () => (lastTs() != null
        ? `${fmtTime(firstTs())} to ${fmtOnDay(lastTs(), key)}, ${fmtDuration(lastTs() - firstTs())}.`
        : 'With no last bite, the window stays open.');
      // The wheels update the summary in place, so rolling never redraws them.
      const summary = h('p', { class: 'day-summary tabular', 'data-testid': 'day-summary' }, summaryText());
      const hintLine = errorLine(draft.hint, { testid: 'day-hint' });
      const hintEl = hintLine.querySelector('[data-testid]');
      const planned = plannedStartMin(key, rec, ctx.settings);
      children.push(
        summary,
        h('div', { class: 'field-pair day-wheels' },
          labelRow(timeField({ label: 'First bite', minutes: draft.first, fallback: planned, name: 'day-first', onChange: (m) => { draft.first = m; summary.textContent = summaryText(); } })),
          labelRow(timeField({ label: 'Last bite', minutes: draft.last, fallback: (draft.first ?? planned) + 180, name: 'day-last', allowUnset: true, hint: draft.last == null ? 'Open' : '', onChange: (m) => { draft.last = m; summary.textContent = summaryText(); } }))),
        hintLine,
        h('div', { class: 'day-actions' }, button('Save window', async () => {
          const setHint = (text) => { draft.hint = text; hintEl.textContent = text; };
          const first = firstTs();
          const last = lastTs();
          if (first == null) { setHint('Roll the first bite to its time.'); return; }
          if (first > now() || (last != null && last > now())) { setHint('That time is still ahead.'); return; }
          if (rec.firstBite) {
            // An existing window: meals are kept consistent with the new times.
            const result = await store.adjustWindow(key, first, last);
            if (result.error) setHint(result.error);
            else app.flash('Window saved.', { undo: result.undo });
            return;
          }
          const undo = store.undoPoint({ days: [key], meals: store.mealIdsOf(key) });
          await store.setWindowTimes(key, first, last);
          app.flash('Window saved.', { undo });
        }, { block: true, name: 'save-window' }),
        rec.firstBite
          ? (draft.confirmClear
            ? confirmBox('Clear this window?',
              button('Clear', async () => {
                const undo = store.undoPoint({ days: [key] });
                await store.clearWindow(key);
                app.flash('Window cleared.', { undo });
              }, { kind: 'danger', name: 'confirm-clear' }),
              button('Keep', () => { draft.confirmClear = false; draw(); }, { kind: 'outline' }))
            : h('div', { class: 'pill-row day-center' }, button('Clear this window', () => { draft.confirmClear = true; draw(); }, { kind: 'secondary', name: 'clear-window' })))
          : null),
      );
    }
    card.replaceChildren(...children.filter(Boolean));
  };
  draw();
  return section;
}

/**
 * A wheel's label row: the label, and at its right the wheel's own Clear,
 * moved up from under the wheel so it plainly clears that wheel alone.
 * The same element moves, so it keeps its handler and its hidden state.
 */
function labelRow(field) {
  const label = field.querySelector(':scope > .field-label');
  const clear = field.querySelector(':scope > .time-foot > .btn-2');
  if (label) field.prepend(h('div', { class: 'field-head' }, label, clear));
  return field;
}

/** A titled group on the page: list rows with hairlines, then its add action. No card. */
function group(block, title, rows, empty, action) {
  return h('section', { class: 'day-group on-page', 'data-block': block },
    h('h2', { class: 'group-title' }, title),
    rows.length ? h('ul', { class: 'list' }, rows.map((row) => h('li', {}, row))) : (empty ? h('p', { class: 'day-group-empty' }, empty) : null),
    action ? h('div', { class: 'day-group-action' }, action) : null);
}

function mealsSection(ctx, app, key) {
  const meals = mealsOfDay(ctx, key);
  return group('day-meals', 'Meals',
    meals.map((m) => h('button', { type: 'button', class: 'item', 'data-meal': String(m.id), onclick: () => showMealEditSheet(app, m.id) },
      h('span', {}, h('span', { class: 'item-title' }, m.name || 'Meal'), h('br'), h('span', { class: 'item-meta' }, mealMeta(m))),
      h('span', { class: 'item-side tabular' }, m.finishedAt ? `${fmtTime(m.startedAt)} to ${fmtTime(m.finishedAt)}` : fmtTime(m.startedAt)))),
    'No meals logged.',
    button('Add a meal', () => showAddMealSheet(app, { day: key }), { kind: 'outline', block: true, name: 'add-meal' }));
}

function outsideSection(ctx, app, key) {
  const items = outsideOfDay(ctx, key);
  const trig = Object.fromEntries(TRIGGER_OPTIONS.map((o) => [o.value, o.label.toLowerCase()]));
  return group('day-outside', 'Outside the window',
    items.map((o) => h('button', { type: 'button', class: 'item', 'data-outside': String(o.id), onclick: () => showOutsideEditSheet(app, o.id) },
      h('span', { class: 'item-lead' }, mark('outside', { size: 12 })),
      h('span', { class: 'item-title' }, `${trig[o.trigger] || 'no trigger'}${o.amount === 'little' ? ', a little' : o.amount === 'meal' ? ', more than a little' : ''}`),
      h('span', { class: 'item-side tabular' }, fmtOnDay(o.at, key)))),
    'Nothing outside the window.',
    button('Add eating outside the window', () => showOutsideSheet(app, { day: key }), { kind: 'outline', block: true, name: 'add-outside' }));
}

function checkinSection(ctx, key, rec) {
  return titled('day-checkin', 'Check-in',
    h('div', { class: 'day-fields' },
      isWorkday(key, rec)
        ? scale({ n: 5, value: rec.energy4pm ?? null, label: 'Energy at 4 PM', low: '1 drained', high: '5 sharp', name: 'energy',
          onChange: (v) => store.updateDay(key, { energy4pm: v }) })
        : null,
      choice({ label: 'Trained', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: rec.trained ?? null, cols: 2, name: 'trained',
        onChange: (v) => store.updateDay(key, { trained: v, trainingType: v ? rec.trainingType || null : null }) }),
      rec.trained
        ? choice({ label: 'Type', options: TRAINING_OPTIONS, value: rec.trainingType || null, cols: 3, name: 'training-type',
          onChange: (v) => store.updateDay(key, { trainingType: v }) })
        : null)).section;
}

function temptationSection(ctx, app, key) {
  const items = temptationsOfDay(ctx, key);
  if (!items.length) return null;
  return group('day-temptations', 'Temptations',
    items.map((t) => h('button', { type: 'button', class: 'item', onclick: () => showTemptationSheet(app, t.id) },
      h('span', {}, h('span', { class: 'item-title' }, `${t.trigger || 'no trigger'}:`), ' ', h('br'),
        h('span', { class: 'item-meta' }, t.outcome ? OUTCOME_TEXT[t.outcome].toLowerCase() : 'no outcome')),
      h('span', { class: 'item-side tabular' }, fmtTime(t.startedAt)))),
    null, null);
}

function showOutsideEditSheet(app, id) {
  const o = store.state.outside.get(id);
  if (!o) return;
  const draft = { trigger: o.trigger, amount: o.amount, minutes: minutesOfDay(o.at) };
  let confirming = false;
  openSheet((api) => ({
    head: sheetHead(api, 'Outside the window'),
    body: h('div', { class: 'day-form' },
      h('div', { class: 'day-form-lead' },
        h('h3', { class: 'day-form-hero' }, 'What set it off?'),
        choice({ ariaLabel: 'What set it off?', options: TRIGGER_OPTIONS, value: draft.trigger, cols: 3, name: 'trigger', onChange: (v) => { draft.trigger = v; } })),
      choice({ label: 'How much', options: AMOUNT_OPTIONS, value: draft.amount, cols: 2, name: 'amount', onChange: (v) => { draft.amount = v; } }),
      timeField({ label: 'At', minutes: draft.minutes, name: 'outside-at', onChange: (m) => { draft.minutes = m; } }),
      h('div', { class: 'day-form-end' }, confirming
        ? confirmBox('Delete this entry?',
          button('Delete', async () => {
            const undo = store.undoPoint({ outside: [id] });
            await store.deleteOutside(id);
            await api.close();
            app.flash('Entry deleted.', { undo });
          }, { kind: 'danger', name: 'confirm-delete-outside' }),
          button('Keep', () => { confirming = false; api.rerender(); }, { kind: 'outline' }))
        : h('div', { class: 'pill-row' }, button('Delete entry', () => { confirming = true; api.rerender(); }, { kind: 'secondary', name: 'delete-outside' })))),
    actions: button('Save', async () => {
      // An unchanged time keeps its exact moment; a changed one stays next to it.
      const when = draft.minutes === minutesOfDay(o.at) ? o.at : nearestTime(o.at, draft.minutes);
      const undo = store.undoPoint({ outside: [id] });
      await store.updateOutside(id, { trigger: draft.trigger, amount: draft.amount, at: when });
      await api.close();
      app.flash('Entry saved.', { undo });
    }, { block: true, name: 'save-outside' }),
  }), { name: 'edit-outside', label: 'Outside the window' });
}

function showTemptationSheet(app, id) {
  const t = store.state.temptations.get(id);
  if (!t) return;
  let confirming = false;
  openSheet((api) => ({
    head: sheetHead(api, 'Temptation'),
    body: h('div', { class: 'day-form' },
      h('div', { class: 'day-form-lead' },
        h('p', { class: 'day-form-hero statement tabular' }, `${fmtTime(t.startedAt)}, ${t.trigger || 'no trigger'}`),
        h('p', { class: 'day-form-outcome' }, t.outcome ? OUTCOME_TEXT[t.outcome] : 'No outcome recorded.'),
        (t.urges || []).length ? h('p', { class: 'day-form-note' }, `Urge ratings: ${(t.urges || []).map((u) => u.value).join(', ')}.`) : null),
      h('div', { class: 'day-form-end' }, confirming
        ? confirmBox('Delete this entry?',
          button('Delete', async () => { await store.deleteTemptation(id); api.close(); }, { kind: 'danger', name: 'confirm-delete-temptation' }),
          button('Keep', () => { confirming = false; api.rerender(); }, { kind: 'outline' }))
        : h('div', { class: 'pill-row' }, button('Delete entry', () => { confirming = true; api.rerender(); }, { kind: 'secondary', name: 'delete-temptation' })))),
  }), { name: 'temptation-detail', label: 'Temptation' });
}
