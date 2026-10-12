// Fasting stages, timed from the last bite. Pure data and functions.
//
// Hours are typical, not exact: they shift with the size of the last meal
// and with activity. Wording stays within what the sources below support.
//   Stages 1 and 2: Dimitriadis GD et al., Nutrients 2021 (postprandial and
//     postabsorptive glucose metabolism).
//   Stage 3: Anton SD et al., Obesity 2018 (the metabolic switch, usually
//     12 to 36 hours after the last meal).
//   Stage 4: Rothman DL et al., Science 1991 (new sugar is 96% of supply
//     from 36 to 54 hours); Hartman ML et al., J Clin Endocrinol Metab 1992
//     (growth hormone about five times higher on day 2).
//   Stage 5: Pan JW et al., J Cereb Blood Flow Metab 2000 (brain ketones
//     rise after 2 and 3 days of fasting); Hasselbalch SG et al., J Cereb
//     Blood Flow Metab 1994 (ketones meet about a quarter of the brain's
//     energy needs by about 3 days).
//   Stage 6: Göschke H et al., Klin Wochenschr 1975 (protein loss rises
//     from day 1 to day 3, then falls steadily); Ho KY et al., J Clin Invest
//     1988 (growth hormone about three times higher on day 5).
//   Stage 2 sugar: Rothman DL et al., Science 1991 (new sugar made by the
//     body is about 64% of supply in the first 22 hours of a fast).
//   Hunger in waves (Read more): Natalucci G et al., Eur J Endocrinol 2005
//     (in a 24-hour fast, ghrelin rose and fell at the usual meal times).
//   Read more (stage-more.js) holds the longer write-up, from the same sources.
//   Autophagy: Bagherniya M et al., Ageing Res Rev 2018; Bensalem J et al.,
//     J Physiol 2025. Human timing is unknown, so it has no place on the clock.

import { HOUR } from './time.js';

export const SCALE_HOURS = 24;

export const STAGES = [
  {
    key: 'digesting',
    name: 'Digesting',
    from: 0,
    to: 4,
    range: '0 to about 4 h',
    text: 'Your last meal is being absorbed. Blood sugar and insulin rise, then settle, while your body stores the energy.',
  },
  {
    key: 'settling',
    name: 'Blood sugar settles',
    from: 4,
    to: 12,
    range: 'about 4 to 12 h',
    text: 'Insulin is back at its low baseline. Your liver keeps blood sugar steady, partly from its sugar store and partly by making new sugar, and your body draws more and more on fat.',
  },
  {
    key: 'switch',
    name: 'Metabolic switch',
    from: 12,
    to: 24,
    range: 'from about 12 h',
    text: 'As the liver\'s sugar store runs low, fat becomes the main fuel and ketones start to rise. It can come as late as 36 hours: sooner after training, later after a big meal.',
  },
  {
    key: 'ketones',
    name: 'Ketones climbing',
    from: 24,
    to: 48,
    range: 'about 24 to 48 h',
    text: 'Your liver\'s sugar store gives little now: by the second day nearly all your blood sugar is new sugar your body makes. Fat supplies most of your energy and ketones keep rising. Growth hormone output climbs too, to about five times its usual level on the second day.',
  },
  {
    key: 'brain',
    name: 'Brain on ketones',
    from: 48,
    to: 72,
    range: 'about 48 to 72 h',
    text: 'Ketones are now high enough for your brain to take up and burn in place of some of its sugar. By about the third day they meet about a quarter of its energy needs.',
  },
  {
    key: 'sparing',
    name: 'Protein sparing',
    from: 72,
    to: Infinity,
    range: '72 h and beyond',
    text: 'The protein your body breaks down, much of it to make sugar, peaks around the third day, then falls steadily. Growth hormone stays high: about three times its usual level on the fifth day. A fast this long is best done with a doctor\'s guidance, more so if you take medicine or have a health condition.',
  },
];

export const AUTOPHAGY_NOTE = 'Autophagy is how cells clear out and recycle worn parts. Fasting switches it on in cell and animal studies, and early human studies point the same way, but when it starts in people is not known. So Fast does not place it on the clock.';

export const VARIATION_NOTE = 'The hours are typical, not exact. They shift with the size of your last meal and how active you are.';

export const SOURCES = [
  'Dimitriadis GD et al. Regulation of postabsorptive and postprandial glucose metabolism by insulin-dependent and insulin-independent mechanisms. Nutrients, 2021.',
  'Anton SD et al. Flipping the metabolic switch: understanding and applying the health benefits of fasting. Obesity, 2018.',
  'Pan JW et al. Human brain beta-hydroxybutyrate and lactate increase in fasting-induced ketosis. Journal of Cerebral Blood Flow and Metabolism, 2000.',
  'Ho KY et al. Fasting enhances growth hormone secretion and amplifies the complex rhythms of growth hormone secretion in man. Journal of Clinical Investigation, 1988.',
  'Hartman ML et al. Augmented growth hormone secretory burst frequency and amplitude mediate enhanced GH secretion during a two-day fast in normal men. Journal of Clinical Endocrinology and Metabolism, 1992.',
  'Rothman DL et al. Quantitation of hepatic glycogenolysis and gluconeogenesis in fasting humans with 13C NMR. Science, 1991.',
  'Hasselbalch SG et al. Brain metabolism during short-term starvation in humans. Journal of Cerebral Blood Flow and Metabolism, 1994.',
  'Göschke H et al. Nitrogen loss in normal and obese subjects during total fast. Klinische Wochenschrift, 1975.',
  'Natalucci G et al. Spontaneous 24-h ghrelin secretion pattern in fasting subjects: maintenance of a meal-related pattern. European Journal of Endocrinology, 2005.',
  'Bagherniya M et al. The effect of fasting or calorie restriction on autophagy induction: a review of the literature. Ageing Research Reviews, 2018.',
  'Bensalem J et al. Intermittent time-restricted eating may increase autophagic flux in humans: an exploratory analysis. Journal of Physiology, 2025.',
];

/** Index of the stage for a time since the last bite. */
export function stageIndex(elapsedMs) {
  const hours = Math.max(0, elapsedMs) / HOUR;
  return STAGES.findIndex((s) => hours >= s.from && hours < s.to);
}

/**
 * Where a fast stands: { elapsedMs, index, stage, next, untilNextMs, position }.
 * position is 0 to 1 along the 24-hour scale (1 past 24 hours).
 */
export function fastingState(lastBiteTs, nowTs) {
  const elapsedMs = Math.max(0, nowTs - lastBiteTs);
  const index = stageIndex(elapsedMs);
  const next = STAGES[index + 1] || null;
  return {
    elapsedMs,
    index,
    stage: STAGES[index],
    next,
    untilNextMs: next ? next.from * HOUR - elapsedMs : null,
    position: Math.min(1, elapsedMs / (SCALE_HOURS * HOUR)),
  };
}
