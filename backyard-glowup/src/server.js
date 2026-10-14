import { createServer as createHttpServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLeadMailer } from './email.js';
import { clientIp, createDailyLimits } from './limits.js';
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

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 12 * 60 * 60 * 1000;

const BUSY_MESSAGE = "We're getting a lot of requests right now. Please try again in a few minutes.";
const DAILY_LIMIT_MESSAGE = "You've made a lot of designs today. Please come back tomorrow.";
const LEAD_LIMIT_MESSAGE = "You've sent a lot of requests today. Please try again tomorrow.";

// Get This Built has no sign-in either. A real customer sends one or two requests, so a
// few per address per day is plenty. The email cap stays under Resend's free plan (100
// a day), so a flood can't run the owner's account out; past it, requests are still saved.
const LEADS_PER_IP = 5;
const LEAD_EMAILS_PER_DAY = 90;

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

// A whole-number setting. Anything that isn't one falls back to the default, with a
// warning so a typo in the host's dashboard doesn't go unnoticed.
function countSetting(env, key, fallback) {
  const value = setting(env, key);
  if (value === null) return fallback;
  if (/^\d+$/.test(value)) return Number(value);
  console.warn(`[config] ${key} should be a whole number; using ${fallback}`);
  return fallback;
}

// How many days designs are kept. Unset means 90, and only 0 turns cleanup off (null).
// Anything else that isn't a positive number is a typo, so it warns and keeps 90: the
// privacy policy promises the deletion, and a typo must not quietly stop it.
function retentionDays(env) {
  const value = setting(env, 'RETENTION_DAYS');
  if (value === null) return 90;
  const days = Number(value);
  if (days === 0) return null;
  if (days > 0) return days;
  console.warn('[config] RETENTION_DAYS should be a number of days; using 90');
  return 90;
}

// Where designs and requests are saved: DATA_DIR (a host's persistent disk), or the
// data folder next to src.
export function dataDirFromEnv(env = process.env) {
  const dir = setting(env, 'DATA_DIR');
  return dir ? path.resolve(dir) : path.join(here, '..', 'data');
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

// `now` is the clock for daily limits, saved dates, and cleanup, and `fetchImpl` sends
// the owner's emails; tests swap in their own.
export function createApp({
  env = process.env,
  provider = providerFromEnv(env),
  dataDir = dataDirFromEnv(env),
  now = Date.now,
  fetchImpl = fetch,
} = {}) {
  const store = createStore(dataDir, { now });
  const storeUrl = setting(env, 'AMAZON_STORE_URL');
  const contractor = { name: setting(env, 'CONTRACTOR_NAME'), phone: setting(env, 'CONTRACTOR_PHONE') };
  const adminToken = setting(env, 'ADMIN_TOKEN');
  const trustProxy = ['1', 'true'].includes(setting(env, 'TRUST_PROXY')?.toLowerCase());
  const limits = createDailyLimits({
    perIp: countSetting(env, 'GENERATE_LIMIT_PER_IP', 20),
    perDay: countSetting(env, 'GENERATE_DAILY_CAP', 300),
    now,
  });
  const leadLimits = createDailyLimits({ perIp: LEADS_PER_IP, now });
  const emailLimits = createDailyLimits({ perDay: LEAD_EMAILS_PER_DAY, now });
  const mailLead = createLeadMailer({
    apiKey: setting(env, 'RESEND_API_KEY'),
    to: setting(env, 'LEAD_EMAIL_TO'),
    from: setting(env, 'LEAD_EMAIL_FROM') ?? undefined,
    fetchImpl,
  });
  const keepDays = retentionDays(env);

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

    // Counted only once the photo and plan check out, and before the slow model call, so
    // a burst of requests can't all slip in under the limit together.
    const ip = clientIp(req, trustProxy);
    const blocked = limits.take(ip);
    if (blocked === 'ip') throw new HttpError(429, DAILY_LIMIT_MESSAGE);
    if (blocked === 'day') throw new HttpError(503, BUSY_MESSAGE);

    let result;
    try {
      result = await provider.edit({ image: buffer, mimeType, prompt });
    } catch (err) {
      console.error('[generate] provider failed:', err.message);
      // 429 is OpenAI's rate limit or the project's monthly spend limit: busy, not broken.
      // Nothing was made or charged, so the design goes back to the customer and the day;
      // otherwise retries while OpenAI is busy would use up both with nothing to show.
      if (err.status === 429) {
        limits.giveBack(ip);
        throw new HttpError(503, BUSY_MESSAGE);
      }
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
    const design = isId(form.designId) ? await store.get(form.designId) : null;
    if (form.designId && !design) throw new HttpError(400, 'That design is no longer available');

    // Counted once the form checks out, like new designs, so fixing a typo is free.
    if (leadLimits.take(clientIp(req, trustProxy))) throw new HttpError(429, LEAD_LIMIT_MESSAGE);

    const fields = {
      designId: form.designId || null,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      zip: form.zip,
      notes: form.notes || null,
    };
    let lead;
    try {
      lead = await store.saveLead(fields);
    } catch (err) {
      // A full disk must not lose the request. The email is then its only copy, so wait
      // for it, and tell the customer it was sent only if the email went.
      const unsaved = { id: randomUUID(), createdAt: new Date(now()).toISOString(), ...fields };
      if (!(await emailLead(unsaved, design, { saved: false }))) throw err;
      console.error(`[lead] could not save request ${unsaved.id}, emailed only: ${err.code ?? 'error'}`);
      return send(res, 201, { id: unsaved.id, createdAt: unsaved.createdAt });
    }
    // Just the id: customer details stay out of the logs.
    console.log(`[lead] new request ${lead.id}`);
    send(res, 201, { id: lead.id, createdAt: lead.createdAt });
    // After the reply and never awaited, so a slow or failing email can't hold up or
    // break the customer's request. The mailer catches and logs its own errors.
    emailLead(lead, design);
  }

  // Emails the owner, up to LEAD_EMAILS_PER_DAY a day. Resolves to whether it was sent.
  async function emailLead(lead, design, options) {
    if (!mailLead) return false;
    if (emailLimits.take('server')) {
      console.warn(`[lead] email skipped ${lead.id} (daily email limit)`);
      return false;
    }
    return mailLead(lead, design, options);
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

  const server = createHttpServer(async (req, res) => {
    try {
      const url = requestUrl(req);
      // For the host's health check.
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return send(res, 200, { ok: true });
      }
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

  // Photo cleanup. Each pass waits for the one before it, so passes never overlap, and
  // resolves to how many designs it removed. Tests call it to wait for a pass to finish.
  let cleaning = Promise.resolve(0);
  server.cleanupOldDesigns = () => {
    cleaning = cleaning.then(async () => {
      if (!keepDays) return 0;
      try {
        const removed = await store.removeDesignsBefore(now() - keepDays * DAY_MS);
        if (removed) console.log(`[cleanup] removed ${removed} old designs`);
        return removed;
      } catch (err) {
        console.error('[cleanup] failed:', err.message);
        return 0;
      }
    });
    return cleaning;
  };

  // Once at startup, then every 12 hours. unref() so the timer never keeps the process
  // alive, and it stops when the server closes.
  if (keepDays) {
    server.cleanupOldDesigns();
    const timer = setInterval(server.cleanupOldDesigns, CLEANUP_EVERY_MS);
    timer.unref();
    server.on('close', () => clearInterval(timer));
  }

  return server;
}
