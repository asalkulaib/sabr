// The design tokens: the type steps, the spacing scale and the ring sizes,
// with the ring sizes the same in CSS and in js/ui/rings.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs');
const tokens = readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
const value = (name) => {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};

test('ten type steps, each a size, a line height and a tracking', () => {
  const steps = {
    hero: [56, 56], display: [40, 44], 'title-1': [32, 38], 'title-2': [24, 30], 'title-3': [20, 26],
    headline: [17, 22], body: [17, 26], callout: [15, 22], footnote: [13, 18], micro: [11, 14],
  };
  for (const [step, [size, lh]] of Object.entries(steps)) {
    assert.equal(value(`--t-${step}-size`), `${size}px`, step);
    assert.equal(value(`--t-${step}-lh`), `${lh}px`, step);
    assert.ok(value(`--t-${step}-track`) != null, `${step} tracking`);
  }
});

test('the 4pt spacing scale', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24]) assert.equal(value(`--space-${n}`), `${n * 4}px`, `--space-${n}`);
});

test('the ring sizes are the same in CSS and in rings.js', async () => {
  const { RING } = await import(path.join(root, 'js', 'ui', 'rings.js'));
  for (const [name, { size, stroke }] of Object.entries(RING)) {
    assert.equal(value(`--ring-${name}`), `${size}px`, `--ring-${name}`);
    assert.equal(value(`--ring-${name}-stroke`), `${stroke}px`, `--ring-${name}-stroke`);
  }
});

test('motion: three easings and the named durations', () => {
  for (const name of ['--ease-out', '--ease-in', '--ease-in-out']) assert.match(value(name), /^cubic-bezier\(/, name);
  for (const name of ['press', 'fast', 'base', 'glide', 'sheet', 'chart', 'burst', 'spin', 'reduced', 'spinner']) assert.match(value(`--dur-${name}`), /^\d+ms$/, name);
  assert.equal(value('--press-scale'), '0.97');
});

test('the wheel row is the same in CSS and in components.js', () => {
  const js = readFileSync(path.join(root, 'js', 'ui', 'components.js'), 'utf8');
  const row = js.match(/const ROW = (\d+);/);
  assert.ok(row, 'ROW in components.js');
  assert.equal(value('--wheel-row'), `${row[1]}px`);
});

// The system's own files keep to the tokens (spec 4.4); the screens' files
// follow once each screen has moved to them.
const SYSTEM_CSS = ['base', 'components'].map((n) => [n, readFileSync(path.join(root, 'css', `${n}.css`), 'utf8')]);

test('system CSS: sizes, weights and case come from the type scale', () => {
  for (const [name, text] of SYSTEM_CSS) {
    assert.doesNotMatch(text, /(font-size|line-height)\s*:\s*[\d.]+px/, `${name}.css sets a px font size or line height`);
    for (const [, w] of text.matchAll(/font-weight\s*:\s*([^;]+);/g)) assert.match(w.trim(), /^(600|700|800|900|inherit)$/, `${name}.css font-weight ${w}`);
    assert.doesNotMatch(text, /text-transform\s*:\s*uppercase/, `${name}.css uses uppercase`);
  }
});

test('system CSS: space from the 4pt scale, motion from the named durations and easings', () => {
  for (const [name, text] of SYSTEM_CSS) {
    for (const [decl] of text.matchAll(/(?:^|[\s;{])(?:margin|padding|gap|row-gap|column-gap)(?:-[a-z]+)*\s*:\s*[^;]+;/g)) {
      assert.doesNotMatch(decl, /\d(px|rem)/, `${name}.css: ${decl.trim()}`);
    }
    for (const [decl] of text.matchAll(/(?:transition|animation)(?:-[a-z]+)*\s*:\s*[^;]+;/g)) {
      assert.doesNotMatch(decl, /\d(ms|s)\b/, `${name}.css: ${decl.trim()}`);
      assert.doesNotMatch(decl, /(?<![-\w])ease(?![-\w])|cubic-bezier\(/, `${name}.css: ${decl.trim()}`);
    }
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,6}\b|rgba\(/, `${name}.css has a raw colour`);
  }
});

test('system CSS: every file that animates stops under Reduce Motion, with no keyframes inside', () => {
  for (const [name, text] of SYSTEM_CSS) {
    if (!/animation\s*:|transition\s*:[^;]*transform/.test(text)) continue;
    const blocks = [...text.matchAll(/@media \(prefers-reduced-motion: reduce\) \{/g)];
    assert.ok(blocks.length, `${name}.css has a Reduce Motion block`);
    for (const b of blocks) {
      let depth = 0;
      let i = b.index + b[0].length - 1;
      const start = i;
      for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) break;
      }
      assert.doesNotMatch(text.slice(start, i), /@keyframes/, `${name}.css: keyframes inside Reduce Motion`);
    }
  }
});
