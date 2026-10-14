import { createServer as createHttpServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, buildPrompt, publicModes } from './presets.js';
import { providerFromEnv } from './providers.js';
import { createStore, isId } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// Node lets odd request targets like `http://[/x` through, so a bad one is a 400, not a crash.
function requestUrl(req) {
  try {
    return new URL(req.url, 'http://localhost');
  } catch {
    throw new HttpError(400, 'Bad request');
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

// Blank environment values count as unset.
function setting(env, key) {
  return env[key]?.trim() || null;
}

// Missing, null, or non-string fields all count as blank, and everything is trimmed.
function readLeadForm(body) {
  const text = (key) => (typeof body?.[key] === 'string' ? body[key].trim() : '');
  return {
    designId: text('designId'),
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    zip: text('zip'),
    notes: text('notes'),
  };
}

// The Get This Built checks, in the same order as the app. Returns the first problem,
// or null when the form is fine. The design check needs the disk, so it runs separately.
function leadProblem({ name, phone, email, zip, notes }) {
  if (!name) return 'Add your name';
  if (name.length > 100) return 'Keep your name under 100 characters';
  if (!phone && !email) return 'Add a phone number or email so the contractor can reach you';
  if (phone && (phone.replace(/\D/g, '').length < 7 || phone.length > 30)) return 'Check the phone number';
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 200)) return 'Check the email address';
  if (zip.length < 3 || zip.length > 12) return 'Add your ZIP code';
  if (notes.length > 1000) return 'Keep notes under 1,000 characters';
  return null;
}

// Constant-time check of the owner's bearer token. Hashing both sides first gives
// equal-length buffers, so a token of the wrong length is just another mismatch.
function tokenMatches(header, token) {
  const given = /^Bearer\s+(.+)$/i.exec(header || '')?.[1] ?? '';
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(token));
}

function designSummary(record) {
  if (!record) return null;
  const { id, file, beforeFile, mode, upgrades, style } = record;
  return { id, file, beforeFile, mode, upgrades, style };
}

export function createApp({
  env = process.env,
  provider = providerFromEnv(env),
  dataDir = path.join(here, '..', 'data'),
} = {}) {
  const store = createStore(dataDir);
  const storeUrl = setting(env, 'AMAZON_STORE_URL');
  const contractor = { name: setting(env, 'CONTRACTOR_NAME'), phone: setting(env, 'CONTRACTOR_PHONE') };
  const adminToken = setting(env, 'ADMIN_TOKEN');

  async function handleGenerate(req, res) {
    const body = (await readJson(req)) || {};
    const { mimeType, buffer } = decodeImage(body.image);
    // Text only: the app reads mode and style as strings, and one odd record would
    // break the gallery for everyone.
    const mode = typeof body.mode === 'string' ? body.mode : '';
    const upgradeIds = Array.isArray(body.upgrades) ? body.upgrades : [];
    const style = typeof body.style === 'string' ? body.style : '';

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

  async function handleCreateLead(req, res) {
    const form = readLeadForm(await readJson(req));
    const problem = leadProblem(form);
    if (problem) throw new HttpError(400, problem);

    // Only a real design id is ever looked up, so a path like '../x' never reaches the disk.
    if (form.designId && (!isId(form.designId) || !(await store.get(form.designId)))) {
      throw new HttpError(400, 'That design is no longer available');
    }

    const lead = await store.saveLead({
      designId: form.designId || null,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      zip: form.zip,
      notes: form.notes || null,
    });
    // Just the id: customer details stay out of the logs.
    console.log(`[lead] new request ${lead.id}`);
    send(res, 201, { id: lead.id, createdAt: lead.createdAt });
  }

  // Owner-only routes are off unless ADMIN_TOKEN is set, and then need that token.
  function requireOwner(req) {
    if (!adminToken) throw new HttpError(404, 'Not found');
    if (!tokenMatches(req.headers.authorization, adminToken)) throw new HttpError(401, 'Unauthorized');
  }

  async function handleListLeads(req, res) {
    requireOwner(req);
    const leads = await store.listLeads();
    const items = await Promise.all(
      leads.map(async (lead) => ({ ...lead, design: designSummary(await store.get(lead.designId)) })),
    );
    send(res, 200, { items });
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
    try {
      const url = requestUrl(req);
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return send(res, 200, {
          modes: publicModes({ storeUrl }),
          styles: Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label })),
          previewMode: provider.name === 'mock',
          contractor,
        });
      }
      // Every customer's designs, including photos of their homes, so it is owner-only.
      // The app keeps each customer's own designs on their phone instead.
      if (req.method === 'GET' && url.pathname === '/api/gallery') {
        requireOwner(req);
        return send(res, 200, { items: await store.list() });
      }
      if (req.method === 'POST' && url.pathname === '/api/generate') {
        return await handleGenerate(req, res);
      }
      if (req.method === 'POST' && url.pathname === '/api/leads') {
        return await handleCreateLead(req, res);
      }
      if (req.method === 'GET' && url.pathname === '/api/leads') {
        return await handleListLeads(req, res);
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
