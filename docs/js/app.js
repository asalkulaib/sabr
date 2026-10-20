// Sabr: app shell. Routing, rendering, the one-second tick, prompts and the
// actions that hand files to iOS.

import * as store from './store.js';
import { requestPersistence } from './db.js';
import { h, fadeIn, fadeOut, updateLive } from './ui/dom.js';
import { button, sliding } from './ui/components.js';
import { MIN, HOME_ZONE, now, dayKey, isDayKey, fmtDayLong, fmtDayMonth, sameClock, switchZone, zoneName } from './core/time.js';
import { makeEvaluator, noWindowAlerts, streaks, todayMode, trackingStart, windowMsFor } from './core/rules.js';
import { buildIcs, icsTimes } from './core/ics.js';
import { buildCsvFiles } from './core/csv.js';
import { buildBackup, backupFileName, backupSpan, daysAfter, describeBackup, parseBackup } from './core/backup.js';
import { dailyCopy, keepCopyFirst } from './copies.js';
import { renderToday, signature as todaySignature } from './ui/today.js';
import { renderWeek } from './ui/week.js';
import { renderDay } from './ui/day.js';
import { renderHistory } from './ui/history.js';
import { renderWeight } from './ui/weight.js';
import { renderMore } from './ui/more.js';
import { renderSatiety } from './ui/satiety.js';
import { renderHelp } from './ui/help.js';
import { closeSheet, currentSheet, isSheetOpen, openSheet, roomForMessage, sheetHead } from './ui/sheet.js';
import { showFullnessSheet } from './ui/meal.js';
import { knownOutcome, resumeTemptation, startTemptation, unfinishedTemptation } from './ui/temptation.js';
import { dueFullness } from './ui/shared.js';
import { deliverFiles } from './ui/share.js';
import { importWeightText } from './weight-import.js';
import { needsWelcome, showWelcome } from './ui/welcome.js';
import { VERSION } from './version.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let tabSlide = null; // the tabs' sliding pill, once the app has started
const sheetRoot = document.getElementById('sheet-root');

const ROUTES = ['today', 'week', 'day', 'satiety', 'history', 'weight', 'more', 'help'];

/** "1 meal", "3 meals". */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
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
  view.replaceChildren(node);
  view.removeAttribute('aria-busy');
  syncFlash(ctx.nowTs);
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

// ---------- The toast ----------

// Messages live in their own host outside the screen, above the tabs and
// above an open sheet, so a message about a sheet's change shows over it.
// The host is the live region, there from the start, so VoiceOver reads each
// message as it arrives (a region inserted with its words is often missed).
const flashRoot = h('div', { id: 'flash-root', class: 'flash-root', role: 'status', 'aria-live': 'polite' });
document.body.append(flashRoot);
let flashShown = null; // the message on screen now
let flashSized = null;

/** The message bar, with Undo when the change can be reversed. */
function flashBar(f) {
  return h('div', { class: 'flash', 'data-flash': '' },
    h('span', { 'data-testid': 'flash' }, f.text),
    f.undo ? button('Undo', () => undoLast(), { kind: 'secondary', name: 'undo' }) : null);
}

/** The screen keeps room under its last line for the message, however tall it grows. */
function roomForFlash(el) {
  if (flashSized) flashSized.disconnect();
  flashSized = null;
  const root = document.documentElement;
  if (!el) {
    document.body.classList.remove('has-flash');
    root.style.removeProperty('--flash-h');
    return;
  }
  document.body.classList.add('has-flash');
  const size = () => {
    const px = Math.ceil(el.offsetHeight) + 16;
    root.style.setProperty('--flash-h', `${px}px`);
    // An open sheet makes room at its foot, so the message covers none of it.
    roomForMessage(px);
  };
  size();
  flashSized = new ResizeObserver(size);
  flashSized.observe(el);
}

/** Shows the current message, keeping the one on screen when it has not changed. */
function syncFlash(nowTs) {
  const live = flash && flash.until > nowTs ? flash : null;
  if (live === flashShown) return;
  flashShown = live;
  if (!live) {
    clearFlash();
    return;
  }
  const el = flashBar(live);
  flashRoot.replaceChildren(el);
  roomForFlash(el);
}

/** Fades the message out. */
function clearFlash() {
  const el = flashRoot.querySelector('[data-flash]');
  flashShown = null;
  roomForFlash(null);
  if (el) fadeOut(el).then(() => { if (!flashShown) el.remove(); });
}

/**
 * Undo, from the message. The message floats above an open sheet, so the sheet
 * never shows a change that is no longer there: a message raised before this
 * sheet opened belongs to the screen behind, so the sheet closes first and the
 * change undone is in view; a message the sheet itself raised (the Goal sheet)
 * leaves it open, drawn again with the change undone.
 */
async function undoLast() {
  const f = flash;
  if (!f || !f.undo) return;
  // Undo had focus (a keyboard or VoiceOver tap): the message that replaces
  // it has no Undo, so focus must land somewhere rather than on the page.
  const hadFocus = flashRoot.contains(document.activeElement);
  flash = null;
  if (currentSheet() && currentSheet() !== f.sheet) await closeSheet();
  await f.undo();
  const open = currentSheet();
  if (open) open.api.rerender();
  showFlash('Undone.');
  if (hadFocus) focusAfterUndo();
}

/**
 * After Undo, focus goes to the open sheet's title, or to the screen's title,
 * unless it is already somewhere (a closed sheet hands it back to its opener).
 * Once more after the next frame, in case a redraw replaced the title.
 */
