import { test, expect, openAt, seed, settings, ms } from './helpers.js';

// Last night's window closed at 21:00 on Saturday 26 September; the 20 h goal comes at 17:00.
const LAST_NIGHT = {
  days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }],
  settings: settings({ installedAt: ms('2026-09-26T08:00') }),
};

const ring = (page) => page.getByTestId('fasting-ring');

test('the fasting goal reached: the rings spin and the red rays burst, once', async ({ page }) => {
  await openAt(page, '2026-09-27T17:05');
  await seed(page, LAST_NIGHT);
  await expect(ring(page)).toHaveClass(/\bcelebrate-fast\b/);
  await expect(ring(page)).toHaveAttribute('data-celebrate', 'fast');
  // The rays move.
  const moving = () => page.evaluate(() => document.querySelector('.burst-fast').getAnimations().filter((a) => a.animationName).length);
  expect(await moving()).toBeGreaterThan(0);
  // Opened again later, the same goal is not celebrated twice.
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await page.clock.runFor(4000);
  await page.reload();
  await expect(page.getByTestId('ring-goal')).toHaveText('Goal of 20 h reached');
  await expect(ring(page)).not.toHaveClass(/\bcelebrate\b/);
});

test('a window kept and every meal left wanting: the green and blue rings celebrate', async ({ page }) => {
  await openAt(page, '2026-09-27T21:30');
  await seed(page, {
    days: [...LAST_NIGHT.days, { day: '2026-09-27', firstBite: ms('2026-09-27T17:30'), lastBite: ms('2026-09-27T21:00') }],
    meals: [{ id: 1, day: '2026-09-27', name: 'Dinner', startedAt: ms('2026-09-27T17:30'), finishedAt: ms('2026-09-27T18:00'), stop: 'before_full', fullnessNow: 5, fullness20: 6 }],
    settings: LAST_NIGHT.settings,
  });
  await expect(ring(page)).toHaveClass(/\bcelebrate-win\b/);
  await expect(ring(page)).toHaveClass(/\bcelebrate-full\b/);
  await expect(page.getByTestId('ring-window')).toContainText('Kept, 3 h 30 min');
  await expect(page.getByTestId('ring-fullness')).toContainText('Left wanting');
});

test('with Reduce Motion on, nothing moves; the words still say it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '2026-09-27T17:05');
  await seed(page, LAST_NIGHT);
  await expect(page.getByTestId('ring-goal')).toHaveText('Goal of 20 h reached');
  await expect(ring(page)).not.toHaveClass(/\bcelebrate\b/);
});
