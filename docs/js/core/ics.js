// Builds the reminders calendar file (.ics, RFC 5545). Pure functions only.
// Times are floating local times (no time zone), so on a trip the alerts
// ring by the phone's own clock, as Fast's times do.

import { addDays, keyParts, toMinutes, weekday } from './time.js';

const CRLF = '\r\n';
const WORK = ['SU', 'MO', 'TU', 'WE', 'TH'];
const WEEKEND = ['FR', 'SA'];
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const EVENT_UIDS = ['hold-the-line', 'training', 'window-workday', 'window-weekend'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function escapeText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets; continuation lines start with one space. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (len + size > limit) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += size;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

function utcStamp(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** First day on or after fromKey whose weekday is in the list. */
function firstMatching(fromKey, codes) {
  for (let i = 0; i < 7; i++) {
    const k = addDays(fromKey, i);
    if (codes.includes(DAY_CODES[weekday(k)])) return k;
  }
  return fromKey;
}

function localStamp(key, hhmm) {
  const { y, m, d } = keyParts(key);
  const min = toMinutes(hhmm);
  return `${y}${pad(m)}${pad(d)}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
}

/**
 * The four repeating reminders, from the current settings. On flexible
 * timing there is no planned opening, so the two window alerts go out
 * cancelled: importing the file removes them from Calendar.
 */
export function reminderEvents(s, { flexible = false } = {}) {
  const until = flexible ? 'your window' : `your window opens at ${s.workdayStart}`;
  return [
    { uid: 'hold-the-line', days: WORK, time: s.holdTime, summary: 'Hold the line', description: flexible ? 'Water, black coffee, espresso or plain tea until your window.' : `Your window opens at ${s.workdayStart}. Water, black coffee, espresso or plain tea until then.` },
    { uid: 'training', days: WORK, time: s.trainingTime, summary: 'Training', description: `Train before ${until}. Log your 4 PM energy in Sabr.` },
    { uid: 'window-workday', days: WORK, time: s.workdayStart, summary: 'Window opens', description: 'Protein and vegetables first. Eat slowly. Pause halfway.', cancelled: flexible },
    { uid: 'window-weekend', days: WEEKEND, time: s.weekendStart, summary: 'Window opens', description: 'Protein and vegetables first. Eat slowly. Pause halfway.', cancelled: flexible },
  ];
}

/**
 * settings: { workdayStart, weekendStart, holdTime, trainingTime }
 * opts: { nowTs, todayKey, sequence }
 */
export function buildIcs(settings, { nowTs, todayKey, sequence = 0, flexible = false }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sabr//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Sabr',
  ];
  for (const ev of reminderEvents(settings, { flexible })) {
    const start = firstMatching(todayKey, ev.days);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@sabr.reminders`,
      `DTSTAMP:${utcStamp(nowTs)}`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${localStamp(start, ev.time)}`,
      'DURATION:PT10M',
      `RRULE:FREQ=WEEKLY;BYDAY=${ev.days.join(',')}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      `DESCRIPTION:${escapeText(ev.description)}`,
      'TRANSP:TRANSPARENT',
      ...(ev.cancelled ? ['STATUS:CANCELLED'] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(ev.summary)}`, 'TRIGGER:-PT0M', 'END:VALARM']),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * The times a calendar file was built from, to tell when it is out of date.
 * 'local' marks files whose alerts follow the phone's clock; older ones were
 * pinned to Kuwait time.
 */
export function icsTimes(s, { flexible = false } = {}) {
  return ['local', s.holdTime, s.trainingTime, s.workdayStart, s.weekendStart, ...(flexible ? ['flexible'] : [])].join('|');
}

/** A file made before alerts followed the phone's clock. */
export const icsPinnedToKuwait = (fingerprint) => !!fingerprint && !String(fingerprint).startsWith('local|');
