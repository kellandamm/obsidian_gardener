import type { App, TFile, TAbstractFile } from "obsidian";
import { minimatch } from "minimatch";
import {
  type VaultIndex,
  type NoteEntry,
  createVaultIndex,
  addOrUpdate,
  removeNote,
} from "./VaultIndex";
import { loadIndex, saveIndex } from "./persist";
import type { GardenerSchema } from "../schema/GardenerSchema";
import { yieldEvery } from "../utils/cooperative";

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const TAG_RE = /#([\w/-]+)/g;
const H1_RE = /^#\s+(.+)$/m;
const H2_RE = /^#{2,}\s+(.+)$/gm;
const WORD_RE = /\S+/g;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const FM_KEY_RE = /^([a-zA-Z0-9_-]+)\s*:/gm;

export class Indexer {
  private index: VaultIndex = createVaultIndex();
  private app: App;
  private dataDir: string;
  private schema: GardenerSchema;
  private eventRefs: (() => void)[] = [];

  constructor(app: App, dataDir: string, schema: GardenerSchema) {
    this.app = app;
    this.dataDir = dataDir;
    this.schema = schema;
  }

  async load(): Promise<void> {
    const persisted = await loadIndex(this.app, this.dataDir);
    if (persisted) this.index = persisted;
    await this.sync();
    this.registerEvents();
  }

  unload(): void {
    for (const unregister of this.eventRefs) unregister();
    this.eventRefs = [];
  }

  getIndex(): VaultIndex {
    return this.index;
  }

  updateSchema(schema: GardenerSchema): void {
    this.schema = schema;
  }

  private isProtected(path: string): boolean {
    return this.schema.protected.neverRead.some((glob) => minimatch(path, glob, { dot: true }));
  }

  private async sync(): Promise<void> {
    const vaultFiles = this.app.vault.getMarkdownFiles();
    const vaultPaths = new Set(vaultFiles.map((f) => f.path));

    // Remove deleted notes from index
    let deleteIndex = 0;
    for (const path of this.index.notes.keys()) {
      if (!vaultPaths.has(path)) removeNote(this.index, path);
      await yieldEvery(++deleteIndex, 500);
    }

    // Index new or modified files
    let fileIndex = 0;
    for (const file of vaultFiles) {
      if (this.isProtected(file.path)) continue;
      const existing = this.index.notes.get(file.path);
      if (!existing || existing.mtime !== file.stat.mtime) {
        await this.indexFile(file);
      }
      await yieldEvery(++fileIndex, 25);
    }

    await saveIndex(this.app, this.dataDir, this.index);
  }

  private async indexFile(file: TFile): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    const resolvedLinks = this.resolveLinks(file, content);

    // Strip frontmatter before extracting headings/words/tags
    const fmMatch = FRONTMATTER_RE.exec(content);
    const fmBlock = fmMatch?.[1] ?? "";
    const body = fmMatch ? content.slice(fmMatch[0].length) : content;

    const frontmatterKeys: string[] = [];
    let km: RegExpExecArray | null;
    FM_KEY_RE.lastIndex = 0;
    while ((km = FM_KEY_RE.exec(fmBlock)) !== null) frontmatterKeys.push(km[1]);

    H2_RE.lastIndex = 0;
    const headings: string[] = [];
    let hm: RegExpExecArray | null;
    while ((hm = H2_RE.exec(body)) !== null) headings.push(hm[1].trim());

    const entry: NoteEntry = {
      path: file.path,
      mtime: file.stat.mtime,
      wordCount: (body.match(WORD_RE) ?? []).length,
      links: resolvedLinks,
      tags: [...body.matchAll(TAG_RE)].map((m) => m[1]),
      title: H1_RE.exec(body)?.[1] ?? file.basename,
      headings,
      frontmatterKeys,
    };
    addOrUpdate(this.index, entry);
  }

  private resolveLinks(file: TFile, content: string): string[] {
    const links: string[] = [];
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(content)) !== null) {
      const linkText = m[1].trim();
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
      links.push(resolved ? resolved.path : linkText + ".md");
    }
    return links;
  }

  private registerEvents(): void {
    const onModify = async (...args: unknown[]) => {
      const file = args[0] as TAbstractFile;
      if ((file as TFile).extension !== "md") return;
      if (this.isProtected(file.path)) return;
      await this.indexFile(file as TFile);
      await saveIndex(this.app, this.dataDir, this.index);
    };

    const onDelete = async (...args: unknown[]) => {
      const file = args[0] as TAbstractFile;
      removeNote(this.index, file.path);
      await saveIndex(this.app, this.dataDir, this.index);
    };

    const onRename = async (...args: unknown[]) => {
      const file = args[0] as TAbstractFile;
      const oldPath = args[1] as string;
      removeNote(this.index, oldPath);
      if ((file as TFile).extension === "md" && !this.isProtected(file.path)) {
        await this.indexFile(file as TFile);
      }
      await saveIndex(this.app, this.dataDir, this.index);
    };

    this.app.vault.on("modify", onModify);
    this.app.vault.on("delete", onDelete);
    this.app.vault.on("rename", onRename);

    this.eventRefs.push(
      () => this.app.vault.off("modify", onModify),
      () => this.app.vault.off("delete", onDelete),
      () => this.app.vault.off("rename", onRename)
    );
  }
}
