// Time helpers.
// Every stored time is epoch milliseconds (UTC). Clock times and days follow
// the phone's time zone, and every moment keeps the zone it happened in: a
// timeline of zones ({ from, zone }, oldest first; the first from is null)
// says which zone was in force when. A Dubai dinner reads 19:00 in Dubai and
// still 19:00 back in Kuwait, and Kuwait days never shift. Until the phone
// first leaves Kuwait time, the timeline is Kuwait alone.

export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const now = () => Date.now();

export const HOME_ZONE = 'Asia/Kuwait';
const HOME = [{ from: null, zone: HOME_ZONE }];

const pad = (n) => String(n).padStart(2, '0');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- Time zones ----------

let ZONES = HOME;

/** Sets the timeline of zones (from settings). Empty or missing means Kuwait throughout. */
export function setZones(list) {
  ZONES = Array.isArray(list) && list.length && list.every((s) => isZone(s.zone))
    ? [{ from: null, zone: list[0].zone }, ...list.slice(1)]
    : HOME;
}

export const zones = () => ZONES;

/** The zone in force at a moment. */
export function zoneAt(ts, list = ZONES) {
  let zone = list[0].zone;
  for (const s of list) {
    if (s.from != null && s.from > ts) break;
    zone = s.zone;
  }
  return zone;
}

/** Whether a name is a time zone this device knows. */
export function isZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

/** 'Asia/Dubai' to 'Dubai', 'America/New_York' to 'New York'. */
export function zoneName(zone) {
  return String(zone).split('/').pop().replace(/_/g, ' ');
}

