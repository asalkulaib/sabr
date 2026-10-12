// Imports weight data from a link, the clipboard or a paste.
// Messages carry counts only, never a weight.

import * as store from './store.js';
import { diffEntries, looksLikePounds, parseImport } from './core/weight.js';
import { dayKey, now } from './core/time.js';

const entries = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** Resolves with { ok, message, imported }. */
export async function importWeightText(text) {
  const parsed = parseImport(text, dayKey(now()));
  if (!parsed) return { ok: false, message: 'No weight data found.', imported: 0 };
  if (!parsed.entries.size) {
    return {
      ok: false,
      imported: 0,
      message: parsed.skipped
        ? `Nothing imported. ${entries(parsed.skipped)} skipped: check that Health uses kg and the iPhone uses the Gregorian calendar.`
        : 'No weight data found.',
    };
  }
  if (looksLikePounds(store.state.weights, parsed.entries)) {
    return {
      ok: false,
      imported: 0,
      message: 'Nothing imported: these look like pounds. In the Health app, set the weight unit to kg, then run the Shortcut again.',
    };
  }
  const diff = diffEntries(store.state.weights, parsed.entries);
  await store.saveWeights(parsed.entries);
  const imported = diff.added + diff.updated;
  const parts = [imported ? `Imported ${entries(imported)}.` : 'Nothing new to import.'];
  if (diff.unchanged) parts.push(`${diff.unchanged} already saved.`);
  if (parsed.skipped) parts.push(`${parsed.skipped} skipped.`);
  return { ok: true, message: parts.join(' '), imported };
}
