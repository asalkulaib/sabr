// The design guards (spec 4.4): every style comes from a token. tokens.css is
// the one file with raw colours, px type, durations and easings; palette.js
// mirrors the colours for SVG drawing. The 44px target guard (7) is measured
// in the browser: shot() in tests/e2e/helpers.js runs it on every screenshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs');
const all = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else all.push(full);
  }
})(root);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const read = (f) => readFileSync(f, 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Every CSS file but the tokens and the generated font faces.
const CSS = all.filter((f) => f.endsWith('.css') && !['css/tokens.css', 'css/fonts.css'].includes(rel(f))).map((f) => [rel(f), read(f)]);
// Declarations, with comments taken out so a comment never trips a guard.
const decls = (text, prop) => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`(?:^|[\\s;{])(${prop})\\s*:\\s*([^;{}]+);`, 'g'))];

test('1. no raw colour outside tokens.css, palette.js, the icon and the theme colours', () => {
  const allowed = new Set(['css/tokens.css', 'js/ui/palette.js', 'icons/icon.svg']);
  const bad = [];
  for (const f of all.filter((x) => /\.(css|js|html|webmanifest|svg)$/.test(x))) {
    const r = rel(f);
    if (allowed.has(r)) continue;
    const text = read(f);
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) {
      const line = text.split('\n')[lineOf(text, m.index) - 1];
      // The browser's own bar and the Home Screen splash take a plain colour.
      if (/name="theme-color"|"(theme|background)_color"/.test(line)) continue;
      // An id in a URL fragment (url(#stripes), href="#week") is not a colour.
      if (m[0].startsWith('#') && (/url\($|href="$/.test(text.slice(m.index - 6, m.index)) || /^#[0-9a-fA-F]{3,8}[g-zG-Z_-]/.test(text.slice(m.index, m.index + 10)))) continue;
      bad.push(`${r}:${lineOf(text, m.index)} ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('2. no px type outside tokens.css; weights only 600 to 900 or a token', () => {
  const bad = [];
  for (const [r, text] of CSS) {
    for (const [, prop, v] of decls(text, 'font-size|line-height')) if (/\d(px|pt|rem)\b/.test(v)) bad.push(`${r}: ${prop}: ${v}`);
    for (const [, prop, v] of decls(text, 'font-weight')) if (!/^(600|700|800|900|inherit|var\(--[\w-]+\))$/.test(v.trim())) bad.push(`${r}: ${prop}: ${v}`);
    for (const [, prop, v] of decls(text, 'font')) if (v.trim() !== 'inherit') bad.push(`${r}: ${prop}: ${v} (use the -size, -lh and -track tokens)`);
  }
  assert.deepEqual(bad, []);
});

test('3. margin, padding and gap from the 4pt scale and its aliases', () => {
  const bad = [];
  for (const [r, text] of CSS) {
    for (const [, prop, v] of decls(text, '(?:margin|padding|gap|row-gap|column-gap)(?:-[a-z-]+)?')) {
      // 0, tokens, calc() of tokens and em (the units of a big figure) only.
      if (/\d(px|rem|pt|vh|vw|%)/.test(v.replace(/\b0(px)?\b/g, ''))) bad.push(`${r}: ${prop}: ${v.trim()}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('4. motion from the named durations, delays and easings', () => {
  const bad = [];
  for (const [r, text] of CSS) {
    for (const [, prop, v] of decls(text, '(?:transition|animation)(?:-[a-z]+)?')) {
      if (/(?<![\w-])\d*\.?\d+(ms|s)\b/.test(v)) bad.push(`${r}: ${prop}: ${v.trim()} (raw time)`);
      if (/(?<![-\w])ease(?![-\w])|ease-in-out(?![-\w])|cubic-bezier\(|steps\(/.test(v.replace(/var\(--ease-[\w-]+\)/g, ''))) bad.push(`${r}: ${prop}: ${v.trim()} (raw easing)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('5. every file that animates stops under Reduce Motion, with no keyframes inside', () => {
  const bad = [];
  for (const [r, text] of CSS) {
    if (!/animation(-name)?\s*:\s*(?!none)|transition\s*:[^;]*transform/.test(text)) continue;
    const blocks = [...text.matchAll(/@media \(prefers-reduced-motion: reduce\) \{/g)];
    if (!blocks.length) bad.push(`${r} has no Reduce Motion block`);
    for (const b of blocks) {
      let depth = 0;
      let i = b.index + b[0].length - 1;
      const start = i;
      for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) break;
      }
      if (/@keyframes/.test(text.slice(start, i))) bad.push(`${r}: keyframes inside Reduce Motion`);
    }
  }
  assert.deepEqual(bad, []);
});

test('6. sentence case: no uppercase anywhere in the styles', () => {
  const bad = CSS.filter(([, text]) => /text-transform\s*:\s*uppercase|font-variant(-caps)?\s*:[^;]*(small-caps|all-caps)/.test(text)).map(([r]) => r);
  assert.deepEqual(bad, []);
});

test('8. every ring size is a ring token, in CSS and in the code that draws rings', async () => {
  const { RING } = await import(path.join(root, 'js', 'ui', 'rings.js'));
  const sizes = new Set(Object.values(RING).map((r) => r.size));
  const tokens = read(path.join(root, 'css', 'tokens.css'));
  const ringTokens = new Set([...tokens.matchAll(/(--ring-[\w-]+):/g)].map((m) => m[1]));
  const bad = [];
  for (const [r, text] of CSS) {
    // Ring tokens used are ring tokens that exist.
    for (const [, name] of text.matchAll(/var\((--ring-[\w-]+)/g)) if (!ringTokens.has(name)) bad.push(`${r}: ${name} is not a token`);
    // A rule for a ring's box sizes it with a ring token.
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*\.ring[\w-]*[^{}]*)\{([^{}]*)\}/g)) {
      for (const [, prop, v] of decls(`{${m[2]}`, 'width|height|inline-size|block-size|min-width|min-height')) {
        if (/\d(px|rem)/.test(v)) bad.push(`${r}: ${m[1].trim()} ${prop}: ${v.trim()}`);
      }
    }
  }
  for (const f of all.filter((x) => x.endsWith('.js'))) {
    const text = read(f);
    const r = rel(f);
    // A number passed as a ring's size: resultRing(result, 120), emptyRings(56),
    // or { size: 120 } in a call to ringsSvg, progressRing or resultRing.
    for (const m of text.matchAll(/\b(?:resultRing|emptyRings)\(\s*(?:[^,()]+,\s*)?(\d+)\b/g)) {
      if (!sizes.has(Number(m[1]))) bad.push(`${r}:${lineOf(text, m.index)} ring size ${m[1]}`);
    }
    for (const m of text.matchAll(/\b(?:ringsSvg|progressRing|resultRing)\([^;]*?\bsize:\s*(\d+)\b/g)) {
      if (!sizes.has(Number(m[1]))) bad.push(`${r}:${lineOf(text, m.index)} ring size ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
