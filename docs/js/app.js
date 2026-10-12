// Sabr: app shell. Routing, rendering, the one-second tick, prompts and the
// actions that hand files to iOS.

import * as store from './store.js';
import { requestPersistence } from './db.js';
import { h, fadeIn, fadeOut, updateLive } from './ui/dom.js';
import { button, sliding } from './ui/components.js';
import { MIN, HOME_ZONE, now, dayKey, isDayKey, fmtDayLong, sameClock, switchZone, zoneName } from './core/time.js';
import { makeEvaluator, noWindowAlerts, streaks, todayMode, trackingStart, windowMsFor } from './core/rules.js';
import { buildIcs, icsTimes } from './core/ics.js';
import { buildCsvFiles } from './core/csv.js';
import { buildBackup, backupFileName, describeBackup, parseBackup } from './core/backup.js';
import { renderToday, signature as todaySignature } from './ui/today.js';
import { renderWeek } from './ui/week.js';
import { renderDay } from './ui/day.js';
import { renderHistory } from './ui/history.js';
import { renderWeight } from './ui/weight.js';
import { renderMore } from './ui/more.js';
import { renderSatiety } from './ui/satiety.js';
import { renderHelp } from './ui/help.js';
import { currentSheet, isSheetOpen, openSheet, sheetHead } from './ui/sheet.js';
import { showFullnessSheet } from './ui/meal.js';
import { knownOutcome, resumeTemptation, startTemptation, unfinishedTemptation } from './ui/temptation.js';
import { dueFullness } from './ui/shared.js';
import { deliverFiles } from './ui/share.js';
import { importWeightText } from './weight-import.js';
import { VERSION } from './version.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let tabSlide = null; // the tabs' sliding pill, once the app has started
const sheetRoot = document.getElementById('sheet-root');

const ROUTES = ['today', 'week', 'day', 'satiety', 'history', 'weight', 'more', 'help'];
let route = parseRoute(location.hash);
let lastSignature = '';
let lastStateKey = '';
let flash = null; // { text, until, undo }
let renderQueued = false;
const prompted = new Set();

