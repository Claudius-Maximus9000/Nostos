import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { mockProvider } from '../src/providers.js';

async function withServer(fn) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'glowup-'));
  const server = createApp({ provider: mockProvider, dataDir });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dataDir, { recursive: true, force: true });
  }
}

const photo = `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`;

test('config lists both modes and reports preview mode', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/config`);
    const json = await res.json();
    assert.deepEqual(json.modes.map((m) => m.id), ['cleanup', 'glowup']);
    assert.equal(json.previewMode, true);
  }));

test('generate saves an image that shows up in the gallery and can be downloaded', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: photo, mode: 'glowup', upgrades: ['deck', 'firepit'], style: 'rustic' }),
    });
    assert.equal(res.status, 201);
    const record = await res.json();
    assert.equal(record.mode, 'glowup');
    assert.equal(record.preview, true);

    const img = await fetch(`${base}/outputs/${record.file}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await img.arrayBuffer()).toString(), 'fake-jpeg');

    const before = await fetch(`${base}/outputs/${record.beforeFile}`);
    assert.equal(before.status, 200);

    const gallery = await (await fetch(`${base}/api/gallery`)).json();
    assert.equal(gallery.items[0].id, record.id);
  }));

test('generate rejects a non-image upload with a readable message', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ image: 'data:text/plain;base64,aGk=', mode: 'cleanup', upgrades: ['mow'] }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /JPG or PNG/);
  }));

test('output route cannot escape the outputs folder', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/outputs/..%2F..%2Fpackage.json`);
    assert.equal(res.status, 404);
  }));
