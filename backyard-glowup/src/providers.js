// Image providers. The app only talks to the interface { name, edit({ image, mimeType, prompt }) },
// so swapping the backend (OpenAI, a self-hosted model on your server, etc.) is config, not code.

// Returns the original photo untouched. Lets the full flow run with no API key or credits.
export const mockProvider = {
  name: 'mock',
  async edit({ image, mimeType }) {
    return { buffer: image, mimeType, note: 'Preview mode: no image model is configured, so the original photo is returned.' };
  },
};

// Calls an OpenAI-compatible images/edits endpoint. OPENAI_BASE_URL lets you point
// this at your own server later without changing code.
export function openaiProvider({ apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-image-1', size = 'auto', fetchImpl = fetch }) {
  return {
    name: `openai:${model}`,
    async edit({ image, mimeType, prompt }) {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('n', '1');
      form.append('image', new Blob([image], { type: mimeType }), mimeType === 'image/png' ? 'yard.png' : 'yard.jpg');

      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Image model returned ${res.status}: ${detail.slice(0, 300)}`);
      }

      const json = await res.json();
      const item = json.data?.[0];
      if (item?.b64_json) {
        return { buffer: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png' };
      }
      if (item?.url) {
        const img = await fetchImpl(item.url);
        if (!img.ok) throw new Error(`Could not download generated image: ${img.status}`);
        return { buffer: Buffer.from(await img.arrayBuffer()), mimeType: 'image/png' };
      }
      throw new Error('Image model response had no image data');
    },
  };
}

// Picks a provider from environment variables. No key means mock mode.
export function providerFromEnv(env = process.env) {
  if (!env.OPENAI_API_KEY) return mockProvider;
  return openaiProvider({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_IMAGE_MODEL,
    size: env.OPENAI_IMAGE_SIZE,
  });
}
