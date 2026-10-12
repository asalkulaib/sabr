// More: planned times, pauses, calendar reminders, exports, backup and restore.

import { h } from './dom.js';
import { button, timeField } from './components.js';
import * as store from '../store.js';
import { fmtMinutes, toMinutes } from '../core/time.js';
import { icsPinnedToKuwait, icsTimes } from '../core/ics.js';
import { VERSION } from '../version.js';
import { ago, header, note } from './shared.js';
import { openSheet, sheetHead } from './sheet.js';
import { pausesSection } from './pause.js';
import { goalSection } from './goal.js';
import { choice } from './components.js';
import { isFlexible, noWindowAlerts } from '../core/rules.js';

/** A time shown as a row; tapping it opens its wheel in a sheet, where each roll saves. */
function timeSetting(label, key, ctx) {
  return h('button', { type: 'button', class: 'setting-row', 'data-action': `edit-${key}`, 'aria-label': `${label}, ${ctx.settings[key]}. Change`,
    onclick: () => openSheet((api) => h('div', {},
      sheetHead(api, label),
      h('section', { class: 'section flush gap' }, timeField({
        label: `${label} at`,
        minutes: toMinutes(store.state.settings[key]),
        name: key,
        onChange: (m) => store.setSettings({ [key]: fmtMinutes(m) }),
      }))), { name: `time-${key}`, label }) },
  h('span', {}, label), h('span', { class: 'value' }, ctx.settings[key]));
}

