import type { App } from "obsidian";
import type { MemoryNode } from "./WikiMemoryGraph";

const MEMORY_REVIEW_FILE = "memory-review.json";

export type MemoryReviewStatus =
  | "accepted"
  | "rejected"
  | "hub-queued"
  | "contradiction-real"
  | "contradiction-context"
  | "contradiction-false"
  | "contradiction-superseded";

export interface MemoryReviewEntry {
  nodeId: string;
  nodeType: MemoryNode["type"];
  label: string;
  path?: string;
  status: MemoryReviewStatus;
  reason?: string;
  editedLabel?: string;
  updatedAt: number;
}

export interface MemoryReviewData {
  version: 1;
  entries: MemoryReviewEntry[];
}

export function createMemoryReviewData(): MemoryReviewData {
  return { version: 1, entries: [] };
}

export class MemoryReviewStore {
  private data: MemoryReviewData = createMemoryReviewData();

  constructor(private app: App, private dataDir: string) {}

  async load(): Promise<void> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.dataDir}/${MEMORY_REVIEW_FILE}`);
      const parsed = JSON.parse(raw) as MemoryReviewData;
      if (parsed.version === 1 && Array.isArray(parsed.entries)) this.data = parsed;
    } catch {
      this.data = createMemoryReviewData();
    }
  }

  getData(): MemoryReviewData {
    return this.data;
  }

  getStatus(nodeId: string): MemoryReviewStatus | null {
    return this.data.entries.find((entry) => entry.nodeId === nodeId)?.status ?? null;
  }

  async setStatus(node: MemoryNode, status: MemoryReviewStatus, reason?: string): Promise<void> {
    const existing = this.data.entries.find((entry) => entry.nodeId === node.id);
    const entry: MemoryReviewEntry = {
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      path: node.provenance[0]?.path,
      status,
      reason,
      updatedAt: Date.now(),
    };
    if (existing) Object.assign(existing, entry);
    else this.data.entries.unshift(entry);
    this.data.entries = this.data.entries.slice(0, 1000);
    await this.save();
  }

  async setSyntheticStatus(
    nodeId: string,
    nodeType: MemoryNode["type"],
    label: string,
    status: MemoryReviewStatus,
    path?: string,
    reason?: string
  ): Promise<void> {
    const existing = this.data.entries.find((entry) => entry.nodeId === nodeId);
    const entry: MemoryReviewEntry = {
      nodeId,
      nodeType,
      label,
      path,
      status,
      reason,
      updatedAt: Date.now(),
    };
    if (existing) Object.assign(existing, entry);
    else this.data.entries.unshift(entry);
    this.data.entries = this.data.entries.slice(0, 1000);
    await this.save();
  }

  getEditedLabel(nodeId: string): string | null {
    return this.data.entries.find((entry) => entry.nodeId === nodeId)?.editedLabel ?? null;
  }

  async setEditedLabel(node: MemoryNode, editedLabel: string): Promise<void> {
    const existing = this.data.entries.find((entry) => entry.nodeId === node.id);
    const trimmed = editedLabel.trim();
    const entry: MemoryReviewEntry = {
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      path: node.provenance[0]?.path,
      status: existing?.status ?? "accepted",
      reason: existing?.reason,
      editedLabel: trimmed.length > 0 && trimmed !== node.label ? trimmed : undefined,
      updatedAt: Date.now(),
    };
    if (existing) Object.assign(existing, entry);
    else this.data.entries.unshift(entry);
    this.data.entries = this.data.entries.slice(0, 1000);
    await this.save();
  }

  private async save(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.dataDir);
    } catch {
      // already exists
    }
    await this.app.vault.adapter.write(
      `${this.dataDir}/${MEMORY_REVIEW_FILE}`,
      JSON.stringify(this.data, null, 2)
    );
  }
}
