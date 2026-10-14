import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiProvider, providerFromEnv, mockProvider } from '../src/providers.js';

const image = Buffer.from('fake-jpeg-bytes');

test('no API key selects the mock provider', () => {
  assert.equal(providerFromEnv({}).name, 'mock');
});

test('API key selects the OpenAI-compatible provider with the configured model', () => {
  const p = providerFromEnv({ OPENAI_API_KEY: 'k', OPENAI_IMAGE_MODEL: 'gpt-image-1' });
  assert.equal(p.name, 'openai:gpt-image-1');
});

test('mock provider returns the original image', async () => {
  const out = await mockProvider.edit({ image, mimeType: 'image/jpeg', prompt: 'x' });
  assert.equal(out.buffer, image);
  assert.ok(out.note);
});

test('openai provider posts to baseUrl/images/edits and decodes b64_json', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png!').toString('base64') }] }), { status: 200 });
  };
  const p = openaiProvider({ apiKey: 'secret', baseUrl: 'https://example.test/v1/', fetchImpl: fakeFetch });
  const out = await p.edit({ image, mimeType: 'image/jpeg', prompt: 'make it nice' });

  assert.equal(seen.url, 'https://example.test/v1/images/edits');
  assert.equal(seen.init.headers.Authorization, 'Bearer secret');
  assert.equal(out.buffer.toString(), 'png!');
  assert.equal(out.mimeType, 'image/png');
});

test('openai provider surfaces non-OK responses as errors', async () => {
  const fakeFetch = async () => new Response('rate limited', { status: 429 });
  const p = openaiProvider({ apiKey: 'k', fetchImpl: fakeFetch });
  await assert.rejects(p.edit({ image, mimeType: 'image/png', prompt: 'x' }), /returned 429/);
});
