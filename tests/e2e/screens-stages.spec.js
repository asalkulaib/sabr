// The stages sheet and Read more at 390 x 844: every state shot for design
// review, with a contrast audit of each, plus the layout rules the design
// holds the sheet to (checked in every browser).
import { test, expect, openAt, seed, tap, sheet, settings, ms, shot, scrollSheet, smallTargets } from './helpers.js';

const install = settings({ installedAt: ms('2026-09-20T08:00'), lastBackupAt: ms('2026-09-26T08:00'), lastImportAt: ms('2026-09-26T09:00') });
// Last night's window closed at 21:00 on Saturday 26 September.
const LAST_NIGHT = { days: [{ day: '2026-09-26', firstBite: ms('2026-09-26T17:00'), lastBite: ms('2026-09-26T21:00') }], settings: install };

/** Scrolls the open sheet's body so el sits near its top. */
const bring = (page, locator, gap = 16) => locator.evaluate((el, g) => {
  const body = el.closest('.sheet-body');
  body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top - g;
}, gap);

test.describe('screens', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', 'screens are reviewed in WebKit, the engine of iPhone Safari');

  test('the stages sheet, opened from the chip, then each stage in view', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, '2026-09-27T13:10'); // 16 h 10 min: the metabolic switch
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    const s = sheet(page, 'stages');
    await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'st-01-stages-switch');
    await tap(page, 'stage-ketones');
    await expect(s.locator('[data-action="stage-ketones"]')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'st-02-stages-ketones');
    await tap(page, 'stage-sparing');
    await expect(s.locator('[data-action="stage-sparing"]')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'st-03-stages-sparing');
    await tap(page, 'stage-digesting');
    await expect(s.locator('[data-action="stage-digesting"]')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'st-04-stages-digesting');
    await bring(page, s.getByTestId('autophagy-note').locator('xpath=..'), 24);
    await shot(page, 'st-05-stages-autophagy');
    await scrollSheet(page, 'stages');
    await shot(page, 'st-06-stages-sources');
  });

  test('the stages sheet with the icons moving, from About the stages', async ({ page }) => {
    await openAt(page, '2026-09-27T13:10');
    await seed(page, LAST_NIGHT);
    await tap(page, 'about-stages');
    await shot(page, 'st-07-stages-live');
    // A stop focused from the keyboard.
    await sheet(page, 'stages').locator('[data-action="stage-ketones"]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await shot(page, 'st-08-stages-focus');
  });

  test('the first hours', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, '2026-09-26T22:30'); // 1 h 30 min: digesting, no fast so far to draw
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    await shot(page, 'st-09-stages-digesting-now');
  });

  test('the third day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, '2026-09-28T23:30'); // 50 h 30 min: the brain on ketones
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    await shot(page, 'st-10-stages-third-day');
  });

  test('read more: a stage at length, now and not now', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, '2026-09-27T13:10');
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    await tap(page, 'more-switch');
    const more = sheet(page, 'stages').getByTestId('stage-more');
    await expect(more).toHaveAttribute('data-stage', 'switch');
    await shot(page, 'st-11-more-switch');
    await bring(page, more.getByTestId('stage-findings').locator('xpath=..'));
    await shot(page, 'st-12-more-switch-findings');
    await bring(page, more.locator('.advice').locator('xpath=..'));
    await shot(page, 'st-13-more-switch-good-to-know');
    await scrollSheet(page, 'stages');
    await shot(page, 'st-14-more-switch-end');
    await tap(page, 'stages-back-end');
    await tap(page, 'stage-sparing');
    await tap(page, 'more-sparing');
    await expect(more).toHaveAttribute('data-stage', 'sparing');
    await shot(page, 'st-15-more-sparing');
    await scrollSheet(page, 'stages');
    await shot(page, 'st-16-more-sparing-end');
    await tap(page, 'stages-back');
    await tap(page, 'stage-digesting');
    await tap(page, 'more-digesting');
    await shot(page, 'st-17-more-digesting-passed');
  });

  test.describe('at 320 wide', () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('the sheet and a stage page on a small phone', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openAt(page, '2026-09-27T13:10');
      await seed(page, LAST_NIGHT);
      await tap(page, 'open-stages');
      await shot(page, 'st-18-stages-320');
      await tap(page, 'more-switch');
      await shot(page, 'st-19-more-320');
    });
  });
});

