import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { ChangeSetEngine } from "../changeset/ChangeSetEngine";

export const UNDO_HISTORY_VIEW_TYPE = "gardener-undo-history";

export class UndoHistoryView extends ItemView {
  private engine: ChangeSetEngine;

  constructor(leaf: WorkspaceLeaf, engine: ChangeSetEngine) {
    super(leaf);
    this.engine = engine;
  }

  getViewType(): string { return UNDO_HISTORY_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: History"; }
  getIcon(): string { return "history"; }

  async onOpen(): Promise<void> { this.render(); }
  async onClose(): Promise<void> {}

  refresh(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-history");

    contentEl.createEl("h3", { text: "Applied Changes", cls: "gardener-history-title" });
    contentEl.createEl("p", {
      text: "Changes applied in the last 30 days. Click Undo to revert a change.",
      cls: "gardener-history-sub",
    });

    const entries = this.engine.getJournalEntries()
      .slice()
      .sort((a, b) => b.appliedAt - a.appliedAt); // newest first

    if (entries.length === 0) {
      const empty = contentEl.createDiv("gardener-empty");
      empty.createDiv("gardener-empty-icon").textContent = "↩";
      empty.createEl("p").textContent = "No changes have been applied yet.";
      return;
    }

    const list = contentEl.createDiv("gardener-history-list");

    for (const entry of entries) {
      const row = list.createDiv("gardener-history-row");

      const info = row.createDiv("gardener-history-info");
      info.createEl("b", {
        text: entry.targetPath.split("/").pop() ?? entry.targetPath,
        cls: "gardener-history-file",
      });
      info.createEl("span", {
        text: this.formatDate(entry.appliedAt),
        cls: "gardener-history-date",
      });
      info.createEl("span", {
        text: `proposal: ${entry.proposalId}`,
        cls: "gardener-history-id",
      });

      const undoBtn = row.createEl("button", {
        cls: "gardener-btn gardener-history-undo",
        text: "Undo",
      });
      undoBtn.addEventListener("click", async () => {
        undoBtn.setAttr("disabled", "true");
        undoBtn.textContent = "Reverting…";
        const ok = await this.engine.undo(entry.id);
        if (ok) {
          new Notice(`Gardener: reverted change to "${entry.targetPath.split("/").pop()}"`);
          this.render();
        } else {
          new Notice("Gardener: could not revert — entry may have already been undone.");
          undoBtn.removeAttribute("disabled");
          undoBtn.textContent = "Undo";
        }
      });
    }
  }

  private formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }
}
