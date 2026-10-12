// The /import route. strip-hash.js has already taken the payload out of the
// address bar, so the numbers are never shown. This page saves the entries
// and reports counts only.

import * as store from './store.js';
import { importWeightText } from './weight-import.js';
import { h } from './ui/dom.js';
import { weightRing } from './ui/art.js';

const view = document.getElementById('view');

function standalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function run() {
  const payload = window.__fastPayload || '';
  window.__fastPayload = null;
  let message;
  let ok = false;
  try {
    await store.load();
    if (!store.state.settings.installedAt) await store.setSettings({ installedAt: Date.now() });
    if (payload) ({ message, ok } = await importWeightText(payload));
    else message = 'This link holds no weight data.';
  } catch {
    message = 'Sabr could not open its storage here.';
  }
  view.removeAttribute('aria-busy');
  // A saved import leads with the weight's filled disc; a failure says so in words only.
  view.replaceChildren(...[
    h('h1', { class: 't-title-1 import-title' }, 'Weight import'),
    h('div', { class: ok ? 'import-head ok' : 'import-head' },
      ok ? h('span', { class: 'import-glyph' }, weightRing()) : null,
      h('p', { class: ok ? 't-title-2' : 't-title-3', role: 'status', 'data-testid': 'import-result' }, message)),
    h('p', { class: 'import-words' }, 'Sabr shows your 7-day average, counting every weigh-in. Each weigh-in is listed in the CSV export.'),
    standalone()
      ? null
      : h('p', { class: 'callout import-safari' }, 'This page opened in Safari, so it saved to Safari\'s copy of Sabr. The Home Screen app keeps its own data: there, use Import weight on the Weight screen.'),
    h('div', { class: 'import-dock' }, h('a', { class: 'btn block', href: '../#weight', 'data-action': 'open-sabr' }, 'Open Sabr')),
  ].filter(Boolean));
}

run();
