import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Every id this store hands out comes from randomUUID(), so anything else is refused
// before it gets near a file path.
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function extFor(mimeType) {
  return mimeType === 'image/jpeg' ? 'jpg' : 'png';
}

// A folder that doesn't exist yet just has nothing in it. Cleanup relies on this so it
// never creates folders of its own.
async function jsonFiles(dir) {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readRecords(dir) {
  const names = await jsonFiles(dir);
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(dir, n), 'utf8'))));
}

function newestFirst(records) {
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Keeps generated images on local disk with a small JSON sidecar per image, and each
// Glow Up Plus request as its own JSON file.
// Good enough for a baseline; swap for a real database when there are customers.
// `now` is the clock for createdAt, so tests can age designs without waiting.
export function createStore(dir, { now = Date.now } = {}) {
  const outputsDir = path.join(dir, 'outputs');
  const leadsDir = path.join(dir, 'leads');

  async function ensure() {
    await mkdir(outputsDir, { recursive: true });
    await mkdir(leadsDir, { recursive: true });
  }

  return {
    outputsDir,
    leadsDir,

    // Saves the generated image and the original photo, so the app can show a before/after.
    async save({ buffer, mimeType, before, meta }) {
      await ensure();
      const id = randomUUID();
      const record = {
        id,
        file: `${id}.${extFor(mimeType)}`,
        beforeFile: `${id}-before.${extFor(before.mimeType)}`,
        createdAt: new Date(now()).toISOString(),
        ...meta,
      };
      await writeFile(path.join(outputsDir, record.file), buffer);
      await writeFile(path.join(outputsDir, record.beforeFile), before.buffer);
      await writeFile(path.join(outputsDir, `${id}.json`), JSON.stringify(record, null, 2));
      return record;
    },

    async list(limit = 24) {
      await ensure();
      return newestFirst(await readRecords(outputsDir)).slice(0, limit);
    },

    // One saved design, or null when the id isn't one of ours or the design is gone.
    async get(id) {
      if (!isId(id)) return null;
      const json = await readFile(path.join(outputsDir, `${id}.json`), 'utf8').catch(() => null);
      return json ? JSON.parse(json) : null;
    },

    async saveLead(fields) {
      await ensure();
      const lead = { id: randomUUID(), createdAt: new Date(now()).toISOString(), ...fields };
      await writeFile(path.join(leadsDir, `${lead.id}.json`), JSON.stringify(lead, null, 2));
      return lead;
    },

    async listLeads() {
      await ensure();
      return newestFirst(await readRecords(leadsDir));
    },

    // Deletes designs saved before `cutoff` (a time in ms): the image, the original photo,
    // and the sidecar. A design a Glow Up Plus request points at is always kept, because
    // the owner needs it to quote the job. Requests themselves are never deleted. Any
    // unreadable record stops the pass before anything is deleted. Returns the count.
    async removeDesignsBefore(cutoff) {
      const old = (await readRecords(outputsDir)).filter((d) => Date.parse(d.createdAt) < cutoff);
      if (old.length === 0) return 0;
      const wanted = new Set((await readRecords(leadsDir)).map((lead) => lead.designId));
      const doomed = old.filter((d) => isId(d.id) && !wanted.has(d.id));
      for (const d of doomed) {
        // Sidecar last, so a pass cut short leaves a record the next pass can find again.
        for (const name of [d.file, d.beforeFile, `${d.id}.json`]) {
          if (name) await rm(path.join(outputsDir, path.basename(name)), { force: true });
        }
      }
      return doomed.length;
    },
  };
}
