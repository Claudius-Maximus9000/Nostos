import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function extFor(mimeType) {
  return mimeType === 'image/jpeg' ? 'jpg' : 'png';
}

// Keeps generated images on local disk with a small JSON sidecar per image.
// Good enough for a baseline; swap for a real database when there are customers.
export function createStore(dir) {
  const outputsDir = path.join(dir, 'outputs');

  async function ensure() {
    await mkdir(outputsDir, { recursive: true });
  }

  return {
    outputsDir,

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
      const names = (await readdir(outputsDir)).filter((n) => n.endsWith('.json'));
      const records = await Promise.all(
        names.map(async (n) => JSON.parse(await readFile(path.join(outputsDir, n), 'utf8'))),
      );
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
  };
}
