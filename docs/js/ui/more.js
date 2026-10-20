// More: planned times, pauses, calendar reminders, exports, backup and restore.

import { h } from './dom.js';
import { button, choice, timeField } from './components.js';
import * as store from '../store.js';
import { fmtMinutes, toMinutes } from '../core/time.js';
import { icsPinnedToKuwait, icsTimes } from '../core/ics.js';
import { VERSION } from '../version.js';
import { ago, header } from './shared.js';
import { openSheet, sheetHead } from './sheet.js';
import { pausesSection } from './pause.js';
import { goalSection } from './goal.js';
import { isFlexible, noWindowAlerts } from '../core/rules.js';
import { glyph } from './icons.js';
import { keepCopyFirst } from '../copies.js';
import { showCopiesSheet } from './copies.js';

/** A time shown as a row; tapping it opens its wheel in a sheet, where each roll saves. */
function timeSetting(label, key, ctx) {
  return h('button', { type: 'button', class: 'setting-row', 'data-action': `edit-${key}`, 'aria-label': `${label}, ${ctx.settings[key]}. Change`,
    onclick: () => openSheet((api) => ({
      head: sheetHead(api, label),
      body: h('div', { class: 'time-setting' }, timeField({
        label: `${label} at`,
        srLabel: true,
        minutes: toMinutes(store.state.settings[key]),
        name: key,
        onChange: (m) => store.setSettings({ [key]: fmtMinutes(m) }),
      })),
    }), { name: `time-${key}`, label }) },
  h('span', {}, label), h('span', { class: 'value' }, ctx.settings[key]));
}

/** A card's heading inside a titled group. */
const cardTitle = (text) => h('h3', { class: 'card-title in-group' }, text);