/** Alarms: timers on the iPhone clock through the Fast Timer shortcut. */
function alarmSection(ctx) {
  return h('section', { class: 'section', 'data-block': 'alarms' },
    h('div', { class: 'label' }, 'Alarms'),
    h('p', { class: 'small gap-s' }, 'Sabr cannot ring while it is closed. With Alarms on, it asks your Fast Timer shortcut to start an iPhone timer when you finish a meal, for the 20-minute fullness check. The Shortcuts app opens for a moment each time.'),
    h('div', { class: 'gap' }, choice({
      options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
      value: !!ctx.settings.alarms, cols: 2, name: 'alarms',
      onChange: (v) => store.setSettings({ alarms: v }),
    })),
    h('p', { class: 'small quiet gap' }, 'Build the shortcut once: in Shortcuts, tap +, name it Fast Timer, add the action Start Timer, tap its duration, choose Shortcut Input, and set it to minutes. Then tap Done. Already built it for Fast? It works here too.'));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Reset asks twice: what goes (with a backup offer), then that it is final. */
function showResetSheet(app) {
  const confirmFirst = (api) => h('div', {},
    sheetHead(api, 'Reset'),
    h('p', { class: 'statement' }, 'Delete all history?'),
    h('p', { class: 'gap' }, 'This removes every window, meal, check-in, pause, temptation and weigh-in from this iPhone. Your planned times and reminders stay.'),
    h('p', { class: 'small quiet gap-s' }, 'A backup first lets you bring everything back later.'),
    h('div', { class: 'stack gap-l' },
      button('Back up first', () => app.backup(), { kind: 'secondary', name: 'reset-backup' }),
      button('Continue', () => api.replace(confirmFinal), { block: true, name: 'reset-continue' }),
      button('Keep my data', () => api.close(), { kind: 'secondary', name: 'reset-keep' })));

  const confirmFinal = (api) => {
    const d = store.data();
    const windows = [...d.days.values()].filter((r) => r.firstBite).length;
    return h('div', {},
      sheetHead(api, 'Reset'),
      h('p', { class: 'statement', 'data-testid': 'reset-final' }, 'This cannot be undone.'),
      h('p', { class: 'gap' },
        `${plural(windows, 'window')}, ${plural(d.meals.length, 'meal')}, ${plural(d.weights.size, 'weigh-in')} and ${plural(d.temptations.length, 'temptation')} will be deleted for good.`),
      h('div', { class: 'stack gap-l' },
        button('Delete all history', async () => {
          await store.resetHistory();
          await api.close();
          app.go('today');
          app.flash('All history deleted.');
        }, { block: true, name: 'reset-confirm' }),
        button('Keep my data', () => api.close(), { kind: 'secondary', name: 'reset-keep' })));
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
    h('div', { class: 'label' }, 'What makes a day a success'),
    h('div', { class: 'gap-s' }, choice({ options: [{ value: 'fixed', label: 'Planned start' }, { value: 'flexible', label: 'Feasting hours' }], value: flexible ? 'flexible' : 'fixed', cols: 2, name: 'timing', onChange: set })),
    h('p', { class: 'gap-s', 'data-testid': 'timing-text' }, flexible
      ? `Open your ${hours}-hour window at any hour, any day. A day succeeds when all eating fits inside it.`
      : `Your ${hours}-hour window, and on workdays not before 16:00. A day succeeds when both hold and all eating fits inside it.`),
    h('p', { class: 'small quiet gap-s' }, 'A change applies from today on. Past days keep the rule they had.'));
}

function calendarStatus(ctx) {
  const s = ctx.settings;
  if (!s.icsTimes) return h('p', { class: 'small quiet gap-s', 'data-testid': 'ics-status' }, 'Not added yet.');
  if (icsPinnedToKuwait(s.icsTimes)) {
    return h('p', { class: 'small gap-s', 'data-testid': 'ics-status' },
      'Your calendar alerts ring by Kuwait time, even when you travel. Add the new file so they follow your phone\'s clock, then delete the old Sabr events: open one, tap Delete Event, then Delete All Future Events.');
  }
  if (s.icsTimes !== icsTimes(s, { flexible: noWindowAlerts(ctx.todayKey, s) })) {
    return h('p', { class: 'small gap-s', 'data-testid': 'ics-status' },
      'Your times changed since the last file. Add the new file, then delete the old Sabr events: open one, tap Delete Event, then Delete All Future Events.');
  }
  return h('p', { class: 'small quiet gap-s', 'data-testid': 'ics-status' }, 'Added with your current times.');
}

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
    h('section', { class: 'section strong' },
      h('h1', { class: 'display' }, 'Settings'),
      h('p', { class: 'gap' }, 'Your goal, when a day counts as a success, and the times Sabr reminds you.')),
    goalSection(ctx, app),
    timingSection(ctx, app),
    // On feasting hours there is no planned start to set.
    flexible ? null : h('section', { class: 'section', 'data-block': 'planned' },
      h('div', { class: 'label' }, 'Planned window start'),
      h('div', { class: 'gap-s' },
        timeSetting('Workdays', 'workdayStart', ctx),
        timeSetting('Weekends', 'weekendStart', ctx)),
      h('p', { class: 'small quiet gap-s' }, 'Workdays run Sunday to Thursday; weekends are Friday and Saturday.')),
    h('section', { class: 'section', 'data-block': 'reminder-times' },
      h('div', { class: 'label' }, 'Reminder times, Sun to Thu'),
      h('div', { class: 'gap-s' },
        timeSetting('Hold the line', 'holdTime', ctx),
        timeSetting('Training', 'trainingTime', ctx))),
    alarmSection(ctx),
    pausesSection(ctx, app),
    h('section', { class: 'section', 'data-block': 'calendar' },
      h('div', { class: 'label' }, 'Calendar reminders'),
      h('p', { class: 'gap-s' },
        flexible
          ? `Two repeating alerts for your iPhone Calendar: hold the line at ${s.holdTime} and training at ${s.trainingTime} on workdays. With feasting hours there is no planned opening, so the file removes the window alerts.`
          : `Four repeating alerts for your iPhone Calendar: hold the line at ${s.holdTime} and training at ${s.trainingTime} on workdays, `
          + `and your window at ${s.workdayStart} on workdays and ${s.weekendStart} at weekends.`),
      calendarStatus(ctx),
      h('div', { class: 'gap' }, button('Add to Calendar', () => app.addCalendar(), { kind: 'outline', block: true, name: 'add-calendar' })),
      h('p', { class: 'small quiet gap-s' }, 'In the share sheet choose Calendar. If it is not listed, choose Save to Files, then open the file in Files and tap Add All.')),
    h('section', { class: 'section', 'data-block': 'export' },
      h('div', { class: 'label' }, 'Export'),
      h('p', { class: 'gap-s' }, 'CSV files for Excel: every day with its window and the fast before it, meals, weight, check-ins and temptations. The weight file holds your raw entries.'),
      h('div', { class: 'gap' }, button('Export CSV files', () => app.exportCsv(), { kind: 'outline', block: true, name: 'export-csv' }))),
    h('section', { class: 'section', 'data-block': 'backup' },
      h('div', { class: 'label' }, 'Backup'),
      h('p', { class: 'gap-s', 'data-testid': 'backup-status' }, s.lastBackupAt ? `Last backup ${ago(s.lastBackupAt, ctx.nowTs)}.` : 'No backup yet.'),
      h('p', { class: 'small quiet' }, 'Everything lives only on this iPhone. Back up once a week and keep the file in Files or iCloud Drive.'),
      h('div', { class: 'gap' }, button('Back up now', () => app.backup(), { kind: 'outline', block: true, name: 'backup' })),
      h('div', { class: 'gap-s' }, button('Restore from a backup', () => restoreInput.click(), { kind: 'secondary', name: 'restore' })),
      restoreInput),
    h('section', { class: 'section', 'data-block': 'storage' },
      h('div', { class: 'label' }, 'Storage'),
      h('p', { class: 'small gap-s' },
        s.persisted === true
          ? 'Kept on this iPhone. The browser has agreed not to clear it when space runs low.'
          : 'iOS may clear this data if the iPhone runs very low on space. Weekly backups keep it safe.'),
      isStandalone()
        ? null
        : h('p', { class: 'small gap-s' }, 'You are using Sabr in the browser. Add it to your Home Screen and use it from there: the Home Screen app keeps its own data.')),
    h('section', { class: 'section', 'data-block': 'help' },
      h('div', { class: 'label' }, 'Help'),
      h('div', { class: 'gap-s' }, button('Weight Shortcut and Home Screen setup', () => app.go('help'), { kind: 'secondary', name: 'help' }))),
    h('section', { class: 'section', 'data-block': 'reset' },
      h('div', { class: 'label' }, 'Reset'),
      h('p', { class: 'small gap-s' }, 'Delete all history and start again. Your planned times and reminders stay.'),
      h('div', { class: 'gap-s' }, button('Reset all history', () => showResetSheet(app), { kind: 'secondary', name: 'reset' }))),
    h('div', { class: 'row gap-l' },
      h('div', { class: 'main' }),
      h('div', { class: 'margin' }, note('Version', VERSION))),
  );
}
