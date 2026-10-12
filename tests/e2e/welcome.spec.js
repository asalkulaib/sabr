import { test, expect, openAt, seed, tap, choose, sheet, setTime, readDb, settings, ms } from './helpers.js';
import { WEEK } from './seed-data.js';

// The first-run welcome: once, on a fresh install with nothing logged.
test.use({ welcome: true });

const settingsOf = async (page) => Object.fromEntries((await readDb(page)).settings.map((x) => [x.key, x.value]));

test('a fresh install shows the welcome at step 1 of 3', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  const w = sheet(page, 'welcome');
  await expect(w).toBeVisible();
  await expect(w.getByTestId('welcome-step')).toHaveText('Step 1 of 3');
  await expect(w.locator('[data-step="goal"]')).toContainText('Welcome to Sabr');
  await expect(w.getByTestId('goal-pair')).toContainText('Fast');
  await expect(w.locator('button[data-choice="goal"][data-value="4"]')).toHaveAttribute('aria-checked', 'true');
});

test('Skip closes it, saves welcomedAt, and it never shows again', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await tap(page, 'welcome-skip');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  expect((await settingsOf(page)).welcomedAt).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(sheet(page, 'welcome')).toHaveCount(0);
});

test('Escape acts as Skip', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await expect(sheet(page, 'welcome')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  expect((await settingsOf(page)).welcomedAt).toBeGreaterThan(0);
});

test('Escape still skips after a choice has redrawn the step', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await choose(page, 'goal', '6');
  await expect(sheet(page, 'welcome').getByTestId('goal-text')).toHaveText('Eating window 6 hours, fasting 18 hours.');
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  const s = await settingsOf(page);
  expect(s.welcomedAt).toBeGreaterThan(0);
  expect(s.goalChanges).toEqual([{ from: '2026-09-27', hours: 6 }]);
});

test('opened at another screen, it opens over Today and leaves you there', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00', '#more');
  await expect(sheet(page, 'welcome')).toBeVisible();
  await expect(page).toHaveURL(/#today$/);
  await tap(page, 'welcome-skip');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(page.locator('#view .head h1')).toBeFocused();
});

test('a weight link that imports nothing keeps you on Weight with its paste box', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T09:00:00+03:00') });
  await page.goto(`./#b=${Buffer.from('nothing to read', 'utf8').toString('base64')}`);
  await expect(sheet(page, 'welcome')).toBeVisible();
  await expect(page).toHaveURL(/#weight$/);
  await tap(page, 'welcome-skip');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  await expect(page).toHaveURL(/#weight$/);
  await expect(page.getByTestId('paste-target')).toBeVisible();
});

test('if saving fails, Skip still closes it, and it stays away', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await expect(sheet(page, 'welcome')).toBeVisible();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await tap(page, 'welcome-skip');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sabr.welcomed'))).toBe('1');
});

test('18:6, workdays at 18:00, Next, Next, Done: saved as More saves them, and Today shows the plan', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00'); // Sunday, a workday
  await choose(page, 'goal', '6');
  await expect(sheet(page, 'welcome').getByTestId('goal-text')).toHaveText('Eating window 6 hours, fasting 18 hours.');
  await expect(sheet(page, 'welcome').getByTestId('goal-pair')).toContainText('18h');
  await expect(page.getByTestId('flash')).toHaveCount(0); // the welcome saves without a message
  await tap(page, 'welcome-next');
  await expect(sheet(page, 'welcome').getByTestId('welcome-step')).toHaveText('Step 2 of 3');
  await setTime(page, 'workdayStart', '18:00');
  await tap(page, 'welcome-next');
  await expect(sheet(page, 'welcome').locator('[data-step="home"]')).toContainText('Add Sabr to your Home Screen');
  await expect(sheet(page, 'welcome').locator('ol.steps.badges > li')).toHaveCount(5);
  await tap(page, 'welcome-done');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
  const s = await settingsOf(page);
  expect(s.goalChanges).toEqual([{ from: '2026-09-27', hours: 6 }]);
  expect(s.workdayStart).toBe('18:00');
  expect(s.welcomedAt).toBeGreaterThan(0);
  await expect(page.locator('[data-block="before"]')).toContainText('Window planned for 18:00.');
  await expect(page.locator('[data-action="edit-goal"]')).toContainText('18:6');
  await expect(page.getByTestId('flash')).toHaveCount(0);
});

test('Back returns to the step before, keeping what was chosen', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await choose(page, 'goal', '8');
  await tap(page, 'welcome-next');
  await tap(page, 'welcome-back');
  await expect(sheet(page, 'welcome').getByTestId('welcome-step')).toHaveText('Step 1 of 3');
  await expect(sheet(page, 'welcome').locator('button[data-choice="goal"][data-value="8"]')).toHaveAttribute('aria-checked', 'true');
});

test('with data on record, there is no welcome', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, WEEK);
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(sheet(page, 'welcome')).toHaveCount(0);
});

test('with a goal already set, there is no welcome', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  await seed(page, { settings: settings({ installedAt: ms('2026-09-27T08:00'), goalChanges: [{ from: '2026-09-27', hours: 6 }] }) });
  await expect(page.locator('[data-block="before"]')).toBeVisible();
  await expect(sheet(page, 'welcome')).toHaveCount(0);
});

test('on the Home Screen, step 3 is left out', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
  await openAt(page, '2026-09-27T09:00');
  await expect(sheet(page, 'welcome').getByTestId('welcome-step')).toHaveText('Step 1 of 2');
  await tap(page, 'welcome-next');
  await expect(sheet(page, 'welcome').getByTestId('welcome-step')).toHaveText('Step 2 of 2');
  await tap(page, 'welcome-done');
  await expect(sheet(page, 'welcome')).toHaveCount(0);
});

test('every control on every step is at least 44px tall', async ({ page }) => {
  await openAt(page, '2026-09-27T09:00');
  const small = () => page.evaluate(() => [...document.querySelectorAll('[data-sheet="welcome"] button')]
    .filter((b) => b.getClientRects().length)
    .map((b) => {
      const r = b.getBoundingClientRect();
      const after = getComputedStyle(b, '::after');
      const hit = after.content !== 'none' && after.position === 'absolute' ? r.height + 2 * Math.abs(parseFloat(after.top) || 0) : r.height;
      return { name: b.dataset.action || b.dataset.choice || b.textContent.trim(), h: Math.max(r.height, hit) };
    })
    .filter((x) => x.h < 43.5));
  expect(await small()).toEqual([]);
  await choose(page, 'goal', 'custom');
  expect(await small()).toEqual([]);
  await tap(page, 'welcome-next');
  expect(await small()).toEqual([]);
  await tap(page, 'welcome-next');
  expect(await small()).toEqual([]);
});
