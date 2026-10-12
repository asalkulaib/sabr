// Pieces several screens share: header, margin notes, notices, queries.

import { h, live } from './dom.js';
import { button } from './components.js';
import { DAY, HOME_ZONE, addDays, dayKey, fmtDayLong, fmtDuration, fmtMinutes, fmtWhen, sameClock, zoneAt, zoneName } from '../core/time.js';
import { isFlexible, isOpen, isWorkday, longFastAhead, plannedStartMin } from '../core/rules.js';

/** Margin note: a small scholar's note. */
export function note(title, value) {
  return h('div', { class: 'note' }, h('b', {}, title), value);
}

export function liveNote(title, fn) {
  return h('div', { class: 'note' }, h('b', {}, title), live('span', {}, fn));
}

/** A margin note you tap to change its time. */
export function tapNote(title, value, onClick, name) {
  return h('button', {
    type: 'button',
    class: 'note tap',
    'data-action': name,
    'aria-label': `${title}, ${value}. Change`,
    onclick: onClick,
  }, h('b', {}, title), h('span', { class: 'tap-value' }, value));
}

/** A labelled time in a pill you tap to change (when the fast began, when it reaches its goal). */
export function timePill(title, value, onClick, name, { reached = false } = {}) {
  return h('div', { class: 'time-pill' },
    h('div', { class: 'label', 'aria-hidden': 'true' }, title),
    h('button', {
      type: 'button',
      class: reached ? 'reached' : null,
      'data-action': name,
      'aria-label': `${title}, ${value}. Change`,
      onclick: onClick,
    }, value));
}

export function dayTypeText(key, rec) {
  if (rec && rec.paused) return 'Paused';
  if (rec && rec.dayOff) return 'Day off';
  return isWorkday(key, rec) ? 'Workday' : 'Weekend';
}

/** Screen header. The Tempted? button shows whenever no window is open, except on a paused day. */
/** Away from Kuwait time: 'Dubai time', the zone Fast follows now; null at home. */
export function awayZone(ctx) {
  const zone = zoneAt(ctx.nowTs);
  return sameClock(zone, HOME_ZONE, ctx.nowTs) ? null : `${zoneName(zone)} time`;
}

/** The zone a moment happened in, as 'Dubai time', when it differs from the zone in force now. */
export function zoneNoteFor(ctx, ts) {
  const zone = zoneAt(ts);
  return sameClock(zone, zoneAt(ctx.nowTs), ts) ? null : `${zoneName(zone)} time`;
}

/** zone: a note about the time zone in place of the usual one (a day from another clock). */
export function header(ctx, app, { title, sub, zone }) {
  const tempted = !ctx.openRec && ctx.mode.mode !== 'paused'
    ? button('Tempted?', () => app.tempted(), { kind: 'secondary', name: 'tempted' })
    : null;
  const away = zone !== undefined ? zone : awayZone(ctx);
  return h('header', { class: 'head' },
    h('div', { class: 'head-title' },
      h('div', { class: 'label' }, title),
      sub || away
        ? h('div', { class: 'label' }, sub || null, away ? h('span', { 'data-testid': 'zone-note' }, `${sub ? ' · ' : ''}${away}`) : null)
        : null),
    tempted,
  );
}

export function mealsOfDay(ctx, key) {
  return ctx.meals.filter((m) => m.day === key).sort((a, b) => a.startedAt - b.startedAt);
}

export function mealInProgress(ctx, key) {
  return mealsOfDay(ctx, key).find((m) => !m.finishedAt) || null;
}

/** Meals whose 20-minute fullness check is due now. */
export function dueFullness(ctx) {
  return ctx.meals
    .filter((m) => m.fullness20DueAt && m.fullness20 == null && !m.fullness20Skipped
      && m.fullness20DueAt <= ctx.nowTs && ctx.nowTs - m.fullness20DueAt < 6 * 60 * 60000)
    .sort((a, b) => a.fullness20DueAt - b.fullness20DueAt);
}

/** Meals whose 20-minute timer is still running. */
export function runningFullness(ctx) {
  return ctx.meals.filter((m) => m.fullness20DueAt && m.fullness20 == null && !m.fullness20Skipped && m.fullness20DueAt > ctx.nowTs);
}