/** Alarms: timers on the iPhone clock through the Fast Timer shortcut. */
function alarmSection(ctx) {
  return h('div', { class: 'more-part' },
    h('section', { class: 'section', 'data-block': 'alarms' },
      h('div', { class: 'title-row' },
        cardTitle('Alarms'),
        choice({
          options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
          value: !!ctx.settings.alarms, cols: 2, name: 'alarms', slim: true, ariaLabel: 'Alarms',
          onChange: (v) => store.setSettings({ alarms: v }),
        })),
      h('p', { class: 'more-body' }, 'Sabr cannot ring while it is closed. With Alarms on, it asks your Fast Timer shortcut to start an iPhone timer when you finish a meal, for the 20-minute fullness check. The Shortcuts app opens for a moment each time.')),
    h('p', { class: 'group-footer' }, 'Build the shortcut once: in Shortcuts, tap +, name it Fast Timer, add the action Start Timer, tap its duration, choose Shortcut Input, and set it to minutes. Then tap Done. Already built it for Fast? It works here too.'));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reset's words as they read, with each number in ink at 900 (counts: true)
 * and "check-in" and "weigh-in" kept whole, never split at the hyphen.
 */
function resetWords(text, { counts = false } = {}) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(counts ? /\d+|(?:check|weigh)-ins?/g : /(?:check|weigh)-ins?/g)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(/^\d/.test(m[0]) ? h('b', { class: 'count' }, m[0]) : h('span', { class: 'nowrap' }, m[0]));
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

/** Reset asks twice: what goes (with a backup offer), then that it is final. */
function showResetSheet(app) {
  const confirmFirst = (api) => ({
    head: sheetHead(api, 'Reset'),
    body: h('div', { class: 'reset-step' },
      h('h3', { class: 'reset-title' }, 'Delete all history?'),
      h('p', { class: 'reset-body' }, ...resetWords('This removes every window, meal, check-in, pause, temptation and weigh-in from this iPhone. Your planned times and reminders stay.')),
      h('div', { class: 'callout reset-backup' },
        h('p', {}, 'A backup first lets you bring everything back later.'),
        button('Back up first', () => app.backup(), { kind: 'outline', block: true, name: 'reset-backup' }))),
    actions: h('div', { class: 'btn-pair' },
      button('Keep my data', () => api.close(), { kind: 'outline', name: 'reset-keep' }),
      button('Continue', () => api.replace(confirmFinal, { dir: 'forward' }), { name: 'reset-continue' })),
  });

  const confirmFinal = (api) => {
    const d = store.data();
    const windows = [...d.days.values()].filter((r) => r.firstBite).length;
    return {
      head: sheetHead(api, 'Reset'),
      body: h('div', { class: 'reset-step' },
        h('h3', { class: 'reset-title', 'data-testid': 'reset-final' }, 'This cannot be undone.'),
        h('p', { class: 'reset-body' },
          ...resetWords(`${plural(windows, 'window')}, ${plural(d.meals.length, 'meal')}, ${plural(d.weights.size, 'weigh-in')} and ${plural(d.temptations.length, 'temptation')} will be deleted for good.`, { counts: true }))),
      actions: [
        button('Delete all history', async () => {
          // A copy of everything is kept first: Copies on this iPhone can bring it back.
          await keepCopyFirst('before-reset');
          await store.resetHistory();
          await api.close();
          app.go('today');
          app.flash('All history deleted.');
        }, { kind: 'danger', block: true, name: 'reset-confirm' }),
        button('Keep my data', () => api.close(), { kind: 'outline', block: true, name: 'reset-keep' }),
      ],
    };
  };

  openSheet(confirmFirst, { name: 'reset', label: 'Reset' });
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/**
 * What makes a day a success: a planned start (workdays from 16:00), or
 * feasting hours, where the window opens at any hour and only its length counts.
 */
function timingSection(ctx, app) {
  const flexible = isFlexible(ctx.todayKey, ctx.settings);
  const hours = Math.round(ctx.windowMsFor(ctx.todayKey) / 3600000);
  const set = async (v) => {
    const on = v === 'flexible';
    if (on === isFlexible(app.ctx().todayKey, app.ctx().settings)) return;
    const { undo } = await store.setFlexible(on, ctx.todayKey);
    app.flash(on ? 'Feasting hours from today: open your window any time.' : 'Planned start from today: workdays open at 16:00 or later.', { undo });
  };
  return h('section', { class: 'section', 'data-block': 'timing' },
    cardTitle('What makes a day a success'),
    choice({ options: [{ value: 'fixed', label: 'Planned start' }, { value: 'flexible', label: 'Feasting hours' }], value: flexible ? 'flexible' : 'fixed', cols: 2, name: 'timing', ariaLabel: 'What makes a day a success', onChange: set }),
    h('p', { class: 'more-text', 'data-testid': 'timing-text' }, flexible
      ? `Open your ${hours}-hour window at any hour, any day. A day succeeds when all eating fits inside it.`
      : `Your ${hours}-hour window, and on workdays not before 16:00. A day succeeds when both hold and all eating fits inside it.`),
    h('p', { class: 'caption' }, 'A change applies from today on. Past days keep the rule they had.'));
}

function calendarStatus(ctx) {
  const s = ctx.settings;
  // Restored from Fast: Fast's own events are still in Calendar until deleted.
  if (s.fastCalendar) {
    return h('p', { class: 'ics-status callout', 'data-testid': 'ics-status' },
      'Restored from Fast. In Calendar, delete the Fast events: open one, tap Delete Event, then Delete All Future Events. Then add Sabr\'s file.');
  }
  if (!s.icsTimes) return h('p', { class: 'ics-status', 'data-testid': 'ics-status' }, 'Not added yet.');
  if (icsPinnedToKuwait(s.icsTimes)) {
    return h('p', { class: 'ics-status callout', 'data-testid': 'ics-status' },
      'Your calendar alerts ring by Kuwait time, even when you travel. Add the new file so they follow your phone\'s clock, then delete the old Sabr events: open one, tap Delete Event, then Delete All Future Events.');
  }
  if (s.icsTimes !== icsTimes(s, { flexible: noWindowAlerts(ctx.todayKey, s) })) {
    return h('p', { class: 'ics-status callout', 'data-testid': 'ics-status' },
      'Your times changed since the last file. Add the new file, then delete the old Sabr events: open one, tap Delete Event, then Delete All Future Events.');
  }
  return h('p', { class: 'ics-status', 'data-testid': 'ics-status' }, 'Added with your current times.');
}

const groupTitle = (text) => h('h2', { class: 'group-title' }, text);

export function renderMore(ctx, app) {
  const s = ctx.settings;
  const flexible = isFlexible(ctx.todayKey, s);
  const restoreInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'data-testid': 'restore-input' });
  restoreInput.addEventListener('change', () => {
    const file = restoreInput.files && restoreInput.files[0];
    restoreInput.value = '';
    if (file) app.restoreFrom(file);
  });

  return h('div', { class: 'more' },
    header(ctx, app, { title: 'More' }),
    // Under the page title it sums up the whole page: the goal, the rule and the reminders.
    h('p', { class: 'more-intro' }, 'Your goal, when a day counts as a success, and the times Sabr reminds you.'),
    goalSection(ctx, app),

    groupTitle('Settings'),
    timingSection(ctx, app),
    // On feasting hours there is no planned start to set.
    flexible ? null : h('div', { class: 'more-part' },
      h('section', { class: 'section', 'data-block': 'planned' },
        cardTitle('Planned window start'),
        timeSetting('Workdays', 'workdayStart', ctx),
        timeSetting('Weekends', 'weekendStart', ctx)),
      h('p', { class: 'group-footer' }, 'Workdays run Sunday to Thursday; weekends are Friday and Saturday.')),

    groupTitle('Reminders'),
    h('section', { class: 'section', 'data-block': 'reminder-times' },
      cardTitle('Reminder times, Sun to Thu'),
      timeSetting('Hold the line', 'holdTime', ctx),
      timeSetting('Training', 'trainingTime', ctx)),
    h('div', { class: 'more-part' },
      h('section', { class: 'section', 'data-block': 'calendar' },
        cardTitle('Calendar reminders'),
        h('p', { class: 'more-body' },
          flexible
            ? `Two repeating alerts for your iPhone Calendar: hold the line at ${s.holdTime} and training at ${s.trainingTime} on workdays. With feasting hours there is no planned opening, so the file removes the window alerts.`
            : `Four repeating alerts for your iPhone Calendar: hold the line at ${s.holdTime} and training at ${s.trainingTime} on workdays, `
            + `and your window at ${s.workdayStart} on workdays and ${s.weekendStart} at weekends.`),
        calendarStatus(ctx),
        button('Add to Calendar', () => app.addCalendar(), { kind: 'outline', block: true, name: 'add-calendar' })),
      h('p', { class: 'group-footer' }, 'In the share sheet choose Calendar. If it is not listed, choose Save to Files, then open the file in Files and tap Add All.')),
    alarmSection(ctx),

    pausesSection(ctx, app),

    groupTitle('Your data'),
    h('section', { class: 'section group data-group' },
      h('div', { class: 'data-part', 'data-block': 'backup' },
        cardTitle('Backup'),
        h('p', { class: 'backup-status', 'data-testid': 'backup-status' }, s.lastBackupAt ? `Last backup ${ago(s.lastBackupAt, ctx.nowTs)}.` : 'No backup yet.'),
        h('p', { class: 'more-body quiet' }, 'Everything lives only on this iPhone. Back up once a week and save the file to iCloud Drive, in a folder named Sabr (On My iPhone goes with the phone).'),
        button('Back up now', () => app.backup(), { block: true, name: 'backup' }),
        h('div', { class: 'pill-row' }, button('Restore from a backup', () => restoreInput.click(), { kind: 'secondary', name: 'restore' })),
        restoreInput),
      // Copies Sabr keeps by itself, to undo a wrong restore or reset.
      h('div', { class: 'data-part', 'data-block': 'copies' },
        h('button', { type: 'button', class: 'setting-row copies-row', 'data-action': 'copies', onclick: () => showCopiesSheet(app) },
          h('span', {}, 'Copies on this iPhone'))),
      h('div', { class: 'data-part', 'data-block': 'export' },
        cardTitle('Export'),
        h('p', { class: 'more-body' }, 'CSV files for Excel: every day with its window and the fast before it, meals, weight, check-ins and temptations. The weight file holds your raw entries.'),
        button('Export CSV files', () => app.exportCsv(), { kind: 'outline', block: true, name: 'export-csv' })),
      h('div', { class: 'data-part', 'data-block': 'storage' },
        cardTitle('Storage'),
        h('p', { class: 'more-body' },
          s.persisted === true
            ? 'Kept on this iPhone. The browser has agreed not to clear it when space runs low.'
            : 'iOS may clear this data if the iPhone runs very low on space. Weekly backups keep it safe.'),
        isStandalone()
          ? null
          : h('p', { class: 'more-body' }, 'You are using Sabr in the browser. Add it to your Home Screen and use it from there: the Home Screen app keeps its own data.'))),

    groupTitle('Help'),
    h('section', { class: 'section group help-link', 'data-block': 'help' },
      h('button', { type: 'button', class: 'setting-row help-row', 'data-action': 'help', onclick: () => app.go('help') },
        glyph('book', { size: 20 }),
        h('span', {}, 'Weight Shortcut and Home Screen setup'))),

    groupTitle('Reset'),
    h('section', { class: 'section', 'data-block': 'reset' },
      h('p', { class: 'more-body' }, 'Delete all history and start again. Your planned times and reminders stay.'),
      h('div', { class: 'pill-row' }, button('Reset all history', () => showResetSheet(app), { kind: 'secondary', name: 'reset', icon: 'trash' }))),

    h('p', { class: 'version' }, h('span', { class: 'version-label' }, 'Version'), ' ', h('span', { class: 'version-value' }, VERSION)),
  );
}
