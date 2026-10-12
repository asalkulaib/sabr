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
