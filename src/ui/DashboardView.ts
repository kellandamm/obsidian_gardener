import { ItemView, WorkspaceLeaf } from "obsidian";
import type { Indexer } from "../index/Indexer";
import type { ChangeSetEngine } from "../changeset/ChangeSetEngine";
import { getBrokenLinks, getOrphans } from "../index/VaultIndex";

export const DASHBOARD_VIEW_TYPE = "gardener-dashboard";

export class DashboardView extends ItemView {
  private indexer: Indexer;
  private engine: ChangeSetEngine;

  constructor(leaf: WorkspaceLeaf, indexer: Indexer, engine: ChangeSetEngine) {
    super(leaf);
    this.indexer = indexer;
    this.engine = engine;
  }

  getViewType(): string { return DASHBOARD_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Dashboard"; }
  getIcon(): string { return "bar-chart-2"; }

  async onOpen(): Promise<void> { this.render(); }
  async onClose(): Promise<void> {}

  refresh(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-dashboard");

    const index = this.indexer.getIndex();
    const notes = [...index.notes.values()];
    const totalNotes = notes.length;

    if (totalNotes === 0) {
      contentEl.createEl("p", { text: "No notes indexed yet.", cls: "gardener-empty" });
      return;
    }

    const orphans = getOrphans(index);
    const broken = getBrokenLinks(index);
    const totalLinks = notes.reduce((sum, n) => sum + n.links.length, 0);
    const avgLinks = totalNotes > 0 ? totalLinks / totalNotes : 0;
    const orphanPct = totalNotes > 0 ? (orphans.length / totalNotes) * 100 : 0;
    const allWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
    const avgWords = totalNotes > 0 ? allWords / totalNotes : 0;

    const journal = this.engine.getJournalEntries();
    const approvedThisMonth = journal.filter(
      (e) => e.appliedAt > Date.now() - 30 * 24 * 60 * 60 * 1000
    ).length;

    // Header
    contentEl.createEl("h3", { text: "Vault Health", cls: "gardener-dash-title" });
    contentEl.createEl("p", {
      text: `Last updated: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      cls: "gardener-dash-sub",
    });

    // Stats grid
    const grid = contentEl.createDiv("gardener-stat-grid");

    this.renderStat(grid, String(totalNotes), "Total notes", "neutral");
    this.renderStat(
      grid,
      avgLinks.toFixed(1),
      "Links per note",
      avgLinks >= 2 ? "good" : avgLinks >= 1 ? "warn" : "bad"
    );
    this.renderStat(
      grid,
      `${orphanPct.toFixed(0)}%`,
      "Orphan notes",
      orphanPct < 10 ? "good" : orphanPct < 25 ? "warn" : "bad"
    );
    this.renderStat(
      grid,
      String(broken.length),
      "Broken links",
      broken.length === 0 ? "good" : broken.length < 5 ? "warn" : "bad"
    );
    this.renderStat(grid, Math.round(avgWords).toLocaleString(), "Avg note length", "neutral");
    this.renderStat(grid, String(approvedThisMonth), "Changes approved (30d)", "neutral");

    // Orphan list (up to 10)
    if (orphans.length > 0) {
      const section = contentEl.createDiv("gardener-dash-section");
      section.createEl("h4", { text: `Orphan notes (${orphans.length})` });
      const list = section.createEl("ul", { cls: "gardener-dash-list" });
      for (const note of orphans.slice(0, 10)) {
        list.createEl("li").createEl("span", { text: note.title, cls: "gardener-dash-note" });
      }
      if (orphans.length > 10) {
        section.createEl("p", {
          text: `…and ${orphans.length - 10} more`,
          cls: "gardener-dash-more",
        });
      }
    }

    // Broken links list (up to 10)
    if (broken.length > 0) {
      const section = contentEl.createDiv("gardener-dash-section");
      section.createEl("h4", { text: `Broken links (${broken.length})` });
      const list = section.createEl("ul", { cls: "gardener-dash-list" });
      for (const { source, target } of broken.slice(0, 10)) {
        const li = list.createEl("li");
        li.createEl("span", { text: source.split("/").pop() ?? source, cls: "gardener-dash-note" });
        li.createEl("span", { text: " → ", cls: "gardener-dash-arrow" });
        li.createEl("span", { text: target, cls: "gardener-dash-broken" });
      }
    }

    // Tag diversity
    const allTags = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags) allTags.set(tag, (allTags.get(tag) ?? 0) + 1);
    }
    const topTags = [...allTags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topTags.length > 0) {
      const section = contentEl.createDiv("gardener-dash-section");
      section.createEl("h4", { text: "Top tags" });
      const tagCloud = section.createDiv("gardener-tag-cloud");
      for (const [tag, count] of topTags) {
        const chip = tagCloud.createSpan("gardener-tag-chip");
        chip.textContent = `#${tag} (${count})`;
      }
    }
  }

  private renderStat(
    parent: HTMLElement,
    value: string,
    label: string,
    health: "good" | "warn" | "bad" | "neutral"
  ): void {
    const card = parent.createDiv(`gardener-stat-card gardener-stat-${health}`);
    card.createDiv("gardener-stat-value").textContent = value;
    card.createDiv("gardener-stat-label").textContent = label;
  }
}
