// The longer read for each fasting stage, behind Read more on its card.
// Pure data. Every finding comes from a study in SOURCES (stages.js) and
// stays within what that study reports; the studies are named by first
// author and year, with no links, since nothing leaves the app. Good to
// know holds plain advice that claims no finding.

import { SOURCES } from './stages.js';

export const STAGE_MORE = {
  digesting: {
    body: [
      'Your gut breaks the meal down and absorbs it: starch and sugar as glucose, protein as amino acids, fat as fatty acids. As the glucose reaches your blood, your blood sugar rises and your pancreas releases insulin to match.',
      'Insulin helps your muscles and other tissues take sugar out of your blood. Your liver takes up more than half of the sugar from a meal and stores some of it as glycogen, a store it draws on later. While insulin is up, your liver holds back its own sugar and your fat tissue holds on to its fat.',
      'Over the next few hours, as the last of the meal is absorbed, your blood sugar and insulin settle back to where they were before you ate.',
    ],
    findings: [
      { text: 'After a meal, the liver takes up more than half of the sugar eaten, which keeps the rise in blood sugar and insulin in check.', by: 'Dimitriadis' },
      { text: 'Each meal primes the body for the next, so blood sugar is handled better as the day goes on.', by: 'Dimitriadis' },
    ],
    good: [
      'Fast times every stage from the time of your last bite, even one you add later, so this one starts then.',
      'A bigger meal takes longer to absorb, so this stage can run past 4 hours.',
    ],
  },
  settling: {
    body: [
      'The meal is absorbed and insulin is back at its low baseline. With it, the hold on your liver and your fat tissue lifts.',
      'Your liver now keeps your blood sugar steady, with some help from your kidneys. It draws on its store of sugar, called glycogen, and it makes new sugar from other material in your body.',
      'Your fat tissue releases fatty acids, and your muscles and liver burn more and more of them. That saves the sugar for your brain, which still runs mostly on sugar.',
    ],
    findings: [
      { text: 'Over the first 22 hours of a fast, about two thirds (64%) of the sugar released into the blood was new sugar the body made. The rest came from the liver\'s glycogen store.', by: 'Rothman' },
      { text: 'During sleep, surges of growth hormone and cortisol turn the muscles from sugar to fat, which keeps blood sugar in range until you wake.', by: 'Dimitriadis' },
      { text: 'In a small study of a 24-hour fast, ghrelin, the hormone linked to hunger, still rose at the times people usually ate, then fell again on its own with no food.', by: 'Natalucci' },
    ],
    good: [
      'A night\'s sleep covers much of this stage.',
      'Hunger can come in waves at your usual meal times. A wave may pass if you wait.',
    ],
  },
  switch: {
    body: [
      'Your liver\'s store of sugar, glycogen, runs low, and fat becomes your main fuel: your fat tissue releases more fatty acids, and your muscles and other organs burn them.',
      'Your liver turns some of those fatty acids into ketones, which other organs, your brain among them, can burn in place of sugar. The ketones in your blood start to rise.',
      'Anton and colleagues call this point the metabolic switch: the body uses more energy than it takes in, the liver\'s glycogen store is spent, and fat is released for fuel.',
    ],
    findings: [
      { text: 'The switch typically comes 12 to 36 hours after the last meal, depending on how much glycogen the liver holds when the fast starts and how much energy is used during it, exercise included.', by: 'Anton' },
      { text: 'The review argues that the switch moves the body from storing fat to using it, while burning fat and ketones helps it keep its muscle.', by: 'Anton' },
      { text: 'From 22 to 36 hours into a fast, new sugar the body made was 82% of the sugar released into the blood.', by: 'Rothman' },
    ],
    good: [
      'Exercise brings the switch sooner. A big meal before the fast pushes it later.',
    ],
  },
  ketones: {
    body: [
      'Your liver\'s store of sugar, glycogen, gives little now, so almost all the sugar in your blood is new sugar your body makes, partly from protein it breaks down.',
      'Fat supplies most of your energy, and the ketones in your blood keep rising.',
      'Growth hormone, which helps release fat from your fat tissue, climbs well above its usual level.',
    ],
    findings: [
      { text: 'From 36 to 54 hours into a fast, new sugar the body made was 96% of the sugar released into the blood. The liver\'s glycogen was measured directly, with magnetic resonance scans.', by: 'Rothman' },
      { text: 'On the second day of a fast, men\'s growth hormone output was about five times its usual level, released in more than twice as many bursts.', by: 'Hartman' },
      { text: 'Nitrogen in the urine, a measure of the protein broken down, was highest in the first three days of a fast.', by: 'Göschke' },
    ],
    good: [
      'A fast past a day is a bigger step. If you take medicine, above all for diabetes or blood pressure, or have a health condition, ask a doctor first.',
      'Keep drinking water.',
      'If you feel faint, dizzy, confused or unwell, end the fast and eat.',
    ],
  },
  brain: {
    body: [
      'The ketones in your blood are now high enough for your brain to take them up in quantity and burn them in place of some of its sugar.',
      'As your brain uses less sugar, your body needs to make less of it, and so needs to break down less protein to make it.',
    ],
    findings: [
      { text: 'Ketones measured in the brain itself, with magnetic resonance, were about 12 times their usual level after two days of fasting and about 20 times after three, rising in step with the blood.', by: 'Pan' },
      { text: 'After three and a half days of fasting, the brain used about a quarter less sugar, took up about 13 times more beta-hydroxybutyrate, the main ketone, and met about a quarter of its energy needs from ketones. Blood flow to the brain did not change.', by: 'Hasselbalch' },
    ],
    good: [
      'If you feel faint, dizzy, confused or unwell, end the fast and eat.',
      'A fast this long is best planned with a doctor, more so if you take medicine or have a health condition.',
    ],
  },
  sparing: {
    body: [
      'All through a fast your body breaks down some protein, much of it from muscle, to make new sugar from its amino acids. That breakdown is highest in the first three days, then falls steadily.',
      'It falls as your brain takes more of its energy from ketones and needs less sugar, so less protein has to be broken down to make it. That is why this stage is called protein sparing.',
      'Fat and ketones carry most of the load, and growth hormone stays high.',
    ],
    findings: [
      { text: 'In 24 people of normal weight who fasted for six days, nitrogen loss peaked in the first three days, then fell steadily. Protein supplied about 15% of the energy the men used, and men lost more protein than women of the same weight.', by: 'Göschke' },
      { text: 'In women with obesity who fasted for up to four weeks, protein supplied about 5% of their energy by the fourth week.', by: 'Göschke' },
      { text: 'On the fifth day of a fast, men\'s growth hormone output was about three times its usual level, in more frequent pulses.', by: 'Ho' },
    ],
    good: [
      'A fast this long is best done with a doctor\'s guidance, more so if you take medicine or have a health condition.',
      'If you feel faint, dizzy, confused or unwell, end the fast and eat.',
    ],
  },
};

/** The source a finding names, by its first author's surname. */
export function sourceBy(surname) {
  return SOURCES.find((src) => src.startsWith(`${surname} `)) || null;
}

/** 'Rothman and colleagues, 1991': who found it, from its source. */
export function citeBy(surname) {
  const src = sourceBy(surname);
  const year = src && src.match(/(\d{4})\.$/);
  return year ? `${surname} and colleagues, ${year[1]}` : surname;
}

/** The sources one stage's findings draw on, each once, in the order of SOURCES. */
export function stageSources(key) {
  const used = new Set((STAGE_MORE[key]?.findings || []).map((f) => sourceBy(f.by)));
  return SOURCES.filter((src) => used.has(src));
}
