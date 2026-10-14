import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { mockProvider, openaiProvider } from '../src/providers.js';

// Each test gets its own data folder and its own environment, so nothing from the
// machine running the tests (ADMIN_TOKEN, a store URL, ...) leaks in. Other createApp
// options (provider, now, fetchImpl) pass straight through. A test that brings its own
// dataDir also cleans it up.
async function withServer(fn, { env = {}, dataDir, ...options } = {}) {
  const dir = dataDir ?? (await mkdtemp(path.join(tmpdir(), 'glowup-')));
  const server = createApp({ provider: mockProvider, dataDir: dir, env, ...options });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base, dir, server);
  } finally {
    await new Promise((r) => server.close(r));
    if (!dataDir) await rm(dir, { recursive: true, force: true });
  }
}

// Polls until check() is true; for work the server finishes after it has replied.
async function waitFor(check) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('timed out waiting');
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

test('the health check answers ok', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  }));

// --- Daily limits on new designs ---

const BUSY = "We're getting a lot of requests right now. Please try again in a few minutes.";
const COME_BACK = "You've made a lot of designs today. Please come back tomorrow.";
const plusDesign = { image: photo, mode: 'glowupplus', upgrades: ['deck'], style: '' };

function postFrom(base, address, body = plusDesign) {
  return fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address },
    body: JSON.stringify(body),
  });
}

async function expectError(res, status, error) {
  assert.equal(res.status, status);
  assert.deepEqual(await res.json(), { error });
}

test('each address gets GENERATE_LIMIT_PER_IP designs per UTC day', () => {
  let time = Date.parse('2026-10-14T23:58:00Z');
  return withServer(
    async (base) => {
      await generate(base);
      await generate(base);
      await expectError(await post(base, '/api/generate', plusDesign), 429, COME_BACK);

      time = Date.parse('2026-10-15T00:00:00Z');
      await generate(base);
    },
    { env: { GENERATE_LIMIT_PER_IP: '2' }, now: () => time },
  );
});

test('the per-address limit defaults to 20', () =>
  withServer(async (base) => {
    for (let i = 0; i < 20; i++) await generate(base);
    await expectError(await post(base, '/api/generate', plusDesign), 429, COME_BACK);
  }));

test('a bad photo or plan does not use up the allowance', () =>
  withServer(
    async (base) => {
      assert.equal((await post(base, '/api/generate', { ...plusDesign, image: 'data:text/plain;base64,aGk=' })).status, 400);
      assert.equal((await post(base, '/api/generate', { ...plusDesign, mode: 'deluxe' })).status, 400);
      assert.equal((await post(base, '/api/generate', { ...plusDesign, upgrades: [] })).status, 400);
      assert.equal((await fetch(`${base}/api/generate`, { method: 'POST', body: 'not json' })).status, 400);
      await generate(base);
      await expectError(await post(base, '/api/generate', plusDesign), 429, COME_BACK);
    },
    { env: { GENERATE_LIMIT_PER_IP: '1' } },
  ));

test('GENERATE_DAILY_CAP covers the whole server for the UTC day and answers busy', () => {
  let time = Date.parse('2026-10-14T12:00:00Z');
  return withServer(
    async (base) => {
      assert.equal((await postFrom(base, '203.0.113.1')).status, 201);
      assert.equal((await postFrom(base, '203.0.113.2')).status, 201);
      await expectError(await postFrom(base, '203.0.113.3'), 503, BUSY);

      time = Date.parse('2026-10-15T00:00:01Z');
      assert.equal((await postFrom(base, '203.0.113.3')).status, 201);
    },
    { env: { GENERATE_DAILY_CAP: '2', TRUST_PROXY: 'true' }, now: () => time },
  );
});

test('a GENERATE_DAILY_CAP of 0 pauses new designs', () =>
  withServer(
    async (base) => {
      await expectError(await post(base, '/api/generate', plusDesign), 503, BUSY);
    },
    { env: { GENERATE_DAILY_CAP: '0' } },
  ));

