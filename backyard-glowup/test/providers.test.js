import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiProvider, providerFromEnv, mockProvider } from '../src/providers.js';

const image = Buffer.from('fake-jpeg-bytes');

test('no API key selects the mock provider', () => {
  assert.equal(providerFromEnv({}).name, 'mock');
});

test('API key selects the OpenAI-compatible provider with the configured model', () => {
  const p = providerFromEnv({ OPENAI_API_KEY: 'k', OPENAI_IMAGE_MODEL: 'gpt-image-2' });
  assert.equal(p.name, 'openai:gpt-image-2');
});

test('a blank API key is preview mode', () => {
  assert.equal(providerFromEnv({ OPENAI_API_KEY: '  ' }).name, 'mock');
});

// Runs one edit through a provider and returns the form fields it sent.
async function sentFields(provider) {
  let form;
  const fakeFetch = async (url, init) => {
    form = init.body;
    return new Response(JSON.stringify({ data: [{ b64_json: 'cG5nIQ==' }] }), { status: 200 });
  };
  await provider({ fetchImpl: fakeFetch }).edit({ image, mimeType: 'image/jpeg', prompt: 'make it nice' });
  return {
    model: form.get('model'),
    quality: form.get('quality'),
    size: form.get('size'),
    outputFormat: form.get('output_format'),
    prompt: form.get('prompt'),
  };
}

test('the default model is gpt-image-2.5-flare at medium quality and the photo\'s own size, as a JPEG', async () => {
  assert.equal(providerFromEnv({ OPENAI_API_KEY: 'k' }).name, 'openai:gpt-image-2.5-flare');
  const fields = await sentFields((opts) => openaiProvider({ apiKey: 'k', ...opts }));
  assert.deepEqual(fields, {
    model: 'gpt-image-2.5-flare',
    quality: 'medium',
    size: 'auto',
    outputFormat: 'jpeg',
    prompt: 'make it nice',
  });
});

test('model, quality, and size come from the environment, and blanks use the defaults', async (t) => {
  // providerFromEnv has no fetch option, so the global one is swapped for this test.
  const run = async (env) => {
    let form;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      form = init.body;
      return new Response(JSON.stringify({ data: [{ b64_json: 'cG5nIQ==' }] }), { status: 200 });
    });
    await providerFromEnv({ OPENAI_API_KEY: 'k', ...env }).edit({ image, mimeType: 'image/png', prompt: 'x' });
    return { model: form.get('model'), quality: form.get('quality'), size: form.get('size'), format: form.get('output_format') };
  };
  assert.deepEqual(
    await run({ OPENAI_IMAGE_MODEL: 'gpt-image-2', OPENAI_IMAGE_QUALITY: 'high', OPENAI_IMAGE_SIZE: '1024x1536', OPENAI_IMAGE_FORMAT: 'webp' }),
    { model: 'gpt-image-2', quality: 'high', size: '1024x1536', format: 'webp' },
  );
  assert.deepEqual(
    await run({ OPENAI_IMAGE_MODEL: '', OPENAI_IMAGE_QUALITY: ' ', OPENAI_IMAGE_SIZE: '', OPENAI_IMAGE_FORMAT: '' }),
    { model: 'gpt-image-2.5-flare', quality: 'medium', size: 'auto', format: 'jpeg' },
  );
  // A model that rejects output_format can be run without it.
  assert.equal((await run({ OPENAI_IMAGE_FORMAT: 'none' })).format, null);
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

test('openai provider surfaces non-OK responses as errors that keep the status', async () => {
  for (const status of [429, 500]) {
    const fakeFetch = async () => new Response('{"error":{"code":"rate_limit_exceeded"}}', { status });
    const p = openaiProvider({ apiKey: 'k', fetchImpl: fakeFetch });
    await assert.rejects(p.edit({ image, mimeType: 'image/png', prompt: 'x' }), (err) => {
      assert.match(err.message, new RegExp(`returned ${status}`));
      assert.equal(err.status, status);
      return true;
    });
  }
});

// The bytes, not the request, decide the type, so a server that ignores output_format
// and sends a PNG still gets saved and served as one.
test('openai provider labels a returned image by its bytes, whether sent inline or as a link', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const bytes of [jpeg, png]) {
    const inline = openaiProvider({
      apiKey: 'k',
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }), { status: 200 }),
    });
    const linked = openaiProvider({
      apiKey: 'k',
      fetchImpl: async (url) =>
        url === 'https://cdn.example/out'
          ? new Response(bytes, { status: 200 })
          : new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/out' }] }), { status: 200 }),
    });
    for (const p of [inline, linked]) {
      const out = await p.edit({ image, mimeType: 'image/jpeg', prompt: 'x' });
      assert.deepEqual(out.buffer, bytes);
      assert.equal(out.mimeType, bytes === jpeg ? 'image/jpeg' : 'image/png');
    }
  }
});
