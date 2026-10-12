// The temptation flow. Fixed and offline. It holds the line and never argues
// against fasting. Each event records time, trigger and outcome.

import { h, live } from './dom.js';
import { button, choice, scale, TRIGGER_OPTIONS } from './components.js';
import { openSheet } from './sheet.js';
import * as store from '../store.js';
import { HOUR, MIN, at, fmtDuration, fmtMinutes, fmtTime, fmtTimer, fmtWhen, minutesOfDay, now } from '../core/time.js';
import { CUTOFF_MIN, cutoffApplies, isFlexible, isWorkday, lateNightDay, longFastAhead, plannedStartMin } from '../core/rules.js';
import { energySplit } from '../core/review.js';
import { showStartMealSheet } from './meal.js';
import { nextWindowLine, note } from './shared.js';

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

function showFlow(app, id) {
  // What the sheet last drew, so the tick redraws it as soon as the timer moves on,
  // even when that happens before the first tick (the app reopened after the timer ended).
  let drawnSig = '';
  let flow = null;
  flow = openSheet((api) => {
    drawnSig = surfSig(id, now());
    return render(app, api, id);
  }, {
    full: true,
    name: 'temptation',
    label: 'Tempted',
    tick: (nowTs) => {
      const sig = surfSig(id, nowTs);
      if (sig && sig !== drawnSig && flow) flow.rerender();
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

function render(app, api, id) {
  const t = store.state.temptations.get(id);
  const ctx = app.ctx();
  if (!t) return h('div', {}, h('p', {}, 'This was removed.'), button('Close', () => api.close(), { kind: 'secondary' }));
  const sit = situation(ctx);
  const today = ctx.todayKey;
  const todayRec = ctx.days.get(today);

  const next = async (patch) => {
    await store.updateTemptation(id, patch);
    api.replace((a) => render(app, a, id));
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
  const head = h('div', { class: 'sheet-head' },
    h('div', { class: 'label' }, 'Tempted'),
    h('button', { type: 'button', class: 'btn-2', 'data-action': 'close-flow', onclick: close }, t.step === 'ask' ? 'Not sure yet' : 'Close'));

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

  let step = t.step;
  if (step === 'surf' && t.surfEndsAt && ctx.nowTs >= t.surfEndsAt) step = 'end';

  switch (step) {
    case 'trigger':
      return h('div', {}, head,
        h('h1', { class: 'display' }, 'Hold the line.'),
        h('p', { class: 'gap' }, "What's pulling at you?"),
        h('section', { class: 'section gap' },
          choice({ options: TRIGGER_OPTIONS, value: t.trigger, cols: 3, name: 'trigger', onChange: (v) => next({ trigger: v, step: 'gain' }) })));

    case 'gain': {
      let lead;
      const ahead = longFastAhead(ctx);
      if (sit.kind === 'before' && ahead) {
        lead = h('p', { class: 'statement' }, `Your ${ahead.hours}-hour fast reaches its goal at ${fmtWhen(ahead.at, today)}. `,
          live('span', {}, (ts) => `That is ${fmtDuration(Math.max(0, ahead.at - ts))} away.`));
      } else if (sit.kind === 'before' && isFlexible(today, ctx.settings)) {
        lead = h('p', { class: 'statement' }, 'Your window opens when you choose. Every hour you wait adds to the fast.');
      } else if (sit.kind === 'before') {
        const plannedMin = plannedStartMin(today, todayRec, ctx.settings);
        const plannedTs = at(today, plannedMin);
        lead = ctx.nowTs < plannedTs
          ? h('p', { class: 'statement' }, `Your window opens at ${fmtMinutes(plannedMin)}. `,
            live('span', {}, (ts) => `That is ${fmtDuration(Math.max(0, plannedTs - ts))} away.`))
          : h('p', { class: 'statement' }, 'Your planned time has come. Open the window when you sit down to eat.');
      } else if (sit.kind === 'open') {
        lead = h('p', { class: 'statement' }, `Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}. Eat inside it.`);
      } else {
        lead = h('p', { class: 'statement' }, nextWindowLine(ctx, sit.lastDay));
      }
      return h('div', {}, head,
        h('div', { class: 'label' }, 'What waiting gives you'),
        h('div', { class: 'gap-s' }, lead),
        h('section', { class: 'section gap' },
          h('ul', { class: 'list', 'data-testid': 'gains' }, gains(ctx, sit).map((g) => h('li', {}, g)))),
        h('div', { class: 'stack gap-l' },
          button('Ride it out for 10 minutes', () => next({ step: 'surf', surfEndsAt: now() + SURF_MS }), { block: true, name: 'ride-it-out' }),
          h('div', { class: 'btn-row' },
            button("I'm with people", () => next({ step: 'social' }), { kind: 'secondary', name: 'with-people' }),
            button("I can't avoid eating", () => next({ step: 'cant' }), { kind: 'secondary', name: 'cant-avoid' }))));
    }

    case 'surf': {
      const st = surfState(t, ctx.nowTs);
      const cp = st.checkpoint;
      return h('div', {}, head,
        h('div', { class: 'label' }, 'Urge surfing', h('sup', { class: 'fn' }, '1')),
        h('div', { class: 'row gap' },
          h('div', { class: 'main' }, live('div', { class: 'timer', 'data-testid': 'urge-timer' }, (ts) => fmtTimer(t.surfEndsAt - ts))),
          h('div', { class: 'margin' }, note('Ends', fmtTime(t.surfEndsAt)))),
        h('p', { class: 'statement gap-l' },
          live('span', {}, (ts) => PROMPTS[Math.max(0, Math.min(PROMPTS.length - 1, Math.floor((ts - st.startedAt) / (2 * MIN))))])),
        cp != null
          ? h('section', { class: 'section gap-l' },
            scale({ n: 10, label: cp === 0 ? 'Rate the urge now' : `Rate the urge again, minute ${cp}`, low: '1 faint', high: '10 strong', name: 'urge',
              onChange: async (v) => {
                await store.updateTemptation(id, { urges: [...(t.urges || []), { min: cp, value: v }] });
                api.rerender();
              } }))
          : h('p', { class: 'quiet small gap-l' }, (t.urges || []).length ? `Urge so far: ${(t.urges || []).map((u) => u.value).join(', ')}.` : ''),
        h('div', { class: 'gap-l' }, button('Stop the timer', () => next({ step: 'end' }), { kind: 'secondary', name: 'stop-timer' })),
        h('p', { class: 'gloss gap-xl' },
          h('sup', { class: 'fn' }, '1'), ' ', h('span', { class: 'term' }, 'Urge surfing'),
          ': noticing a craving rise, peak and pass without acting on it. Most fade within minutes.'));
    }

    case 'end':
      return h('div', {}, head,
        h('p', { class: 'statement' }, 'How is it now?'),
        h('div', { class: 'stack gap-l' },
          button('It passed. I held.', () => finish('held', 'held'), { block: true, name: 'held' }),
          h('div', { class: 'btn-row' },
            button("I'm with people", () => next({ step: 'social' }), { kind: 'secondary', name: 'with-people' }),
            button("I can't avoid eating", () => next({ step: 'cant' }), { kind: 'secondary', name: 'cant-avoid' }))));

    case 'social':
      return h('div', {}, head,
        h('div', { class: 'label' }, 'Practical exits'),
        h('div', { class: 'stack-lg gap' },
          h('div', {}, h('p', { class: 'statement' }, 'Hold a drink.'),
            h('p', { class: 'gap-s' }, 'Water, sparkling water, black coffee, espresso or plain tea. A full glass answers most offers.')),
          h('div', {}, h('p', { class: 'statement' }, 'Step away.'),
            h('p', { class: 'gap-s' }, 'Take a call, a short walk, some air. A few minutes changes the room.')),
          h('div', {}, h('p', { class: 'statement' }, 'Decline politely.'),
            h('ul', { class: 'plain phrases gap-s' }, PHRASES.map((p) => h('li', {}, p))))),
        h('div', { class: 'stack gap-l' },
          button('I held', () => finish('held', 'held'), { block: true, name: 'held' }),
          button("I can't avoid eating", () => next({ step: 'cant' }), { kind: 'secondary', name: 'cant-avoid' })));

    case 'cant': {
      const blocks = [];
      if (sit.kind === 'open') {
        blocks.push(h('p', { class: 'statement' }, `Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}. Eat inside it.`));
      }
      if (sit.kind === 'before' || sit.kind === 'late') {
        const clock = `${Math.round(ctx.windowMsFor(today) / (60 * MIN))}-hour clock`;
        const workdayEarly = cutoffApplies(today, todayRec, ctx.settings) && minutesOfDay(ctx.nowTs) < CUTOFF_MIN;
        blocks.push(h('section', { class: 'section flush' },
          h('p', { class: 'statement' }, 'Open the window now'),
          h('p', { class: 'gap-s' }, `This starts your ${clock}. Everything you eat fits by ${fmtTime(ctx.nowTs + ctx.windowMsFor(today))}.`),
          workdayEarly ? h('p', { class: 'gap-s' }, 'Today is a workday and it is before 16:00, so today will count as a miss.') : null,
          h('div', { class: 'gap' }, button(`Start the ${clock}`, openNow, { block: true, name: 'open-now' }))));
      }
      if (sit.kind === 'after' || sit.kind === 'late') {
        blocks.push(h('section', { class: blocks.length ? 'section' : 'section flush' },
          h('p', { class: 'statement' }, 'Eat very little'),
          h('p', { class: 'gap-s' }, 'A small portion. Protein only. Then close it again.'),
          sit.kind === 'late' ? h('p', { class: 'quiet small gap-s' }, 'This counts against last night.') : null,
          h('div', { class: 'gap' }, button('Log a small portion', () => ateOutside('little'), { kind: blocks.length ? 'outline' : 'primary', block: true, name: 'eat-little' })),
          h('div', { class: 'gap-s' }, button('I ate more than that', () => ateOutside('meal'), { kind: 'secondary', name: 'ate-more' }))));
      }
      return h('div', {}, head,
        h('div', { class: 'label' }, "If you can't avoid it"),
        h('div', { class: 'gap' }, blocks),
        h('div', { class: 'gap' }, button('Back', () => next({ step: 'gain' }), { kind: 'secondary', name: 'back' })));
    }

    case 'ask': {
      const options = [button('I held', () => finish('held', 'held'), { block: true, name: 'held' })];
      if (sit.kind !== 'after') options.push(button('I opened the window', openNow, { kind: 'secondary', name: 'opened' }));
      if (sit.kind === 'after' || sit.kind === 'late') {
        options.push(button('I ate a little', () => ateOutside('little'), { kind: 'secondary', name: 'ate-little' }));
        options.push(button('I ate outside the window', () => ateOutside('meal'), { kind: 'secondary', name: 'ate-outside' }));
      }
      return h('div', {}, head,
        h('p', { class: 'statement' }, 'How did it end?'),
        h('div', { class: 'stack gap-l' }, options));
    }

    case 'slip':
      return h('div', {}, head,
        h('p', { class: 'statement', 'data-testid': 'slip-line' }, nextWindowLine(ctx, t.slipDay || sit.lastDay || today)),
        h('div', { class: 'gap-l' }, button('Done', () => api.close(), { block: true, name: 'done' })));

    case 'held':
    default: {
      let line;
      if (sit.kind === 'before') line = isFlexible(today, ctx.settings) ? 'Your window opens when you choose.' : `Your window opens at ${fmtMinutes(plannedStartMin(today, todayRec, ctx.settings))}.`;
      else if (sit.kind === 'open') line = `Your window is open until ${fmtTime(ctx.openRec.firstBite + ctx.windowMsFor(ctx.openRec.day))}.`;
      else line = nextWindowLine(ctx, sit.lastDay);
      return h('div', {}, head,
        h('h1', { class: 'display' }, 'Held.'),
        h('p', { class: 'gap' }, line),
        h('div', { class: 'gap-l' }, button('Done', () => api.close(), { block: true, name: 'done' })));
    }
  }
}