function parseRoute(hash) {
  const [name, arg] = hash.replace(/^#\/?/, '').split('/');
  if (!ROUTES.includes(name)) return { name: 'today' };
  if (name === 'day' && !isDayKey(arg)) return { name: 'week' };
  if (name === 'week' && arg && !isDayKey(arg)) return { name: 'week' };
  return { name, arg };
}

/** Everything a screen needs, computed fresh. */
function context() {
  const nowTs = now();
  const todayKey = dayKey(nowTs);
  const d = store.data();
  const startKey = trackingStart({ ...d, installedAt: d.settings.installedAt }, todayKey);
  const evaluate = makeEvaluator({ days: d.days, outside: d.outside, meals: d.meals, nowTs, todayKey, startKey, settings: d.settings });
  const mode = todayMode({ days: d.days, todayKey, nowTs, settings: d.settings });
  return {
    ...d,
    nowTs,
    todayKey,
    startKey,
    evaluate,
    mode,
    // The eating-window goal in force on a day, in ms.
    windowMsFor: (key) => windowMsFor(key, d.settings),
    openRec: mode.mode === 'open' || mode.mode === 'forgot' ? mode.rec : null,
    streak: streaks(evaluate, todayKey, startKey),
  };
}

function signatureOf(ctx) {
  const base = `${route.name}|${route.arg || ''}|${ctx.todayKey}|${!!ctx.openRec}`;
  return route.name === 'today' ? `${base}|${todaySignature(ctx)}` : base;
}

function renderRoute(ctx) {
  switch (route.name) {
    case 'week': return renderWeek(ctx, app, route.arg);
    case 'day': return renderDay(ctx, app, route.arg);
    case 'satiety': return renderSatiety(ctx, app);
    // Weight is the third view of History.
    case 'history': return ctx.settings.historyMetric === 'weight' ? renderWeight(ctx, app) : renderHistory(ctx, app);
    case 'weight': return renderWeight(ctx, app);
    case 'more': return renderMore(ctx, app);
    case 'help': return renderHelp(ctx, app);
    default: return renderToday(ctx, app);
  }
}

let lastRoute = null;

function render(fresh) {
  if (!store.state.ready) return;
  // A chart showing one series only resets once you leave its screen.
  if (route.name !== lastRoute) { app.ui.satietyFocus = null; app.ui.historyFocus = null; app.ui.weightDay = null; }
  lastRoute = route.name;
  const ctx = context();
  const y = window.scrollY;
  const node = renderRoute(ctx);
  const flashNode = flash && flash.until > ctx.nowTs ? flashBar(flash) : null;
  view.replaceChildren(...[flashNode, node].filter(Boolean));
  view.removeAttribute('aria-busy');
  // A soft fade when the screen or the state of the day changes.
  const stateKey = `${route.name}|${route.arg || ''}|${ctx.mode.mode}`;
  if (fresh) {
    window.scrollTo(0, 0);
    fadeIn(node);
  } else {
    window.scrollTo(0, y);
    if (stateKey !== lastStateKey) fadeIn(node);
  }
  lastStateKey = stateKey;
  const tab = { day: 'week', help: 'more', weight: 'history' }[route.name] || route.name;
  for (const b of tabbar.querySelectorAll('.tab')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  // The pill glides to the tab, however the screen was reached.
  if (tabSlide) tabSlide.sync();
  lastSignature = signatureOf(ctx);
}

/** The message bar above the tabs, with Undo when the change can be reversed. */
function flashBar(f) {
  return h('div', { class: 'flash', role: 'status', 'data-flash': '' },
    h('span', { 'data-testid': 'flash' }, f.text),
    f.undo ? button('Undo', () => undoLast(), { kind: 'secondary', name: 'undo' }) : null);
}

async function undoLast() {
  const undo = flash && flash.undo;
  if (!undo) return;
  flash = null;
  await undo();
  showFlash('Undone.');
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render(false);
  });
}

function editing() {
  const el = document.activeElement;
  return !!el && view.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName);
}

/** Opens prompts that are due: an unfinished temptation, then fullness checks. */
function prompts(ctx) {
  if (isSheetOpen() || editing()) return;
  const t = unfinishedTemptation(ctx);
  if (t && !prompted.has(`t${t.id}`)) {
    prompted.add(`t${t.id}`);
    // A window opened since the temptation began already tells how it ended.
    const known = knownOutcome(ctx, t);
    if (known) store.updateTemptation(t.id, { outcome: known, step: 'done', endedAt: now() });
    else resumeTemptation(app, t.id);
    return;
  }
  const due = dueFullness(ctx).find((m) => !prompted.has(`f${m.id}`));
  if (due) {
    prompted.add(`f${due.id}`);
    showFullnessSheet(app, due.id);
  }
}

function tick() {
  if (document.hidden || !store.state.ready) return;
  if (now() - zoneCheckedAt >= 5 * MIN) followZone();
  const ctx = context();
  if (flash && flash.until <= ctx.nowTs) {
    const el = view.querySelector('[data-flash]');
    flash = null;
    if (el) fadeOut(el).then(() => el.remove());
  }
  if (signatureOf(ctx) !== lastSignature && !editing()) render(false);
  else updateLive(view, ctx.nowTs);
  const sheet = currentSheet();
  if (sheet) {
    updateLive(sheetRoot, ctx.nowTs);
    if (sheet.opts.tick) sheet.opts.tick(ctx.nowTs);
  }
  prompts(ctx);
}

// ---------- Time zone ----------

/** The phone's time zone, or null when the browser does not say. */
function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

let zoneCheckedAt = 0;

/**
 * Follows the phone's time zone. After a change, all that happened since Fast
 * was last open reads in the new zone, and a message says so. Then notes that
 * Fast is open now.
 */
