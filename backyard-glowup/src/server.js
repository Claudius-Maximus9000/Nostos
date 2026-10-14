import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, STYLES, buildPrompt } from './presets.js';
import { providerFromEnv } from './providers.js';
import { createStore } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Photo is too large. Try one under 9 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Request body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Accepts a data: URL from the browser and returns the raw bytes plus MIME type.
function decodeImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl || '');
  if (!match || !ALLOWED_MIME.has(match[1])) {
    throw new HttpError(400, 'Upload a JPG or PNG photo');
  }
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

export function createApp({ provider = providerFromEnv(), dataDir = path.join(here, '..', 'data') } = {}) {
  const store = createStore(dataDir);

  async function handleGenerate(req, res) {
    const body = await readJson(req);
    const { mimeType, buffer } = decodeImage(body.image);
    const mode = body.mode;
    const upgradeIds = Array.isArray(body.upgrades) ? body.upgrades : [];
    const style = body.style || '';

    let prompt;
    try {
      prompt = buildPrompt({ mode, upgradeIds, style });
    } catch (err) {
      throw new HttpError(400, err.message);
    }

    let result;
    try {
      result = await provider.edit({ image: buffer, mimeType, prompt });
    } catch (err) {
      console.error('[generate] provider failed:', err.message);
      throw new HttpError(502, 'The image model could not finish this one. Try again in a moment.');
    }

    const record = await store.save({
      buffer: result.buffer,
      mimeType: result.mimeType,
      before: { buffer, mimeType },
      meta: {
        mode,
        upgrades: upgradeIds,
        style,
        provider: provider.name,
        preview: provider.name === 'mock',
        note: result.note || null,
        prompt,
      },
    });
    send(res, 201, record);
  }

  async function serveOutput(res, name) {
    const safe = path.basename(name);
    const filePath = path.join(store.outputsDir, safe);
    const data = await readFile(filePath).catch(() => null);
    if (!data) throw new HttpError(404, 'Not found');
    res.writeHead(200, { 'Content-Type': MIME_BY_EXT[path.extname(safe)] || 'application/octet-stream' });
    res.end(data);
  }

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return send(res, 200, {
          modes: Object.values(MODES),
          styles: Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label })),
          previewMode: provider.name === 'mock',
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/gallery') {
        return send(res, 200, { items: await store.list() });
      }
      if (req.method === 'POST' && url.pathname === '/api/generate') {
        return await handleGenerate(req, res);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/outputs/')) {
        return await serveOutput(res, url.pathname.slice('/outputs/'.length));
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) send(res, err.status, { error: err.message });
        return;
      }
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong on our end' });
    }
  });
}
