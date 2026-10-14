import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { mockProvider } from '../src/providers.js';

// Each test gets its own data folder and its own environment, so nothing from the
// machine running the tests (ADMIN_TOKEN, a store URL, ...) leaks in.
async function withServer(fn, { env = {} } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'glowup-'));
  const server = createApp({ provider: mockProvider, dataDir, env });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base, dataDir);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dataDir, { recursive: true, force: true });
  }
}

const photo = `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`;

function post(base, route, body) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function generate(base, body = { mode: 'glowupplus', upgrades: ['deck', 'firepit'], style: 'rustic' }) {
  const res = await post(base, '/api/generate', { image: photo, ...body });
  assert.equal(res.status, 201);
  return res.json();
}

// Sends a request line exactly as written, which fetch would refuse to do.
function rawRequest(base, requestLine) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    let reply = '';
    const socket = net.connect(Number(port), hostname, () => {
      socket.write(`${requestLine}\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    socket.setTimeout(5000, () => socket.destroy(new Error(`no reply to ${requestLine}`)));
    socket.on('data', (chunk) => (reply += chunk));
    socket.on('end', () => resolve(reply));
    socket.on('error', reject);
  });
}

const goodLead = { name: 'Dana Rivers', phone: '(555) 123-4567', zip: '97201' };

test('config lists both plans with contractor details and reports preview mode', () =>
  withServer(
    async (base) => {
      const res = await fetch(`${base}/api/config`);
      const json = await res.json();
      assert.deepEqual(json.modes.map((m) => m.id), ['glowup', 'glowupplus']);
      assert.deepEqual(json.modes.map((m) => m.kind), ['shop', 'contractor']);
      assert.deepEqual(json.contractor, { name: 'Green Acres Builders', phone: '555-0100' });
      assert.deepEqual(json.styles[0], { id: 'modern', label: 'Modern' });
      assert.equal(json.previewMode, true);

      const [glowup, plus] = json.modes;
      assert.deepEqual(Object.keys(glowup.upgrades[0]), ['id', 'label', 'url']);
      assert.equal(glowup.upgrades[0].url, 'https://www.amazon.com/shop/example');
      assert.ok(plus.upgrades.every((u) => u.url === null));
      assert.doesNotMatch(JSON.stringify(json), /prompt/);
    },
    {
      env: {
        AMAZON_STORE_URL: 'https://www.amazon.com/shop/example',
        CONTRACTOR_NAME: 'Green Acres Builders',
        CONTRACTOR_PHONE: '555-0100',
      },
    },
  ));

test('config treats blank settings as unset', () =>
  withServer(
    async (base) => {
      const json = await (await fetch(`${base}/api/config`)).json();
      assert.deepEqual(json.contractor, { name: null, phone: null });
      assert.equal(json.modes[0].upgrades[0].url, null);
    },
    { env: { AMAZON_STORE_URL: '', CONTRACTOR_NAME: '', CONTRACTOR_PHONE: '  ' } },
  ));

test('generate saves an image that shows up in the gallery and can be downloaded', () =>
  withServer(
    async (base) => {
      const record = await generate(base);
      assert.equal(record.mode, 'glowupplus');
      assert.deepEqual(record.upgrades, ['deck', 'firepit']);
      assert.equal(record.preview, true);

      const img = await fetch(`${base}/outputs/${record.file}`);
      assert.equal(img.status, 200);
      assert.equal(img.headers.get('content-type'), 'image/jpeg');
      assert.equal(Buffer.from(await img.arrayBuffer()).toString(), 'fake-jpeg');

      const before = await fetch(`${base}/outputs/${record.beforeFile}`);
      assert.equal(before.status, 200);

      const gallery = await (await fetch(`${base}/api/gallery`, { headers: { Authorization: 'Bearer owner-secret' } })).json();
      assert.equal(gallery.items[0].id, record.id);
    },
    { env: { ADMIN_TOKEN: 'owner-secret' } },
  ));

test('the full gallery is owner-only so customers never see each other\'s yards', () =>
  withServer(
    async (base) => {
      await generate(base);
      assert.equal((await fetch(`${base}/api/gallery`)).status, 401);
      const wrong = await fetch(`${base}/api/gallery`, { headers: { Authorization: 'Bearer nope' } });
      assert.equal(wrong.status, 401);
      assert.equal((await fetch(`${base}/api/gallery`, { headers: { Authorization: 'Bearer owner-secret' } })).status, 200);
    },
    { env: { ADMIN_TOKEN: 'owner-secret' } },
  ));

test('the full gallery is off when no admin token is set', () =>
  withServer(async (base) => {
    await generate(base);
    assert.equal((await fetch(`${base}/api/gallery`)).status, 404);
  }));

test('generate works for the Glow Up shop plan', () =>
  withServer(async (base) => {
    const record = await generate(base, { mode: 'glowup', upgrades: ['lights', 'seating'], style: '' });
    assert.equal(record.mode, 'glowup');
    assert.match(record.prompt, /^Add these outdoor products/);
  }));

test('generate rejects an item from the other plan and the old cleanup plan', () =>
  withServer(async (base) => {
    const cross = await post(base, '/api/generate', { image: photo, mode: 'glowup', upgrades: ['deck'] });
    assert.equal(cross.status, 400);
    assert.equal((await cross.json()).error, "That item isn't part of Glow Up");

    const old = await post(base, '/api/generate', { image: photo, mode: 'cleanup', upgrades: ['mow'] });
    assert.equal(old.status, 400);
    assert.match((await old.json()).error, /Unknown plan/);
  }));

test('generate rejects a non-image upload with a readable message', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ image: 'data:text/plain;base64,aGk=', mode: 'glowup', upgrades: ['lights'] }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /JPG or PNG/);
  }));

test('generate never saves a plan or style that is not text', () =>
  withServer(
    async (base) => {
      // The app reads mode and style as text, so one odd record would empty everyone's gallery.
      const plan = await post(base, '/api/generate', { image: photo, mode: ['glowupplus'], upgrades: ['deck'] });
      assert.equal(plan.status, 400);
      assert.match((await plan.json()).error, /Unknown plan/);

      for (const style of [5, { a: 1 }, ['modern']]) {
        const record = await generate(base, { mode: 'glowup', upgrades: ['lights'], style });
        assert.equal(record.style, '');
      }

      const { items } = await (await fetch(`${base}/api/gallery`, { headers: { Authorization: 'Bearer owner-secret' } })).json();
      assert.equal(items.length, 3);
      for (const item of items) {
        assert.equal(typeof item.mode, 'string');
        assert.equal(typeof item.style, 'string');
      }
    },
    { env: { ADMIN_TOKEN: 'owner-secret' } },
  ));

test('generate treats built-in object names as unknown plans and a null body as no photo', () =>
  withServer(async (base) => {
    for (const mode of ['toString', '__proto__']) {
      const res = await post(base, '/api/generate', { image: photo, mode, upgrades: ['lights'] });
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: `Unknown plan: ${mode}` });
    }

    const empty = await post(base, '/api/generate', null);
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /JPG or PNG/);
  }));

test('a malformed request target gets a 400 and the server keeps running', () =>
  withServer(async (base) => {
    for (const target of ['http://[/x', 'http://:99999/']) {
      const reply = await rawRequest(base, `GET ${target} HTTP/1.1`);
      assert.match(reply, /^HTTP\/1\.1 400 /, target);
    }
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
  }));

test('output route cannot escape the outputs folder', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/outputs/..%2F..%2Fpackage.json`);
    assert.equal(res.status, 404);
  }));

