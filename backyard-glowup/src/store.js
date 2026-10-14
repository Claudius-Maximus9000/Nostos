import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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

async function readRecords(dir) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(dir, n), 'utf8'))));
}

function newestFirst(records) {
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Keeps generated images on local disk with a small JSON sidecar per image, and each
// Glow Up Plus request as its own JSON file.
// Good enough for a baseline; swap for a real database when there are customers.
export function createStore(dir) {
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
        createdAt: new Date().toISOString(),
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
      const lead = { id: randomUUID(), createdAt: new Date().toISOString(), ...fields };
      await writeFile(path.join(leadsDir, `${lead.id}.json`), JSON.stringify(lead, null, 2));
      return lead;
    },

    async listLeads() {
      await ensure();
      return newestFirst(await readRecords(leadsDir));
    },
  };
}
