import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, SOURCES, AUTOPHAGY_NOTE, fastingState, stageIndex } from '../../docs/js/core/stages.js';

const H = 3_600_000;
const M = 60_000;

test('stages cover the whole clock without gaps', () => {
  assert.equal(STAGES[0].from, 0);
  for (let i = 1; i < STAGES.length; i++) assert.equal(STAGES[i].from, STAGES[i - 1].to);
  assert.equal(STAGES.at(-1).to, Infinity);
});

test('stage boundaries at 4, 12, 24, 48 and 72 hours', () => {
  assert.equal(stageIndex(0), 0);
  assert.equal(stageIndex(4 * H - M), 0);
  assert.equal(stageIndex(4 * H), 1);
  assert.equal(stageIndex(12 * H - M), 1);
  assert.equal(stageIndex(12 * H), 2);
  assert.equal(stageIndex(24 * H - M), 2);
  assert.equal(stageIndex(24 * H), 3);
  assert.equal(stageIndex(48 * H - M), 3);
  assert.equal(stageIndex(48 * H), 4);
  assert.equal(stageIndex(72 * H - M), 4);
  assert.equal(stageIndex(72 * H), 5);
  assert.equal(stageIndex(30 * 24 * H), 5);
});

test('fasting state: stage, next stage and position on the 24-hour scale', () => {
  const last = Date.parse('2026-09-26T21:00:00+03:00');
  const s = fastingState(last, last + 16 * H + 10 * M);
  assert.equal(s.stage.name, 'Metabolic switch');
  assert.equal(s.next.name, 'Ketones climbing');
  assert.equal(s.untilNextMs, 7 * H + 50 * M);
  assert.ok(Math.abs(s.position - (16 + 10 / 60) / 24) < 1e-9);
  // Past a day the sun rests at the end of the scale, and the stages go on.
  const day2 = fastingState(last, last + 30 * H);
  assert.equal(day2.stage.name, 'Ketones climbing');
  assert.equal(day2.next.name, 'Brain on ketones');
  assert.equal(day2.untilNextMs, 18 * H);
  assert.equal(day2.position, 1);
  const day3 = fastingState(last, last + 50 * H);
  assert.equal(day3.stage.name, 'Brain on ketones');
  assert.equal(day3.next.name, 'Protein sparing');
  const long = fastingState(last, last + 80 * H);
  assert.equal(long.stage.name, 'Protein sparing');
  assert.equal(long.next, null);
  assert.equal(long.untilNextMs, null);
});

test('the copy stays within the evidence', () => {
  const all = [...STAGES.map((s) => s.text), AUTOPHAGY_NOTE].join(' ');
  // No stage claims autophagy at an hour, and no stage promises ketosis as a certainty.
  assert.doesNotMatch(STAGES.map((s) => `${s.name} ${s.text}`).join(' '), /autophagy/i);
  assert.doesNotMatch(all, /you are in ketosis/i);
  assert.match(AUTOPHAGY_NOTE, /not known/);
  assert.equal(SOURCES.length, 11);
  // The longest fast carries the advice to fast that long only with a doctor.
  assert.match(STAGES.at(-1).text, /doctor's guidance/);
});

test('read more: every stage has its longer page, each finding from a named source', async () => {
  const { STAGE_MORE, citeBy, sourceBy, stageSources } = await import('../../docs/js/core/stage-more.js');
  assert.deepEqual(Object.keys(STAGE_MORE), STAGES.map((s) => s.key));
  for (const s of STAGES) {
    const more = STAGE_MORE[s.key];
    assert.ok(more.body.length >= 2, `${s.key} has a body`);
    assert.ok(more.findings.length >= 2, `${s.key} has findings`);
    assert.ok(more.good.length >= 1, `${s.key} has advice`);
    for (const f of more.findings) assert.ok(sourceBy(f.by), `${s.key}: ${f.by} is in SOURCES`);
    assert.ok(stageSources(s.key).length >= 1);
  }
  assert.equal(citeBy('Rothman'), 'Rothman and colleagues, 1991');
  assert.equal(citeBy('Göschke'), 'Göschke and colleagues, 1975');
  assert.deepEqual(stageSources('sparing'), [SOURCES.find((x) => x.startsWith('Ho ')), SOURCES.find((x) => x.startsWith('Göschke '))]);
  // Autophagy stays off the clock here too, and the long fasts carry a doctor's advice.
  const all = Object.values(STAGE_MORE).flatMap((m) => [...m.body, ...m.findings.map((f) => f.text), ...m.good]).join(' ');
  assert.doesNotMatch(all, /autophagy/i);
  assert.doesNotMatch(all, /https?:|www\./);
  for (const key of ['ketones', 'brain', 'sparing']) assert.match(STAGE_MORE[key].good.join(' '), /doctor/);
});
