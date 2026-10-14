import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, buildPrompt, publicModes } from '../src/presets.js';

test('glow up prompt places the chosen products and keeps the keep-rules', () => {
  const prompt = buildPrompt({ mode: 'glowup', upgradeIds: ['lights', 'rug'], style: '' });
  assert.match(prompt, /^Add these outdoor products to this backyard photo/);
  assert.match(prompt, /warm outdoor string lights/);
  assert.match(prompt, /patterned outdoor rug/);
  assert.doesNotMatch(prompt, /patio umbrella/);
  assert.match(prompt, /Keep the exact same camera angle, perspective, lighting direction, house, fences, and sky\./);
  assert.match(prompt, /Only change the parts of the yard described above\./);
  assert.match(prompt, /no people, no text, no watermarks\.$/);
});

test('glow up plus prompt asks for a professional renovation and keeps the keep-rules', () => {
  const prompt = buildPrompt({ mode: 'glowupplus', upgradeIds: ['deck', 'firepit'], style: '' });
  assert.match(prompt, /^Edit this backyard photo to show a finished professional renovation with: /);
  assert.match(prompt, /composite deck/);
  assert.match(prompt, /round stone fire pit/);
  assert.doesNotMatch(prompt, /outdoor products/);
  assert.match(prompt, /Keep the exact same camera angle/);
});

test('style text is appended when valid', () => {
  const prompt = buildPrompt({ mode: 'glowupplus', upgradeIds: ['deck'], style: 'modern' });
  assert.match(prompt, /Style: clean modern design/);
});

test('unknown style is ignored rather than failing', () => {
  const prompt = buildPrompt({ mode: 'glowup', upgradeIds: ['lights'], style: 'nope' });
  assert.doesNotMatch(prompt, /Style:/);
});

test('rejects an item that belongs to the other plan', () => {
  assert.throws(
    () => buildPrompt({ mode: 'glowup', upgradeIds: ['lights', 'deck'], style: '' }),
    /^Error: That item isn't part of Glow Up$/,
  );
  assert.throws(
    () => buildPrompt({ mode: 'glowupplus', upgradeIds: ['hammock'], style: '' }),
    /^Error: That item isn't part of Glow Up Plus$/,
  );
});

test('an empty selection asks for an item or an upgrade depending on the plan', () => {
  assert.throws(() => buildPrompt({ mode: 'glowup', upgradeIds: [], style: '' }), /^Error: Pick at least one item$/);
  assert.throws(() => buildPrompt({ mode: 'glowupplus', upgradeIds: [], style: '' }), /^Error: Pick at least one upgrade$/);
});

test('rejects an unknown plan, including the old cleanup plan', () => {
  assert.throws(() => buildPrompt({ mode: 'deluxe', upgradeIds: ['x'], style: '' }), /Unknown plan: deluxe/);
  assert.throws(() => buildPrompt({ mode: 'cleanup', upgradeIds: ['mow'], style: '' }), /Unknown plan: cleanup/);
});

test('built-in object names are unknown plans too', () => {
  for (const mode of ['toString', '__proto__', 'constructor']) {
    assert.throws(() => buildPrompt({ mode, upgradeIds: ['lights'], style: '' }), new RegExp(`^Error: Unknown plan: ${mode}$`));
  }
});

test('public plan list has both plans with labels, kinds, and defaults', () => {
  const modes = publicModes();
  assert.deepEqual(modes.map((m) => [m.id, m.kind, m.label]), [
    ['glowup', 'shop', 'Glow Up'],
    ['glowupplus', 'contractor', 'Glow Up Plus'],
  ]);
  for (const mode of modes) {
    assert.ok(mode.blurb);
    assert.deepEqual(mode.defaultUpgrades, MODES[mode.id].defaultUpgrades);
    assert.deepEqual(mode.upgrades.map((u) => u.id), MODES[mode.id].upgrades.map((u) => u.id));
  }
});

test('public plan list never includes prompt text', () => {
  const json = JSON.stringify(publicModes({ storeUrl: 'https://www.amazon.com/shop/example' }));
  assert.doesNotMatch(json, /prompt/);
  for (const mode of Object.values(MODES)) {
    for (const u of mode.upgrades) assert.ok(!json.includes(u.prompt), `leaked prompt for ${u.id}`);
  }
});

test('shop links use the product url, then the store url, then null', () => {
  const [linked, unlinked] = MODES.glowup.upgrades;
  const originals = [linked.url, unlinked.url];
  linked.url = 'https://www.amazon.com/dp/B000TEST';
  unlinked.url = '';
  try {
    const withStore = publicModes({ storeUrl: 'https://www.amazon.com/shop/example' })[0].upgrades;
    assert.equal(withStore[0].url, 'https://www.amazon.com/dp/B000TEST');
    assert.equal(withStore[1].url, 'https://www.amazon.com/shop/example');

    const noStore = publicModes()[0].upgrades;
    assert.equal(noStore[0].url, 'https://www.amazon.com/dp/B000TEST');
    assert.equal(noStore[1].url, null);
    assert.equal(publicModes({ storeUrl: '' })[0].upgrades[1].url, null);
  } finally {
    [linked.url, unlinked.url] = originals;
  }
});

test('contractor items never carry a link', () => {
  const plus = publicModes({ storeUrl: 'https://www.amazon.com/shop/example' }).find((m) => m.id === 'glowupplus');
  assert.ok(plus.upgrades.length > 0);
  for (const u of plus.upgrades) assert.equal(u.url, null);
});
