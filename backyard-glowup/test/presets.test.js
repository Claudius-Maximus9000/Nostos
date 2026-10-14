import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/presets.js';

test('cleanup prompt includes chosen upgrades and keep-rules', () => {
  const prompt = buildPrompt({ mode: 'cleanup', upgradeIds: ['mow'], style: '' });
  assert.match(prompt, /freshly mowed/);
  assert.match(prompt, /Keep the exact same camera angle/);
});

test('style text is appended when valid', () => {
  const prompt = buildPrompt({ mode: 'glowup', upgradeIds: ['deck'], style: 'modern' });
  assert.match(prompt, /Style: clean modern design/);
});

test('unknown style is ignored rather than failing', () => {
  const prompt = buildPrompt({ mode: 'glowup', upgradeIds: ['deck'], style: 'nope' });
  assert.doesNotMatch(prompt, /Style:/);
});

test('rejects an upgrade that belongs to the other mode', () => {
  assert.throws(
    () => buildPrompt({ mode: 'cleanup', upgradeIds: ['deck'], style: '' }),
    /not valid for Cleanup mode/,
  );
});

test('rejects an empty upgrade list', () => {
  assert.throws(() => buildPrompt({ mode: 'glowup', upgradeIds: [], style: '' }), /Pick at least one/);
});

test('rejects an unknown mode', () => {
  assert.throws(() => buildPrompt({ mode: 'deluxe', upgradeIds: ['x'], style: '' }), /Unknown mode/);
});
