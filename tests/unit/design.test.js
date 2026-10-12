// Guards for the Rings theme and the copy rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(css|js|html|webmanifest|svg)$/.test(name)) files.push(full);
  }
})(root);
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => path.relative(root, f);
// tokens.css holds every token; the other files are walked through `files`.
const css = read(path.join(root, 'css', 'tokens.css'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

// Rings: white page, soft grey cards, ink text; red the fast, green the
// window, blue fullness, orange stripes a miss, indigo weight.
const PALETTE = {
  '--bg': '#FFFFFF', '--bg-raised': '#F3F3F6', '--bg-raised-2': '#FFFFFF',
  '--text-display': '#0E0E12', '--text-body': '#1C1C22', '--text-quiet': '#5C5C66',
  '--text-label': '#4A4A55', '--text-marginalia': '#9A9AA4', '--ink': '#0E0E12', '--track': '#E4E4EA',
  '--fast': '#FF2E63', '--fast-soft': '#FFE3EA', '--fast-text': '#C8103F', '--fast-deep': '#A30B33',
  '--win': '#2FCB57', '--win-soft': '#DDF7E3', '--win-text': '#117534',
  '--full': '#12AEEA', '--full-soft': '#DCF3FC', '--full-text': '#05698F',
  '--miss': '#FF7A00', '--miss-text': '#A84D00',
  '--weight': '#5B5BF0', '--weight-soft': '#ECECFE', '--weight-text': '#3C3CC0',
  '--night': '#05060B',
};

// The ink-alpha tokens, checked as plain text: '(' and '.' would be regex syntax.
const RGBA = {
  '--rule-quiet': 'rgba(14, 14, 18, 0.12)',
  '--shade': 'rgba(14, 14, 18, 0.06)',
  '--edge': 'rgba(14, 14, 18, 0.5)',
  '--scrim': 'rgba(14, 14, 18, 0.4)',
};

test('the colour tokens are exactly the brief', () => {
  for (const [name, hex] of Object.entries(PALETTE)) {
    assert.match(css, new RegExp(`${name}:\\s*${hex};`, 'i'), name);
  }
  for (const [name, value] of Object.entries(RGBA)) {
    assert.ok(css.includes(`${name}: ${value};`), `${name}: ${value}`);
  }
});

test('the styles are layered files, linked in order, with app.css gone', () => {
  const order = ['tokens', 'base', 'components', 'today', 'stages', 'sheets', 'week', 'history', 'satiety', 'more', 'welcome'];
  assert.match(css, /^@layer tokens, base, components, screens;/);
  const layerOf = { tokens: 'tokens', base: 'base', components: 'components' };
  for (const name of order) {
    const text = read(path.join(root, 'css', `${name}.css`));
    assert.match(text, new RegExp(`@layer ${layerOf[name] || 'screens'} \\{`), `${name}.css`);
    assert.doesNotMatch(text, /@import/, `${name}.css`);
  }
  assert.ok(!cssFiles.some((f) => f.endsWith('app.css')), 'app.css is gone');
  const linked = (html) => [...html.matchAll(/<link rel="stylesheet" href="(?:\.\.\/)?css\/([\w-]+)\.css">/g)].map((m) => m[1]);
  assert.deepEqual(linked(read(path.join(root, 'index.html'))), ['fonts', ...order]);
  assert.deepEqual(linked(read(path.join(root, 'import', 'index.html'))), ['fonts', 'tokens', 'base', 'components', 'history']);
});

test('the drawing colours in palette.js match the tokens', async () => {
  const P = await import(path.join(root, 'js', 'ui', 'palette.js'));
  const pairs = { INK: '--ink', PAGE: '--bg', CARD: '--bg-raised', TRACK: '--track', QUIET: '--text-quiet',
    FAST: '--fast', FAST_SOFT: '--fast-soft', FAST_TEXT: '--fast-text', FAST_DEEP: '--fast-deep',
    WIN: '--win', WIN_SOFT: '--win-soft', WIN_TEXT: '--win-text', FULL: '--full', FULL_SOFT: '--full-soft', FULL_TEXT: '--full-text',
    MISS: '--miss', MISS_TEXT: '--miss-text', WEIGHT: '--weight', WEIGHT_SOFT: '--weight-soft', WEIGHT_TEXT: '--weight-text',
    MARGINALIA: '--text-marginalia' };
  for (const [k, token] of Object.entries(pairs)) assert.equal(P[k].toUpperCase(), PALETTE[token].toUpperCase(), k);
  assert.equal(P.EDGE, RGBA['--edge']);
  assert.equal(P.GRID, RGBA['--rule-quiet']);
});

test('no colour outside the palette anywhere', () => {
  const allowed = new Set(Object.values(PALETTE).map((h) => h.toLowerCase()));
  for (const f of files) {
    for (const [hex] of read(f).matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      assert.ok(allowed.has(hex.toLowerCase()), `${rel(f)} uses ${hex}`);
    }
    for (const [rgba] of read(f).matchAll(/rgba\(([^)]*)\)/g)) {
      assert.match(rgba, /rgba\(14, 14, 18, 0?\.\d+\)/, `${rel(f)} uses ${rgba}`);
    }
  }
});

test('corners only from the radius tokens; no shadows, gradients, glass or banned fonts', () => {
  // Rounded: what you tap (pills and controls), panels and sheets. Every
  // radius comes from a token, so the shapes stay a small, deliberate set.
  assert.match(css, /--r-pill:\s*999px;/);
  assert.match(css, /--r-control:\s*\d+px;/);
  assert.match(css, /--r-panel:\s*\d+px;/);
  assert.match(css, /--r-sheet:\s*\d+px;/);
  for (const f of files.filter((x) => /\.(css|js|html)$/.test(x))) {
    const text = read(f);
    for (const [decl] of text.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
      assert.match(decl, /:\s*(0|var\(--r-[a-z]+\))( (0|var\(--r-[a-z]+\)))*;$/, `${rel(f)}: ${decl}`);
    }
    assert.doesNotMatch(text, /box-shadow|text-shadow|drop-shadow/, rel(f));
    assert.doesNotMatch(text, /gradient\(/, rel(f));
    assert.doesNotMatch(text, /backdrop-filter|filter:\s*blur/, rel(f));
    assert.doesNotMatch(text, /\bInter\b|Geist|Space Grotesk/, rel(f));
  }
});

test('copy: no em dashes, emojis, checkmarks or "it\'s not X, it\'s Y"', () => {
  const copyFiles = [...files, path.resolve('README.md')];
  for (const f of copyFiles) {
    const text = read(f);
    assert.doesNotMatch(text, /—/, `${rel(f)} has an em dash`);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${rel(f)} has an emoji`);
    assert.doesNotMatch(text, /[✓✔✅]/, `${rel(f)} has a checkmark`);
    assert.doesNotMatch(text, /\bit'?s not [^.]{1,40}, it'?s\b/i, `${rel(f)} uses the "it's not X, it's Y" pattern`);
  }
});

test('nothing loads from another origin', () => {
  for (const f of files) {
    const urls = [...read(f).matchAll(/https?:\/\/[^\s'")]+/g)].map((m) => m[0]);
    for (const u of urls) assert.equal(u, 'http://www.w3.org/2000/svg', `${rel(f)} references ${u}`);
  }
});

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('text contrast on white and on the cards', () => {
  const grounds = [PALETTE['--bg'], PALETTE['--bg-raised']];
  for (const token of ['--text-display', '--text-body', '--text-quiet', '--text-label', '--fast-text', '--win-text', '--full-text', '--miss-text', '--weight-text']) {
    for (const g of grounds) assert.ok(contrast(PALETTE[token], g) >= 4.5, `${token} on ${g}: ${contrast(PALETTE[token], g).toFixed(2)}`);
  }
  // Each colour's words on its own soft fill.
  for (const [t, g] of [['--fast-text', '--fast-soft'], ['--win-text', '--win-soft'], ['--full-text', '--full-soft'], ['--weight-text', '--weight-soft']]) {
    assert.ok(contrast(PALETTE[t], PALETTE[g]) >= 4.5, `${t} on ${g}`);
  }
  // White words on ink and on the deep reds; ink on the window's green (Start a meal).
  assert.ok(contrast(PALETTE['--bg'], PALETTE['--ink']) >= 4.5);
  assert.ok(contrast(PALETTE['--bg'], PALETTE['--fast-text']) >= 4.5);
  assert.ok(contrast(PALETTE['--bg'], PALETTE['--fast-deep']) >= 4.5);
  assert.ok(contrast(PALETTE['--ink'], PALETTE['--win']) >= 4.5);
  // The ring colours themselves are fills, never text on white.
  for (const t of ['--fast', '--win', '--full', '--miss']) assert.ok(contrast(PALETTE[t], PALETTE['--bg']) < 4.5, t);
  // Marginalia colour is decorative only.
  assert.ok(contrast(PALETTE['--text-marginalia'], PALETTE['--bg']) < 4.5);
});
