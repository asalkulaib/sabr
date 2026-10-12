// The day's fullness (شبع), on Today and in the day editor: read from the
// meals when every one is rated, otherwise one rating for the whole day,
// asked at the day's end and on paused days, when no meals are logged.

import { h } from './dom.js';
import { choice, STOP_OPTIONS } from './components.js';
import * as store from '../store.js';
import { dayFullness, ratedByMeals } from '../core/fullness.js';
import { mealsOfDay } from './shared.js';

const FROM_MEALS = {
  before_full: 'Left wanting at every meal.',
  full: 'Satisfied at one meal or more.',
  stuffed: 'Overfull at one meal or more.',
};

export function fullnessCard(ctx, key, { question = 'How did you finish eating today?' } = {}) {
  const rec = ctx.days.get(key) || { day: key };
  const meals = mealsOfDay(ctx, key);
  return h('section', { class: 'section', 'data-block': 'fullness', 'data-day': key },
    h('div', { class: 'label' }, 'Fullness ', h('span', { class: 'ar', lang: 'ar' }, 'شبع')),
    ratedByMeals(meals)
      ? h('p', { class: 'gap-s', 'data-testid': 'day-fullness' }, FROM_MEALS[dayFullness(meals, rec)])
      : [
        h('p', { class: 'gap-s' }, question),
        h('div', { class: 'gap-s' }, choice({
          options: STOP_OPTIONS,
          value: rec.fullness || null,
          cols: 3,
          name: 'day-fullness',
          onChange: (v) => store.setDayFullness(key, v),
        })),
      ]);
}
