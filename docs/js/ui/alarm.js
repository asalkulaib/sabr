// Alarms while Fast is closed. A web app cannot ring on its own, so with
// Alarms on, Fast hands the minutes to a Shortcut named "Fast Timer", which
// starts an iPhone Clock timer when a meal is finished: the 20-minute
// fullness check, for every meal, the first one of the day included.

import * as store from '../store.js';

export const ALARM_SHORTCUT = 'Fast Timer';

export function alarmUrl(minutes) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(ALARM_SHORTCUT)}&input=text&text=${Math.max(1, Math.round(minutes))}`;
}

/** Starts a timer through the Shortcut, when Alarms is on. */
export function ringIn(minutes) {
  if (!store.state.settings.alarms || !(minutes > 0)) return;
  const url = alarmUrl(minutes);
  // Tests record the address instead of leaving the page.
  if (window.__fastOpened) window.__fastOpened.push(url);
  else window.location.href = url;
}
