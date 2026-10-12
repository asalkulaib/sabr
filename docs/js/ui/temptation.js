// The temptation flow. Fixed and offline. It holds the line and never argues
// against fasting. Each event records time, trigger and outcome.

import { h, live } from './dom.js';
import { button, choice, missLine, scale, TRIGGER_OPTIONS } from './components.js';
import { RING, progressRing } from './rings.js';
import { openSheet } from './sheet.js';
import * as store from '../store.js';
import { HOUR, MIN, at, fmtDuration, fmtMinutes, fmtTime, fmtTimer, fmtWhen, minutesOfDay, now } from '../core/time.js';
import { CUTOFF_MIN, cutoffApplies, isFlexible, isWorkday, lateNightDay, longFastAhead, plannedStartMin } from '../core/rules.js';
import { energySplit } from '../core/review.js';
import { showStartMealSheet } from './meal.js';
import { nextWindowLine } from './shared.js';

export const SURF_MS = 10 * MIN;
const CHECKPOINTS = [0, 3, 6, 9];
const PROMPTS = [
  'Drink a glass of water, or make an espresso.',
  'Walk. Two minutes is enough.',
  'Breathe out slowly, longer than you breathe in.',
  'Notice where the urge sits. Let it stay there.',
  'It rises, peaks and falls. You are near the end.',
];
const PHRASES = [
  'Not for me right now, thank you.',
  'It looks lovely. Coffee is perfect for me.',
  "I'm fine for now, thank you.",
  "I'll keep you company with a drink.",
];

/**
 * Where the day stands right now: a window open, after today's window,
 * late at night after last night's window, or before today's window.
 * Always read live, so a flow resumed later acts on the current day.
 */
function situation(ctx) {
  if (ctx.openRec) return { kind: 'open', lastDay: ctx.openRec.day };
  const late = lateNightDay(ctx);
  if (late) return { kind: 'late', lastDay: late };
  const rec = ctx.days.get(ctx.todayKey);
  if (rec && rec.firstBite && rec.lastBite) return { kind: 'after', lastDay: ctx.todayKey };
  return { kind: 'before', lastDay: null };
}