test('limit settings that are not whole numbers fall back to the defaults with a warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  return withServer(
    async (base) => {
      await generate(base);
      await generate(base);
      assert.deepEqual(
        warn.mock.calls.map((c) => c.arguments.join(' ')),
        [
          '[config] GENERATE_LIMIT_PER_IP should be a whole number; using 20',
          '[config] GENERATE_DAILY_CAP should be a whole number; using 300',
        ],
      );
    },
    { env: { GENERATE_LIMIT_PER_IP: 'ten', GENERATE_DAILY_CAP: '-1' } },
  );
});

test('requests are counted before the image model runs, so a burst cannot overshoot the cap', { timeout: 10_000 }, async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  const slowProvider = {
    name: 'slow',
    async edit({ image, mimeType }) {
      calls += 1;
      await gate;
      return { buffer: image, mimeType };
    },
  };
  await withServer(
    async (base) => {
      const replies = [];
      const pending = Array.from({ length: 5 }, () =>
        post(base, '/api/generate', plusDesign).then(async (res) => {
          const reply = { status: res.status, body: await res.json() };
          replies.push(reply);
          return reply;
        }),
      );
      // Three are turned away while the first two are still with the model.
      await waitFor(() => replies.length === 3);
      assert.equal(calls, 2);
      for (const reply of replies) assert.deepEqual(reply, { status: 503, body: { error: BUSY } });

      release();
      const statuses = (await Promise.all(pending)).map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 201, 503, 503, 503]);
      assert.equal(calls, 2);
    },
    { env: { GENERATE_DAILY_CAP: '2' }, provider: slowProvider },
  );
});

for (const flag of ['1', 'true', 'TRUE']) {
  test(`with TRUST_PROXY=${flag}, customers are counted by the first X-Forwarded-For address`, () =>
    withServer(
      async (base) => {
        assert.equal((await postFrom(base, '203.0.113.5, 10.0.0.1')).status, 201);
        assert.equal((await postFrom(base, '203.0.113.6')).status, 201);
        await expectError(await postFrom(base, '203.0.113.5, 10.0.0.2'), 429, COME_BACK);
      },
      { env: { GENERATE_LIMIT_PER_IP: '1', TRUST_PROXY: flag } },
    ));
}

test('without TRUST_PROXY, X-Forwarded-For is ignored and the connection address counts', () =>
  withServer(
    async (base) => {
      assert.equal((await postFrom(base, '203.0.113.5')).status, 201);
      await expectError(await postFrom(base, '203.0.113.6'), 429, COME_BACK);
    },
    { env: { GENERATE_LIMIT_PER_IP: '1', TRUST_PROXY: 'yes please' } },
  ));

// --- Image model failures ---

