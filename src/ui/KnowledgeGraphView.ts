import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { Indexer } from "../index/Indexer";
import { graphClusters } from "../index/VaultIndex";

export const GRAPH_GAPS_VIEW_TYPE = "gardener-graph-gaps";

export class KnowledgeGraphView extends ItemView {
  private indexer: Indexer;

  constructor(leaf: WorkspaceLeaf, indexer: Indexer) {
    super(leaf);
    this.indexer = indexer;
  }

  getViewType(): string { return GRAPH_GAPS_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Graph Gaps"; }
  getIcon(): string { return "git-fork"; }

  async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.render())
    );
    this.render();
  }

  async onClose(): Promise<void> {}

  refresh(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-graph-view");

    const index = this.indexer.getIndex();
    const clusters = graphClusters(index);

    contentEl.createEl("h2", { text: "Knowledge Graph Gaps", cls: "gardener-section-title" });

    if (clusters.length === 0) {
      contentEl.createEl("p", { text: "No notes indexed yet.", cls: "gardener-empty" });
      return;
    }

    // ── Connected Components ─────────────────────────────────────
    const sec = contentEl.createDiv("gardener-graph-section");
    sec.createDiv("gardener-graph-heading").textContent = `${clusters.length} connected cluster${clusters.length !== 1 ? "s" : ""}`;

    if (clusters.length === 1) {
      sec.createEl("p", {
        text: "Your vault is fully connected — every note can reach every other note.",
        cls: "gardener-graph-ok",
      });
    } else {
      const [main, ...islands] = clusters;
      sec.createEl("p", {
        text: `Main cluster: ${main.length} note${main.length !== 1 ? "s" : ""}. ${islands.length} isolated island${islands.length !== 1 ? "s" : ""} found.`,
      });

      for (const island of islands.slice(0, 20)) {
        const row = sec.createDiv("gardener-graph-island");
        row.createDiv("gardener-graph-island-size").textContent = String(island.length);
        const list = row.createDiv("gardener-graph-island-notes");
        for (const path of island.slice(0, 4)) {
          const note = index.notes.get(path);
          const chip = list.createEl("span", {
            text: note?.title ?? path,
            cls: "gardener-graph-chip",
          });
          chip.addEventListener("click", () => void this.openNote(path));
        }
        if (island.length > 4) {
          list.createEl("span", {
            text: `+${island.length - 4} more`,
            cls: "gardener-graph-more",
          });
        }
      }
      if (islands.length > 20) {
        sec.createEl("p", {
          text: `… and ${islands.length - 20} more small islands.`,
          cls: "gardener-graph-more",
        });
      }
    }

    // ── Tag Co-occurrence Heatmap ────────────────────────────────
    const allTags = this.topTags(8);
    if (allTags.length >= 2) {
      const hmSec = contentEl.createDiv("gardener-graph-section");
      hmSec.createDiv("gardener-graph-heading").textContent = "Tag co-occurrence (top 8 tags)";
      hmSec.appendChild(this.buildHeatmap(allTags, index.notes));
    }
  }

  private topTags(n: number): string[] {
    const index = this.indexer.getIndex();
    const counts = new Map<string, number>();
    for (const note of index.notes.values()) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([t]) => t);
  }

  private buildHeatmap(
    tags: string[],
    notes: Map<string, { tags: string[] }>
  ): HTMLElement {
    const n = tags.length;

    // Count co-occurrences
    const co: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (const note of notes.values()) {
      const tagSet = new Set(note.tags);
      for (let i = 0; i < n; i++) {
        if (!tagSet.has(tags[i])) continue;
        for (let j = 0; j < n; j++) {
          if (tagSet.has(tags[j])) co[i][j]++;
        }
      }
    }

    const maxVal = Math.max(1, ...co.flat().filter((_, idx) => {
      const i = Math.floor(idx / n), j = idx % n;
      return i !== j;
    }));

    const table = activeDocument.createElement("table");
    table.className = "gardener-heatmap";

    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "" });
    for (const tag of tags) {
      headerRow.createEl("th", { text: `#${tag}`, cls: "gardener-heatmap-th" });
    }

    const tbody = table.createEl("tbody");
    for (let i = 0; i < n; i++) {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: `#${tags[i]}`, cls: "gardener-heatmap-label" });
      for (let j = 0; j < n; j++) {
        const val = co[i][j];
        const cell = row.createEl("td", {
          cls: "gardener-heatmap-cell",
          attr: { title: i === j ? `${val} notes with this tag` : `${val} notes share both tags` },
        });
        if (i === j) {
          cell.addClass("gardener-heatmap-cell--diagonal");
          cell.textContent = String(val);
        } else if (val > 0) {
          const opacity = Math.max(0.1, val / maxVal);
          cell.addClass("gardener-heatmap-cell--active");
          cell.setCssProps({ "--gardener-cell-opacity": String(opacity) });
          if (opacity > 0.5) cell.addClass("gardener-heatmap-cell--light");
          cell.textContent = String(val);
        }
      }
    }

    return table;
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
