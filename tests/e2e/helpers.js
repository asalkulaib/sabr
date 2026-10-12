import { mkdir, writeFile } from 'node:fs/promises';
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
 * own origin (no CDN, no analytics). The first-run welcome stays away unless
 * a spec asks for it with test.use({ welcome: true }).
 */
export const test = base.extend({
  welcome: [false, { option: true }],
  page: async ({ page, welcome }, use) => {
    if (!welcome) {
      await page.addInitScript(() => {
        try { localStorage.setItem('sabr.welcomed', '1'); } catch { /* storage blocked: the app's own check decides */ }
      });
    }
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

// ---------- Screenshots for design review ----------

export const SCREENS_DIR = 'test-results/screens';

/** Every visible text must reach 4.5:1 (3:1 at 24px and above) on its background. */
export async function audit(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(',').map((x) => Number(x.trim()));
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el) => {
      // The chosen option of a sliding track sits on its ink pill, a sibling
      // drawn behind it; so does the tab you are on.
      if (el.closest('.tab[aria-current="page"]')) return { r: 14, g: 14, b: 18, a: 1 };
      if (el.closest('.choice button[aria-checked="true"], .scale button[aria-checked="true"]')) return { r: 14, g: 14, b: 18, a: 1 };
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0.5) return c;
        if (e.classList && e.classList.contains('sheet')) break;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
    const bad = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (el.closest('[hidden], button[disabled]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const bg = background(el);
      const fg = blend(parse(el instanceof SVGElement ? cs.fill : cs.color), bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const need = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66) ? 3 : 4.5;
      if (ratio + 0.01 < need) bad.push(`${text.slice(0, 40)} (${ratio.toFixed(2)} at ${size}px)`);
    }
    return bad;
  });
}

/** The project can sit in a synced folder that holds a file for a moment: retry the write. */
async function save(path, png) {
  await mkdir(SCREENS_DIR, { recursive: true });
  for (let i = 0; ; i++) {
    try {
      return await writeFile(path, png);
    } catch (err) {
      if (i >= 5) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

/** Waits until every animation that ends has ended (ring draws, sheets, fades); loops never end. */
export async function settleMotion(page) {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); })
      .map((a) => a.finished.catch(() => {}))),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]));
}

/** Shoots the screen into test-results/screens/<name>.png, then audits its text contrast. */
export async function shot(page, name, { full = false } = {}) {
  await page.waitForTimeout(450); // let fades settle
  await settleMotion(page);
  await save(`${SCREENS_DIR}/${name}.png`, await page.screenshot({ fullPage: full }));
  expect(await audit(page), `contrast on ${name}`).toEqual([]);
  expect(await underMessage(page), `message over the sheet on ${name}`).toEqual([]);
  expect(await smallTargets(page), `targets under 44px on ${name}`).toEqual([]);
}

/**
 * Every button, chip, legend chip and track option on show is at least 44px
 * tall, by its own box or by a hit area drawn as its ::after (spec 4.4, 7).
 */
export async function smallTargets(page) {
  return page.evaluate(() => {
    const HIT = 44 - 0.5;
    const px = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
    const out = [];
    for (const el of document.querySelectorAll('button, .btn-2, .chip, .legend-pick, [role="radio"]')) {
      if (el.closest('[hidden], [inert]') && !el.closest('#sheet-root')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue; // off screen: checked where it shows
      if (r.height >= HIT) continue;
      const a = getComputedStyle(el, '::after');
      let hit = 0;
      if (a.content !== 'none' && a.position === 'absolute') {
        const h = px(a.height);
        const top = px(a.top);
        const bottom = px(a.bottom);
        hit = h != null && h > 0 ? h : top != null && bottom != null ? r.height - top - bottom : 0;
      }
      if (hit >= HIT) continue;
      const name = el.dataset.action || el.dataset.value || el.dataset.tab || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24);
      out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${name}" ${Math.round(r.height)}px`);
    }
    return out;
  });
}

/**
 * The controls and words of an open sheet that a message covers. A body that
 * scrolls and is not at its end is skipped: what it hides is a scroll away.
 */
export async function underMessage(page) {
  return page.evaluate(() => {
    const flash = document.querySelector('#flash-root .flash:not(.fade-out)');
    const sheet = document.querySelector('#sheet-root:not([hidden]) [data-sheet]');
    if (!flash || !sheet) return [];
    const body = sheet.querySelector(':scope > .sheet-body');
    if (body && body.scrollTop + body.clientHeight < body.scrollHeight - 1) return [];
    const f = flash.getBoundingClientRect();
    // What shows of a box: cut by every ancestor that clips (a wheel shows
    // only the rows around its lens), and nothing when it is hidden.
    const seen = (r, el) => {
      let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      for (let e = el; e && e !== sheet.parentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
        if (e !== el && cs.overflow !== 'visible') {
          const c = e.getBoundingClientRect();
          box = { left: Math.max(box.left, c.left), right: Math.min(box.right, c.right), top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
        }
      }
      return box.right > box.left && box.bottom > box.top ? box : null;
    };
    const hits = (r, el) => {
      const b = seen(r, el);
      return !!b && b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top;
    };
    const out = [];
    for (const el of sheet.querySelectorAll('[data-action]')) {
      if (hits(el.getBoundingClientRect(), el)) out.push(`[data-action="${el.dataset.action}"]`);
    }
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((r) => hits(r, node.parentElement))) out.push(node.textContent.trim().slice(0, 40));
    }
    return out;
  });
}

/** Scrolls an open sheet to its top or its end: only the sheet's body scrolls. */
export async function scrollSheet(page, name, to = 'end') {
  await page.locator(`[data-sheet="${name}"]`).evaluate((el, end) => {
    for (const box of [el, el.querySelector(':scope > .sheet-body')]) {
      if (box) box.scrollTop = end ? box.scrollHeight : 0;
    }
  }, to === 'end');
}