function openaiAnswering(status, body) {
  return openaiProvider({ apiKey: 'k', fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
}

test('when OpenAI is rate limited or over the spend limit, the customer is told it is busy', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const provider = openaiAnswering(429, {
    error: { code: 'project_spend_limit_exceeded', message: 'You have exceeded your project spend limit.' },
  });
  return withServer(
    async (base) => {
      await expectError(await post(base, '/api/generate', plusDesign), 503, BUSY);
      // The log says what went wrong but never carries the prompt.
      const logged = errors.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
      assert.match(logged, /^\[generate\] provider failed: Image model returned 429/);
      assert.match(logged, /project_spend_limit_exceeded/);
      assert.doesNotMatch(logged, /composite deck|backyard photo/);
    },
    { provider },
  );
});

test('other image model failures keep the try-again message', (t) => {
  t.mock.method(console, 'error', () => {});
  return withServer(
    async (base) => {
      await expectError(
        await post(base, '/api/generate', plusDesign),
        502,
        'The image model could not finish this one. Try again in a moment.',
      );
    },
    { provider: openaiAnswering(500, { error: { message: 'server error' } }) },
  );
});

test('a design OpenAI turns away as busy uses up neither the customer\'s allowance nor the day\'s cap', (t) => {
  t.mock.method(console, 'error', () => {});
  // OpenAI makes and charges nothing for a 429, so customers retrying while it is busy
  // (or until the owner raises the spend limit) must not run out of designs.
  let reply;
  const spendLimit = () => new Response('{"error":{"code":"project_spend_limit_exceeded"}}', { status: 429 });
  const rateLimit = () => new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429 });
  const healthy = () => new Response(JSON.stringify({ data: [{ b64_json: 'cG5nIQ==' }] }), { status: 200 });
  const provider = openaiProvider({ apiKey: 'k', fetchImpl: async () => reply() });
  return withServer(
    async (base) => {
      reply = spendLimit;
      for (let i = 0; i < 3; i++) await expectError(await postFrom(base, '198.51.100.1'), 503, BUSY);
      reply = rateLimit;
      await expectError(await postFrom(base, '198.51.100.2'), 503, BUSY);

      // Once OpenAI is healthy, everyone still has their full allowance for the day.
      reply = healthy;
      for (let i = 0; i < 3; i++) assert.equal((await postFrom(base, '198.51.100.1')).status, 201);
      assert.equal((await postFrom(base, '198.51.100.2')).status, 201);
      // Real designs still count: 198.51.100.1 is done for the day, and the cap of 4 is used up.
      await expectError(await postFrom(base, '198.51.100.1'), 429, COME_BACK);
      await expectError(await postFrom(base, '198.51.100.3'), 503, BUSY);
    },
    { env: { GENERATE_LIMIT_PER_IP: '3', GENERATE_DAILY_CAP: '4', TRUST_PROXY: '1' }, provider },
  );
});

test('a JPEG from the image model is saved and served as a JPEG', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const provider = openaiAnswering(200, { data: [{ b64_json: jpeg.toString('base64') }] });
  return withServer(
    async (base) => {
      const record = await generate(base);
      assert.match(record.file, /\.jpg$/);
      const img = await fetch(`${base}/outputs/${record.file}`);
      assert.equal(img.headers.get('content-type'), 'image/jpeg');
      assert.deepEqual(Buffer.from(await img.arrayBuffer()), jpeg);
    },
    { provider },
  );
});

// --- New-request emails to the owner ---

const emailEnv = { RESEND_API_KEY: 're_test_key', LEAD_EMAIL_TO: 'owner@example.com' };
const fullLead = { ...goodLead, email: 'dana@example.com', notes: 'Weekends work best' };

// A stand-in for fetch that records each call and answers with `reply()`.
function fakeFetch(reply = () => new Response('{"id":"email-1"}', { status: 200 })) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return reply();
  };
  return { calls, impl };
}

test('a new request is emailed to the owner through Resend, and the log has only ids', (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  const mail = fakeFetch();
  return withServer(
    async (base) => {
      const design = await generate(base);
      const res = await post(base, '/api/leads', { ...fullLead, designId: design.id });
      assert.equal(res.status, 201);
      const { id } = await res.json();

      await waitFor(() => log.mock.calls.length === 2);
      assert.equal(mail.calls.length, 1);
      const [{ url, init, body }] = mail.calls;
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, 'Bearer re_test_key');
      assert.equal(init.headers['Content-Type'], 'application/json');
      assert.deepEqual(Object.keys(body), ['from', 'to', 'subject', 'text']);
      assert.equal(body.from, 'Backyard Glow Up <onboarding@resend.dev>');
      assert.deepEqual(body.to, ['owner@example.com']);
      assert.equal(body.subject, 'New Get This Built request from Dana Rivers');
      for (const part of [
        'Name: Dana Rivers',
        'Phone: (555) 123-4567',
        'Email: dana@example.com',
        'ZIP: 97201',
        'Notes: Weekends work best',
        'Plan: Glow Up Plus',
        'Items: New composite deck, Stone fire pit with seating',
        'Style: Rustic',
        `Design id: ${design.id}`,
        `Picture: /outputs/${design.file}`,
        `Request id: ${id}`,
      ]) {
        assert.ok(body.text.includes(part), part);
      }

      const lines = log.mock.calls.map((c) => c.arguments.join(' '));
      assert.deepEqual(lines, [`[lead] new request ${id}`, `[lead] email sent ${id}`]);
      assert.equal(errors.mock.calls.length, 0);
    },
    { env: emailEnv, fetchImpl: mail.impl },
  );
});

