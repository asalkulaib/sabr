// The day's fullness (شبع), on Satiety's Now view and on a day in Week: read
// from the meals when every one is rated, otherwise one rating for the whole
// day, asked at the day's end and on paused days, when no meals are logged.
// One look wherever it appears (satiety.css styles [data-block="fullness"]).

import { h } from './dom.js';
import { choice, key, STOP_OPTIONS } from './components.js';
import * as store from '../store.js';
import { dayFullness, ratedByMeals } from '../core/fullness.js';
import { mealsOfDay } from './shared.js';

const FROM_MEALS = {
  before_full: 'Left wanting at every meal.',
  full: 'Satisfied at one meal or more.',
  stuffed: 'Overfull at one meal or more.',
};

// Each option carries its way's mark, so the track is its own legend. Drawn
// fresh for each card: a node can sit in one place only.
const options = () => STOP_OPTIONS.map((o) => ({ ...o, label: [key(`stop-${o.value}`, { size: 12 }), h('span', {}, o.label)] }));

export function fullnessCard(ctx, key_, { question = 'How did you finish eating today?' } = {}) {
  const rec = ctx.days.get(key_) || { day: key_ };
  const meals = mealsOfDay(ctx, key_);
  const fromMeals = ratedByMeals(meals) ? dayFullness(meals, rec) : null;
  return h('section', { class: 'section fullness-card', 'data-block': 'fullness', 'data-day': key_ },
    h('div', { class: 'label fullness-label' }, 'Fullness ', h('span', { class: 'ar', lang: 'ar' }, 'شبع')),
    fromMeals
      ? h('p', { class: 'fullness-statement', 'data-testid': 'day-fullness' }, key(`stop-${fromMeals}`, { size: 20 }), FROM_MEALS[fromMeals])
      : [
        h('p', { class: 'fullness-question' }, question),
        h('div', { class: 'fullness-track' }, choice({
          options: options(),
          value: rec.fullness || null,
          cols: 3,
          fit: true,
          name: 'day-fullness',
          ariaLabel: question,
          onChange: (v) => store.setDayFullness(key_, v),
        })),
      ]);
}
