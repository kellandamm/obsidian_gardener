import type { App } from "obsidian";

const JOURNAL_FILE = "journal.json";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface JournalEntry {
  id: string;
  proposalId: string;
  targetPath: string;
  before: string;
  existedBefore?: boolean;
  appliedAt: number;
}

export class UndoJournal {
  private entries: JournalEntry[] = [];
  private app: App;
  private dataDir: string;

  constructor(app: App, dataDir: string) {
    this.app = app;
    this.dataDir = dataDir;
  }

  async load(): Promise<void> {
    const path = `${this.dataDir}/${JOURNAL_FILE}`;
    try {
      const raw = await this.app.vault.adapter.read(path);
      this.entries = JSON.parse(raw) as JournalEntry[];
      this.prune();
    } catch {
      this.entries = [];
    }
  }

  async record(entry: Omit<JournalEntry, "id">): Promise<string> {
    const id = `journal-${Date.now()}`;
    this.entries.push({ id, ...entry });
    await this.save();
    return id;
  }

  async undo(journalId: string, app: App): Promise<boolean> {
    const entry = this.entries.find((e) => e.id === journalId);
    if (!entry) return false;
    const file = app.vault.getAbstractFileByPath(entry.targetPath);
    if (entry.existedBefore === false) {
      if (file) await app.vault.delete(file);
      this.entries = this.entries.filter((e) => e.id !== journalId);
      await this.save();
      return true;
    }
    if (file) {
      await app.vault.adapter.write(entry.targetPath, entry.before);
    } else {
      await app.vault.create(entry.targetPath, entry.before);
    }
    this.entries = this.entries.filter((e) => e.id !== journalId);
    await this.save();
    return true;
  }

  getEntries(): JournalEntry[] {
    return this.entries;
  }

  private prune(): void {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    this.entries = this.entries.filter((e) => e.appliedAt > cutoff);
  }

  private async save(): Promise<void> {
    await this.app.vault.adapter.write(
      `${this.dataDir}/${JOURNAL_FILE}`,
      JSON.stringify(this.entries, null, 2)
    );
  }
}
