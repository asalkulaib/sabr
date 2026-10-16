// The form sheets in every state, shot at 390 x 844 for design review
// (test-results/screens, names starting with F), each with the contrast
// audit of shot(): start, add, finish and edit a meal, the fullness check,
// I'm done eating, outside the window, the window opened, the bite times,
// the window times and Begin fast.
import { test, expect, openAt, seed, advance, tap, pick, choose, sheet, setTime, settings, ms, shot as shoot, scrollSheet } from './helpers.js';
import { WEEK } from './seed-data.js';

test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

// A sheet drawn again (after an error) places its wheels a frame later: shoot once they stand on their times.
async function shot(page, name, opts) {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-sheet] .wheel-col')].every((c) => !c.clientHeight || c.scrollTop > 0));
  await shoot(page, name, opts);
}

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });
const today = (extra) => ({ ...WEEK, days: [...WEEK.days, { day: '2026-09-27', ...extra }], settings: install });

test('start a meal: first meal, the 16:00 warning, Other, after the window', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await choose(page, 'meal-type', 'Dinner');
  await pick(page, 'hunger', 7);
  await scrollSheet(page, 'start-meal', 'top');
  await shot(page, 'F02-start-meal-sheet');
  await scrollSheet(page, 'start-meal');
  await shot(page, 'F02a-start-meal-end');
  // Other: the name, and names typed before as pills.
  await choose(page, 'meal-type', 'other');
  await page.locator('[data-sheet="start-meal"] [data-block="meal-type"]').scrollIntoViewIfNeeded();
  await shot(page, 'F02b-start-meal-other');
  await tap(page, 'close-sheet');

  // Before 16:00 on a workday: the warning under the time.
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await expect(sheet(page, 'start-meal').getByTestId('meal-warning')).toBeVisible();
  await shot(page, 'F02c-start-meal-warning');

  // After the window and its hours: the meal counts as eating outside it.
  await openAt(page, '2026-09-27T23:10');
  await seed(page, today({ firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:30') }));
  await tap(page, 'start-meal');
  await setTime(page, 'meal-start', '20:00');
  await tap(page, 'start-eating');
  await expect(sheet(page, 'start-meal').getByTestId('meal-hint')).toBeVisible();
  await shot(page, 'F02d-start-meal-outside-refused');
});

test('finish a meal, the fullness check, one meal at a time', async ({ page }) => {
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await choose(page, 'meal-type', 'Dinner');
  await tap(page, 'start-eating');
  await advance(page, 40);
  await tap(page, 'finish-meal');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await shot(page, 'F04-finish-meal-sheet');
  await tap(page, 'close-sheet');
  // A second meal while one is open: finish that one first.
  await tap(page, 'another-meal');
  await expect(sheet(page, 'finish-meal').getByTestId('finish-lead')).toBeVisible();
  await shot(page, 'F04b-finish-meal-one-at-a-time');
  await tap(page, 'save-finish');
  await expect(sheet(page, 'start-meal')).toBeVisible();
  await tap(page, 'close-sheet');
  await advance(page, 21);
  await expect(sheet(page, 'fullness')).toBeVisible();
  await shot(page, 'F05-fullness-check');
  await tap(page, 'save-fullness');
  await expect(sheet(page, 'fullness')).toContainText('Pick a number from 1 to 10.');
  await shot(page, 'F05b-fullness-check-hint');
  await pick(page, 'fullness-20', 7);
  await shot(page, 'F05c-fullness-check-picked');
});

test("I'm done eating: over the goal, inside it, a meal still open, a time still ahead", async ({ page }) => {
  await openAt(page, '2026-09-27T21:56');
  await seed(page, today({ firstBite: ms('2026-09-27T17:30'), lastBite: null }));
  await tap(page, 'done-eating');
  await expect(sheet(page, 'done-eating').getByTestId('done-miss')).not.toHaveText('');
  await shot(page, 'F09-done-eating-over');
  await setTime(page, 'last-bite', '21:20');
  await expect(sheet(page, 'done-eating').getByTestId('done-miss')).toHaveText('');
  await shot(page, 'F09b-done-eating-inside');
  await setTime(page, 'last-bite', '22:30');
  await expect(page.locator('[data-action="close-window"]')).toBeDisabled();
  await shot(page, 'F09c-done-eating-ahead');
  await tap(page, 'close-sheet');

  await openAt(page, '2026-09-27T19:00');
  await seed(page, {
    ...today({ firstBite: ms('2026-09-27T17:30'), lastBite: null }),
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T18:30'), finishedAt: null }],
  });
  await tap(page, 'done-eating');
  await choose(page, 'stop', 'full');
  await shot(page, 'F09d-done-eating-meal-open');
  await tap(page, 'close-sheet');

  // The tallest footer: a meal still open and the window over its goal.
  await openAt(page, '2026-09-27T21:56');
  await seed(page, {
    ...today({ firstBite: ms('2026-09-27T17:30'), lastBite: null }),
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T21:00'), finishedAt: null }],
  });
  await tap(page, 'done-eating');
  await expect(sheet(page, 'done-eating').getByTestId('done-miss')).not.toHaveText('');
  await shot(page, 'F09e-done-eating-meal-open-over');
});

test('outside the window: the trigger, a missing trigger, the slip line', async ({ page }) => {
  await openAt(page, '2026-09-27T21:40');
  await seed(page, today({ firstBite: ms('2026-09-27T17:34'), lastBite: ms('2026-09-27T21:26') }));
  await tap(page, 'ate-something');
  await shot(page, 'F11-outside-sheet');
  await tap(page, 'save-outside');
  await expect(sheet(page, 'outside')).toContainText('Pick what set it off.');
  await shot(page, 'F11b-outside-hint');
  await choose(page, 'trigger', 'boredom');
  await choose(page, 'amount', 'little');
  await shot(page, 'F11c-outside-picked');
  await tap(page, 'save-outside');
  await expect(page.getByTestId('slip-line')).toBeVisible();
  await shot(page, 'F12-outside-slip-line');
});

test('the window opened, removing it, the window times with and without a miss', async ({ page }) => {
  await openAt(page, '2026-09-27T17:45');
  await seed(page, {
    ...today({ firstBite: ms('2026-09-27T16:30'), lastBite: null }),
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T16:30'), finishedAt: null }],
  });
  await tap(page, 'change-opening');
  await shot(page, 'F18-opening-sheet');
  await tap(page, 'remove-window');
  await shot(page, 'F18b-opening-remove-confirm');
  await tap(page, 'keep-window');
  await setTime(page, 'opened-at', '18:30');
  await tap(page, 'save-opening');
  await expect(page.getByTestId('times-hint')).toHaveText('That time is still ahead.');
  await shot(page, 'F18c-opening-ahead');
  await tap(page, 'close-sheet');

  // Opened before 16:00 and longer than the goal: both misses, in words.
  // At 21:00, so 17:00 to 20:30 is a window already eaten, not one ahead.
  await openAt(page, '2026-09-27T21:00');
  await seed(page, today({ firstBite: ms('2026-09-27T12:30'), lastBite: ms('2026-09-27T16:50') }));
  await tap(page, 'change-times');
  const times = sheet(page, 'window-times');
  await expect(times.getByTestId('times-miss')).not.toHaveText('');
  await shot(page, 'F19-window-times-misses');
  await setTime(page, 'times-first', '17:00');
  await setTime(page, 'times-last', '20:30');
  await expect(times.getByTestId('times-miss')).toHaveText('');
  await expect(times.getByTestId('times-hint')).toHaveText('');
  await expect(times.getByTestId('times-summary')).toHaveText('17:00 to 20:30, 3 h 30 min.');
  await shot(page, 'F19g-window-times-success');
  // A last bite still ahead: no window, no miss, and why.
  await setTime(page, 'times-last', '23:30');
  await expect(times.getByTestId('times-hint')).toHaveText('That last bite is still ahead.');
  await expect(times.getByTestId('times-summary')).toHaveText('');
  await shot(page, 'F19j-window-times-ahead');
});

test('the bite times: last bite, first bite, eating logged outside the window', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'edit-last-bite');
  await shot(page, 'F01f-last-bite-sheet');
  await setTime(page, 'edit-last-bite', '23:50');
  await shot(page, 'F01g-last-bite-other-day');
  await tap(page, 'close-sheet');

  await openAt(page, '2026-09-27T22:30');
  await seed(page, today({ firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:20') }));
  await tap(page, 'edit-first-bite');
  await shot(page, 'F01h-first-bite-sheet');
  await setTime(page, 'edit-first-bite', '23:00');
  await expect(sheet(page, 'first-bite-time').getByTestId('bite-summary')).toHaveText('That time is still ahead.');
  await shot(page, 'F01i-first-bite-ahead');
  await tap(page, 'close-sheet');

  await openAt(page, '2026-09-27T13:10');
  await seed(page, { ...WEEK, outside: [...WEEK.outside, { id: 2, day: '2026-09-26', at: ms('2026-09-26T23:15'), trigger: 'boredom', amount: 'little', source: 'today' }], settings: install });
  await tap(page, 'edit-last-bite');
  await expect(sheet(page, 'outside-bite-time')).toBeVisible();
  await shot(page, 'F56-outside-bite-sheet');
});

// The hour column of Started at and of Finished at, from the left of the sheet.
async function wheelsLineUp(page) {
  const left = (name) => page.locator(`[data-sheet="add-meal"] [data-time="${name}"] .wheel-col`).first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  expect(await left('added-start')).toBe(await left('added-finish'));
}

test('add a meal: the form, its end, a miss in words, an overlap, a fixed day', async ({ page }) => {
  await openAt(page, '2026-09-27T14:20'); // a Sunday, a workday
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'add-meal');
  await choose(page, 'meal-type', 'Lunch');
  await pick(page, 'hunger', 6);
  await scrollSheet(page, 'add-meal', 'top');
  await wheelsLineUp(page);
  await shot(page, 'F19b-add-meal-sheet');
  // The middle of the form: the times, the meal and the ratings, each its own group.
  await sheet(page, 'add-meal').locator('[data-time="added-finish"]').evaluate((el) => {
    const body = el.closest('.sheet-body');
    body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  await shot(page, 'F19k-add-meal-middle');
  await choose(page, 'stop', 'before_full');
  await pick(page, 'fullness-now', 6);
  await pick(page, 'fullness-20', 7);
  await choose(page, 'last-meal', 'true');
  await scrollSheet(page, 'add-meal');
  await shot(page, 'F19c-add-meal-sheet-end');
  await tap(page, 'close-sheet');

  // After the window and its goal: eating outside it, a miss in words.
  const days = WEEK.days.map((d) => (d.day === '2026-09-26' ? { ...d, firstBite: ms('2026-09-26T13:00'), lastBite: ms('2026-09-26T15:00') } : d));
  await seed(page, { ...WEEK, days, settings: install });
  await tap(page, 'add-meal');
  await choose(page, 'added-day', '2026-09-26');
  await setTime(page, 'added-start', '20:00');
  await expect(sheet(page, 'add-meal').getByTestId('add-meal-miss')).not.toHaveText('');
  await wheelsLineUp(page);
  await shot(page, 'F19f-add-meal-outside');
  await tap(page, 'close-sheet');

  // Over a meal already logged: why it cannot go there, as an error.
  await openAt(page, '2026-09-27T20:00');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T19:00') }],
    meals: [{ id: 1, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:00'), finishedAt: ms('2026-09-27T17:30') }],
    settings: install,
  });
  await tap(page, 'add-meal');
  await setTime(page, 'added-start', '17:10');
  await expect(sheet(page, 'add-meal').getByTestId('add-meal-effect')).toContainText('That overlaps Dinner');
  await shot(page, 'F19h-add-meal-overlap');
  await tap(page, 'close-sheet');

  // From a day in Week: the day is fixed.
  await openAt(page, '2026-09-27T10:00', '#day/2026-09-24');
  await seed(page, { settings: install });
  await tap(page, 'add-meal');
  await wheelsLineUp(page);
  await shot(page, 'F19i-add-meal-fixed-day');
});

test('meal edit and its delete confirm', async ({ page }) => {
  await openAt(page, '2026-09-27T20:00', '#satiety');
  await seed(page, { ...WEEK, settings: install });
  await choose(page, 'satiety-view', 'meals');
  await page.locator('[data-meal="2"]').click();
  await expect(sheet(page, 'edit-meal')).toBeVisible();
  await shot(page, 'F20-meal-edit');
  await scrollSheet(page, 'edit-meal');
  await shot(page, 'F20b-meal-edit-end');
  await tap(page, 'delete-meal');
  await scrollSheet(page, 'edit-meal');
  await shot(page, 'F20c-meal-edit-delete-confirm');
  await tap(page, 'close-sheet');

  // From Last bite on Today, when the last bite was a meal: Just now under Finished.
  await openAt(page, '2026-09-27T23:30');
  await seed(page, {
    ...today({ firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:00') }),
    meals: [...WEEK.meals, { id: 9, day: '2026-09-27', name: 'Dessert', startedAt: ms('2026-09-27T22:00'), finishedAt: ms('2026-09-27T22:20'), outside: true }],
  });
  await page.locator('[data-action="edit-last-bite"]').first().click();
  await expect(sheet(page, 'edit-meal')).toBeVisible();
  await shot(page, 'F20d-meal-edit-last-bite');
});

test('begin fast: from last night, and before the last bite on record', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await tap(page, 'begin-fast');
  await tap(page, 'fast-last');
  await shot(page, 'F61-begin-fast-sheet');
  await tap(page, 'close-sheet');

  await seed(page, {
    days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00'), fastFrom: ms('2026-09-26T21:30') }],
    settings: settings({ installedAt: ms('2026-09-26T08:00') }),
  });
  await tap(page, 'edit-fast-start');
  await setTime(page, 'fast-start', '20:00');
  await expect(page.locator('[data-action="save-fast"]')).toBeDisabled();
  await shot(page, 'F61b-begin-fast-refused');
});

// Nothing in an open sheet runs past it: the body never pans sideways, and
// every quick time stands inside the screen's gutter.
async function noOverflow(page) {
  const over = await page.evaluate(() => {
    const found = [];
    const body = document.querySelector('[data-sheet] .sheet-body');
    if (body && body.scrollWidth > body.clientWidth) found.push(`body ${body.scrollWidth} > ${body.clientWidth}`);
    for (const el of document.querySelectorAll('[data-sheet] button, [data-sheet] .wheel')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth) found.push(el.textContent.trim().slice(0, 30));
    }
    for (const el of document.querySelectorAll('[data-sheet] .presets button')) {
      if (el.getBoundingClientRect().right > window.innerWidth - 20) found.push(`gutter: ${el.textContent.trim()}`);
    }
    return found;
  });
  expect(over).toEqual([]);
}

test('a narrow phone: 320 wide', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAt(page, '2026-09-27T17:30');
  await seed(page, { ...WEEK, settings: install });
  await tap(page, 'start-meal');
  await scrollSheet(page, 'start-meal', 'top');
  await shot(page, 'F90-narrow-start-meal');
  await noOverflow(page);
  // The longest words for a number still fit on one line, 320 wide.
  await pick(page, 'hunger', 4);
  await page.getByTestId('hunger-meaning').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('hunger-meaning')).toHaveText('4: Getting hungry. Thinking about food.');
  await shot(page, 'F90b-narrow-hunger-words');
  await noOverflow(page);
  await tap(page, 'close-sheet');
  await tap(page, 'add-meal');
  await page.locator('[data-sheet="add-meal"] [data-time="added-finish"]').scrollIntoViewIfNeeded();
  await shot(page, 'F91-narrow-add-meal');
  await noOverflow(page);
  await page.locator('[data-sheet="add-meal"] [data-time="added-start"]').scrollIntoViewIfNeeded();
  await noOverflow(page);
  await tap(page, 'close-sheet');
  await seed(page, today({ firstBite: ms('2026-09-27T12:30'), lastBite: ms('2026-09-27T16:50') }));
  await tap(page, 'change-times');
  await shot(page, 'F92-narrow-window-times');
  await noOverflow(page);
  await tap(page, 'close-sheet');

  // Begin fast: all four quick starts under the wheel.
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { settings: install });
  await tap(page, 'begin-fast');
  await page.locator('[data-sheet="begin-fast"] .presets').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sheet="begin-fast"] .presets button')).toHaveCount(4);
  await shot(page, 'F93-narrow-begin-fast');
  await noOverflow(page);
});