export function outsideOfDay(ctx, key) {
  return ctx.outside.filter((o) => o.day === key).sort((a, b) => a.at - b.at);
}

export function temptationsOfDay(ctx, key) {
  return ctx.temptations.filter((t) => t.day === key).sort((a, b) => a.startedAt - b.startedAt);
}

/** The next planned window after a day, as a sentence. */
export function nextWindowLine(ctx, fromKey = ctx.todayKey) {
  // On a long fast the next window waits for its goal.
  const ahead = longFastAhead(ctx);
  if (ahead) return `Your ${ahead.hours}-hour fast reaches its goal at ${fmtWhen(ahead.at, ctx.todayKey)}.`;
  const next = addDays(fromKey, 1);
  if (isFlexible(next, ctx.settings)) {
    const when = next === addDays(ctx.todayKey, 1) ? 'Tomorrow' : 'Today';
    return `${when}: a ${Math.round(ctx.windowMsFor(next) / 3600000)}-hour window, opened whenever you choose.`;
  }
  const time = fmtMinutes(plannedStartMin(next, ctx.days.get(next), ctx.settings));
  return next === addDays(ctx.todayKey, 1)
    ? `Tomorrow's window opens at ${time}.`
    : `Today's window opens at ${time}.`;
}

/** Most recent past days with nothing logged (last 14 days). */
export function unloggedDays(ctx) {
  const out = [];
  for (let i = 1; i <= 14; i++) {
    const k = addDays(ctx.todayKey, -i);
    if (k < ctx.startKey) break;
    if (ctx.evaluate(k).result === 'unlogged' && !isOpen(ctx.days.get(k))) out.push(k);
  }
  return out;
}

export function ago(ts, nowTs) {
  const days = Math.floor((nowTs - ts) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function backupDue(ctx) {
  const hasData = ctx.days.size > 0 || ctx.meals.length > 0 || ctx.weights.size > 0;
  if (!hasData) return false;
  const since = ctx.settings.lastBackupAt || ctx.settings.installedAt;
  return !since || ctx.nowTs - since >= 7 * DAY;
}

export function weightImportDue(ctx) {
  const last = ctx.settings.lastImportAt;
  if (last) return ctx.nowTs - last >= 7 * DAY;
  const installed = ctx.settings.installedAt;
  return !!installed && ctx.nowTs - installed >= 2 * DAY;
}

/** Quiet notes at the top of Today: gaps, backups, weight imports. */
export function notices(ctx, app) {
  const items = [];
  const gaps = unloggedDays(ctx);
  if (gaps.length) {
    const text = gaps.length === 1 ? `Nothing logged for ${fmtDayLong(gaps[0])}.` : `${gaps.length} recent days have nothing logged.`;
    items.push(h('div', { class: 'notice', 'data-notice': 'unlogged' },
      h('span', {}, text),
      button('Fill in', () => app.go(`day/${gaps[0]}`), { kind: 'secondary', name: 'fill-in' })));
  }
  if (backupDue(ctx)) {
    const last = ctx.settings.lastBackupAt;
    items.push(h('div', { class: 'notice', 'data-notice': 'backup' },
      h('span', {}, last ? `Backup due. The last one was ${ago(last, ctx.nowTs)}.` : 'No backup yet.'),
      button('Back up', () => app.backup(), { kind: 'secondary', name: 'backup-now' })));
  }
  if (weightImportDue(ctx)) {
    items.push(h('div', { class: 'notice', 'data-notice': 'weight' },
      h('span', {}, ctx.settings.lastImportAt ? 'Weight import due.' : 'No weight imported yet.'),
      button('Import weight', () => app.importWeight(), { kind: 'secondary', name: 'import-weight-notice' })));
  }
  return items.length ? h('div', { class: 'notices' }, items) : null;
}

export function sinceText(ts) {
  return (nowTs) => fmtDuration(nowTs - ts);
}

export function whenText(ts, ctx) {
  return fmtWhen(ts, ctx.todayKey);
}

export { dayKey };
