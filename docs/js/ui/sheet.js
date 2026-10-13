// Sheets: a bottom sheet that slides up over a scrim, or a full-screen flow.
// Each sheet is a flex column: a fixed head (the title and Close), a body
// that is the only thing that scrolls, and an optional fixed footer for the
// consequences and the actions. Under Reduce Motion they fade.

import { h, clear } from './dom.js';
import { button } from './components.js';

let current = null;
// What opened the sheet, to get focus back on close: the element, and its
// hooks, so a screen redrawn by a save can still be found again.
let opener = null;
// iOS Safari does not focus a button on tap, so the last control tapped
// stands in for the opener when nothing has focus.
let lastTap = null;
document.addEventListener('click', (e) => {
  const t = e.target instanceof Element ? e.target.closest('button, [role="button"], a[href]') : null;
  if (t && !(root() && root().contains(t))) lastTap = { el: t, at: Date.now() };
}, true);

const root = () => document.getElementById('sheet-root');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The page behind a sheet can be neither tapped nor reached by VoiceOver. */
function setBehind(inert) {
  for (const id of ['view', 'tabbar']) {
    const el = document.getElementById(id);
    if (el) el.inert = inert;
  }
}

export function isSheetOpen() {
  return !!current;
}

export function currentSheet() {
  return current;
}

/**
 * A builder that still puts its sheetHead first in its body (directly, or
 * first in its first child) has that head lifted out, so it stays put while
 * the body scrolls, and a tested root never holds the head's h2.
 */
function liftHead(body) {
  if (!body || typeof body.firstElementChild === 'undefined') return null;
  const first = body.firstElementChild;
  const head = first && first.classList.contains('sheet-head') ? first
    : first && first.firstElementChild && first.firstElementChild.classList.contains('sheet-head') ? first.firstElementChild
      : null;
  if (head) head.remove();
  return head;
}

/**
 * What a builder returns, laid out: a node is the body; { head, body, actions }
 * puts the head above the body and the actions below it.
 */
function layout(built, { dir = null, enter = false } = {}) {
  const parts = built instanceof Node || built == null ? { body: built } : built;
  const head = parts.head || liftHead(parts.body);
  const body = h('div', { class: enter ? 'sheet-body enter' : 'sheet-body', 'data-dir': dir },
    h('div', { class: 'sheet-sentinel', 'data-edge': 'top', 'aria-hidden': 'true' }),
    parts.body,
    h('div', { class: 'sheet-sentinel', 'data-edge': 'end', 'aria-hidden': 'true' }));
  return [
    head || null,
    body,
    parts.actions ? h('div', { class: 'sheet-actions' }, parts.actions) : null,
  ].filter(Boolean);
}

/** A hairline under the head once the body scrolls, and over the footer while more lies beneath it. */
function watchEdges(sheet) {
  if (sheet.__edges) sheet.__edges.disconnect();
  const body = sheet.querySelector(':scope > .sheet-body');
  if (!body || typeof IntersectionObserver === 'undefined') return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target.dataset.edge === 'top') sheet.classList.toggle('scrolled', !e.isIntersecting);
      else sheet.classList.toggle('more-below', !e.isIntersecting);
    }
  }, { root: body });
  for (const s of body.querySelectorAll(':scope > .sheet-sentinel')) io.observe(s);
  sheet.__edges = io;
}

/**
 * Room at the foot of a sheet for a message, so the message never covers the
 * sheet's words or its actions. Kept for the sheet's whole life, so the sheet
 * never shrinks when the message goes. px is the message's height plus its
 * gap; without it the room is the one-line height (--flash-room).
 */
function holdRoom(sheet, px) {
  const had = sheet.classList.contains('flash-room');
  const held = parseFloat(sheet.style.getPropertyValue('--sheet-flash-room')) || 0;
  if (had && !(px > held)) return;
  // A sheet already on screen grows upward: it glides there, rather than jumps.
  const before = had || !sheet.isConnected ? null : sheet.getBoundingClientRect().top;
  sheet.classList.add('flash-room');
  if (px > held) sheet.style.setProperty('--sheet-flash-room', `${Math.ceil(px)}px`);
  if (before == null || reduced() || typeof sheet.animate !== 'function') return;
  const rise = before - sheet.getBoundingClientRect().top;
  if (rise < 1) return;
  const css = getComputedStyle(document.documentElement);
  sheet.animate([{ transform: `translateY(${rise}px)` }, { transform: 'none' }], {
    duration: parseFloat(css.getPropertyValue('--dur-base')) || 240,
    easing: css.getPropertyValue('--ease-out').trim() || 'ease-out',
  });
}