test('a lead is saved trimmed, with blanks stored as null, and only its id is logged', (t) =>
  withServer(async (base, dataDir) => {
    const log = t.mock.method(console, 'log', () => {});
    const res = await post(base, '/api/leads', {
      name: '  Dana Rivers ',
      phone: ' (555) 123-4567 ',
      email: '   ',
      zip: ' 97201 ',
      notes: '',
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ['id', 'createdAt']);
    assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(!Number.isNaN(Date.parse(body.createdAt)));

    const saved = JSON.parse(await readFile(path.join(dataDir, 'leads', `${body.id}.json`), 'utf8'));
    assert.deepEqual(saved, {
      id: body.id,
      createdAt: body.createdAt,
      designId: null,
      name: 'Dana Rivers',
      phone: '(555) 123-4567',
      email: null,
      zip: '97201',
      notes: null,
    });

    const lines = log.mock.calls.map((c) => c.arguments.join(' '));
    assert.deepEqual(lines, [`[lead] new request ${body.id}`]);
  }));

test('a lead can point at a real design', (t) =>
  withServer(async (base, dataDir) => {
    t.mock.method(console, 'log', () => {});
    const design = await generate(base);
    const res = await post(base, '/api/leads', { ...goodLead, email: 'dana@example.com', designId: design.id, notes: 'Weekends work best' });
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const saved = JSON.parse(await readFile(path.join(dataDir, 'leads', `${id}.json`), 'utf8'));
    assert.equal(saved.designId, design.id);
    assert.equal(saved.email, 'dana@example.com');
    assert.equal(saved.notes, 'Weekends work best');
  }));

const invalidLeads = [
  ['missing name', { ...goodLead, name: undefined }, 'Add your name'],
  ['blank name', { ...goodLead, name: '   ' }, 'Add your name'],
  ['non-string name', { ...goodLead, name: 42 }, 'Add your name'],
  ['long name', { ...goodLead, name: 'a'.repeat(101) }, 'Keep your name under 100 characters'],
  ['no phone or email', { name: 'Dana', email: null, zip: '97201' }, 'Add a phone number or email so the contractor can reach you'],
  ['phone with too few digits', { ...goodLead, phone: '555-12' }, 'Check the phone number'],
  ['phone over 30 characters', { ...goodLead, phone: `555 123 4567 ${'x'.repeat(20)}` }, 'Check the phone number'],
  ['bad email', { ...goodLead, phone: '', email: 'dana@example' }, 'Check the email address'],
  ['email with spaces', { ...goodLead, email: 'dana rivers@example.com' }, 'Check the email address'],
  ['email over 200 characters', { ...goodLead, email: `${'d'.repeat(190)}@example.com` }, 'Check the email address'],
  ['missing zip', { ...goodLead, zip: undefined }, 'Add your ZIP code'],
  ['short zip', { ...goodLead, zip: '97' }, 'Add your ZIP code'],
  ['long zip', { ...goodLead, zip: '9'.repeat(13) }, 'Add your ZIP code'],
  ['long notes', { ...goodLead, notes: 'n'.repeat(1001) }, 'Keep notes under 1,000 characters'],
  ['unknown design', { ...goodLead, designId: '00000000-0000-4000-8000-000000000000' }, 'That design is no longer available'],
  ['design id that is not a uuid', { ...goodLead, designId: 'abc' }, 'That design is no longer available'],
  ['the first failing rule wins', { name: '', phone: '1', zip: '' }, 'Add your name'],
  ['rules run in order', { name: 'Dana', phone: '1', email: 'nope', zip: '' }, 'Check the phone number'],
];

for (const [label, body, message] of invalidLeads) {
  test(`lead validation: ${label}`, () =>
    withServer(async (base, dataDir) => {
      const res = await post(base, '/api/leads', body);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: message });
      assert.deepEqual(await readdir(path.join(dataDir, 'leads')).catch(() => []), []);
    }));
}

