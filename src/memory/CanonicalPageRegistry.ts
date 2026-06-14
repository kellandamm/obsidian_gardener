import type { App } from "obsidian";
import type { ChangeProposal } from "../changeset/ChangeProposal";
import type { MemoryNode } from "./WikiMemoryGraph";

const CANONICAL_REGISTRY_FILE = "canonical-pages.json";

export type CanonicalPageSource = "existing" | "promoted" | "created";

export interface CanonicalPageEntry {
  conceptId: string;
  conceptLabel: string;
  path: string;
  source: CanonicalPageSource;
  confidence: number;
  provenanceCount: number;
  updatedAt: number;
}

export interface CanonicalPageRegistryData {
  version: 1;
  entries: CanonicalPageEntry[];
}

export function createCanonicalPageRegistry(): CanonicalPageRegistryData {
  return { version: 1, entries: [] };
}

export class CanonicalPageRegistry {
  private data: CanonicalPageRegistryData = createCanonicalPageRegistry();

  constructor(private app: App, private dataDir: string) {}

  async load(): Promise<void> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.dataDir}/${CANONICAL_REGISTRY_FILE}`);
      const parsed = JSON.parse(raw) as CanonicalPageRegistryData;
      if (parsed.version === 1 && Array.isArray(parsed.entries)) this.data = parsed;
    } catch {
      this.data = createCanonicalPageRegistry();
    }
  }

  getData(): CanonicalPageRegistryData {
    return this.data;
  }

  get(conceptId: string): CanonicalPageEntry | null {
    return this.data.entries.find((entry) => entry.conceptId === conceptId) ?? null;
  }

  findByPath(path: string): CanonicalPageEntry | null {
    return this.data.entries.find((entry) => entry.path === path) ?? null;
  }

  async upsert(entry: CanonicalPageEntry): Promise<void> {
    const existing = this.data.entries.find((item) => item.conceptId === entry.conceptId);
    if (existing) Object.assign(existing, entry);
    else this.data.entries.unshift(entry);
    await this.save();
  }

  async recordApprovedProposal(proposal: ChangeProposal): Promise<void> {
    if (proposal.taskId !== "queued-hub-notes") return;
    const conceptId = /gardener-concept-id:\s*(.+)/.exec(proposal.after)?.[1]?.trim();
    const label = /^#\s+(.+)$/m.exec(proposal.after)?.[1]?.trim();
    if (!conceptId || !label) return;
    await this.upsert({
      conceptId,
      conceptLabel: label,
      path: proposal.targetPath,
      source: proposal.before.trim() ? "promoted" : "created",
      confidence: proposal.confidence,
      provenanceCount: (proposal.after.match(/\n- \[\[/g) ?? []).length,
      updatedAt: Date.now(),
    });
  }

  private async save(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.dataDir);
    } catch {
      // already exists
    }
    await this.app.vault.adapter.write(
      `${this.dataDir}/${CANONICAL_REGISTRY_FILE}`,
      JSON.stringify(this.data, null, 2)
    );
  }
}

export function canonicalEntryFromExisting(concept: MemoryNode, path: string): CanonicalPageEntry {
  return {
    conceptId: concept.id,
    conceptLabel: concept.label,
    path,
    source: "existing",
    confidence: 0.72,
    provenanceCount: concept.provenance.length,
    updatedAt: Date.now(),
  };
}