/**
 * Marks a sheet open or shut. A message on screen sits lower over a sheet
 * than over the tabs: it glides to its new place with the sheet (--dur-sheet
 * as one opens, --dur-base as one closes) instead of jumping in one frame.
 */
function setSheetOpen(on) {
  const html = document.documentElement;
  if (html.classList.contains('sheet-open') === on) return;
  const host = document.getElementById('flash-root');
  const showing = host && host.querySelector('[data-flash]');
  const before = showing ? host.getBoundingClientRect().top : null;
  if (host && typeof host.getAnimations === 'function') for (const a of host.getAnimations()) a.cancel();
  html.classList.toggle('sheet-open', on);
  if (before == null || reduced() || typeof host.animate !== 'function') return;
  const shift = before - host.getBoundingClientRect().top;
  if (Math.abs(shift) < 1) return;
  const css = getComputedStyle(html);
  host.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], {
    duration: parseFloat(css.getPropertyValue(on ? '--dur-sheet' : '--dur-base')) || (on ? 380 : 240),
    easing: css.getPropertyValue('--ease-out').trim() || 'ease-out',
  });
}

/** A message is showing, px tall with its gap: the open sheet keeps room for it. */
export function roomForMessage(px) {
  if (current) holdRoom(current.api.el, px);
}

/** The height of the message on screen now, with its gap, or null. */
function messageRoom() {
  if (!document.body.classList.contains('has-flash')) return null;
  return parseFloat(document.documentElement.style.getPropertyValue('--flash-h')) || 0;
}