async function followZone() {
  const nowTs = now();
  zoneCheckedAt = nowTs;
  const s = store.state.settings;
  const next = switchZone(s.zones, deviceZone(), s.zoneSeenAt ?? store.lastActivityAt(), nowTs);
  if (next) {
    await store.setSettings({ zones: next });
    const zone = next[next.length - 1].zone;
    showFlash(sameClock(zone, HOME_ZONE, nowTs) ? `Back on ${zoneName(HOME_ZONE)} time.` : `Times now follow ${zoneName(zone)} time.`, { ms: 12000 });
  }
  await store.noteSeen(nowTs);
}

// ---------- Actions ----------

/** A short message; with undo, a change that one tap on Undo reverses. */
function showFlash(text, { ms = 8000, undo = null } = {}) {
  flash = { text, undo, until: now() + (undo ? Math.max(ms, 10000) : ms) };
  render(false);
}

async function importText(text) {
  const result = await importWeightText(text);
  app.ui.showPaste = !result.ok;
  // New weigh-ins: the big box goes back to the latest figure.
  if (result.ok) app.ui.weightDay = null;
  showFlash(result.ok ? result.message : `${result.message} Run the Fast Weight shortcut, then tap Import weight again.`, { ms: 12000 });
  if (result.ok && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText('').catch(() => {});
  }
  return result;
}

async function importWeight() {
  // Read the clipboard first, straight from the tap (iOS shows its Paste bubble).
  let text = null;
  try {
    if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
  } catch {
    text = null;
  }
  if (route.name !== 'weight') app.go('weight');
  if (text == null) {
    app.ui.showPaste = true;
    showFlash('The clipboard could not be read. Long-press the paste box below and tap Paste.', { ms: 12000 });
    return;
  }
  await importText(text);
}

async function backup() {
  const nowTs = now();
  const text = JSON.stringify(buildBackup(store.data(), { nowTs, version: VERSION }), null, 1);
  const result = await deliverFiles([{ name: backupFileName(nowTs, dayKey), text, type: 'application/json' }], 'Sabr backup');
  if (result === 'cancelled') return;
  await store.setSettings({ lastBackupAt: nowTs });
  showFlash(result === 'shared' ? 'Backup handed to iOS. Keep it in Files or iCloud Drive.' : 'Backup file downloaded.');
}

async function exportCsv() {
  const ctx = context();
  const files = buildCsvFiles(store.data(), { nowTs: ctx.nowTs, todayKey: ctx.todayKey, startKey: ctx.startKey })
    .map((f) => ({ ...f, type: 'text/csv' }));
  const result = await deliverFiles(files, 'Sabr CSV export');
  if (result !== 'cancelled') showFlash(result === 'shared' ? 'CSV files handed to iOS.' : 'CSV files downloaded.');
}

async function addCalendar() {
  const ctx = context();
  const s = ctx.settings;
  const flexible = noWindowAlerts(ctx.todayKey, s);
  const fingerprint = icsTimes(s, { flexible });
  const sequence = s.icsTimes && s.icsTimes !== fingerprint ? (s.icsSequence || 0) + 1 : s.icsSequence || 0;
  const text = buildIcs(s, { nowTs: ctx.nowTs, todayKey: ctx.todayKey, sequence, flexible });
  const result = await deliverFiles([{ name: 'sabr-reminders.ics', text, type: 'text/calendar' }], 'Sabr reminders');
  if (result === 'cancelled') return;
  await store.setSettings({ icsTimes: fingerprint, icsSequence: sequence });
  showFlash(result === 'shared' ? 'Calendar file handed to iOS.' : 'Calendar file downloaded.');
}

