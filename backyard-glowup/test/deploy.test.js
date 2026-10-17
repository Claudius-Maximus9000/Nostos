import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');

// Every setting name the server code reads, found by how it reads them.
async function settingsInCode() {
  const names = new Set();
  for (const file of await readdir(path.join(root, 'src'))) {
    const code = await read(path.join('src', file));
    for (const [, name] of code.matchAll(/(?:setting\(env, |countSetting\(env, |pick\(|env\.|env\[)'?([A-Z][A-Z0-9_]+)/g)) {
      names.add(name);
    }
  }
  return names;
}

test('the README settings table lists every setting the server reads', async () => {
  const readme = await read('README.md');
  const table = new Set([...readme.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((m) => m[1]));
  const code = await settingsInCode();
  assert.ok(code.size >= 18, `found only ${[...code]}`);
  for (const name of code) assert.ok(table.has(name), `${name} is missing from the README table`);
});

// The service's settings in render.yaml, as { key: value } with secrets as null.
function blueprintEnv(yaml) {
  const entries = [...yaml.matchAll(/- key: (\w+)\n\s+(?:value: "?([^"\n]*)"?|sync: (false))/g)];
  return Object.fromEntries(entries.map(([, key, value, secret]) => [key, secret ? null : value]));
}

test('render.yaml runs this folder with a disk for DATA_DIR, the health check, and secrets kept out', async () => {
  const yaml = await read('render.yaml');
  const field = (name) => new RegExp(`^[\\s-]+${name}: (.+)$`, 'm').exec(yaml)?.[1];

  assert.equal(field('type'), 'web');
  assert.equal(field('runtime'), 'node');
  assert.equal(field('plan'), 'starter');
  assert.equal(field('rootDir'), path.basename(root));
  assert.equal(field('startCommand'), 'npm start');
  assert.equal(field('healthCheckPath'), '/healthz');
  assert.equal(field('mountPath'), '/var/data');
  assert.equal(field('sizeGB'), '5');

  const env = blueprintEnv(yaml);
  assert.equal(env.DATA_DIR, field('mountPath'));
  assert.equal(env.TRUST_PROXY, 'true');
  const secrets = Object.keys(env).filter((key) => env[key] === null);
  assert.deepEqual(secrets.sort(), [
    'ADMIN_TOKEN',
    'AMAZON_STORE_URL',
    'CONTRACTOR_NAME',
    'CONTRACTOR_PHONE',
    'LEAD_EMAIL_TO',
    'OPENAI_API_KEY',
    'RESEND_API_KEY',
  ]);
  // Every service setting is one the server knows about (or Render's own Node version).
  const known = await settingsInCode();
  for (const key of Object.keys(env)) assert.ok(known.has(key) || key === 'NODE_VERSION', key);
});