test('the email uses LEAD_EMAIL_FROM and can go to several addresses', (t) => {
  t.mock.method(console, 'log', () => {});
  const mail = fakeFetch();
  return withServer(
    async (base) => {
      assert.equal((await post(base, '/api/leads', goodLead)).status, 201);
      await waitFor(() => mail.calls.length === 1);
      const { body } = mail.calls[0];
      assert.equal(body.from, 'Green Acres <leads@greenacres.example>');
      assert.deepEqual(body.to, ['owner@example.com', 'office@example.com']);
      assert.match(body.text, /Design: none/);
    },
    {
      env: {
        ...emailEnv,
        LEAD_EMAIL_TO: ' owner@example.com, office@example.com ',
        LEAD_EMAIL_FROM: 'Green Acres <leads@greenacres.example>',
      },
      fetchImpl: mail.impl,
    },
  );
});

test('the customer gets their reply even when the email never finishes', (t) => {
  t.mock.method(console, 'log', () => {});
  const mail = fakeFetch(() => new Promise(() => {}));
  return withServer(
    async (base) => {
      const res = await post(base, '/api/leads', fullLead);
      assert.equal(res.status, 201);
      assert.equal(mail.calls.length, 1);
    },
    { env: emailEnv, fetchImpl: mail.impl },
  );
});

for (const [label, reply, logged] of [
  ['Resend refuses it', () => new Response('{"message":"bad from address"}', { status: 422 }), '422'],
  ['the network fails', () => Promise.reject(new TypeError('fetch failed')), 'error'],
  ['it times out', () => Promise.reject(new DOMException('timed out', 'TimeoutError')), 'timeout'],
]) {
  test(`when ${label}, the request is still saved and only its id is logged`, (t) => {
    const log = t.mock.method(console, 'log', () => {});
    const errors = t.mock.method(console, 'error', () => {});
    const mail = fakeFetch(reply);
    return withServer(
      async (base, dataDir) => {
        const res = await post(base, '/api/leads', fullLead);
        assert.equal(res.status, 201);
        const { id } = await res.json();
        assert.deepEqual(await readdir(path.join(dataDir, 'leads')), [`${id}.json`]);

        await waitFor(() => errors.mock.calls.length === 1);
        assert.deepEqual(errors.mock.calls[0].arguments, [`[lead] email failed ${id} ${logged}`]);
        assert.deepEqual(log.mock.calls.map((c) => c.arguments.join(' ')), [`[lead] new request ${id}`]);
      },
      { env: emailEnv, fetchImpl: mail.impl },
    );
  });
}

for (const [label, env] of [
  ['no Resend key', { LEAD_EMAIL_TO: 'owner@example.com' }],
  ['no recipient', { RESEND_API_KEY: 're_test_key' }],
  ['blank settings', { RESEND_API_KEY: ' ', LEAD_EMAIL_TO: '' }],
]) {
  test(`no email is sent with ${label}`, (t) => {
    const log = t.mock.method(console, 'log', () => {});
    const mail = fakeFetch();
    return withServer(
      async (base) => {
        const res = await post(base, '/api/leads', fullLead);
        assert.equal(res.status, 201);
        const { id } = await res.json();
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(mail.calls.length, 0);
        assert.deepEqual(log.mock.calls.map((c) => c.arguments.join(' ')), [`[lead] new request ${id}`]);
      },
      { env, fetchImpl: mail.impl },
    );
  });
}

// --- Limits on Get This Built requests ---

const LEAD_LIMIT = "You've sent a lot of requests today. Please try again tomorrow.";