function focusAfterUndo() {
  const lost = () => !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected || flashRoot.contains(document.activeElement);
  const put = () => {
    if (!lost()) return;
    const open = currentSheet();
    const target = open ? open.api.el.querySelector(':scope > .sheet-head h2') || open.api.el : view.querySelector('h1');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  put();
  requestAnimationFrame(put);
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

let copyDay = null; // the day the daily copy was last looked for

function tick() {
  if (document.hidden || !store.state.ready) return;
  if (now() - zoneCheckedAt >= 5 * MIN) followZone();
  const ctx = context();
  // Left open past midnight: the new day gets its copy too.
  if (copyDay && ctx.todayKey !== copyDay) {
    copyDay = ctx.todayKey;
    dailyCopy();
  }
  if (flash && flash.until <= ctx.nowTs) {
    flash = null;
    clearFlash();
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
  // The sheet open as it is raised, if any: its Undo belongs to that sheet.
  flash = { text, undo, sheet: currentSheet(), until: now() + (undo ? Math.max(ms, 10000) : ms) };
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
  showFlash(result === 'shared' ? 'Backup handed to iOS. Keep it in iCloud Drive, in a folder named Sabr.' : 'Backup file downloaded.');
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
  // Sabr's own file is in Calendar now: Fast's events were to go before it.
  await store.setSettings({ icsTimes: fingerprint, icsSequence: sequence, fastCalendar: false });
  showFlash(result === 'shared' ? 'Calendar file handed to iOS.' : 'Calendar file downloaded.');
}

/** '25 Sep to 16 Oct', with each year when the two differ. */
function spanText({ first, last }) {
  const years = first.slice(0, 4) !== last.slice(0, 4);
  const day = (k) => (years ? `${fmtDayMonth(k)} ${k.slice(0, 4)}` : fmtDayMonth(k));
  return `${day(first)} to ${day(last)}`;
}

/**
 * What a backup covers, and what restoring it removes from this iPhone that
 * it does not hold: the days logged after its last day.
 */
function restoreLines(backupObj, ctx) {
  const span = backupSpan(backupObj, dayKey);
  const later = daysAfter(store.data(), span ? span.last : null, ctx.todayKey);
  const days = `${later} ${later === 1 ? 'day' : 'days'}`;
  return {
    span: !span ? null
      : span.first === span.last ? `This backup holds ${fmtDayMonth(span.first)} only.` : `This backup runs ${spanText(span)}.`,
    loss: !later ? null
      : span ? `${days} logged on this iPhone after ${fmtDayMonth(span.last)} will be removed.` : `${days} logged on this iPhone will be removed.`,
  };
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
  const lines = restoreLines(backupObj, context());
  openSheet((api) => ({
    head: sheetHead(api, 'Restore'),
    body: h('div', {},
      h('p', { class: 'statement' }, 'Replace everything on this iPhone with this backup?'),
      h('p', { class: 'gap' }, `Backup from ${when}: ${count(info.windows, 'window')}, ${count(info.meals, 'meal')}, ${count(info.weighIns, 'weigh-in')} and ${count(info.temptations, 'temptation')}.`),
      lines.span ? h('p', { class: 'gap restore-span', 'data-testid': 'restore-span' }, lines.span) : null,
      lines.loss ? h('p', { class: 'callout gap restore-loss', 'data-testid': 'restore-loss' }, lines.loss) : null,
      info.skipped ? h('p', { class: 'small quiet gap-s' }, `${info.skipped} damaged ${info.skipped === 1 ? 'entry' : 'entries'} will be left out.`) : null),
    actions: [
      button('Replace my data', async () => {
        // A copy of now is kept first, so Undo can bring it back.
        const undo = await keepCopyFirst('before-restore');
        await store.restore(backupObj);
        await api.close();
        showFlash('Backup restored.', { undo });
      }, { block: true, name: 'confirm-restore' }),
      button('Cancel', () => api.close(), { kind: 'outline', block: true, name: 'cancel-restore' }),
    ],
  }),
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
  // The rescue screen (rescue.js) offers to save the data and try again.
  if (typeof window.__sabrRescue === 'function') {
    window.__sabrRescue();
    return;
  }
  view.removeAttribute('aria-busy');
  view.replaceChildren(h('div', {},
    h('div', { class: 'label' }, 'Sabr'),
    h('h1', { class: 'display gap-s' }, 'Storage is not available'),
    h('p', { class: 'gap' }, 'Sabr keeps everything on this device and could not open its storage. Private Browsing blocks it. Open Sabr from the Home Screen or in a normal Safari tab.'),
    h('p', { class: 'quiet small gap' }, String(err && err.message ? err.message : err))));
}

async function boot() {
  // iOS Safari draws :active only where a touch listener sits on the element
  // or above it: one on the document gives every row, tile and pill its
  // pressed state.
  document.addEventListener('touchstart', () => {}, { passive: true });
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
    dailyCopy();
  });

  render(true);
  // The first screen is up: the rescue screen (rescue.js) stays away from now on.
  window.__sabrDrawn = true;

  if (window.__fastPayload) {
    const payload = window.__fastPayload;
    window.__fastPayload = null;
    route = { name: 'weight' };
    history.replaceState(null, '', `${location.pathname}#weight`);
    await importText(payload);
  }

  // A fresh install meets the welcome once, never over a weight import just made.
  if (needsWelcome(store.state)) showWelcome(app);

  prompts(context());
  setInterval(tick, 1000);
  registerServiceWorker();
  // Today's copy on this iPhone, once the screen is up and in no save's way.
  copyDay = dayKey(now());
  setTimeout(dailyCopy, 1500);
}

boot();
