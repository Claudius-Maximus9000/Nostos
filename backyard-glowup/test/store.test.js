import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';

async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'glowup-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const jpeg = { buffer: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg' };

test('saved dates come from the store clock', async (t) => {
  const store = createStore(await tempDir(t), { now: () => Date.parse('2026-01-02T03:04:05Z') });
  const design = await store.save({ ...jpeg, before: jpeg, meta: {} });
  assert.equal(design.createdAt, '2026-01-02T03:04:05.000Z');
  assert.equal((await store.saveLead({ name: 'Dana' })).createdAt, '2026-01-02T03:04:05.000Z');
});

test('cleanup on a store with nothing saved yet does nothing and creates no folders', async (t) => {
  const dir = await tempDir(t);
  assert.equal(await createStore(dir).removeDesignsBefore(Date.now()), 0);
  assert.deepEqual(await readdir(dir), []);
});

test('an unreadable request stops cleanup before anything is deleted', async (t) => {
  const dir = await tempDir(t);
  let time = Date.parse('2026-01-01T00:00:00Z');
  const store = createStore(dir, { now: () => time });
  const design = await store.save({ ...jpeg, before: jpeg, meta: {} });
  await store.saveLead({ designId: design.id, name: 'Dana' });
  // Without the requests it can't know which designs the owner still needs.
  await writeFile(path.join(store.leadsDir, 'broken.json'), '{ not json');

  time += 365 * 24 * 60 * 60 * 1000;
  await assert.rejects(store.removeDesignsBefore(time));
  assert.equal((await readdir(store.outputsDir)).length, 3);
});

test('a design with an unreadable date is kept', async (t) => {
  const store = createStore(await tempDir(t));
  const design = await store.save({ ...jpeg, before: jpeg, meta: { createdAt: 'someday' } });
  assert.equal(await store.removeDesignsBefore(Date.now() + 1e12), 0);
  assert.ok(await store.get(design.id));
});
