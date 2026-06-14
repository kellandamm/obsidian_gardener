import type { App } from "obsidian";
import { createWikiMemoryGraph, type WikiMemoryGraphData } from "./WikiMemoryGraph";

const MEMORY_FILE = "wiki-memory.json";

export async function loadWikiMemoryGraph(app: App, dataDir: string): Promise<WikiMemoryGraphData> {
  try {
    const raw = await app.vault.adapter.read(`${dataDir}/${MEMORY_FILE}`);
    const parsed = JSON.parse(raw) as WikiMemoryGraphData;
    if (parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return parsed;
    }
  } catch {
    // fall through to an empty graph
  }
  return createWikiMemoryGraph();
}

export async function saveWikiMemoryGraph(
  app: App,
  dataDir: string,
  graph: WikiMemoryGraphData
): Promise<void> {
  await ensureDir(app, dataDir);
  await app.vault.adapter.write(`${dataDir}/${MEMORY_FILE}`, JSON.stringify(graph, null, 2));
}

async function ensureDir(app: App, dir: string): Promise<void> {
  try {
    await app.vault.adapter.mkdir(dir);
  } catch {
    // already exists
  }
}
