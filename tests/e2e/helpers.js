import { test as base, expect } from '@playwright/test';

export { expect };

// The app's own origin (the offline test runs its own server on another local port).
const ORIGIN = 'http://localhost:';

/** Kuwait local time ('2026-09-27T17:30') to a Date. */
export const T = (s) => new Date(`${s}:00+03:00`);
export const ms = (s) => T(s).getTime();
export const MIN = 60_000;

/**
 * Every test also checks that the app never requests anything outside its
 * own origin (no CDN, no analytics).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const outside = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(ORIGIN) && !url.startsWith('blob:') && !url.startsWith('data:')) outside.push(url);
    });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(outside, 'requests outside the app').toEqual([]);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

/**
 * Just after Fast opens it records whether iOS keeps its storage, and that
 * redraws the screen once. Waits for that redraw, so a test never holds an
 * element the redraw is about to replace.
 */
async function settle(page) {
  await page.waitForFunction(async () => {
    const db = await import('/sabr/js/db.js');
    const all = await db.readAll();
    return all.settings.some((s) => s.key === 'persisted');
  });
  // The redraw follows the saved setting within the same turn of the page.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Freezes the page clock at a Kuwait time and opens a route. */
export async function openAt(page, when, route = '') {
  await page.clock.install({ time: T(when) });
  await page.goto(`./${route}`);
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await settle(page);
}

/** Replaces the whole database, then reloads so the app reads it. */
export async function seed(page, data) {
  await page.evaluate(async (d) => {
    const db = await import('/sabr/js/db.js');
    await db.replaceAll(d);
  }, {
    days: [], meals: [], outside: [], temptations: [], weights: [], settings: [], ...data,
  });
  await page.reload();
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  await settle(page);
}

export async function readDb(page) {
  return page.evaluate(async () => {
    const db = await import('/sabr/js/db.js');
    return db.readAll();
  });
}

/** Moves the clock forward; the app's one-second tick then re-renders. */
export async function advance(page, minutes) {
  await page.clock.fastForward(minutes * MIN);
  await page.clock.fastForward(1000);
}

export const act = (page, name) => page.locator(`[data-action="${name}"]:visible`).first();
export const tap = async (page, name) => act(page, name).click();
export const pick = (page, scale, value) => page.locator(`button[data-scale="${scale}"][data-value="${value}"]:visible`).first().click();
export const choose = (page, name, value) => page.locator(`button[data-choice="${name}"][data-value="${value}"]:visible`).first().click();

/**
 * Rolls a time wheel to HH:MM the way a finger does: touch, roll, come to rest.
 * Saving can redraw the screen between finding a column and rolling it; a
 * roll that landed on a column no longer on screen is made again.
 */
export async function setTime(page, name, hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const wheel = page.locator(`[data-time="${name}"]:visible`).first();
  for (const [part, value] of [['hour', hh], ['minute', mm]]) {
    await expect(async () => {
      const rolled = await wheel.locator(`[data-part="${part}"]`).evaluate((col, v) => {
        if (!col.isConnected) return false;
        col.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        col.scrollTop = v * col.querySelector('.wheel-item').offsetHeight;
        col.dispatchEvent(new Event('scroll'));
        col.dispatchEvent(new Event('scrollend'));
        return true;
      }, value);
      expect(rolled).toBe(true);
    }).toPass({ timeout: 5000 });
  }
}

/** Rolls a date wheel to a day ('2026-09-29'), the same way as setTime. */
export async function setDate(page, name, key) {
  const col = page.locator(`[data-date="${name}"]:visible [data-part="date"]`).first();
  await expect(async () => {
    const rolled = await col.evaluate((c, k) => {
      if (!c.isConnected) return false;
      const item = c.querySelector(`.wheel-item[data-key="${k}"]`);
      if (!item) throw new Error(`${k} is not on this wheel`);
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      c.scrollTop = Number(item.dataset.value) * item.offsetHeight;
      c.dispatchEvent(new Event('scroll'));
      c.dispatchEvent(new Event('scrollend'));
      return true;
    }, key);
    expect(rolled).toBe(true);
  }).toPass({ timeout: 5000 });
}

/** Rolls an option wheel (such as the goal's hours) to a value. */
export async function setPick(page, name, value) {
  const col = page.locator(`[data-pick="${name}"]:visible [data-part="option"]`).first();
  await expect(async () => {
    const rolled = await col.evaluate((c, v) => {
      if (!c.isConnected) return false;
      const item = c.querySelector(`.wheel-item[data-key="${v}"]`);
      if (!item) throw new Error(`${v} is not on this wheel`);
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      c.scrollTop = Number(item.dataset.value) * item.offsetHeight;
      c.dispatchEvent(new Event('scroll'));
      c.dispatchEvent(new Event('scrollend'));
      return true;
    }, String(value));
    expect(rolled).toBe(true);
  }).toPass({ timeout: 5000 });
}

export const sheet = (page, name) => page.locator(`[data-sheet="${name}"]`);

/** Settings row helper for seeding. */
export const settings = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }));

/**
 * Replaces navigator.share so tests can read the files the app hands to iOS.
 * Shared files land in window.__shared as { name, type, text, head } where
 * head is the first three bytes (text() drops a UTF-8 byte order mark).
 */
export async function captureShares(page) {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => {
      for (const f of files) {
        const head = [...new Uint8Array(await f.slice(0, 3).arrayBuffer())];
        window.__shared.push({ name: f.name, type: f.type, text: await f.text(), head });
      }
    };
  });
}

export async function sharedFiles(page) {
  return page.evaluate(() => window.__shared);
}
