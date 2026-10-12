// The first-run welcome: a short full sheet on a fresh install that sets the
// goal and the planned start times and shows how to add Sabr to the Home
// Screen. It shows once; Done and Skip both note that it was seen. It writes
// only what More writes (the goal, the two planned times) plus welcomedAt.

import { h } from './dom.js';
import { button, timeField } from './components.js';
import { openSheet } from './sheet.js';
import { ringsSvg, RING } from './rings.js';
import * as store from '../store.js';
import { fmtMinutes, toMinutes } from '../core/time.js';
import { goalControls } from './goal.js';
import { homeScreenSteps } from './help.js';
import { isStandalone } from './more.js';

const SEEN_KEY = 'sabr.welcomed';
const LOGS = ['days', 'meals', 'outside', 'temptations', 'weights'];

/**
 * Whether a fresh install should see the welcome: never welcomed, nothing
 * logged and no goal set. A restored backup has data, so it never shows then.
 */
export function needsWelcome(state) {
  if (!state || !state.settings) return false;
  if (state.settings.welcomedAt) return false;
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return false;
  } catch { /* storage blocked: the saved setting decides */ }
  if (LOGS.some((k) => state[k] && state[k].size)) return false;
  return !(state.settings.goalChanges || []).length;
}

/**
 * Sabr's three rings as empty tracks in their own tints (fast, window,
 * fullness), with no data. With draw, each track draws round from 12
 * o'clock, outer to inner, once the sheet has slid in (CSS stops it under
 * Reduce Motion).
 */
function welcomeRings(draw) {
  const zero = { frac: 0 };
  const svg = ringsSvg({ fast: zero, win: zero, full: zero }, { size: RING.md.size, cls: 'welcome-rings', key: 'welcome' });
  if (!draw) return svg;
  const c = svg.viewBox.baseVal.width / 2;
  ['fast', 'win', 'full'].forEach((kind, i) => {
    const track = svg.querySelector(`.ring-${kind} > circle`);
    if (!track) return;
    track.setAttribute('pathLength', '1');
    track.setAttribute('stroke-dasharray', '1 1');
    track.setAttribute('stroke-dashoffset', '0');
    track.setAttribute('transform', `rotate(-90 ${c} ${c})`);
    track.classList.add('ring-draw', 'welcome-track');
    track.style.setProperty('--from', '1');
    track.style.setProperty('--delay', `calc(var(--dur-sheet) + var(--delay-ring-step) * ${i})`);
  });
  return svg;
}

/** Opens the welcome over the screen. */
export function showWelcome(app) {
  const steps = isStandalone() ? ['goal', 'planned'] : ['goal', 'planned', 'home'];
  let index = 0;
  let api = null;
  let done = false;
  // The rings draw the first time step 1 shows, not when a goal choice redraws it.
  let ringsDrawn = false;

  // Escape acts as Skip, wherever focus is (a choice redrawn drops it to the page).
  const onKey = (e) => {
    if (e.key === 'Escape' && !done) {
      e.preventDefault();
      finish();
    }
  };
  const finish = async () => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey);
    // The welcome always closes: if the save fails, the flag below still keeps it away.
    try { await store.setSettings({ welcomedAt: Date.now() }); } catch { /* the flag is enough */ }
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* the saved setting is enough */ }
    await api.close();
    // Focus lands on the screen's title, so VoiceOver starts there.
    const title = document.querySelector('#view .head h1');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  };
  const go = (to) => {
    const dir = to > index ? 'forward' : 'back';
    index = to;
    api.replace(build, { dir });
  };

  const head = () => h('div', { class: 'sheet-head' },
    h('div', { class: 'label welcome-step', 'data-testid': 'welcome-step' }, `Step ${index + 1} of ${steps.length}`),
    button('Skip', finish, { kind: 'secondary', name: 'welcome-skip' }));
  const back = () => button('Back', () => go(index - 1), { kind: 'outline', name: 'welcome-back' });
  const forward = () => (index === steps.length - 1
    ? button('Done', finish, { name: 'welcome-done' })
    : button('Next', () => go(index + 1), { name: 'welcome-next' }));

  const pages = {
    goal: (a) => {
      const draw = !ringsDrawn;
      ringsDrawn = true;
      return {
        body: [
          h('h1', { class: 'welcome-title' }, 'Welcome to Sabr'),
          h('p', { class: 'welcome-lead' }, 'Choose your goal. You can change it any time in More.'),
          welcomeRings(draw),
          goalControls(app, () => a.rerender(), { announce: false }),
        ],
        actions: button('Next', () => go(index + 1), { block: true, name: 'welcome-next' }),
      };
    },
    planned: () => {
      const s = store.state.settings;
      const wheel = (label, key) => timeField({
        label,
        minutes: toMinutes(s[key]),
        name: key,
        onChange: (m) => store.setSettings({ [key]: fmtMinutes(m) }),
      });
      return {
        body: [
          h('h1', { class: 'welcome-title' }, 'When your window opens'),
          h('p', { class: 'welcome-lead' }, 'The time you plan to open your eating window. Change it any time in More.'),
          h('div', { class: 'field-pair welcome-times' }, wheel('Workdays', 'workdayStart'), wheel('Weekends', 'weekendStart')),
          h('p', { class: 'caption' }, 'Workdays run Sunday to Thursday; weekends are Friday and Saturday.'),
        ],
        actions: h('div', { class: 'btn-pair' }, back(), forward()),
      };
    },
    home: () => ({
      body: [
        h('h1', { class: 'welcome-title' }, 'Add Sabr to your Home Screen'),
        homeScreenSteps(),
      ],
      actions: h('div', { class: 'btn-pair' }, back(), forward()),
    }),
  };

  function build(a) {
    const name = steps[index];
    const page = pages[name](a);
    return {
      head: head(),
      body: h('div', { class: 'welcome-page', 'data-step': name }, ...page.body),
      actions: page.actions,
    };
  }

  // The welcome opens over Today, whatever address the app was opened at,
  // except Weight: a weight link that imported nothing leaves its paste box there.
  const routeName = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (routeName && routeName !== 'today' && routeName !== 'weight') app.go('today');
  api = openSheet(build, { full: true, name: 'welcome', label: 'Welcome', dismissible: false });
  document.addEventListener('keydown', onKey);
}