function leadFrom(base, address, body = fullLead) {
  return fetch(`${base}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address },
    body: JSON.stringify(body),
  });
}

test('each address can send 5 requests a UTC day; more are turned away, not saved or emailed', (t) => {
  t.mock.method(console, 'log', () => {});
  const mail = fakeFetch();
  let time = Date.parse('2026-10-14T12:00:00Z');
  return withServer(
    async (base, dataDir) => {
      // A form the server turns away doesn't count.
      assert.equal((await leadFrom(base, '203.0.113.1', { ...fullLead, zip: '' })).status, 400);
      for (let i = 0; i < 5; i++) assert.equal((await leadFrom(base, '203.0.113.1')).status, 201);
      await expectError(await leadFrom(base, '203.0.113.1'), 429, LEAD_LIMIT);
      assert.equal((await readdir(path.join(dataDir, 'leads'))).length, 5);
      assert.equal(mail.calls.length, 5);

      assert.equal((await leadFrom(base, '203.0.113.2')).status, 201);
      time = Date.parse('2026-10-15T00:00:00Z');
      assert.equal((await leadFrom(base, '203.0.113.1')).status, 201);
    },
    { env: { ...emailEnv, TRUST_PROXY: 'true' }, now: () => time, fetchImpl: mail.impl },
  );
});

test('at most 90 request emails go out a UTC day; past that, requests are still saved', (t) => {
  t.mock.method(console, 'log', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  const mail = fakeFetch();
  let time = Date.parse('2026-10-14T12:00:00Z');
  return withServer(
    async (base, dataDir) => {
      const ids = [];
      for (let i = 0; i < 91; i++) {
        const res = await leadFrom(base, `203.0.113.${Math.floor(i / 5)}`);
        assert.equal(res.status, 201);
        ids.push((await res.json()).id);
      }
      await waitFor(() => mail.calls.length === 90 && warn.mock.callCount() === 1);
      assert.deepEqual(warn.mock.calls[0].arguments, [`[lead] email skipped ${ids[90]} (daily email limit)`]);
      assert.equal((await readdir(path.join(dataDir, 'leads'))).length, 91);

      time = Date.parse('2026-10-15T00:00:00Z');
      assert.equal((await leadFrom(base, '203.0.113.200')).status, 201);
      await waitFor(() => mail.calls.length === 91);
    },
    { env: { ...emailEnv, TRUST_PROXY: 'true' }, now: () => time, fetchImpl: mail.impl },
  );
});

// --- A request the disk can't save ---

// A file where the leads folder should be makes every save fail, the way a full disk does.
async function breakLeadsFolder(dataDir) {
  await rm(path.join(dataDir, 'leads'), { recursive: true, force: true });
  await writeFile(path.join(dataDir, 'leads'), '');
}

test('a request the disk cannot save is emailed as the only copy, and the customer hears it was sent', (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  const mail = fakeFetch();
  return withServer(
    async (base, dataDir) => {
      const design = await generate(base);
      await breakLeadsFolder(dataDir);

      const res = await post(base, '/api/leads', { ...fullLead, designId: design.id });
      assert.equal(res.status, 201);
      const { id, createdAt } = await res.json();
      assert.ok(!Number.isNaN(Date.parse(createdAt)));

      // The email went before the reply, since it is the request's only copy.
      assert.equal(mail.calls.length, 1);
      const { text } = mail.calls[0].body;
      assert.match(text, /^New Get This Built request\n\nThe server could not save this request \(its disk may be full\), so this email is the only copy\. Keep it\.\n/);
      for (const part of ['Name: Dana Rivers', 'Phone: (555) 123-4567', `Design id: ${design.id}`, `Request id: ${id}`]) {
        assert.ok(text.includes(part), part);
      }

      // The logs still carry only the id.
      assert.deepEqual(log.mock.calls.map((c) => c.arguments.join(' ')), [`[lead] email sent ${id}`]);
      assert.equal(errors.mock.callCount(), 1);
      assert.match(errors.mock.calls[0].arguments.join(' '), new RegExp(`^\\[lead\\] could not save request ${id}, emailed only: E[A-Z]+$`));
    },
    { env: emailEnv, fetchImpl: mail.impl },
  );
});

for (const [label, env, reply] of [
  ['no email is set up', {}, undefined],
  ['the email fails too', emailEnv, () => new Response('{}', { status: 500 })],
]) {
  test(`a request the disk cannot save gets the error message when ${label}`, (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    const mail = fakeFetch(reply);
    return withServer(
      async (base, dataDir) => {
        await breakLeadsFolder(dataDir);
        await expectError(await post(base, '/api/leads', fullLead), 500, 'Something went wrong on our end');
      },
      { env, fetchImpl: mail.impl },
    );
  });
}

// --- Photo cleanup ---

const DAY = 24 * 60 * 60 * 1000;
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

test('designs older than RETENTION_DAYS are deleted, except ones a request points at', (t) => {
  t.mock.method(console, 'log', () => {});
  let time = Date.parse('2026-01-01T12:00:00Z');
  return withServer(
    async (base, dataDir, server) => {
      const quoted = await generate(base);
      const plain = await generate(base);
      await post(base, '/api/leads', { ...goodLead, designId: quoted.id });
      await post(base, '/api/leads', { name: 'Sam', email: 'sam@example.com', zip: '10001' });
      time += 30 * DAY;
      const newer = await generate(base);
      const files = async () => (await readdir(path.join(dataDir, 'outputs'))).sort();
      const filesOf = (...designs) => designs.flatMap((d) => [d.file, d.beforeFile, `${d.id}.json`]).sort();

      time += 59 * DAY; // 89 days after the first two: nothing is old enough yet.
      assert.equal(await server.cleanupOldDesigns(), 0);
      assert.deepEqual(await files(), filesOf(quoted, plain, newer));

      time += 2 * DAY; // 91 days.
      assert.equal(await server.cleanupOldDesigns(), 1);
      assert.deepEqual(await files(), filesOf(quoted, newer));
      assert.equal((await fetch(`${base}/outputs/${plain.file}`)).status, 404);
      assert.equal((await fetch(`${base}/outputs/${plain.beforeFile}`)).status, 404);

      time += 30 * DAY;
      assert.equal(await server.cleanupOldDesigns(), 1);
      assert.deepEqual(await files(), filesOf(quoted));

      // Requests are kept, and the owner can still see the design that was quoted.
      const { items } = await (await fetch(`${base}/api/leads`, { headers: { Authorization: 'Bearer owner-secret' } })).json();
      assert.equal(items.length, 2);
      assert.equal(items.find((l) => l.designId === quoted.id).design.file, quoted.file);
      assert.equal((await fetch(`${base}/outputs/${quoted.file}`)).status, 200);
    },
    { env: { ADMIN_TOKEN: 'owner-secret', RETENTION_DAYS: '90' }, now: () => time },
  );
});

test('cleanup runs at startup and every 12 hours, and stops when the server closes', async (t) => {
  t.mock.method(console, 'log', () => {});
  // Only the 12-hour cleanup timer is faked; any other timer is passed to the real one.
  const timers = [];
  const fakes = new Set();
  const { setInterval: realSetInterval, clearInterval: realClearInterval } = globalThis;
  t.mock.method(globalThis, 'setInterval', (fn, ms, ...rest) => {
    if (ms !== TWELVE_HOURS) return realSetInterval(fn, ms, ...rest);
    const handle = { fn, ms, unref: t.mock.fn(() => handle) };
    timers.push(handle);
    fakes.add(handle);
    return handle;
  });
  const clear = t.mock.method(globalThis, 'clearInterval', (handle) => {
    if (!fakes.has(handle)) realClearInterval(handle);
  });

  const dataDir = await mkdtemp(path.join(tmpdir(), 'glowup-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let time = Date.parse('2026-01-01T12:00:00Z');
  const now = () => time;

  let first;
  let second;
  await withServer(
    async (base) => {
      first = await generate(base);
      time += 5 * DAY;
      second = await generate(base);
    },
    { dataDir, now },
  );
  timers.length = 0;
  clear.mock.resetCalls();

  // Restarting 10 days later: the startup pass removes the first design on its own, so
  // the pass the test asks for afterwards finds nothing left to do.
  time += 5 * DAY;
  await withServer(
    async (base, dir, server) => {
      assert.equal(await server.cleanupOldDesigns(), 0);
      assert.equal((await fetch(`${base}/outputs/${first.file}`)).status, 404);
      assert.equal((await fetch(`${base}/outputs/${second.file}`)).status, 200);

      assert.equal(timers.length, 1);
      assert.equal(timers[0].unref.mock.callCount(), 1);

      // Once the second design is past 7 days too, the timer's next pass removes it.
      time += 3 * DAY;
      timers[0].fn();
      assert.equal(await server.cleanupOldDesigns(), 0);
      assert.equal((await fetch(`${base}/outputs/${second.file}`)).status, 404);
      assert.ok(clear.mock.calls.every((c) => c.arguments[0] !== timers[0]));
    },
    { dataDir, now, env: { RETENTION_DAYS: '7' } },
  );
  assert.deepEqual(clear.mock.calls.map((c) => c.arguments[0]).filter((h) => fakes.has(h)), [timers[0]]);
  assert.deepEqual(await readdir(path.join(dataDir, 'outputs')), []);
});

for (const days of ['0', '0.0']) {
  test(`RETENTION_DAYS=${days} turns cleanup off`, (t) => {
    const interval = t.mock.method(globalThis, 'setInterval');
    const warn = t.mock.method(console, 'warn', () => {});
    let time = Date.parse('2026-01-01T12:00:00Z');
    return withServer(
      async (base, dataDir, server) => {
        const design = await generate(base);
        time += 1000 * DAY;
        assert.equal(await server.cleanupOldDesigns(), 0);
        assert.equal((await fetch(`${base}/outputs/${design.file}`)).status, 200);
        assert.ok(interval.mock.calls.every((c) => c.arguments[1] !== TWELVE_HOURS));
        assert.equal(warn.mock.callCount(), 0);
      },
      { env: { RETENTION_DAYS: days }, now: () => time },
    );
  });
}

// The privacy policy promises the deletion, so a typo in the host's dashboard keeps it
// on at 90 days and says so in the log, rather than quietly keeping every photo.
for (const days of ['90 days', '90d', '3 months', 'ninety', 'never', '-5']) {
  test(`RETENTION_DAYS=${days} is a typo: it warns and keeps deleting after 90 days`, (t) => {
    t.mock.method(console, 'log', () => {});
    const warn = t.mock.method(console, 'warn', () => {});
    let time = Date.parse('2026-01-01T12:00:00Z');
    return withServer(
      async (base, dataDir, server) => {
        assert.deepEqual(warn.mock.calls.map((c) => c.arguments.join(' ')), [
          '[config] RETENTION_DAYS should be a number of days; using 90',
        ]);
        const design = await generate(base);
        time += 89 * DAY;
        assert.equal(await server.cleanupOldDesigns(), 0);
        time += 2 * DAY;
        assert.equal(await server.cleanupOldDesigns(), 1);
        assert.equal((await fetch(`${base}/outputs/${design.file}`)).status, 404);
      },
      { env: { RETENTION_DAYS: days }, now: () => time },
    );
  });
}

test('RETENTION_DAYS defaults to 90', (t) => {
  t.mock.method(console, 'log', () => {});
  let time = Date.parse('2026-01-01T12:00:00Z');
  return withServer(
    async (base, dataDir, server) => {
      const design = await generate(base);
      time += 89 * DAY;
      assert.equal(await server.cleanupOldDesigns(), 0);
      time += 2 * DAY;
      assert.equal(await server.cleanupOldDesigns(), 1);
      assert.equal((await fetch(`${base}/outputs/${design.file}`)).status, 404);
    },
    { now: () => time },
  );
});
