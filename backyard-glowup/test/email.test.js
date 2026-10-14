import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeadMailer, leadEmail } from '../src/email.js';

const lead = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Dana\nRivers',
  phone: null,
  email: 'dana@example.com',
  zip: '97201',
  notes: null,
};

test('the email lists the customer, the plan, and the items by name', () => {
  const design = {
    id: '22222222-2222-4222-8222-222222222222',
    file: '22222222-2222-4222-8222-222222222222.png',
    mode: 'glowup',
    upgrades: ['lights', 'rug'],
    style: 'cottage',
  };
  const { subject, text } = leadEmail(lead, design);
  // A line break in the name never reaches the subject line.
  assert.equal(subject, 'New Get This Built request from Dana Rivers');
  assert.equal(
    text,
    [
      'New Get This Built request',
      '',
      'Name: Dana\nRivers',
      'Phone: (none)',
      'Email: dana@example.com',
      'ZIP: 97201',
      'Notes: (none)',
      '',
      'Plan: Glow Up',
      'Items: Outdoor string lights, Outdoor rug',
      'Style: Cottage',
      `Design id: ${design.id}`,
      `Picture: /outputs/${design.file} (put your server address in front)`,
      '',
      `Request id: ${lead.id}`,
    ].join('\n'),
  );
});

test('a design from a plan or style that no longer exists still reads sensibly', () => {
  const { text } = leadEmail(lead, { id: 'x', file: 'x.png', mode: 'cleanup', upgrades: ['mow'], style: 'toString' });
  assert.match(text, /Plan: cleanup\nItems: mow\nStyle: None/);
});

test('a request without a design says so', () => {
  assert.match(leadEmail(lead, null).text, /Design: none \(sent without a design\)/);
});

test('a request the server could not save says the email is the only copy', () => {
  const { text } = leadEmail(lead, null, { saved: false });
  assert.match(
    text,
    /^New Get This Built request\n\nThe server could not save this request \(its disk may be full\), so this email is the only copy\. Keep it\.\n\nName: Dana/,
  );
  assert.doesNotMatch(leadEmail(lead, null).text, /only copy/);
});

test('the mailer is off without a key or a recipient', () => {
  assert.equal(createLeadMailer({ apiKey: null, to: 'owner@example.com' }), null);
  assert.equal(createLeadMailer({ apiKey: 'k', to: null }), null);
  assert.equal(createLeadMailer({ apiKey: 'k', to: ' , ' }), null);
  assert.equal(typeof createLeadMailer({ apiKey: 'k', to: 'owner@example.com' }), 'function');
});

test('the mailer gives up after a while instead of waiting forever', async (t) => {
  t.mock.method(console, 'log', () => {});
  let signal;
  const mail = createLeadMailer({
    apiKey: 'k',
    to: 'owner@example.com',
    fetchImpl: async (url, init) => {
      signal = init.signal;
      return new Response('{}', { status: 200 });
    },
  });
  await mail(lead, null);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
});

test('the mailer resolves to whether the email was sent', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const mailer = (reply) => createLeadMailer({ apiKey: 'k', to: 'owner@example.com', fetchImpl: async () => reply() });
  assert.equal(await mailer(() => new Response('{}', { status: 200 }))(lead, null), true);
  assert.equal(await mailer(() => new Response('{}', { status: 429 }))(lead, null), false);
  assert.equal(await mailer(() => Promise.reject(new TypeError('fetch failed')))(lead, null), false);
});
