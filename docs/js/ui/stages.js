// The fasting stages sheet: the six stages one at a time, and each stage's
// longer page (Read more). Today's rings and stage panel live in
// today-parts.js. The stages are never a target.

import { h } from './dom.js';
import { button, key, legend } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import { AUTOPHAGY_NOTE, SOURCES, STAGES, VARIATION_NOTE } from '../core/stages.js';
import { STAGE_MORE, citeBy, stageSources } from '../core/stage-more.js';
import { stageDisc } from './icons.js';

// The hours of each stage, short enough for the line across the sheet.
const SHORT_HOURS = { digesting: '0–4 h', settling: '4–12 h', switch: '12–24 h', ketones: '24–48 h', brain: '48–72 h', sparing: '72 h+' };

// Disc sizes (the stage disc's own sizes): on the line, and at the top of a stage's page.
const LINE_DISC = 52;
const PAGE_DISC = 56;

/**
 * The stages as a journey: all six along a line across the top, about three
 * and a half to a view, with the fast's red running from the first to the
 * stage the fast is in now, and a card for each below. Swipe the line, the
 * cards, or tap a stage; the sheet opens on the stage the fast is in now.
 * Read more on a card turns the sheet to that stage's longer page, and Back
 * returns to its card.
 */
export function showStagesSheet(currentKey = null) {
  openSheet((api) => stagesView(api, currentKey, currentKey), { name: 'stages', label: 'Fasting stages' });
}

/** passed, now or ahead: where a stage stands against the one the fast is in. */
function stateOf(st, currentKey) {
  const now = STAGES.findIndex((x) => x.key === currentKey);
  const i = STAGES.indexOf(st);
  if (now < 0) return 'ahead';
  return i < now ? 'passed' : i === now ? 'now' : 'ahead';
}

/** The Now tag; on a card and on a stage's page it carries the stage-now hook. */
function nowTag(testid = null) {
  return h('span', { class: 'now-tag', 'data-testid': testid, 'aria-hidden': testid ? null : 'true' }, 'Now');
}

/** The line and the cards, opened on the stage openKey. */
function stagesView(api, currentKey, openKey) {
  const readMore = (st) => api.replace(() => stageMore(api, st, currentKey), { dir: 'forward' });
  const nowIndex = STAGES.findIndex((st) => st.key === currentKey);
  const cards = h('ul', { class: 'stage-cards', role: 'list', 'data-testid': 'stage-list' }, STAGES.map((st) => h('li', {
    class: 'stage-card',
    'data-stage': st.key,
  },
    stageHead(st, currentKey),
    h('h2', { class: 'stage-name' }, st.name),
    h('p', { class: 'stage-text' }, st.text),
    h('div', { class: 'stage-more-row' }, moreButton(st, readMore)))));
  const stops = STAGES.map((st) => {
    // The line's icons are the sheet's six stage icons (data-stage-icon).
    const disc = stageDisc(st.key, { size: LINE_DISC, state: stateOf(st, currentKey), live: false, mark: true });
    return h('button', {
      type: 'button',
      class: `stage-stop${st.key === currentKey ? ' now' : ''}`,
      'data-action': `stage-${st.key}`,
      'aria-label': `${st.name}, ${st.range}${st.key === currentKey ? ', now' : ''}`,
      onclick: () => show(STAGES.indexOf(st), true),
    },
      h('span', { class: 'stop-mark' }, disc, st.key === currentKey ? nowTag() : null),
      h('span', { class: 'name' }, st.name),
      h('span', { class: 'hrs tabular' }, SHORT_HOURS[st.key]));
  });
  // The fast so far, in red, from the first stage to the one it is in.
  const track = h('div', { class: 'stage-track' },
    nowIndex > 0 ? h('span', { class: 'stage-progress', 'aria-hidden': 'true' }) : null,
    stops);
  if (nowIndex > 0) track.style.setProperty('--now-x', `${(nowIndex * 100) / STAGES.length}%`);
  // About three and a half stages show at a time; the line swipes on its own, and follows the card shown.
  const line = h('div', { class: 'stage-line', role: 'group', 'aria-label': 'Stages', 'data-testid': 'stage-line' }, track);
  line.style.setProperty('--disc', `${LINE_DISC}px`);
  const motion = (smooth) => (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto');
  let marked = -1;
  const mark = (i, smooth = true) => {
    // A timer or a frame can outlive the sheet, or the view Read more replaced.
    if (!line.isConnected || !stops[i]) return;
    stops.forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
    if (i === marked) return;
    marked = i;
    const b = stops[i];
    line.scrollTo({ left: track.offsetLeft + b.offsetLeft - (line.clientWidth - b.offsetWidth) / 2, behavior: motion(smooth) });
  };
  const step = () => (cards.children[1] ? cards.children[1].offsetLeft - cards.children[0].offsetLeft : cards.clientWidth);
  const shownCard = () => Math.max(0, Math.min(STAGES.length - 1, Math.round(cards.scrollLeft / step())));
  // The list is as tall as the card in view, so the note under it follows the
  // card's last line. Between two cards it eases from one height to the other.
  const fit = () => {
    if (!cards.isConnected) return;
    const at = Math.max(0, Math.min(STAGES.length - 1, cards.scrollLeft / step()));
    const i = Math.floor(at);
    const a = cards.children[i].offsetHeight;
    const b = cards.children[Math.min(i + 1, STAGES.length - 1)].offsetHeight;
    cards.style.setProperty('--cards-h', `${Math.round(a + (b - a) * (at - i))}px`);
  };
  // A card's height changes with the width and the fonts.
  if (typeof ResizeObserver === 'function') {
    const watch = new ResizeObserver(() => (cards.isConnected ? fit() : watch.disconnect()));
    [...cards.children].forEach((c) => watch.observe(c));
  }
  // While the cards glide to a tapped stage, the line waits for them rather than following each card passed.
  let target = null;
  let settle = 0;
  function show(i, smooth) {
    if (!cards.isConnected) return;
    target = i;
    clearTimeout(settle);
    settle = setTimeout(() => { target = null; mark(shownCard()); }, 800);
    cards.scrollTo({ left: i * step(), behavior: motion(smooth) });
    marked = -1; // a tapped stage is centred even when it is the one marked
    mark(i, smooth);
  }
  // Swiping moves the mark along the line.
  let frame = 0;
  cards.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      fit();
      const i = shownCard();
      if (target !== null && i !== target) return;
      target = null;
      mark(i);
    });
  }, { passive: true });
  const start = Math.max(0, STAGES.findIndex((st) => st.key === openKey));
  stops.forEach((b, j) => b.setAttribute('aria-current', String(j === start)));
  // Open on the stage asked for, once the cards and the line have their width.
  requestAnimationFrame(() => { show(start, false); fit(); });
  const body = h('div', { class: 'stages-view' },
    h('p', { class: 'stages-intro' }, 'Typical changes after your last bite, from human studies. Swipe the stages or the cards, or tap a stage. Read more opens the full story of a stage.'),
    line,
    // The legend names the red bar, so it shows only once there is one.
    nowIndex > 0 ? legend([[key('progress-fast'), 'Fast']], null) : null,
    cards,
    h('p', { class: 'stages-variation' }, VARIATION_NOTE),
    h('section', { class: 'stages-part' },
      h('h3', {}, 'Autophagy'),
      h('p', { 'data-testid': 'autophagy-note' }, AUTOPHAGY_NOTE)),
    h('section', { class: 'stages-part' },
      h('h3', {}, 'Sources'),
      sourceList(SOURCES)));
  return { head: sheetHead(api, 'Fasting stages'), body };
}

