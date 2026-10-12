// Sheets: bottom sheets on ink, or a full-screen flow. Soft fades only.

import { h, clear, fadeIn, fadeOut } from './dom.js';

let current = null;

const root = () => document.getElementById('sheet-root');

export function isSheetOpen() {
  return !!current;
}

export function currentSheet() {
  return current;
}

/**
 * build(api) -> Node
 * opts: { full, label, name, onClose, dismissible = true }
 * api: { close(), rerender(), replace(build), el, name }
 */
export function openSheet(build, opts = {}) {
  if (current) closeNow();
  const r = root();
  const sheet = h('div', {
    class: `sheet${opts.full ? ' full' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': opts.label || 'Details',
    'data-sheet': opts.name || '',
    tabindex: '-1',
  });
  let builder = build;
  const api = {
    el: sheet,
    name: opts.name || '',
    async close() {
      if (current !== entry) return;
      current = null;
      r.inert = true; // nothing in a fading sheet can be tapped
      await fadeOut(r);
      if (current) return; // another sheet opened meanwhile
      clear(r);
      r.hidden = true;
      r.inert = false;
      document.documentElement.classList.remove('locked');
      if (opts.onClose) opts.onClose();
    },
    rerender() {
      const y = sheet.scrollTop;
      clear(sheet);
      sheet.append(builder(api));
      sheet.scrollTop = y;
    },
    replace(next) {
      builder = next;
      clear(sheet);
      sheet.append(fadeIn(builder(api)));
      sheet.scrollTop = 0;
    },
  };
  const entry = { api, opts };
  sheet.append(builder(api));
  clear(r);
  if (!opts.full) {
    r.append(h('div', { class: 'scrim', onclick: () => { if (opts.dismissible !== false) api.close(); } }));
  }
  r.append(sheet);
  r.hidden = false;
  r.inert = false;
  fadeIn(r);
  document.documentElement.classList.add('locked');
  current = entry;
  // Move focus into the sheet so VoiceOver reads it, without popping the keyboard.
  sheet.focus({ preventScroll: true });
  return api;
}

/** Closes without animation (used when replacing a sheet). */
export function closeNow() {
  if (!current) return;
  const { opts } = current;
  current = null;
  const r = root();
  clear(r);
  r.hidden = true;
  r.inert = false;
  document.documentElement.classList.remove('locked');
  if (opts.onClose) opts.onClose();
}

export function closeSheet() {
  if (current) return current.api.close();
  return Promise.resolve();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current && current.opts.dismissible !== false) current.api.close();
});

/** Standard sheet header: label on the left, Close on the right. */
export function sheetHead(api, label, closeLabel = 'Close') {
  return h('div', { class: 'sheet-head' },
    h('div', { class: 'label' }, label),
    h('button', { type: 'button', class: 'btn-2', 'data-action': 'close-sheet', onclick: () => api.close() }, closeLabel));
}
