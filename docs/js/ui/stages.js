// The fasting stages sheet: the six stages one at a time, and each stage's
// longer page (Read more). Today's rings and stage panel live in
// today-parts.js. The stages are never a target.

import { h } from './dom.js';
import { button } from './components.js';
import { openSheet, sheetHead } from './sheet.js';
import { AUTOPHAGY_NOTE, SOURCES, STAGES, VARIATION_NOTE } from '../core/stages.js';
import { STAGE_MORE, citeBy, stageSources } from '../core/stage-more.js';
import { stageGlyph } from './icons.js';

// The hours of each stage, short enough for the line across the sheet.
const SHORT_HOURS = { digesting: '0–4 h', settling: '4–12 h', switch: '12–24 h', ketones: '24–48 h', brain: '48–72 h', sparing: '72 h+' };

/**
 * The stages one at a time: all six along a line across the top, three to
 * a view, the one the fast is in now ringed in the fast's red, and a card for each below,
 * each a shade deeper, from soft grey to ink. Swipe the line, the cards, or tap
 * a stage; the sheet opens on the stage the fast is in now. Read more on a card
 * turns the sheet to that stage's longer page, and Back returns to its card.
 */
export function showStagesSheet(currentKey = null) {
  openSheet((api) => stagesView(api, currentKey, currentKey), { name: 'stages', label: 'Fasting stages' });
}

/** The line and the cards, opened on the stage openKey. */
function stagesView(api, currentKey, openKey) {
  const readMore = (st) => api.replace(() => stageMore(api, st, currentKey));
  const cards = h('ul', { class: 'stage-cards', 'data-testid': 'stage-list' }, STAGES.map((st) => h('li', {
    class: `stage-card s-${st.key}`,
    'data-stage': st.key,
  },
    stageHead(st, currentKey),
    h('h2', { class: 'h2' }, st.name),
    h('p', { class: 'gap-s' }, st.text),
    h('div', { class: 'stage-more-row' }, moreButton(st, readMore)))));
  const stops = STAGES.map((st) => h('button', {
    type: 'button',
    class: `stage-stop${st.key === currentKey ? ' now' : ''}`,
    'data-action': `stage-${st.key}`,
    'aria-label': `${st.name}, ${st.range}${st.key === currentKey ? ', now' : ''}`,
    onclick: () => show(STAGES.indexOf(st), true),
  },
    h('span', { class: `disc s-${st.key}` }, stageGlyph(st.key)),
    h('span', { class: 'name' }, st.name),
    h('span', { class: 'hrs' }, SHORT_HOURS[st.key])));
  // Three stages show at a time; the line swipes on its own, and follows the card shown.
  const line = h('div', { class: 'stage-line', role: 'group', 'aria-label': 'Stages', 'data-testid': 'stage-line' }, h('div', { class: 'stage-track' }, stops));
  const motion = (smooth) => (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto');
  let marked = -1;
  const mark = (i, smooth = true) => {
    // A timer or a frame can outlive the sheet, or the view Read more replaced.
    if (!line.isConnected || !stops[i]) return;
    stops.forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
    if (i === marked) return;
    marked = i;
    const b = stops[i];
    line.scrollTo({ left: b.offsetLeft - (line.clientWidth - b.offsetWidth) / 2, behavior: motion(smooth) });
  };
  const step = () => (cards.children[1] ? cards.children[1].offsetLeft - cards.children[0].offsetLeft : cards.clientWidth);
  const shownCard = () => Math.max(0, Math.min(STAGES.length - 1, Math.round(cards.scrollLeft / step())));
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
      const i = shownCard();
      if (target !== null && i !== target) return;
      target = null;
      mark(i);
    });
  }, { passive: true });
  const start = Math.max(0, STAGES.findIndex((st) => st.key === openKey));
  stops.forEach((b, j) => b.setAttribute('aria-current', String(j === start)));
  // Open on the stage asked for, once the cards and the line have their width.
  requestAnimationFrame(() => show(start, false));
  return h('div', {},
    sheetHead(api, 'Fasting stages'),
    h('p', {}, 'Typical changes after your last bite, from human studies. Swipe the stages or the cards, or tap a stage. Read more opens the full story of a stage.'),
    line,
    cards,
    h('p', { class: 'small quiet gap' }, VARIATION_NOTE),
    h('section', { class: 'section gap' },
      h('div', { class: 'label' }, 'Autophagy'),
      h('p', { class: 'gap-s', 'data-testid': 'autophagy-note' }, AUTOPHAGY_NOTE)),
    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Sources'),
      h('ol', { class: 'steps gap-s small' }, SOURCES.map((src) => h('li', {}, h('span', {}, src))))));
}

/** A card's top line: its hours, and Now on the stage the fast is in. */
function stageHead(st, currentKey) {
  return h('div', { class: 'stage-card-head' },
    h('div', { class: 'label' }, st.range),
    st.key === currentKey ? h('span', { class: 'now-badge', 'data-testid': 'stage-now' }, 'Now') : null);
}

function moreButton(st, readMore) {
  const b = button('Read more', () => readMore(st), { kind: 'outline', name: `more-${st.key}` });
  b.setAttribute('aria-label', `Read more about ${st.name}`);
  return b;
}

/**
 * One stage at length: what happens in the body, what the studies found,
 * plain advice, and the studies it draws on, by name only (no links: the
 * app never leaves itself). Back returns to the cards at this stage.
 */
function stageMore(api, st, currentKey) {
  const more = STAGE_MORE[st.key];
  const back = (name) => button('Back to the stages', () => api.replace(() => stagesView(api, currentKey, st.key)), { kind: 'outline', name });
  const part = (label, ...body) => h('section', { class: 'section' }, h('div', { class: 'label' }, label), ...body);
  return h('div', { 'data-testid': 'stage-more', 'data-stage': st.key },
    sheetHead(api, 'Fasting stages'),
    back('stages-back'),
    h('div', { class: `stage-card stage-hero s-${st.key}` },
      stageHead(st, currentKey),
      h('h2', { class: 'h2' }, st.name),
      h('p', { class: 'gap-s' }, st.text)),
    part('What happens', ...more.body.map((t) => h('p', { class: 'gap-s' }, t))),
    part('What the studies found', h('ul', { class: 'findings gap-s', 'data-testid': 'stage-findings' }, more.findings.map((f) => h('li', {},
      h('p', {}, f.text),
      h('p', { class: 'small quiet' }, citeBy(f.by)))))),
    part('Good to know', ...more.good.map((t) => h('p', { class: 'gap-s' }, t))),
    part('Sources', h('ol', { class: 'steps gap-s small' }, stageSources(st.key).map((src) => h('li', {}, h('span', {}, src))))),
    h('div', { class: 'gap' }, back('stages-back-end')));
}
