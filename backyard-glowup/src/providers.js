// Image providers. The app only talks to the interface { name, edit({ image, mimeType, prompt }) },
// so swapping the backend (OpenAI, a self-hosted model on your server, etc.) is config, not code.

// Returns the original photo untouched. Lets the full flow run with no API key or credits.
export const mockProvider = {
  name: 'mock',
  async edit({ image, mimeType }) {
    return { buffer: image, mimeType, note: 'Preview mode: no image model is configured, so the original photo is returned.' };
  },
};

// A JPEG starts with FF D8 FF. The bytes are checked rather than trusted to match what
// was asked for, in case a compatible server ignores output_format and sends a PNG.
function imageType(buffer) {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? 'image/jpeg' : 'image/png';
}

// Calls an OpenAI-compatible images/edits endpoint. OPENAI_BASE_URL lets you point
// this at your own server later without changing code. Quality is always sent: the 2.5
// models treat a missing one as 'auto', which has been seen to come back at 'low'.
// Output is JPEG: a photo-like PNG is several times larger, and every design is kept on
// the server's disk for RETENTION_DAYS. OPENAI_IMAGE_FORMAT=none stops asking for a format,
// in case a model rejects the setting.
export function openaiProvider({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-image-2.5-flare',
  quality = 'medium',
  size = 'auto',
  format = 'jpeg',
  fetchImpl = fetch,
}) {
  return {
    name: `openai:${model}`,
    async edit({ image, mimeType, prompt }) {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('quality', quality);
      form.append('size', size);
      if (format !== 'none') form.append('output_format', format);
      form.append('n', '1');
      form.append('image', new Blob([image], { type: mimeType }), mimeType === 'image/png' ? 'yard.png' : 'yard.jpg');

      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.text();
        const err = new Error(`Image model returned ${res.status}: ${detail.slice(0, 300)}`);
        // Kept so the server can tell "too busy" (429: rate limit or the monthly spend
        // limit) apart from a real failure.
        err.status = res.status;
        throw err;
      }

      const json = await res.json();
      const item = json.data?.[0];
      if (item?.b64_json) {
        const buffer = Buffer.from(item.b64_json, 'base64');
        return { buffer, mimeType: imageType(buffer) };
      }
      if (item?.url) {
        const img = await fetchImpl(item.url);
        if (!img.ok) throw new Error(`Could not download generated image: ${img.status}`);
        const buffer = Buffer.from(await img.arrayBuffer());
        return { buffer, mimeType: imageType(buffer) };
      }
      throw new Error('Image model response had no image data');
    },
  };
}

// Picks a provider from environment variables. No key means mock mode. Blank settings
// count as unset, so they fall back to the defaults above.
export function providerFromEnv(env = process.env) {
  const pick = (key) => env[key]?.trim() || undefined;
  if (!pick('OPENAI_API_KEY')) return mockProvider;
  return openaiProvider({
    apiKey: pick('OPENAI_API_KEY'),
    baseUrl: pick('OPENAI_BASE_URL'),
    model: pick('OPENAI_IMAGE_MODEL'),
    quality: pick('OPENAI_IMAGE_QUALITY'),
    size: pick('OPENAI_IMAGE_SIZE'),
    format: pick('OPENAI_IMAGE_FORMAT'),
  });
}
