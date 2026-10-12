// Every legend key a screen asks for is one key() draws, so no word in a
// legend is ever left without its mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_KINDS } from '../../docs/js/ui/components.js';

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
        if (!KEY_KINDS.includes(m[1])) unknown.push(`${file}: legend '${m[1]}'`);
      }
    }
  }
  assert.deepEqual(unknown, []);
});

// A key in one ring's colour beside another ring's words breaks "colour means
// one thing".
const FAMILY = (kind) => (/fast|^sun$/.test(kind) ? 'fast' : /win|^track-|^band-(used|left)$/.test(kind) ? 'win' : 'other');

test('words about the window never get a key in the fast\'s colour, and the other way round', () => {
  const wrong = [];
  for (const [file, src] of sources) {
    for (const call of legendCalls(src)) {
      for (const m of call.matchAll(/\[\s*'([\w-]+)'\s*,\s*'([^']+)'/g)) {
        const [, kind, label] = m;
        if (/window/i.test(label) && FAMILY(kind) === 'fast') wrong.push(`${file}: '${kind}' beside "${label}"`);
        if (/fast/i.test(label) && FAMILY(kind) === 'win') wrong.push(`${file}: '${kind}' beside "${label}"`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('every legend names its marks by key() kind, with no old names left', () => {
  const src = fs.readFileSync(path.join(UI, 'components.js'), 'utf8');
  assert.doesNotMatch(src, /LEGACY_KEYS|legacyKind/);
});