test('lead validation allows the longest name, phone, email, zip, and notes', (t) =>
  withServer(async (base) => {
    t.mock.method(console, 'log', () => {});
    const res = await post(base, '/api/leads', {
      name: 'a'.repeat(100),
      phone: '5'.repeat(30),
      email: `${'d'.repeat(188)}@example.com`,
      zip: '1'.repeat(12),
      notes: 'n'.repeat(1000),
    });
    assert.equal(res.status, 201);
  }));

test('a path-like design id is refused before it reaches the disk', () =>
  withServer(async (base, dataDir) => {
    const design = await generate(base);
    // '../outputs/<id>' would resolve to the real design file if it were ever joined onto a path.
    for (const designId of ['../outputs/x', `../outputs/${design.id}`, `${design.id}/../${design.id}`]) {
      const res = await post(base, '/api/leads', { ...goodLead, designId });
      assert.equal(res.status, 400, designId);
      assert.deepEqual(await res.json(), { error: 'That design is no longer available' });
    }
    assert.deepEqual(await readdir(path.join(dataDir, 'leads')).catch(() => []), []);
  }));

test('the leads list is off when no admin token is set', () =>
  withServer(
    async (base) => {
      const res = await fetch(`${base}/api/leads`, { headers: { Authorization: 'Bearer ' } });
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: 'Not found' });
    },
    { env: { ADMIN_TOKEN: '' } },
  ));

test('the leads list needs the right admin token', () =>
  withServer(
    async (base) => {
      for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Bearer owner-secret-plus' }, { Authorization: 'owner-secret' }]) {
        const res = await fetch(`${base}/api/leads`, { headers });
        assert.equal(res.status, 401);
        assert.deepEqual(await res.json(), { error: 'Unauthorized' });
      }
    },
    { env: { ADMIN_TOKEN: 'owner-secret' } },
  ));

test('the leads list shows newest first with the design summary', (t) =>
  withServer(
    async (base) => {
      t.mock.method(console, 'log', () => {});
      const design = await generate(base);
      const first = await (await post(base, '/api/leads', { ...goodLead, designId: design.id })).json();
      await new Promise((r) => setTimeout(r, 5));
      const second = await (await post(base, '/api/leads', { name: 'Sam', email: 'sam@example.com', zip: '10001' })).json();

      const res = await fetch(`${base}/api/leads`, { headers: { Authorization: 'Bearer owner-secret' } });
      assert.equal(res.status, 200);
      const { items } = await res.json();
      assert.deepEqual(items.map((l) => l.id), [second.id, first.id]);

      assert.equal(items[0].email, 'sam@example.com');
      assert.equal(items[0].design, null);

      assert.equal(items[1].name, 'Dana Rivers');
      assert.deepEqual(items[1].design, {
        id: design.id,
        file: design.file,
        beforeFile: design.beforeFile,
        mode: 'glowupplus',
        upgrades: ['deck', 'firepit'],
        style: 'rustic',
      });
    },
    { env: { ADMIN_TOKEN: 'owner-secret' } },
  ));
