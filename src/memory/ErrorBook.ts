import type { App } from "obsidian";
import type { ChangeProposal } from "../changeset/ChangeProposal";

const ERROR_BOOK_FILE = "error-book.json";

export type ErrorBookEntryType =
  | "rejected-proposal"
  | "stale-proposal"
  | "false-duplicate"
  | "bad-link"
  | "user-rule";

export interface ErrorBookEntry {
  id: string;
  type: ErrorBookEntryType;
  taskId: string;
  targetPath: string;
  secondaryPath?: string;
  proposalTitle: string;
  reason?: string;
  signature: string;
  createdAt: number;
}

export interface ErrorBookData {
  version: 1;
  entries: ErrorBookEntry[];
}

export function createErrorBook(): ErrorBookData {
  return { version: 1, entries: [] };
}

export function proposalSignature(proposal: Pick<ChangeProposal, "taskId" | "targetPath" | "secondaryPath" | "title">): string {
  return [
    proposal.taskId,
    proposal.targetPath,
    proposal.secondaryPath ?? "",
    normalizeTitle(proposal.title),
  ].join("|");
}

export function shouldSuppressProposal(errorBook: ErrorBookData, proposal: ChangeProposal): boolean {
  const signature = proposalSignature(proposal);
  return errorBook.entries.some((entry) => entry.signature === signature);
}

export class ErrorBook {
  private data: ErrorBookData = createErrorBook();

  constructor(private app: App, private dataDir: string) {}

  async load(): Promise<void> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.dataDir}/${ERROR_BOOK_FILE}`);
      const parsed = JSON.parse(raw) as ErrorBookData;
      if (parsed.version === 1 && Array.isArray(parsed.entries)) this.data = parsed;
    } catch {
      this.data = createErrorBook();
    }
  }

  getData(): ErrorBookData {
    return this.data;
  }

  shouldSuppress(proposal: ChangeProposal): boolean {
    return shouldSuppressProposal(this.data, proposal);
  }

  async recordRejected(proposal: ChangeProposal, reason?: string): Promise<void> {
    await this.record({
      type: classifyRejectedProposal(proposal),
      taskId: proposal.taskId,
      targetPath: proposal.targetPath,
      secondaryPath: proposal.secondaryPath,
      proposalTitle: proposal.title,
      reason,
      signature: proposalSignature(proposal),
    });
  }

  async recordStale(proposal: ChangeProposal): Promise<void> {
    await this.record({
      type: "stale-proposal",
      taskId: proposal.taskId,
      targetPath: proposal.targetPath,
      secondaryPath: proposal.secondaryPath,
      proposalTitle: proposal.title,
      signature: proposalSignature(proposal),
    });
  }

  private async record(entry: Omit<ErrorBookEntry, "id" | "createdAt">): Promise<void> {
    if (this.data.entries.some((existing) => existing.signature === entry.signature && existing.type === entry.type)) {
      return;
    }
    this.data.entries.unshift({
      ...entry,
      id: `err-${Date.now()}-${this.data.entries.length + 1}`,
      createdAt: Date.now(),
    });
    this.data.entries = this.data.entries.slice(0, 500);
    await this.save();
  }

  private async save(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.dataDir);
    } catch {
      // already exists
    }
    await this.app.vault.adapter.write(
      `${this.dataDir}/${ERROR_BOOK_FILE}`,
      JSON.stringify(this.data, null, 2)
    );
  }
}

function classifyRejectedProposal(proposal: ChangeProposal): ErrorBookEntryType {
  if (proposal.taskId.includes("duplicate") || proposal.type === "merge-notes") return "false-duplicate";
  if (proposal.type === "insert-link" || proposal.type === "delete-link") return "bad-link";
  return proposal.taskId.includes("rule") ? "user-rule" : "rejected-proposal";
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}
