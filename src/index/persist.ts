import type { App } from "obsidian";
import { type VaultIndex, createVaultIndex, addOrUpdate } from "./VaultIndex";

const INDEX_FILE = "index.json";

interface SerializedIndex {
  notes: Array<{
    path: string;
    mtime: number;
    wordCount: number;
    links: string[];
    tags: string[];
    title: string;
  }>;
}

export async function loadIndex(app: App, dataDir: string): Promise<VaultIndex | null> {
  const filePath = `${dataDir}/${INDEX_FILE}`;
  try {
    const raw = await app.vault.adapter.read(filePath);
    const data = JSON.parse(raw) as SerializedIndex;
    const index = createVaultIndex();
    for (const note of data.notes) {
      // Provide defaults for fields added after initial release
      addOrUpdate(index, {
        headings: [],
        frontmatterKeys: [],
        ...note,
      });
    }
    return index;
  } catch {
    return null;
  }
}

export async function saveIndex(app: App, dataDir: string, index: VaultIndex): Promise<void> {
  const data: SerializedIndex = { notes: [...index.notes.values()] };
  await ensureDir(app, dataDir);
  await app.vault.adapter.write(`${dataDir}/${INDEX_FILE}`, JSON.stringify(data));
}

async function ensureDir(app: App, dir: string): Promise<void> {
  try {
    await app.vault.adapter.mkdir(dir);
  } catch {
    // already exists
  }
}
