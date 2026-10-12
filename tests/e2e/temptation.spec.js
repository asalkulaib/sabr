import { test, expect, openAt, advance, tap, pick, choose, sheet, readDb, seed, settings, ms } from './helpers.js';

const flow = (page) => sheet(page, 'temptation');

test('riding out an urge: gains, a 10-minute timer with urge ratings, held', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10'); // Sunday, workday
  await tap(page, 'tempted');
  await expect(flow(page)).toContainText('Hold the line.');
  await choose(page, 'trigger', 'boredom');

  await expect(flow(page)).toContainText('Your window opens at 17:30.');
  await expect(flow(page)).toContainText('That is 4 h 20 min away.');
  const gains = page.getByTestId('gains');
  await expect(gains).toContainText('Energy at 4 PM.');
  await expect(gains).toContainText('A window that fits today: 17:30 to 21:30.');

  await tap(page, 'ride-it-out');
  await expect(page.getByTestId('urge-timer')).toHaveText('10:00');
  await expect(flow(page)).toContainText('Drink a glass of water, or make an espresso.');
  await expect(flow(page).locator('.gloss')).toContainText('Urge surfing: noticing a craving rise, peak and pass');
  await pick(page, 'urge', 7);
  await advance(page, 3);
  await expect(flow(page)).toContainText('Rate the urge again, minute 3');
  await pick(page, 'urge', 5);
  await advance(page, 3);
  await pick(page, 'urge', 3);
  await advance(page, 3);
  await pick(page, 'urge', 2);
  await advance(page, 2); // past 10 minutes
  await expect(flow(page)).toContainText('How is it now?');
  await tap(page, 'held');
  await expect(flow(page)).toContainText('Held.');
  await expect(flow(page)).toContainText('Your window opens at 17:30.');
  await tap(page, 'done');
  await expect(flow(page)).toBeHidden();

  const db = await readDb(page);
  expect(db.temptations).toHaveLength(1);
  expect(db.temptations[0]).toMatchObject({ trigger: 'boredom', outcome: 'held', context: 'before' });
  expect(db.temptations[0].urges.map((u) => u.value)).toEqual([7, 5, 3, 2]);
});

test('the urge timer survives closing the app', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'stress');
  await tap(page, 'ride-it-out');
  await pick(page, 'urge', 6);
  await advance(page, 4);
  await page.reload();
  await expect(flow(page)).toBeVisible();
  await expect(page.getByTestId('urge-timer')).toHaveText(/^5:5\d$/);
  await expect(flow(page)).toContainText('Rate the urge again, minute 3');
});

test('opening the window early on a workday says it will be a miss', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'social');
  await tap(page, 'with-people');
  await expect(flow(page)).toContainText('Hold a drink.');
  await expect(flow(page)).toContainText('Not for me right now, thank you.');
  await tap(page, 'cant-avoid');
  await expect(flow(page)).toContainText('Open the window now');
  await expect(flow(page)).toContainText('Everything you eat fits by 17:10.');
  await expect(flow(page)).toContainText('today will count as a miss');
  await expect(flow(page)).not.toContainText('Eat very little'); // the window has not opened today
  await tap(page, 'open-now');
  await expect(sheet(page, 'start-meal')).toBeVisible();
  await expect(page.getByText('Protein and vegetables first.')).toBeVisible();
  await tap(page, 'start-eating'); // the meal opens the window

  const db = await readDb(page);
  expect(db.temptations[0]).toMatchObject({ trigger: 'social', outcome: 'opened_early' });
  expect(db.days.find((d) => d.day === '2026-09-27').firstBite).toBe(ms('2026-09-27T13:10'));
});

test('after the window: eat very little, logged outside the window, one line to tomorrow', async ({ page }) => {
  await openAt(page, '2026-09-27T21:00');
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    settings: settings({ installedAt: ms('2026-09-27T08:00') }),
  });
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'tired');
  await expect(flow(page)).toContainText("Tomorrow's window opens at 17:30.");
  await expect(page.getByTestId('gains')).toContainText('Today stays a success.');
  await tap(page, 'cant-avoid');
  await expect(flow(page)).not.toContainText('Open the window now');
  await expect(flow(page)).toContainText('A small portion. Protein only.');
  await tap(page, 'eat-little');
  await expect(page.getByTestId('slip-line')).toHaveText("Tomorrow's window opens at 17:30.");
  await tap(page, 'done');
  await expect(page.locator('[data-block="closed"]')).toHaveAttribute('data-result', 'miss');

  const db = await readDb(page);
  expect(db.temptations[0]).toMatchObject({ trigger: 'tired', outcome: 'ate_little', context: 'after' });
  expect(db.outside[0]).toMatchObject({ day: '2026-09-27', trigger: 'tired', amount: 'little', source: 'temptation' });
});

