// The /import route. strip-hash.js has already taken the payload out of the
// address bar, so the numbers are never shown. This page saves the entries
// and reports counts only.

import * as store from './store.js';
import { importWeightText } from './weight-import.js';
import { h } from './ui/dom.js';
import { emptyArt } from './ui/art.js';

const view = document.getElementById('view');

function standalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function run() {
  const payload = window.__fastPayload || '';
  window.__fastPayload = null;
  let message;
  try {
    await store.load();
    if (!store.state.settings.installedAt) await store.setSettings({ installedAt: Date.now() });
    message = payload ? (await importWeightText(payload)).message : 'This link holds no weight data.';
  } catch {
    message = 'Sabr could not open its storage here.';
  }
  view.removeAttribute('aria-busy');
  view.replaceChildren(...[
    h('div', { class: 'label' }, 'Weight import'),
    h('p', { class: 'statement gap', role: 'status', 'data-testid': 'import-result' }, message),
    h('p', { class: 'gap' }, 'Sabr shows your 7-day average, counting every weigh-in. Each weigh-in is listed in the CSV export.'),
    standalone()
      ? null
      : h('p', { class: 'small quiet gap' }, 'This page opened in Safari, so it saved to Safari\'s copy of Sabr. The Home Screen app keeps its own data: there, use Import weight on the Weight screen.'),
    h('div', { class: 'gap-l' }, h('a', { class: 'btn block', href: '../#weight', 'data-action': 'open-sabr' }, 'Open Sabr')),
    emptyArt(),
  ].filter(Boolean));
}

run();
