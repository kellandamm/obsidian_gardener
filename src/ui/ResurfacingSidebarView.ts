import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { Indexer } from "../index/Indexer";
import { findSimilarByTitle } from "../index/VaultIndex";
import { TFIDFEngine } from "../embeddings/TFIDFEngine";

export const RESURFACING_VIEW_TYPE = "gardener-resurfacing";

export class ResurfacingSidebarView extends ItemView {
  private indexer: Indexer;
  private currentPath: string | null = null;
  private engine = new TFIDFEngine();
  private engineBuilt = false;

  constructor(leaf: WorkspaceLeaf, indexer: Indexer) {
    super(leaf);
    this.indexer = indexer;
  }

  getViewType(): string { return RESURFACING_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Writing Context"; }
  getIcon(): string { return "sprout"; }

  async onOpen(): Promise<void> {
    // Update sidebar whenever the active file changes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => { void this.updateForActiveFile(); })
    );
    this.registerEvent(
      this.app.vault.on("modify", () => {
        this.engineBuilt = false;
        void this.updateForActiveFile();
      })
    );
    await this.updateForActiveFile();
  }

  async onClose(): Promise<void> {}

  private async updateForActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return;
    if (file.path === this.currentPath) return;
    this.currentPath = file.path;
    this.render(file);
  }

  private rebuildEngine(): void {
    if (this.engineBuilt) return;
    const index = this.indexer.getIndex();
    this.engine.build(
      [...index.notes.values()].map((note) => ({
        path: note.path,
        text: [note.title, ...note.headings, ...note.tags].join(" "),
      }))
    );
    this.engineBuilt = true;
  }

  private render(file: TFile): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-sidebar");

    const index = this.indexer.getIndex();
    const note = index.notes.get(file.path);
    if (!note) {
      contentEl.createEl("p", { text: "Note not yet indexed.", cls: "gardener-sidebar-empty" });
      return;
    }

    this.rebuildEngine();

    // ── Backlinks ────────────────────────────────────────
    const backlinks = [...(index.backlinks.get(file.path) ?? [])];
    this.renderSection(contentEl, "Linked from", backlinks.length === 0 ? null : backlinks, (el, path) => {
      const entry = index.notes.get(path);
      const item = el.createDiv("gardener-sb-item");
      item.createEl("b", { text: entry?.title ?? path });
      item.createEl("span", { text: `${entry?.wordCount ?? 0} words` });
      item.addEventListener("click", () => { void this.openNote(path); });
      item.addClass("gardener-clickable");
    });

    // ── Semantically related (TF-IDF on metadata) ────────
    const semantic = this.engine.findSimilar(file.path, 0.3).slice(0, 5);
    this.renderSection(contentEl, "Semantically related", semantic.length === 0 ? null : semantic, (el, { path, score }) => {
      const entry = index.notes.get(path);
      const item = el.createDiv("gardener-sb-item");
      item.createEl("b", { text: entry?.title ?? path });
      item.createEl("span", { text: `${Math.round(score * 100)}% similar`, cls: "gardener-sb-score" });
      item.addEventListener("click", () => { void this.openNote(path); });
      item.addClass("gardener-clickable");
    });

    // ── Related by shared tags ────────────────────────────
    const related = this.findRelatedByTags(file.path, 5);
    this.renderSection(contentEl, "Related notes", related.length === 0 ? null : related, (el, { path, shared }) => {
      const entry = index.notes.get(path);
      const item = el.createDiv("gardener-sb-item");
      item.createEl("b", { text: entry?.title ?? path });
      item.createEl("span", { text: shared.map((t) => `#${t}`).join(" ") });
      item.addEventListener("click", () => { void this.openNote(path); });
      item.addClass("gardener-clickable");
    });

    // ── Similar titles ────────────────────────────────────
    const similar = findSimilarByTitle(index, file.path, 0.4).slice(0, 4);
    this.renderSection(contentEl, "Similar titles", similar.length === 0 ? null : similar, (el, { path, score }) => {
      const entry = index.notes.get(path);
      const item = el.createDiv("gardener-sb-item");
      item.createEl("b", { text: entry?.title ?? path });
      item.createEl("span", { text: `${Math.round(score * 100)}% match`, cls: "gardener-sb-score" });
      item.addEventListener("click", () => { void this.openNote(path); });
      item.addClass("gardener-clickable");
    });

    // ── Unlinked mentions of current note ────────────────
    const mentions = this.findMentions(file.path, note.title);
    this.renderSection(contentEl, "Mentions (unlinked)", mentions.length === 0 ? null : mentions, (el, path) => {
      const entry = index.notes.get(path);
      const item = el.createDiv("gardener-sb-item gardener-sb-mention");
      item.createEl("b", { text: entry?.title ?? path });
      item.createEl("span", { text: "mentions this note without a link" });
      item.addEventListener("click", () => { void this.openNote(path); });
      item.addClass("gardener-clickable");
    });
  }

  private renderSection<T>(
    parent: HTMLElement,
    heading: string,
    items: T[] | null,
    renderItem: (el: HTMLElement, item: T) => void
  ): void {
    const section = parent.createDiv("gardener-sb-section");
    section.createDiv("gardener-sb-heading").textContent = heading;
    if (!items || items.length === 0) {
      section.createDiv("gardener-sb-empty").textContent = "None";
      return;
    }
    for (const item of items) renderItem(section, item);
  }

  private findRelatedByTags(
    sourcePath: string,
    limit: number
  ): Array<{ path: string; shared: string[] }> {
    const index = this.indexer.getIndex();
    const source = index.notes.get(sourcePath);
    if (!source || source.tags.length === 0) return [];

    const sourceTags = new Set(source.tags);
    const results: Array<{ path: string; shared: string[] }> = [];

    for (const [path, note] of index.notes) {
      if (path === sourcePath) continue;
      const shared = note.tags.filter((t) => sourceTags.has(t));
      if (shared.length > 0) results.push({ path, shared });
    }

    return results
      .sort((a, b) => b.shared.length - a.shared.length)
      .slice(0, limit);
  }

  private findMentions(sourcePath: string, title: string): string[] {
    if (title.length < 3) return [];
    const index = this.indexer.getIndex();
    const titleLower = title.toLowerCase();
    const results: string[] = [];

    for (const [path, note] of index.notes) {
      if (path === sourcePath) continue;
      // Skip if already linked
      if (note.links.includes(sourcePath)) continue;
      // Check if note title appears in the other note's title (proxy for content)
      if (note.title.toLowerCase().includes(titleLower)) {
        results.push(path);
      }
    }

    return results.slice(0, 5);
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