test('a slip just after midnight counts against last night, not the new day', async ({ page }) => {
  await openAt(page, '2026-09-27T23:50'); // Sunday
  await seed(page, {
    days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T20:00') }],
    settings: settings({ installedAt: ms('2026-09-27T08:00') }),
  });
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'boredom');
  await tap(page, 'ride-it-out');
  await advance(page, 11); // Monday 00:01, timer done
  await tap(page, 'cant-avoid');
  await expect(flow(page)).toContainText('This counts against last night.');
  await tap(page, 'eat-little');
  await expect(page.getByTestId('slip-line')).toHaveText("Today's window opens at 17:30.");
  const db = await readDb(page);
  expect(db.outside[0].day).toBe('2026-09-27');
});

test('a resumed temptation never overwrites a window logged since', async ({ page }) => {
  await openAt(page, '2026-09-27T16:50');
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'hunger');
  await tap(page, 'close-flow');
  await tap(page, 'close-flow'); // Not sure yet
  await expect(flow(page)).toBeHidden();
  await advance(page, 40); // 17:30: first bite
  await tap(page, 'start-meal');
  await tap(page, 'start-eating');
  await advance(page, 90); // 19:00
  await tap(page, 'done-eating');
  await tap(page, 'close-window');
  await advance(page, 30);
  await page.reload(); // next launch: the open question is settled from the logged window
  await expect(page.locator('[data-block="closed"]')).toBeVisible();
  await expect(flow(page)).toHaveCount(0);
  const db = await readDb(page);
  expect(db.days.find((d) => d.day === '2026-09-27')).toMatchObject({ firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T19:00') });
  expect(db.temptations[0].outcome).toBe('held');
});

test('closing the flow midway asks how it ended', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await tap(page, 'tempted');
  await choose(page, 'trigger', 'hunger');
  await tap(page, 'close-flow');
  await expect(flow(page)).toContainText('How did it end?');
  await tap(page, 'held');
  await tap(page, 'done');
  const db = await readDb(page);
  expect(db.temptations[0]).toMatchObject({ trigger: 'hunger', outcome: 'held' });
});

test('closing before choosing a trigger records nothing', async ({ page }) => {
  await openAt(page, '2026-09-27T13:10');
  await tap(page, 'tempted');
  await tap(page, 'close-flow');
  await expect(flow(page)).toBeHidden();
  const db = await readDb(page);
  expect(db.temptations).toHaveLength(0);
});

test('the streak line in the gains follows the day: a fresh start, a streak to extend, a day already won or lost', async ({ page }) => {
  const gains = page.getByTestId('gains');
  const open = async () => { await tap(page, 'tempted'); await choose(page, 'trigger', 'boredom'); };
  const install = settings({ installedAt: ms('2026-09-24T08:00') });
  // Nothing yet: a fresh start.
  await openAt(page, '2026-09-27T13:10');
  await open();
  await expect(gains).toContainText('Today can start a new streak.');
  // Two successful days before today: one more if today holds.
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: [{ day: '2026-09-25', firstBite: ms('2026-09-25T17:00'), lastBite: ms('2026-09-25T20:00') }, { day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T20:00') }], settings: install });
  await open();
  await expect(gains).toContainText('Your streak: 2 days, 3 if today holds.');
  // Today logged without eating already counts.
  await openAt(page, '2026-09-27T13:10');
  await seed(page, { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T20:00') }, { day: '2026-09-27', noEating: true }], settings: install });
  await open();
  await expect(gains).toContainText('Today counts as a success so far. Your streak: 2 days, today included.');
  // After a window that was a miss: tomorrow starts afresh.
  await openAt(page, '2026-09-27T22:30');
  await seed(page, { days: [{ day: '2026-09-27', firstBite: ms('2026-09-27T17:00'), lastBite: ms('2026-09-27T22:00') }], settings: install });
  await open();
  await expect(gains).toContainText('Today is already a miss. Tomorrow can start a new streak.');
});
