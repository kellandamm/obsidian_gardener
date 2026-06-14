import type { App } from "obsidian";
import type { ChangeProposal, StagedProposal, SnoozeDuration } from "./ChangeProposal";
import { UndoJournal } from "./UndoJournal";
import type { AuditLog } from "../safety/AuditLog";

const STAGING_FILE = "staging.json";

export class ChangeSetEngine {
  private staged: Map<string, StagedProposal> = new Map();
  private journal: UndoJournal;
  private app: App;
  private dataDir: string;
  private dryRun: boolean;
  private onSchemaRuleAdded?: (rule: string) => Promise<void>;
  private onProposalRejected?: (proposal: ChangeProposal, reason?: string) => Promise<void>;
  private onProposalStale?: (proposal: ChangeProposal) => Promise<void>;
  private onProposalApplied?: (proposal: ChangeProposal) => Promise<void>;
  private audit?: AuditLog;

  constructor(
    app: App,
    dataDir: string,
    dryRun: boolean,
    onSchemaRuleAdded?: (rule: string) => Promise<void>,
    onProposalRejected?: (proposal: ChangeProposal, reason?: string) => Promise<void>,
    onProposalStale?: (proposal: ChangeProposal) => Promise<void>,
    onProposalApplied?: (proposal: ChangeProposal) => Promise<void>,
    audit?: AuditLog
  ) {
    this.app = app;
    this.dataDir = dataDir;
    this.dryRun = dryRun;
    this.onSchemaRuleAdded = onSchemaRuleAdded;
    this.onProposalRejected = onProposalRejected;
    this.onProposalStale = onProposalStale;
    this.onProposalApplied = onProposalApplied;
    this.audit = audit;
    this.journal = new UndoJournal(app, dataDir);
  }

  async load(): Promise<void> {
    await this.journal.load();
    const path = `${this.dataDir}/${STAGING_FILE}`;
    try {
      const raw = await this.app.vault.adapter.read(path);
      const arr = JSON.parse(raw) as StagedProposal[];
      this.staged = new Map(arr.map((s) => [s.proposal.id, s]));
    } catch {
      this.staged = new Map();
    }
  }

  stage(proposals: ChangeProposal[]): void {
    for (const p of proposals) {
      if (!this.staged.has(p.id)) {
        this.staged.set(p.id, { proposal: p, status: "pending" });
      }
    }
    void this.saveStaging().catch((e) => console.error("Gardener: failed to persist staging", e));
  }

  getPending(): StagedProposal[] {
    this.unsnoozeDue();
    return [...this.staged.values()].filter((s) => s.status === "pending");
  }

  getAll(): StagedProposal[] {
    this.unsnoozeDue();
    return [...this.staged.values()];
  }

  async snooze(id: string, days: SnoozeDuration): Promise<void> {
    const staged = this.staged.get(id);
    if (!staged || staged.status !== "pending") return;
    staged.status = "snoozed";
    staged.snoozeUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    await this.saveStaging();
  }

  // Re-surface any snoozed proposals whose snooze period has expired
  private unsnoozeDue(): void {
    const now = Date.now();
    let changed = false;
    for (const s of this.staged.values()) {
      if (s.status === "snoozed" && s.snoozeUntil && s.snoozeUntil <= now) {
        s.status = "pending";
        s.snoozeUntil = undefined;
        changed = true;
      }
    }
    if (changed) void this.saveStaging().catch((e) => console.error("Gardener: failed to persist staging", e));
  }

  async apply(id: string): Promise<boolean> {
    const staged = this.staged.get(id);
    if (!staged || staged.status !== "pending") return false;
    const { proposal } = staged;

    if (proposal.operation === "replace-file" && !this.dryRun) {
      const existedBefore = this.app.vault.getAbstractFileByPath(proposal.targetPath) !== null;
      const before = await this.readFile(proposal.targetPath);
      if (before !== proposal.before) {
        staged.status = "skipped";
        await this.onProposalStale?.(proposal);
        await this.audit?.write({
          ts: new Date().toISOString(),
          action: "block",
          proposalId: proposal.id,
          taskId: proposal.taskId,
          path: proposal.targetPath,
          detail: "stale proposal: file content changed before apply",
        });
        await this.saveStaging();
        return false;
      }
      await this.writeFile(proposal.targetPath, proposal.after);
      const journalId = await this.journal.record({
        proposalId: proposal.id,
        targetPath: proposal.targetPath,
        before,
        existedBefore,
        appliedAt: Date.now(),
      });
      await this.audit?.write({
        ts: new Date().toISOString(),
        action: "apply",
        proposalId: proposal.id,
        taskId: proposal.taskId,
        path: proposal.targetPath,
        detail: `operation=${proposal.operation}; journal=${journalId}; existedBefore=${existedBefore}`,
      });
    }

    staged.status = "approved";
    await this.onProposalApplied?.(proposal);
    if (proposal.operation !== "replace-file" || this.dryRun) {
      await this.audit?.write({
        ts: new Date().toISOString(),
        action: "apply",
        proposalId: proposal.id,
        taskId: proposal.taskId,
        path: proposal.targetPath,
        detail: this.dryRun ? "dry-run approval; no write" : "advisory approval; no write",
      });
    }
    await this.saveStaging();
    return true;
  }

  async reject(id: string, reason?: string): Promise<void> {
    const staged = this.staged.get(id);
    if (!staged) return;
    staged.status = "rejected";
    staged.rejectionReason = reason;
    if (reason && this.onSchemaRuleAdded) {
      await this.onSchemaRuleAdded(reason);
    }
    await this.onProposalRejected?.(staged.proposal, reason);
    await this.audit?.write({
      ts: new Date().toISOString(),
      action: "reject",
      proposalId: staged.proposal.id,
      taskId: staged.proposal.taskId,
      path: staged.proposal.targetPath,
      detail: reason,
    });
    await this.saveStaging();
  }

  async undo(journalId: string): Promise<boolean> {
    const entry = this.journal.getEntries().find((item) => item.id === journalId);
    const ok = await this.journal.undo(journalId, this.app);
    if (ok) {
      await this.audit?.write({
        ts: new Date().toISOString(),
        action: "undo",
        proposalId: entry?.proposalId,
        path: entry?.targetPath,
        detail: `journal=${journalId}`,
      });
    }
    return ok;
  }

  getJournalEntries() {
    return this.journal.getEntries();
  }

  clearApproved(): void {
    for (const [id, s] of this.staged) {
      if (s.status === "approved") this.staged.delete(id);
    }
    void this.saveStaging().catch((e) => console.error("Gardener: failed to persist staging", e));
  }

  private async readFile(path: string): Promise<string> {
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return "";
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const exists = this.app.vault.getAbstractFileByPath(path);
    if (exists) {
      await this.app.vault.adapter.write(path, content);
    } else {
      await this.ensureParentFolders(path);
      await this.app.vault.create(path, content);
    }
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch {
        // Another process may have created it between the existence check and create call.
      }
    }
  }

  private async saveStaging(): Promise<void> {
    try {
      await this.app.vault.adapter.write(
        `${this.dataDir}/${STAGING_FILE}`,
        JSON.stringify([...this.staged.values()], null, 2)
      );
    } catch {
      // directory may not exist yet on first save — silently skip
    }
  }
}
