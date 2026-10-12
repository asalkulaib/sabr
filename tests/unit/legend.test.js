// Every legend key a screen asks for is one key() draws, so no word in a
// legend is ever left without its mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_KINDS, LEGACY_KEYS, legacyKind } from '../../docs/js/ui/components.js';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/js/ui');
const sources = fs.readdirSync(UI).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(UI, f), 'utf8')]);

/** The text of each call to a function whose name ends in "egend" (legend, stopLegend...), up to its closing bracket. */
function legendCalls(src) {
  const out = [];
  const re = /\b\w*[lL]egend\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    out.push(src.slice(re.lastIndex, i));
  }
  return out;
}

test('every legacy legend name points at a key that is drawn', () => {
  for (const [name, kind] of Object.entries(LEGACY_KEYS)) assert.ok(KEY_KINDS.includes(kind), `${name} -> ${kind}`);
});

test('every kind in KEY_KINDS has its own drawing in key()', () => {
  const src = fs.readFileSync(path.join(UI, 'components.js'), 'utf8');
  const body = src.slice(src.indexOf('export function key('), src.indexOf('export const KEY_KINDS'));
  const results = src.slice(src.indexOf('const RESULT_KEYS'), src.indexOf('\n', src.indexOf('const RESULT_KEYS')));
  for (const kind of KEY_KINDS) {
    const drawn = body.includes(`'${kind}'`) || results.includes(`'${kind}'`) || (kind.startsWith('stop-') && body.includes("startsWith('stop-')"));
    assert.ok(drawn, `key('${kind}') has no drawing`);
  }
});

test('every key a screen names is one key() draws', () => {
  const unknown = [];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/\bkey\(\s*'([\w-]+)'/g)) {
      if (!KEY_KINDS.includes(m[1])) unknown.push(`${file}: key('${m[1]}')`);
    }
    for (const call of legendCalls(src)) {
      for (const m of call.matchAll(/\[\s*'([\w-]+)'\s*,/g)) {
        const kind = LEGACY_KEYS[m[1]] || m[1];
        if (!KEY_KINDS.includes(kind)) unknown.push(`${file}: legend '${m[1]}'`);
      }
    }
  }
  assert.deepEqual(unknown, []);
});

// A key in one ring's colour beside another ring's words breaks "colour means
// one thing". Old names that stand for different marks on different screens
// resolve to the mark each screen draws.
const FAMILY = (kind) => (/fast|^sun$/.test(kind) ? 'fast' : /win|^track-|^band-(used|left)$/.test(kind) ? 'win' : 'other');

test('an old legend name draws the mark its own screen draws', () => {
  // Week strip: the open window is pale green with a green edge.
  assert.equal(legacyKind('bar', 'strip-legend', 'Window still open'), 'track-open');
  // History: Feast bars are green, Fast bars pale red, paused days a grey band, the selected day ink.
  assert.equal(legacyKind('bar', 'history-legend', 'Hours in the window'), 'bar-win');
  assert.equal(legacyKind('bar', 'history-legend', 'Hours fasted'), 'bar-fast-short');
  assert.equal(legacyKind('bar', 'history-legend', 'Short of the goal'), 'bar-fast-short');
  assert.equal(legacyKind('paused', 'history-legend', 'Paused'), 'band-paused');
  assert.equal(legacyKind('pick', 'history-legend', 'Selected day'), 'bar-selected');
  // Elsewhere the plain mapping holds: the paused day ring on Week, the latest weigh-in square on Weight.
  assert.equal(legacyKind('paused', 'strip-legend', 'Paused'), 'day-paused');
  assert.equal(legacyKind('pick', 'weight-legend', 'Latest'), 'latest-square');
});

test('words about the window never get a key in the fast\'s colour, and the other way round', () => {
  const wrong = [];
  const check = (file, name, testid, label) => {
    const fam = FAMILY(legacyKind(name, testid, label));
    if (/window/i.test(label) && fam === 'fast') wrong.push(`${file}: '${name}' beside "${label}"`);
    if (/fast/i.test(label) && fam === 'win') wrong.push(`${file}: '${name}' beside "${label}"`);
  };
  for (const [file, src] of sources) {
    for (const call of legendCalls(src)) {
      const testid = (call.match(/\]\s*,\s*'([\w-]+)'/g) || []).map((t) => t.match(/'([\w-]+)'/)[1]).pop();
      for (const m of call.matchAll(/\[\s*'([\w-]+)'\s*,\s*'([^']+)'/g)) check(file, m[1], testid, m[2]);
    }
  }
  // History builds its bar item's words from its metrics.
  for (const label of ['Hours in the window', 'Hours fasted', 'Short of the goal']) check('history.js', 'bar', 'history-legend', label);
  assert.deepEqual(wrong, []);
});