/** A card's top line: its hours, and Now on the stage the fast is in. */
function stageHead(st, currentKey) {
  return h('div', { class: 'stage-card-head' },
    h('span', { class: 'stage-range' }, st.range),
    st.key === currentKey ? nowTag('stage-now') : null);
}

function moreButton(st, readMore) {
  const b = button('Read more', () => readMore(st), { kind: 'outline', name: `more-${st.key}` });
  b.setAttribute('aria-label', `Read more about ${st.name}`);
  return b;
}

/**
 * The studies, numbered, each with its authors (through "et al.") in ink so
 * the eye finds who wrote it. The words are the same as the source's.
 */
function sourceList(sources) {
  return h('ol', { class: 'stage-sources', role: 'list' }, sources.map((src) => {
    const cut = src.indexOf(' et al.');
    const by = cut > 0 ? src.slice(0, cut + ' et al.'.length) : '';
    return h('li', {}, h('span', {}, by ? h('span', { class: 'by' }, by) : null, by ? src.slice(by.length) : src));
  }));
}

/**
 * One stage at length: what happens in the body, what the studies found,
 * plain advice, and the studies it draws on, by name only (no links: the
 * app never leaves itself). Back returns to the cards at this stage.
 */
function stageMore(api, st, currentKey) {
  const more = STAGE_MORE[st.key];
  const back = () => api.replace(() => stagesView(api, currentKey, st.key), { dir: 'back' });
  const part = (title, ...content) => h('section', { class: 'more-part' }, h('h3', {}, title), ...content);
  // Only the current stage is coloured here: its Now tag names the colour.
  const disc = stageDisc(st.key, { size: PAGE_DISC, state: st.key === currentKey ? 'now' : 'ahead', live: false });
  const head = sheetHead(api, 'Fasting stages', { back: { label: 'Back to the stages', name: 'stages-back', onClick: back } });
  const body = h('div', { class: 'stage-page', 'data-testid': 'stage-more', 'data-stage': st.key },
    h('div', { class: 'stage-page-hero' },
      h('p', { class: 'kicker' }, 'Fasting stages'),
      h('div', { class: 'stage-page-mark' }, disc, st.key === currentKey ? nowTag('stage-now') : null),
      h('p', { class: 'stage-range' }, st.range),
      h('h2', {}, st.name),
      h('p', { class: 'lede' }, st.text)),
    part('What happens', ...more.body.map((t) => h('p', {}, t))),
    part('What the studies found', h('ul', { class: 'findings', role: 'list', 'data-testid': 'stage-findings' }, more.findings.map((f) => h('li', {},
      h('p', {}, f.text),
      h('p', { class: 'cite' }, citeBy(f.by)))))),
    part('Good to know', h('ul', { class: 'advice', role: 'list' }, more.good.map((t) => h('li', {}, t)))),
    part('Sources', sourceList(stageSources(st.key))),
    button('Back to the stages', back, { kind: 'outline', block: true, name: 'stages-back-end' }));
  return { head, body };
}
