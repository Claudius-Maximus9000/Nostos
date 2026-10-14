import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirFromEnv } from '../src/server.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('DATA_DIR picks the data folder, and unset or blank keeps it next to src', () => {
  assert.equal(dataDirFromEnv({ DATA_DIR: '/var/data' }), '/var/data');
  assert.equal(dataDirFromEnv({ DATA_DIR: ' relative/data ' }), path.resolve('relative/data'));
  assert.equal(dataDirFromEnv({}), path.join(root, 'data'));
  assert.equal(dataDirFromEnv({ DATA_DIR: '  ' }), path.join(root, 'data'));
});

test('npm start saves into DATA_DIR and shuts down cleanly on SIGTERM', { timeout: 15_000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'glowup-start-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  // Only PATH from this machine, so no real key or token leaks in. PORT 0 picks a free port.
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { PATH: process.env.PATH, PORT: '0', DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => child.exitCode === null && child.kill('SIGKILL'));

  let output = '';
  child.stdout.setEncoding('utf8');
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const port = /listening on http:\/\/localhost:(\d+)/.exec(output)?.[1];
      if (port && output.includes('Saving designs')) resolve(`http://localhost:${port}`);
    });
    child.once('exit', (code) => reject(new Error(`server exited early (${code}): ${output}`)));
  });
  assert.ok(output.includes(`Saving designs and requests in ${dataDir}`));

  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true });
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`,
      mode: 'glowup',
      upgrades: ['lights'],
    }),
  });
  assert.equal(res.status, 201);
  const design = await res.json();
  assert.ok((await readdir(path.join(dataDir, 'outputs'))).includes(design.file));

  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');
  assert.deepEqual({ code, signal }, { code: 0, signal: null });
});