async function restoreFrom(file) {
  let backupObj;
  try {
    backupObj = parseBackup(await file.text());
  } catch (err) {
    showFlash(err.message || 'That file could not be read.');
    return;
  }
  const info = describeBackup(backupObj);
  const when = info.exportedAt ? fmtDayLong(dayKey(Date.parse(info.exportedAt))) : 'an unknown date';
  openSheet((api) => h('div', {},
    sheetHead(api, 'Restore'),
    h('p', { class: 'statement' }, 'Replace everything on this iPhone with this backup?'),
    h('p', { class: 'gap' }, `Backup from ${when}: ${info.windows} windows, ${info.meals} meals, ${info.weighIns} weigh-ins and ${info.temptations} temptations.`),
    info.skipped ? h('p', { class: 'small quiet gap-s' }, `${info.skipped} damaged ${info.skipped === 1 ? 'entry' : 'entries'} will be left out.`) : null,
    h('div', { class: 'stack gap-l' },
      button('Replace my data', async () => {
        await store.restore(backupObj);
        await api.close();
        showFlash('Backup restored.');
      }, { block: true, name: 'confirm-restore' }),
      button('Cancel', () => api.close(), { kind: 'secondary', name: 'cancel-restore' }))),
  { name: 'restore', label: 'Restore' });
}

export const app = {
  ui: { showPaste: false, showTable: false, showHistoryTable: false, showSatietyTable: false, satietyFocus: null, historyFocus: null, weightDay: null },
  ctx: context,
  go(path) {
    const target = `#${path}`;
    if (location.hash === target) {
      route = parseRoute(target);
      render(true);
    } else {
      location.hash = target;
    }
  },
  refresh: () => render(false),
  flash: showFlash,
  async tempted() {
    const id = await startTemptation(app);
    prompted.add(`t${id}`); // "Not sure yet" closes it until the next launch
  },
  importWeight,
  importText,
  backup,
  exportCsv,
  addCalendar,
  restoreFrom,
};

// ---------- Service worker ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    // A new version took over. Reload once nothing is open, so no input is lost.
    const tryReload = () => {
      if (reloading) return;
      if (isSheetOpen() || editing()) {
        setTimeout(tryReload, 2000);
        return;
      }
      reloading = true;
      location.reload();
    };
    tryReload();
  });
}

// ---------- Boot ----------

function fatal(err) {
  view.removeAttribute('aria-busy');
  view.replaceChildren(h('div', {},
    h('div', { class: 'label' }, 'Sabr'),
    h('h1', { class: 'display gap-s' }, 'Storage is not available'),
    h('p', { class: 'gap' }, 'Sabr keeps everything on this device and could not open its storage. Private Browsing blocks it. Open Sabr from the Home Screen or in a normal Safari tab.'),
    h('p', { class: 'quiet small gap' }, String(err && err.message ? err.message : err))));
}

async function boot() {
  try {
    await store.load();
  } catch (err) {
    fatal(err);
    return;
  }
  if (!store.state.settings.installedAt) await store.setSettings({ installedAt: now() });
  await followZone();
  requestPersistence().then((p) => {
    if (p !== store.state.settings.persisted) store.setSettings({ persisted: p });
  });

  store.subscribe(scheduleRender);
  window.addEventListener('hashchange', () => {
    route = parseRoute(location.hash);
    render(true);
  });
  // The tabs are one sliding track: tap a name, or drag the pill along.
  const tabButtons = [...tabbar.querySelectorAll('.tab')];
  tabSlide = sliding(tabbar.querySelector('.tabs'), tabButtons, { line: true, current: true, pick: (b) => app.go(b.dataset.tab) });
  for (const b of tabButtons) b.addEventListener('click', () => tabSlide.choose(b, { tap: true }));
  document.addEventListener('visibilitychange', async () => {
    // Leaving Fast: a change of zone from here on starts after this moment.
    if (document.hidden) {
      if (store.state.ready) store.noteSeen(now());
      return;
    }
    for (const key of [...prompted]) if (key.startsWith('f')) prompted.delete(key);
    // Back from the Shortcut or another app: the Weight box shows the latest again.
    app.ui.weightDay = null;
    try {
      await store.load();
      await followZone();
    } catch {
      /* keep what is in memory */
    }
    render(false);
    prompts(context());
  });

  render(true);

  if (window.__fastPayload) {
    const payload = window.__fastPayload;
    window.__fastPayload = null;
    route = { name: 'weight' };
    history.replaceState(null, '', `${location.pathname}#weight`);
    await importText(payload);
  }

  prompts(context());
  setInterval(tick, 1000);
  registerServiceWorker();
}

boot();