test.describe('layout', () => {
  test('a journey line: full bleed, 3.6 stops to a view, the fast in red to Now, the selection in ink', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, '2026-09-27T13:10');
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    const s = sheet(page, 'stages');
    const line = s.getByTestId('stage-line');
    // Full bleed: the line runs from edge to edge of the sheet.
    const box = await line.boundingBox();
    const sheetBox = await s.boundingBox();
    expect(Math.abs(box.x - sheetBox.x)).toBeLessThan(1);
    expect(Math.abs(box.width - sheetBox.width)).toBeLessThan(1);
    const perView = await line.evaluate((el) => el.clientWidth / el.querySelector('.stage-stop').getBoundingClientRect().width);
    expect(perView).toBeCloseTo(3.6, 1);
    // Passed, now and ahead discs.
    expect(await s.locator('.stage-stop .stage-disc').evaluateAll((els) => els.map((e) => e.dataset.state)))
      .toEqual(['passed', 'passed', 'now', 'ahead', 'ahead', 'ahead']);
    // The red bar runs from the first disc's centre to the centre of the stage the fast is in.
    const bar = await s.locator('.stage-progress').boundingBox();
    const first = await s.locator('[data-action="stage-digesting"] .stage-disc').boundingBox();
    const now = await s.locator('[data-action="stage-switch"] .stage-disc').boundingBox();
    expect(Math.abs(bar.x - (first.x + first.width / 2))).toBeLessThan(1.5);
    expect(Math.abs(bar.x + bar.width - (now.x + now.width / 2))).toBeLessThan(1.5);
    // One Now tag on the line (no hook), one stage-now, and the Fast legend.
    await expect(s.locator('.stage-stop .now-tag')).toHaveCount(1);
    await expect(s.locator('[data-action="stage-switch"] .now-tag')).toHaveText('Now');
    await expect(s.getByTestId('stage-now')).toHaveCount(1);
    await expect(s.locator('.legend .legend-item')).toHaveText(['Fast']);
    // The stage in view is ringed in ink; its words turn ink.
    const ringed = await s.locator('[data-action="stage-switch"] .stop-mark').evaluate((el) => {
      const a = getComputedStyle(el, '::after');
      return { colour: a.borderTopColor, opacity: a.opacity, words: getComputedStyle(el.parentElement).color };
    });
    expect(ringed).toEqual({ colour: 'rgb(14, 14, 18)', opacity: '1', words: 'rgb(14, 14, 18)' });
    // Neutral cards, each as tall as its words: Read more 16 under the text and
    // the card's padding under Read more, so no card holds an empty block.
    // The list is as tall as the card in view; the note sits 24 under it.
    const cards = await s.locator('.stage-card').evaluateAll((els) => els.map((e) => {
      const card = e.getBoundingClientRect();
      const text = e.querySelector('.stage-text').getBoundingClientRect();
      const more = e.querySelector('[data-action^="more-"]').getBoundingClientRect();
      return {
        bg: getComputedStyle(e).backgroundColor,
        h: card.height,
        gap: Math.round(more.top - text.bottom),
        foot: Math.round(card.bottom - more.bottom - parseFloat(getComputedStyle(e).paddingBottom)),
      };
    }));
    expect(new Set(cards.map((c) => c.bg))).toEqual(new Set(['rgb(243, 243, 246)']));
    expect(cards.map((c) => c.gap)).toEqual(Array(6).fill(16));
    expect(cards.map((c) => c.foot)).toEqual(Array(6).fill(0));
    const list = await s.locator('.stage-cards').evaluate((el) => ({
      h: el.getBoundingClientRect().height,
      shown: el.querySelector('.stage-card[data-stage="switch"]').getBoundingClientRect().height,
      note: Math.round(el.nextElementSibling.getBoundingClientRect().top - el.getBoundingClientRect().bottom),
    }));
    expect(Math.abs(list.h - list.shown)).toBeLessThan(1);
    expect(list.note).toBe(24);
    // Every button is 44 to touch: by its own box, or a tertiary pill's hit area.
    expect(await smallTargets(page)).toEqual([]);
    // Nothing uppercase.
    expect(await s.evaluate((el) => [...el.querySelectorAll('*')].filter((e) => getComputedStyle(e).textTransform === 'uppercase').length)).toBe(0);
  });

  test('with nothing on record the line has no red, no Now and no legend', async ({ page }) => {
    await openAt(page, '2026-09-27T13:10');
    await page.evaluate(async () => { (await import('/sabr/js/ui/stages.js')).showStagesSheet(null); });
    const s = sheet(page, 'stages');
    await expect(s.locator('.stage-stop')).toHaveCount(6);
    await expect(s.locator('[data-stage-icon]')).toHaveCount(6);
    await expect(s.locator('.stage-progress')).toHaveCount(0);
    await expect(s.locator('.now-tag')).toHaveCount(0);
    await expect(s.locator('.legend')).toHaveCount(0);
  });

  test('in the first stage: Now on the first stop, no red bar yet and so no legend', async ({ page }) => {
    await openAt(page, '2026-09-26T22:30');
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    const s = sheet(page, 'stages');
    await expect(s.locator('[data-action="stage-digesting"] .now-tag')).toHaveCount(1);
    await expect(s.locator('.stage-progress')).toHaveCount(0);
    await expect(s.locator('.legend')).toHaveCount(0);
  });

  test('read more: Back and Close in a fixed head with no title, one h2, the page turns each way', async ({ page }) => {
    await openAt(page, '2026-09-27T13:10');
    await seed(page, LAST_NIGHT);
    await tap(page, 'open-stages');
    const s = sheet(page, 'stages');
    await tap(page, 'more-switch');
    const more = s.getByTestId('stage-more');
    await expect(s.locator('.sheet-body')).toHaveAttribute('data-dir', 'forward');
    await expect(s.locator(':scope > .sheet-head [data-action="stages-back"]')).toBeVisible();
    await expect(s.locator(':scope > .sheet-head [data-action="close-sheet"]')).toBeVisible();
    await expect(s.locator(':scope > .sheet-head h2')).toHaveCount(0);
    await expect(more.locator('[data-action="stages-back"]')).toHaveCount(0);
    await expect(more.locator('h2')).toHaveCount(1);
    await expect(s.locator('a')).toHaveCount(0);
    // Focus lands on the stage's name.
    await expect(more.locator('h2')).toBeFocused();
    // The head stays put while the page scrolls.
    const headTop = (await s.locator('.sheet-head').boundingBox()).y;
    await scrollSheet(page, 'stages');
    expect((await s.locator('.sheet-head').boundingBox()).y).toBeCloseTo(headTop, 0);
    // Each finding on its own card, not tappable.
    await expect(more.getByTestId('stage-findings').locator('> li')).toHaveCount(3);
    expect(await more.getByTestId('stage-findings').locator('> li').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(243, 243, 246)');
    await tap(page, 'stages-back');
    await expect(s.locator('.sheet-body')).toHaveAttribute('data-dir', 'back');
    await expect(s.locator('[data-action="stage-switch"]')).toHaveAttribute('aria-current', 'true');
  });
});