export function unfinishedTemptation(ctx) {
  return ctx.temptations
    .filter((t) => !t.outcome && t.trigger && ctx.nowTs - t.startedAt < 3 * HOUR)
    .sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

/**
 * If a window opened after the temptation began, its outcome is already
 * known: held (at or after the planned time) or opened early.
 */
export function knownOutcome(ctx, t) {
  const rec = [...ctx.days.values()].find((r) => r.firstBite && r.firstBite >= t.startedAt - MIN);
  if (!rec) return null;
  const planned = at(rec.day, plannedStartMin(rec.day, rec, ctx.settings));
  return rec.firstBite < planned ? 'opened_early' : 'held';
}

export async function startTemptation(app) {
  const ctx = app.ctx();
  const sit = situation(ctx);
  const rec = await store.addTemptation({
    day: ctx.todayKey,
    startedAt: now(),
    trigger: null,
    context: sit.kind,
    lastDay: sit.lastDay,
    step: 'trigger',
    surfEndsAt: null,
    urges: [],
    outcome: null,
    endedAt: null,
  });
  showFlow(app, rec.id);
  return rec.id;
}

export function resumeTemptation(app, id) {
  showFlow(app, id);
}

function surfState(t, nowTs) {
  const startedAt = t.surfEndsAt - SURF_MS;
  const elapsedMin = Math.floor((nowTs - startedAt) / MIN);
  const rated = new Set((t.urges || []).map((u) => u.min));
  const due = CHECKPOINTS.filter((cp) => cp <= elapsedMin && !rated.has(cp));
  return { startedAt, done: nowTs >= t.surfEndsAt, checkpoint: due.length ? due[due.length - 1] : null };
}

/** Where the urge timer stands, as drawn: done or not, and the rating due. Empty outside the timer. */
function surfSig(id, nowTs) {
  const t = store.state.temptations.get(id);
  if (!t || t.step !== 'surf' || !t.surfEndsAt) return '';
  const st = surfState(t, nowTs);
  return `${st.done}|${st.checkpoint}`;
}

// Where the urge timer stood when each flow last drew (render() notes it), so the
// tick redraws as soon as the timer moves on, and only then: even before the
// first tick (the app reopened after the timer ended), and after any step change.
const drawnSig = new Map();

function showFlow(app, id) {
  let flow = null;
  flow = openSheet((api) => render(app, api, id), {
    full: true,
    name: 'temptation',
    label: 'Tempted',
    tick: (nowTs) => {
      const sig = surfSig(id, nowTs);
      if (sig && sig !== drawnSig.get(id) && flow) flow.rerender();
    },
  });
}

function gains(ctx, sit) {
  const out = [];
  const today = ctx.todayKey;
  const rec = ctx.days.get(today);
  const waiting = sit.kind === 'before' || sit.kind === 'late';
  if (waiting && isWorkday(today, rec) && minutesOfDay(ctx.nowTs) < CUTOFF_MIN) {
    const e = energySplit([...ctx.days.keys()], ctx.days, today);
    out.push(e.without.n >= 2 && e.with.n >= 2
      ? `Energy at 4 PM. On your own record: ${e.without.avg.toFixed(1)} on days with nothing before 4 PM, ${e.with.avg.toFixed(1)} on days with food.`
      : 'Energy at 4 PM. Rate it today at 16:00 and your own record builds.');
  }
  const streak = ctx.streak.current;
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const lastRes = sit.lastDay ? ctx.evaluate(sit.lastDay).result : null;
  // Today, or last night's window just after midnight; a day logged without eating is already a success.
  const todayRes = ctx.evaluate(today).result;
  if (sit.kind === 'after' && lastRes === 'success') out.push(`Today stays a success. Your streak: ${days(streak)}.`);
  else if (sit.kind === 'late' && lastRes === 'success') out.push(`Last night stays a success. Your streak: ${days(streak)}.`);
  else if (sit.kind === 'late' && lastRes === 'miss') out.push('Last night was a miss. Today can start a new streak.');
  else if (lastRes === 'miss') out.push(`${sit.lastDay === today ? 'Today' : 'That day'} is already a miss. ${sit.lastDay === today ? 'Tomorrow' : 'Today'} can start a new streak.`);
  else if (todayRes === 'success') out.push(`Today counts as a success so far. Your streak: ${days(streak)}, today included.`);
  else if (streak > 0) out.push(`Your streak: ${days(streak)}, ${streak + 1} if today holds.`);
  else out.push('Today can start a new streak.');
  const ahead = longFastAhead(ctx);
  if (waiting && ahead) {
    out.push(`Your ${ahead.hours}-hour fast reaches its goal at ${fmtWhen(ahead.at, today)}. Each hour you wait adds to it.`);
  } else if (waiting && isFlexible(today, ctx.settings)) {
    out.push(`A ${Math.round(ctx.windowMsFor(today) / 3600000)}-hour window, whenever you choose. Each hour you wait adds to the fast.`);
  } else if (waiting) {
    const start = plannedStartMin(today, rec, ctx.settings);
    out.push(`A window that fits today: ${fmtMinutes(start)} to ${fmtMinutes(start + ctx.windowMsFor(today) / MIN)}.`);
  }
  return out;
}

/** A step's small label above its headline. */
const kicker = (...text) => h('div', { class: 'label kicker' }, ...text);

/**
 * A step laid out: the fixed head (Back on the left when there is one,
 * Close on the right), the body, and the dock of actions. focus: a step
 * that is only a headline sits at the optical centre.
 */
function stepView(head, body, actions = null, { focus = false, step } = {}) {
  return {
    head,
    body: h('div', { class: focus ? 'tempt-step focus' : 'tempt-step', 'data-step': step }, ...[].concat(body).filter(Boolean)),
    actions: actions ? [].concat(actions).filter(Boolean) : null,
  };
}

/** Two outline actions side by side, sized for half the column. */
const pair = (...buttons) => {
  for (const b of buttons) b.classList.add('sm');
  return h('div', { class: 'btn-pair' }, ...buttons);
};

/** The urge timer: an ink ring that drains as the ten minutes run, the time inside it. */
function urgeTimer(t) {
  const ring = progressRing({ size: RING.focus.size, stroke: RING.focus.stroke, frac: 1 });
  const left = (ts) => Math.max(0, t.surfEndsAt - ts);
  return h('div', { class: 'urge-ring' },
    ring,
    h('div', { class: 'urge-centre' },
      live('div', { class: 'timer tabular', 'data-testid': 'urge-timer' }, (ts) => {
        ring.set(left(ts) / SURF_MS);
        return fmtTimer(t.surfEndsAt - ts);
      }),
      h('div', { class: 'urge-ends' }, `Ends ${fmtTime(t.surfEndsAt)}`)));
}

// The prompt each urge timer last drew, so a redraw with the same words does not fade them again.
const drawnPrompt = new Map();

/**
 * The prompt under the timer. When its words change, the new ones fade in
 * over the old as those fade out, both in one cell; the old leave when done.
 * It follows the clock through the live hook, and manages its own children,
 * so the hook always reports the same value and never repaints them.
 */
function urgePrompt(id, promptAt) {
  const el = h('p', { class: 'urge-prompt' });
  const show = (text) => {
    const fade = drawnPrompt.get(id) !== text;
    for (const old of el.querySelectorAll('.prompt-text:not(.prompt-out)')) {
      if (!fade) { old.remove(); continue; }
      old.classList.add('prompt-out');
      old.setAttribute('aria-hidden', 'true');
      const gone = () => old.remove();
      old.addEventListener('animationend', gone, { once: true });
      old.addEventListener('transitionend', gone, { once: true });
      setTimeout(gone, 1000); // in case no animation runs
    }
    el.append(h('span', { class: fade ? 'prompt-text prompt-in' : 'prompt-text' }, text));
    drawnPrompt.set(id, text);
  };
  show(promptAt(Date.now()));
  el.__live = (ts) => {
    const text = promptAt(ts);
    if (text !== drawnPrompt.get(id)) show(text);
    return 'prompt';
  };
  el.__shown = 'prompt';
  return el;
}

function render(app, api, id) {
  drawnSig.set(id, surfSig(id, now()));
  const t = store.state.temptations.get(id);
  const ctx = app.ctx();
  if (!t) {
    return stepView(h('div', { class: 'sheet-head' }, h('span'), button('Close', () => api.close(), { kind: 'secondary', name: 'close-flow' })),
      h('p', { class: 'tempt-headline' }, 'This was removed.'), null, { focus: true, step: 'removed' });
  }
  const sit = situation(ctx);
  const today = ctx.todayKey;
  const todayRec = ctx.days.get(today);

  const next = async (patch, dir = 'forward') => {
    await store.updateTemptation(id, patch);
    api.replace((a) => render(app, a, id), { dir });
  };
  const finish = (outcome, step) => next({ outcome, step, endedAt: now() });
  const close = async () => {
    if (t.outcome) return api.close();
    if (!t.trigger) {
      await store.deleteTemptation(id);
      return api.close();
    }
    if (t.step === 'ask') return api.close(); // Not sure yet: resumes on the next open
    return next({ step: 'ask' });
  };

  let step = t.step;
  if (step === 'surf' && t.surfEndsAt && ctx.nowTs >= t.surfEndsAt) step = 'end';

  // The head: Back on the cant step, Close (Not sure yet when asking) always.
  const backPill = step === 'cant'
    ? button('Back', () => next({ step: 'gain' }, 'back'), { kind: 'secondary', name: 'back', icon: 'chevron-left' })
    : null;
  if (backPill) backPill.classList.add('back');
  const head = h('div', { class: 'sheet-head' },
    backPill || h('span', { class: 'head-spacer' }),
    button(step === 'ask' ? 'Not sure yet' : 'Close', close, { kind: 'secondary', name: 'close-flow' }));

  const openNow = async () => {
    const cur = situation(app.ctx());
    if (cur.kind !== 'before' && cur.kind !== 'late') {
      // A window is already open or logged today: record the outcome, change nothing else.
      await store.updateTemptation(id, { outcome: knownOutcome(app.ctx(), t) || 'opened_early', step: 'done', endedAt: now() });
      return api.close();
    }
    // On feasting hours no opening is early.
    const planned = isFlexible(today, ctx.settings) ? -Infinity : at(today, plannedStartMin(today, todayRec, ctx.settings));
    await store.updateTemptation(id, { outcome: now() < planned ? 'opened_early' : 'held', step: 'done', endedAt: now() });
    await api.close();
    return showStartMealSheet(app);
  };
  const ateOutside = async (amount) => {
    // Eating outside the window belongs to the window it follows, even after midnight.
    const cur = situation(app.ctx());
    const day = cur.lastDay || today;
    await store.addOutside({ day, at: now(), trigger: t.trigger, amount, source: 'temptation' });
    await next({ outcome: amount === 'little' ? 'ate_little' : 'ate_outside', step: 'slip', slipDay: day, endedAt: now() });
  };
  const withPeople = () => button("I'm with people", () => next({ step: 'social' }), { kind: 'outline', name: 'with-people' });
  const cantAvoid = (opts = {}) => button("I can't avoid eating", () => next({ step: 'cant' }), { kind: 'outline', name: 'cant-avoid', ...opts });

  switch (step) {
    case 'trigger':
      return stepView(head, [
        kicker('Tempted'),
        h('h1', { class: 'tempt-headline' }, 'Hold the line.'),
        h('p', { class: 'tempt-ask' }, "What's pulling at you?"),
      ], h('div', { class: 'trigger-track' },
        choice({ options: TRIGGER_OPTIONS, value: t.trigger, cols: 3, name: 'trigger', ariaLabel: "What's pulling at you?", onChange: (v) => next({ trigger: v, step: 'gain' }) })),
      { focus: true, step: 'trigger' });

    case 'gain': {
      let lead;
      const ahead = longFastAhead(ctx);
      const leadP = (...parts) => h('h1', { class: 'tempt-lead' }, ...parts);
      if (sit.kind === 'before' && ahead) {
        lead = leadP(`Your ${ahead.hours}-hour fast reaches its goal at ${fmtWhen(ahead.at, today)}. `,
          live('span', {}, (ts) => `That is ${fmtDuration(Math.max(0, ahead.at - ts))} away.`));
      } else if (sit.kind === 'before' && isFlexible(today, ctx.settings)) {
        lead = leadP('Your window opens when you choose. Every hour you wait adds to the fast.');
      } else if (sit.kind === 'before') {
        const plannedMin = plannedStartMin(today, todayRec, ctx.settings);
        const plannedTs = at(today, plannedMin);
        lead = ctx.nowTs < plannedTs
          ? leadP(`Your window opens at ${fmtMinutes(plannedMin)}. `,
            live('span', {}, (ts) => `That is ${fmtDuration(Math.max(0, plannedTs - ts))} away.`))
          : leadP('Your planned time has come. Open the window when you sit down to eat.');
      } else if (sit.kind === 'open') {
        lead = leadP(`Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}. Eat inside it.`);
      } else {
        lead = leadP(nextWindowLine(ctx, sit.lastDay));
      }
      return stepView(head, [
        kicker('What waiting gives you'),
        lead,
        h('ul', { class: 'list gains', 'data-testid': 'gains' }, gains(ctx, sit).map((g) => h('li', {}, g))),
      ], [
        button('Ride it out for 10 minutes', () => next({ step: 'surf', surfEndsAt: now() + SURF_MS }), { block: true, name: 'ride-it-out' }),
        pair(withPeople(), cantAvoid()),
      ], { step: 'gain' });
    }

    case 'surf': {
      const st = surfState(t, ctx.nowTs);
      const cp = st.checkpoint;
      const prompt = (ts) => PROMPTS[Math.max(0, Math.min(PROMPTS.length - 1, Math.floor((ts - st.startedAt) / (2 * MIN))))];
      return stepView(head, [
        kicker('Urge surfing', h('sup', { class: 'fn' }, '1')),
        urgeTimer(t),
        urgePrompt(id, prompt),
        cp != null
          ? h('section', { class: 'urge-rate' },
            scale({ n: 10, label: cp === 0 ? 'Rate the urge now' : `Rate the urge again, minute ${cp}`, low: '1 faint', high: '10 strong', name: 'urge',
              onChange: async (v) => {
                await store.updateTemptation(id, { urges: [...(t.urges || []), { min: cp, value: v }] });
                api.rerender();
              } }))
          : h('p', { class: 'urge-so-far' }, (t.urges || []).length ? `Urge so far: ${(t.urges || []).map((u) => u.value).join(', ')}.` : ''),
        h('p', { class: 'gloss' },
          h('sup', { class: 'fn' }, '1'), ' ', h('span', { class: 'term' }, 'Urge surfing'),
          ': noticing a craving rise, peak and pass without acting on it. Most fade within minutes.'),
      ], button('Stop the timer', () => next({ step: 'end' }), { kind: 'outline', block: true, name: 'stop-timer' }), { step: 'surf' });
    }

    case 'end':
      return stepView(head, h('h1', { class: 'tempt-headline' }, 'How is it now?'), [
        button('It passed. I held.', () => finish('held', 'held'), { block: true, name: 'held' }),
        pair(withPeople(), cantAvoid()),
      ], { focus: true, step: 'end' });

    case 'social':
      return stepView(head, [
        kicker('Practical exits'),
        h('div', { class: 'exits' },
          h('section', { class: 'exit-card' }, h('h3', { class: 'card-title' }, 'Hold a drink.'),
            h('p', {}, 'Water, sparkling water, black coffee, espresso or plain tea. A full glass answers most offers.')),
          h('section', { class: 'exit-card' }, h('h3', { class: 'card-title' }, 'Step away.'),
            h('p', {}, 'Take a call, a short walk, some air. A few minutes changes the room.')),
          h('section', { class: 'exit-card' }, h('h3', { class: 'card-title' }, 'Decline politely.'),
            h('ul', { class: 'plain phrases' }, PHRASES.map((p) => h('li', {}, p))))),
      ], [
        button('I held', () => finish('held', 'held'), { block: true, name: 'held' }),
        cantAvoid({ block: true }),
      ], { step: 'social' });

    case 'cant': {
      const blocks = [];
      if (sit.kind === 'open') {
        blocks.push(h('p', { class: 'tempt-lead' }, `Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}. Eat inside it.`));
      }
      if (sit.kind === 'before' || sit.kind === 'late') {
        const clock = `${Math.round(ctx.windowMsFor(today) / (60 * MIN))}-hour clock`;
        const workdayEarly = cutoffApplies(today, todayRec, ctx.settings) && minutesOfDay(ctx.nowTs) < CUTOFF_MIN;
        blocks.push(h('section', { class: 'exit-card' },
          h('h3', { class: 'card-title' }, 'Open the window now'),
          h('p', {}, `This starts your ${clock}. Everything you eat fits by ${fmtTime(ctx.nowTs + ctx.windowMsFor(today))}.`),
          workdayEarly ? missLine('Today is a workday and it is before 16:00, so today will count as a miss.') : null,
          button(`Start the ${clock}`, openNow, { block: true, name: 'open-now' })));
      }
      if (sit.kind === 'after' || sit.kind === 'late') {
        const second = blocks.some((b) => b.querySelector && b.querySelector('[data-action="open-now"]'));
        blocks.push(h('section', { class: 'exit-card' },
          h('h3', { class: 'card-title' }, 'Eat very little'),
          h('p', {}, 'A small portion. Protein only. Then close it again.'),
          sit.kind === 'late' ? h('p', { class: 'caption' }, 'This counts against last night.') : null,
          button('Log a small portion', () => ateOutside('little'), { kind: second ? 'outline' : 'primary', block: true, name: 'eat-little' }),
          button('I ate more than that', () => ateOutside('meal'), { kind: 'outline', block: true, name: 'ate-more' })));
      }
      return stepView(head, [
        kicker("If you can't avoid it"),
        h('div', { class: 'exits' }, blocks),
      ], null, { step: 'cant' });
    }

    case 'ask': {
      const options = [button('I held', () => finish('held', 'held'), { block: true, name: 'held' })];
      if (sit.kind !== 'after') options.push(button('I opened the window', openNow, { kind: 'outline', block: true, name: 'opened' }));
      if (sit.kind === 'after' || sit.kind === 'late') {
        options.push(button('I ate a little', () => ateOutside('little'), { kind: 'outline', block: true, name: 'ate-little' }));
        options.push(button('I ate outside the window', () => ateOutside('meal'), { kind: 'outline', block: true, name: 'ate-outside' }));
      }
      return stepView(head, h('h1', { class: 'tempt-headline' }, 'How did it end?'), options, { focus: true, step: 'ask' });
    }

    case 'slip':
      return stepView(head, h('h1', { class: 'tempt-slip', 'data-testid': 'slip-line' }, nextWindowLine(ctx, t.slipDay || sit.lastDay || today)),
        button('Done', () => api.close(), { block: true, name: 'done' }), { focus: true, step: 'slip' });

    case 'held':
    default: {
      let line;
      if (sit.kind === 'before') line = isFlexible(today, ctx.settings) ? 'Your window opens when you choose.' : `Your window opens at ${fmtMinutes(plannedStartMin(today, todayRec, ctx.settings))}.`;
      else if (sit.kind === 'open') line = `Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}.`;
      else line = nextWindowLine(ctx, sit.lastDay);
      return stepView(head, [
        h('h1', { class: 'tempt-held' }, 'Held.'),
        h('p', { class: 'tempt-line' }, line),
      ], button('Done', () => api.close(), { block: true, name: 'done' }), { focus: true, step: 'held' });
    }
  }
}