const formatters = new Map();
function formatter(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

// Offsets only change on a quarter hour (UTC), so each quarter is looked up once.
const QUARTER = 15 * MIN;
const offsets = new Map();

/** Minutes the zone is ahead of UTC at a moment (Kuwait: 180, Dubai: 240). */
export function offsetAt(zone, ts) {
  const q = Math.floor(ts / QUARTER);
  const key = `${zone}|${q}`;
  let off = offsets.get(key);
  if (off === undefined) {
    const at = q * QUARTER;
    const p = {};
    for (const x of formatter(zone).formatToParts(new Date(at))) p[x.type] = x.value;
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    off = Math.round((wall - at) / MIN);
    if (offsets.size > 50000) offsets.clear();
    offsets.set(key, off);
  }
  return off;
}

/** Two zones keep the same clock now and through the seasons (Kuwait and Riyadh). */
export function sameClock(a, b, ts) {
  if (a === b) return true;
  return [0, 91, 182, 273].every((d) => offsetAt(a, ts + d * DAY) === offsetAt(b, ts + d * DAY));
}

/** The moment a clock time on a day key happens in one zone. */
function zonedInstant(key, minutes, zone) {
  const { y, m, d } = keyParts(key);
  const wall = Date.UTC(y, m - 1, d) + minutes * MIN;
  const guess = wall - offsetAt(zone, wall) * MIN;
  return wall - offsetAt(zone, guess) * MIN;
}

/** The day key of a moment in one zone. */
function keyIn(ts, zone) {
  const d = new Date(ts + offsetAt(zone, ts) * MIN);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The timeline after the phone reports a zone, or null when nothing changes.
 * The new zone starts just after Fast was last seen open, or after the last
 * thing logged (seenAt), so all that has happened since reads in the new
 * zone; never later than now. With nothing logged yet, the new zone holds
 * throughout. The date never goes back: flying west late at night, the new
 * zone starts at its own midnight. A zone with the same clock as the one in
 * force changes nothing.
 */
export function switchZone(list, zone, seenAt, nowTs) {
  const timeline = Array.isArray(list) && list.length ? list : HOME;
  const current = zoneAt(nowTs, timeline);
  if (!isZone(zone) || sameClock(current, zone, nowTs)) return null;
  if (seenAt == null && timeline.length === 1) return [{ from: null, zone }];
  const lastFrom = timeline[timeline.length - 1].from;
  let from = Math.min(seenAt != null ? seenAt + 1 : nowTs, nowTs);
  if (lastFrom != null) from = Math.max(from, lastFrom + 1);
  const was = keyIn(from, zoneAt(from, timeline));
  if (keyIn(from, zone) < was) from = zonedInstant(was, 0, zone);
  return [...timeline, { from, zone }];
}

// ---------- Days and clock times ----------

/** Local calendar parts of a timestamp, in the zone in force then. wd: 0 = Sunday. */
export function parts(ts) {
  const d = new Date(ts + offsetAt(zoneAt(ts), ts) * MIN);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(), wd: d.getUTCDay(),
  };
}

/** Local day key, 'YYYY-MM-DD'. */
export function dayKey(ts) {
  const p = parts(ts);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function isDayKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = keyParts(key);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function keyParts(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/**
 * Epoch ms of local midnight at the start of a day. On a day the phone
 * changed zone it is the midnight of the zone in force then, or the moment
 * of the change when the new zone had already passed midnight.
 */
export function dayStart(key) {
  for (let i = 0; i < ZONES.length; i++) {
    const s = ZONES[i];
    const end = i + 1 < ZONES.length ? ZONES[i + 1].from : Infinity;
    const midnight = zonedInstant(key, 0, s.zone);
    if (midnight < end) return s.from == null ? midnight : Math.max(midnight, s.from);
  }
  return zonedInstant(key, 0, ZONES[ZONES.length - 1].zone);
}

/** 'HH:MM' or minutes since midnight to minutes. */
export function toMinutes(hhmm) {
  if (typeof hhmm === 'number') return hhmm;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** Epoch ms of a local time on a given day, in the zone in force at that time. */
export function at(key, hhmm) {
  const minutes = toMinutes(hhmm);
  for (let i = 0; i < ZONES.length; i++) {
    const s = ZONES[i];
    const end = i + 1 < ZONES.length ? ZONES[i + 1].from : Infinity;
    const ts = zonedInstant(key, minutes, s.zone);
    if ((s.from == null || ts >= s.from) && ts < end) return ts;
  }
  // A time the zone change skipped: read it in the zone the day began in.
  return zonedInstant(key, minutes, zoneAt(dayStart(key)));
}

/**
 * The moment with this clock time nearest to ref (at most 12 hours away).
 * Used when an existing time is edited, so it stays on its own day.
 */
export function nearestTime(ref, minutes) {
  const key = dayKey(ref);
  return [addDays(key, -1), key, addDays(key, 1)].map((k) => at(k, minutes))
    .reduce((best, ts) => (Math.abs(ts - ref) < Math.abs(best - ref) ? ts : best));
}

/** Local minutes since midnight. */
export function minutesOfDay(ts) {
  const p = parts(ts);
  return p.hh * 60 + p.mm;
}

/** Drop seconds and milliseconds, so logged times match what is displayed. */
export function floorToMinute(ts) {
  return Math.floor(ts / MIN) * MIN;
}

export function addDays(key, n) {
  const { y, m, d } = keyParts(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(key) {
  const { y, m, d } = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Sunday to Thursday. */
export function isWorkweekday(key) {
  return weekday(key) <= 4;
}

/** The Sunday that starts the week containing this day. */
export function weekStart(key) {
  return addDays(key, -weekday(key));
}

/** Calendar days from a to b, whatever the length of the days between. */
export function daysBetween(a, b) {
  const x = keyParts(a);
  const y = keyParts(b);
  return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / DAY);
}

export function fmtTime(ts) {
  const p = parts(ts);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function fmtMinutes(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const weekdayName = (key) => WEEKDAYS[weekday(key)];
export const weekdayShort = (key) => WEEKDAYS[weekday(key)].slice(0, 3);

/** 'Friday 25 September' */
export function fmtDayLong(key) {
  const { m, d } = keyParts(key);
  return `${weekdayName(key)} ${d} ${MONTHS[m - 1]}`;
}

/** '25 September' */
export function fmtDateLong(key) {
  const { m, d } = keyParts(key);
  return `${d} ${MONTHS[m - 1]}`;
}

/** 'Fri 25 Sep' */
export function fmtDayShort(key) {
  const { m, d } = keyParts(key);
  return `${weekdayShort(key)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** 'Sep 2026' */
export function fmtMonthYear(key) {
  const { y, m } = keyParts(key);
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** '25 Sep' */
export function fmtDayMonth(key) {
  const { m, d } = keyParts(key);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** '20 to 26 September' or '27 September to 3 October' */
export function fmtWeekRange(startKey) {
  const endKey = addDays(startKey, 6);
  const a = keyParts(startKey);
  const b = keyParts(endKey);
  if (a.m === b.m) return `${a.d} to ${b.d} ${MONTHS[b.m - 1]}`;
  return `${a.d} ${MONTHS[a.m - 1]} to ${b.d} ${MONTHS[b.m - 1]}`;
}

/** '3 h 52 min', '52 min', '4 h' */
export function fmtDuration(ms) {
  const total = Math.round(Math.max(0, ms) / MIN);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Elapsed time for margin notes: '19 h 20 min', or '6 days 12 h' past two days. */
export function fmtElapsed(ms) {
  if (ms < 2 * DAY) return fmtDuration(ms);
  const hours = Math.floor(ms / HOUR);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} days ${rest} h` : `${days} days`;
}

/**
 * A duration as a figure, in parts of [number, unit] so the units can be set
 * small: [['15', 'h'], ['10', 'm']], [['45', 'm']], and past two days
 * [['6', ' days'], ['12', 'h']], rounded as fmtElapsed rounds.
 */
export function durationParts(ms) {
  if (ms >= 2 * DAY) {
    const hours = Math.floor(ms / HOUR);
    const rest = hours % 24;
    const days = [String(Math.floor(hours / 24)), ' days'];
    return rest ? [days, [String(rest), 'h']] : [days];
  }
  const total = Math.round(Math.max(0, ms) / MIN);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return [[String(m), 'm']];
  if (m === 0) return [[String(h), 'h']];
  return [[String(h), 'h'], [String(m), 'm']];
}

/** A duration as figure text: '15h 10m', '45m', '6 days 12h'. */
export const fmtFigure = (ms) => durationParts(ms).map(([n, unit]) => n + unit).join(' ');

/** Countdown 'H:MM', rounded up so it reads 0:00 only at the deadline. */
export function fmtCountdown(ms) {
  const mins = Math.max(0, Math.ceil(ms / MIN));
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
}

/** Short timer 'M:SS', rounded up. */
export function fmtTimer(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
}

/** Time relative to today: '21:05', '21:05 yesterday', '21:05 Thu 24 Sep'. */
/**
 * A time as seen from a record's own day: 01:30 after midnight reads
 * '01:30 next day', whatever today is.
 */
export function fmtOnDay(ts, key) {
  const k = dayKey(ts);
  if (k === key) return fmtTime(ts);
  if (k === addDays(key, 1)) return `${fmtTime(ts)} next day`;
  return `${fmtTime(ts)} ${fmtDayShort(k)}`;
}

export function fmtWhen(ts, todayKey) {
  const k = dayKey(ts);
  if (k === todayKey) return fmtTime(ts);
  if (k === addDays(todayKey, -1)) return `${fmtTime(ts)} yesterday`;
  if (k === addDays(todayKey, 1)) return `${fmtTime(ts)} tomorrow`;
  return `${fmtTime(ts)} ${fmtDayShort(k)}`;
}