/** Focus goes to the sheet's title, or to the body's first heading, so VoiceOver reads it. */
function focusTitle(sheet) {
  const target = sheet.querySelector(':scope > .sheet-head h2')
    || sheet.querySelector(':scope > .sheet-body :is(h1, h2, h3)')
    || sheet;
  if (target !== sheet && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/**
 * build(api) -> Node, or { head, body, actions }
 * opts: { full, label, name, onClose, dismissible = true, flashes }
 * flashes: the sheet shows messages while it stays open (Goal), so it keeps
 * room for one from the start and never changes size for it.
 * api: { close(), rerender(), replace(build, { dir }), el, name }
 */
export function openSheet(build, opts = {}) {
  let from = document.activeElement;
  if ((!from || from === document.body) && lastTap && Date.now() - lastTap.at < 1000) from = lastTap.el;
  if (from && from !== document.body && !(root() && root().contains(from))) {
    opener = { el: from, action: from.getAttribute('data-action') || '', testid: from.getAttribute('data-testid') || '' };
  }
  if (current) closeNow({ keepFocus: true });
  const r = root();
  r.classList.remove('closing');
  const sheet = h('div', {
    class: `sheet${opts.full ? ' full' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': opts.label || 'Details',
    'data-sheet': opts.name || '',
    tabindex: '-1',
  });
  let builder = build;
  const bodyOf = () => sheet.querySelector(':scope > .sheet-body');
  const fill = (options) => {
    clear(sheet);
    sheet.append(...layout(builder(api), options));
    watchEdges(sheet);
  };
  const api = {
    el: sheet,
    name: opts.name || '',
    async close() {
      if (current !== entry) return;
      current = null;
      r.inert = true; // nothing in a closing sheet can be tapped
      r.classList.add('closing');
      setSheetOpen(false);
      await new Promise((resolve) => {
        sheet.addEventListener('animationend', (e) => { if (e.target === sheet) resolve(); });
        sheet.addEventListener('transitionend', (e) => { if (e.target === sheet && e.propertyName === 'opacity') resolve(); });
        setTimeout(resolve, reduced() ? 200 : 320);
      });
      if (current) return; // another sheet opened meanwhile
      if (sheet.__edges) sheet.__edges.disconnect();
      clear(r);
      r.classList.remove('closing');
      r.hidden = true;
      r.inert = false;
      setBehind(false);
      document.documentElement.classList.remove('locked');
      returnFocus();
      if (opts.onClose) opts.onClose();
    },
    /** Draws the same sheet again, keeping where its body was scrolled to. */
    rerender() {
      const by = bodyOf() ? bodyOf().scrollTop : 0;
      fill();
      if (bodyOf()) bodyOf().scrollTop = by;
    },
    /** Turns the sheet to new content; dir ('forward' or 'back') says which way it moves. */
    replace(next, { dir = null } = {}) {
      builder = next;
      fill({ enter: true, dir });
      if (bodyOf()) bodyOf().scrollTop = 0;
      focusTitle(sheet);
    },
  };
  const entry = { api, opts };
  fill();
  // A message already showing (its Undo belongs to the screen behind), or one
  // this sheet will raise while it stays open: the room is there from the start.
  const showing = messageRoom();
  if (showing != null || opts.flashes) holdRoom(sheet, showing || 0);
  clear(r);
  if (!opts.full) {
    r.append(h('div', { class: 'scrim', onclick: () => { if (opts.dismissible !== false) api.close(); } }));
  }
  r.append(sheet);
  r.hidden = false;
  r.inert = false;
  setBehind(true);
  document.documentElement.classList.add('locked');
  setSheetOpen(true);
  current = entry;
  focusTitle(sheet);
  return api;
}

/** Focus goes back to the opener, or, when a save redrew the screen, to the control that took its place. */
function returnFocus() {
  const o = opener;
  opener = null;
  if (!o) return;
  const find = (attr, v) => (v ? document.querySelector(`#view [${attr}="${CSS.escape(v)}"]`) : null);
  const put = () => {
    const el = o.el && o.el.isConnected ? o.el : find('data-testid', o.testid) || find('data-action', o.action);
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  };
  put();
  // A save often redraws the screen just after the sheet has gone: focus
  // follows the opener into the new drawing, for a moment.
  const view = document.getElementById('view');
  if (!view || typeof MutationObserver === 'undefined') return;
  const follow = new MutationObserver(() => {
    if (!current && (!document.activeElement || document.activeElement === document.body)) put();
  });
  follow.observe(view, { childList: true, subtree: true });
  setTimeout(() => follow.disconnect(), 1000);
}

/** Closes without animation (used when replacing a sheet). */
export function closeNow({ keepFocus = false } = {}) {
  if (!current) return;
  const { opts, api } = current;
  current = null;
  const r = root();
  if (api.el.__edges) api.el.__edges.disconnect();
  clear(r);
  r.classList.remove('closing');
  r.hidden = true;
  r.inert = false;
  setBehind(false);
  document.documentElement.classList.remove('locked');
  setSheetOpen(false);
  if (!keepFocus) returnFocus();
  if (opts.onClose) opts.onClose();
}

export function closeSheet() {
  if (current) return current.api.close();
  return Promise.resolve();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current && current.opts.dismissible !== false) current.api.close();
});

/**
 * Standard sheet header: the title on the left, Close on the right. The third
 * argument is the Close label ('Close', 'Later'), or { closeLabel, back }:
 * with back ({ label, name, onClick }) a Back pill takes the title's place
 * (there is no room for both), and the body's own heading carries the words.
 */
export function sheetHead(api, label, closeLabelOrOptions = 'Close') {
  const o = typeof closeLabelOrOptions === 'string' ? { closeLabel: closeLabelOrOptions } : (closeLabelOrOptions || {});
  const { closeLabel = 'Close', back = null } = o;
  let backPill = null;
  if (back) {
    backPill = button(back.label, (e) => back.onClick(e), { kind: 'secondary', name: back.name || 'back', icon: 'chevron-left' });
    backPill.classList.add('back');
  }
  // Close does not wait for the sheet to leave: it never shows as busy.
  return h('div', { class: 'sheet-head' },
    backPill || h('h2', { class: 'sheet-title' }, label),
    button(closeLabel, () => { api.close(); }, { kind: 'secondary', name: 'close-sheet' }));
}
