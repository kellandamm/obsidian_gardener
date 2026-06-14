import { ItemView, Notice, WorkspaceLeaf, TFile } from "obsidian";
import type { MemoryRef } from "../memory/MemoryRef";
import type { ErrorBook } from "../memory/ErrorBook";
import type { ContradictoryClaimPair, MemoryNode, WikiMemoryGraphData } from "../memory/WikiMemoryGraph";
import { getClaimsForConcept, getContradictoryClaimPairs } from "../memory/WikiMemoryGraph";
import type { MemoryReviewStore } from "../memory/MemoryReviewStore";
import type { Indexer } from "../index/Indexer";
import { getBrokenLinks, getOrphans } from "../index/VaultIndex";
import type { CanonicalPageRegistry } from "../memory/CanonicalPageRegistry";
import type { ChangeSetEngine } from "../changeset/ChangeSetEngine";
import { classifyProposal } from "../tasks/proposalFamilies";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { GardenerSettings } from "../main";
import { scoreMemoryNode, formatConfidence } from "../memory/confidence";
import { summarizeSourceScope } from "../memory/sourceScope";
import type { AuditLog } from "../safety/AuditLog";

export const WIKI_MEMORY_VIEW_TYPE = "gardener-wiki-memory";

export class WikiMemoryView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private memory: MemoryRef,
    private errorBook: ErrorBook,
    private reviewStore: MemoryReviewStore,
    private indexer: Indexer,
    private canonicalRegistry: CanonicalPageRegistry,
    private engine: ChangeSetEngine,
    private runPipeline: () => Promise<void>,
    private openReviewQueue: () => void,
    private getSchema: () => GardenerSchema,
    private getPrivacyPosture: () => GardenerSettings["privacyPosture"],
    private getProviderName: () => GardenerSettings["llmProvider"],
    private audit?: AuditLog
  ) {
    super(leaf);
  }

  getViewType(): string { return WIKI_MEMORY_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Home"; }
  getIcon(): string { return "network"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {}

  refresh(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-memory-view");

    const graph = this.memory.graph;
    const concepts = nodesOfType(graph, "concept");
    const claims = nodesOfType(graph, "claim");
    const acceptedClaims = claims.filter((claim) => this.reviewStore.getStatus(claim.id) === "accepted");
    const pendingClaims = claims.filter((claim) => this.reviewStore.getStatus(claim.id) === null);
    const sources = nodesOfType(graph, "source");
    const notes = nodesOfType(graph, "note");
    const contradictionPairs = getContradictoryClaimPairs(graph);
    const contradictions = contradictionPairs.length;
    const index = this.indexer.getIndex();
    const schema = this.getSchema();
    const scope = summarizeSourceScope(index, schema);
    const indexedNotes = [...index.notes.values()];
    const orphanCount = getOrphans(index).length;
    const brokenCount = getBrokenLinks(index).length;
    const avgLinks = indexedNotes.length === 0
      ? 0
      : indexedNotes.reduce((sum, note) => sum + note.links.length, 0) / indexedNotes.length;
    const staged = this.engine.getAll();
    const pendingProposals = staged.filter((item) => item.status === "pending");
    const wikiProposals = pendingProposals.filter((item) => classifyProposal(item.proposal) !== "maintain");
    const canonicalProposals = pendingProposals.filter((item) => classifyProposal(item.proposal) === "canonicalize");
    const queuedHubs = this.reviewStore.getData().entries.filter((entry) => entry.status === "hub-queued").length;
    const rejectedMemory = this.reviewStore.getData().entries.filter((entry) => entry.status === "rejected");

    const hero = contentEl.createDiv("gardener-memory-hero");
    hero.createEl("h3", { text: "Your Knowledge Garden" });
    hero.createEl("p", {
      text: "Gardener scans your notes, finds reusable ideas, suggests main notes and links, and remembers what you reject.",
    });
    const heroActions = hero.createDiv("gardener-memory-hero-actions");
    const run = heroActions.createEl("button", { cls: "gardener-btn approve", text: "Scan vault" });
    run.addEventListener("click", async () => {
      run.disabled = true;
      run.textContent = "Scanning...";
      await this.runPipeline();
      this.render();
    });
    const review = heroActions.createEl("button", { cls: "gardener-btn", text: `Review suggestions${pendingProposals.length ? ` (${pendingProposals.length})` : ""}` });
    review.addEventListener("click", () => this.openReviewQueue());
    const exportGraph = heroActions.createEl("button", { cls: "gardener-btn", text: "Export graph" });
    exportGraph.addEventListener("click", async () => {
      await this.exportMemoryGraph();
    });

    this.renderWorkflow(contentEl, {
      notes: notes.length,
      pendingClaims: pendingClaims.length,
      acceptedClaims: acceptedClaims.length,
      queuedHubs,
      canonicalPages: this.canonicalRegistry.getData().entries.length,
      canonicalProposals: canonicalProposals.length,
      wikiProposals: wikiProposals.length,
      contradictions,
      rejectedCorrections: rejectedMemory.length + this.errorBook.getData().entries.length,
    });
    this.renderSourceScope(contentEl, scope);

    const stats = contentEl.createDiv("gardener-memory-stats");
    this.renderStat(stats, String(notes.length), "Notes scanned");
    this.renderStat(stats, String(concepts.length), "Topics");
    this.renderStat(stats, String(acceptedClaims.length), "Saved ideas");
    this.renderStat(stats, String(pendingClaims.length), "New ideas");
    this.renderStat(stats, String(sources.length), "Sources");
    this.renderStat(stats, String(contradictions), "Conflicts");
    this.renderStat(stats, String(this.errorBook.getData().entries.length), "Corrections");
    this.renderStat(stats, avgLinks.toFixed(1), "Links per note");
    this.renderStat(stats, String(orphanCount), "Lonely notes");
    this.renderStat(stats, String(brokenCount), "Broken links");

    const inbox = contentEl.createDiv("gardener-memory-section");
    inbox.createEl("h4", { text: "New Ideas" });
    const unreviewedClaims = pendingClaims
      .filter((claim) => claim.provenance.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
    if (unreviewedClaims.length === 0) {
      inbox.createDiv("gardener-memory-empty").textContent = "Run Gardener to find reusable ideas in your notes.";
    } else {
      for (const claim of unreviewedClaims) this.renderDistillationCard(inbox, claim);
    }

    this.renderNodeList(contentEl, "Topics", concepts.slice(0, 12));
    this.renderCanonicalWorkbench(contentEl, concepts);
    this.renderContradictionWorkbench(contentEl, contradictionPairs.slice(0, 8));
    this.renderClaimLedger(contentEl, acceptedClaims.slice(0, 10));
    this.renderNodeList(contentEl, "Sources", sources.slice(0, 8));

    const correction = contentEl.createDiv("gardener-memory-section");
    correction.createEl("h4", { text: "Don't Suggest Again" });
    const entries = this.errorBook.getData().entries.slice(0, 8);
    if (entries.length === 0 && rejectedMemory.length === 0) {
      correction.createDiv("gardener-memory-empty").textContent = "Rejected or stale suggestions will appear here and suppress repeat mistakes.";
    }
    for (const entry of rejectedMemory.slice(0, 8)) {
      const item = correction.createDiv("gardener-memory-item");
      item.createEl("b", { text: entry.label });
      item.createEl("span", { text: `rejected memory · ${entry.path ?? "unknown source"}` });
    }
    for (const entry of entries) {
      const item = correction.createDiv("gardener-memory-item");
      item.createEl("b", { text: entry.proposalTitle });
      item.createEl("span", { text: `${entry.type} · ${entry.targetPath}` });
      if (entry.reason) item.createEl("p", { text: entry.reason });
    }
  }

  private renderStat(parent: HTMLElement, value: string, label: string): void {
    const card = parent.createDiv("gardener-memory-stat");
    card.createDiv("gardener-memory-stat-value").textContent = value;
    card.createDiv("gardener-memory-stat-label").textContent = label;
  }

  private renderWorkflow(parent: HTMLElement, state: CompilerWorkflowState): void {
    const section = parent.createDiv("gardener-memory-workflow");
    const steps = [
      {
        label: "Scan",
        value: state.notes,
        detail: "notes indexed",
        active: state.notes > 0,
      },
      {
        label: "Find Ideas",
        value: state.pendingClaims,
        detail: state.pendingClaims === 1 ? "idea waiting" : "ideas waiting",
        active: state.pendingClaims > 0,
      },
      {
        label: "Make Main Notes",
        value: state.queuedHubs + state.canonicalProposals,
        detail: "note actions",
        active: state.queuedHubs + state.canonicalProposals > 0,
      },
      {
        label: "Link",
        value: state.wikiProposals,
        detail: "suggestions",
        active: state.wikiProposals > 0,
      },
      {
        label: "Learn",
        value: state.contradictions + state.rejectedCorrections,
        detail: "corrections",
        active: state.contradictions + state.rejectedCorrections > 0,
      },
    ];

    for (const step of steps) {
      const item = section.createDiv({ cls: `gardener-memory-workflow-step${step.active ? " active" : ""}` });
      item.createEl("span", { cls: "gardener-memory-workflow-label", text: step.label });
      item.createEl("b", { text: String(step.value) });
      item.createEl("span", { cls: "gardener-memory-workflow-detail", text: step.detail });
    }

    const next = parent.createDiv("gardener-memory-next");
    next.createEl("h4", { text: "Next Action" });
    next.createEl("p", { text: nextActionText(state) });
  }

  private renderDistillationCard(parent: HTMLElement, claim: MemoryNode): void {
    const prov = claim.provenance[0];
    const confidence = scoreMemoryNode(this.memory.graph, claim, this.reviewStore);
    const card = parent.createDiv("gardener-distill-card");
    const top = card.createDiv("gardener-distill-top");
    top.createSpan({ cls: "gardener-kind memory", text: "idea" });
    top.createEl("b", { text: "Idea found in your notes" });
    top.createSpan({ cls: `gardener-confidence ${confidence.label}`, text: formatConfidence(confidence) });
    card.createEl("p", { text: this.reviewStore.getEditedLabel(claim.id) ?? claim.label, cls: "gardener-distill-claim" });
    const source = card.createDiv("gardener-distill-source");
    source.createSpan({ text: prov.path });
    if (prov.heading) source.createSpan({ text: ` · ${prov.heading}` });
    card.createEl("blockquote", { text: prov.snippet });
    const actions = card.createDiv("gardener-memory-actions");
    const accept = actions.createEl("button", { cls: "gardener-btn approve", text: "Save idea" });
    const reject = actions.createEl("button", { cls: "gardener-btn reject", text: "Reject" });
    const open = actions.createEl("button", { cls: "gardener-btn", text: "Open source" });
    accept.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.reviewStore.setStatus(claim, "accepted");
      this.render();
    });
    reject.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.reviewStore.setStatus(claim, "rejected");
      this.render();
    });
    open.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.openNote(prov.path);
    });
  }

  private renderSourceScope(parent: HTMLElement, scope: ReturnType<typeof summarizeSourceScope>): void {
    const section = parent.createDiv("gardener-memory-scope");
    const summary = section.createDiv("gardener-memory-scope-summary");
    summary.createEl("b", { text: "What Gardener Can Read" });
    summary.createEl("span", {
      text: `${scope.eligibleNotes}/${scope.totalNotes} notes eligible · ${this.getProviderName()} · ${this.getPrivacyPosture()}`,
    });
    const details = section.createDiv("gardener-memory-scope-grid");
    this.renderScopeList(details, "Eligible folders", scope.eligibleFolders);
    this.renderScopeList(details, "Blocked or disabled", scope.blockedFolders);
    const blocked = details.createDiv("gardener-memory-scope-note");
    blocked.createEl("span", {
      text: `${scope.neverReadNotes} private · ${scope.claimExtractionDisabledNotes} idea finding off`,
    });
  }

  private renderScopeList(parent: HTMLElement, label: string, folders: Array<{ folder: string; count: number }>): void {
    const block = parent.createDiv("gardener-memory-scope-list");
    block.createEl("span", { text: label });
    if (folders.length === 0) {
      block.createEl("p", { text: "None" });
      return;
    }
    block.createEl("p", { text: folders.map((item) => `${item.folder} (${item.count})`).join(", ") });
  }

  private renderCanonicalWorkbench(parent: HTMLElement, concepts: MemoryNode[]): void {
    const section = parent.createDiv("gardener-memory-section");
    section.createEl("h4", { text: "Main Notes" });
    const entries = this.canonicalRegistry.getData().entries.slice(0, 8);
    if (entries.length === 0) {
      section.createDiv("gardener-memory-empty").textContent = "Choose a strong topic to create or promote a main note.";
      return;
    }

    for (const entry of entries) {
      const concept = concepts.find((node) => node.id === entry.conceptId);
      const claims = concept ? getClaimsForConcept(this.memory.graph, concept.id) : [];
      const accepted = claims.filter((claim) => this.reviewStore.getStatus(claim.id) === "accepted");
      const sources = concept ? [...new Set(concept.provenance.map((prov) => prov.path))] : [];
      const contradictions = getContradictoryClaimPairs(this.memory.graph)
        .filter((pair) => claims.some((claim) => claim.id === pair.a.id || claim.id === pair.b.id));
      const pendingProposal = this.engine.getAll()
        .find((staged) => staged.status === "pending" && staged.proposal.targetPath === entry.path && staged.proposal.taskId === "canonical-strengthen")
        ?.proposal;

      const item = section.createDiv("gardener-memory-item gardener-canonical-workbench-item");
      const confidence = concept ? scoreMemoryNode(this.memory.graph, concept, this.reviewStore) : null;
      item.createEl("b", { text: entry.conceptLabel });
      item.createEl("span", {
        text: `${entry.path} · ${accepted.length} saved idea${accepted.length !== 1 ? "s" : ""} · ${sources.length} source${sources.length !== 1 ? "s" : ""} · ${contradictions.length} conflict${contradictions.length !== 1 ? "s" : ""}`,
      });
      if (confidence) {
        item.createEl("p", {
          cls: "gardener-memory-hint",
          text: `Confidence: ${formatConfidence(confidence)} · ${confidence.reasons.slice(0, 3).join(", ")}`,
        });
      }
      if (accepted.length > 0) {
        const list = item.createEl("ul", { cls: "gardener-memory-mini-list" });
        for (const claim of accepted.slice(0, 3)) {
          const prov = claim.provenance[0];
          list.createEl("li", { text: `${claim.label} (${prov?.path ?? "unknown source"})` });
        }
      }
      const actions = item.createDiv("gardener-memory-actions");
      const open = actions.createEl("button", { cls: "gardener-btn approve", text: "Open main note" });
      open.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.openNote(entry.path);
      });
      const review = actions.createEl("button", { cls: "gardener-btn", text: "Review suggestions" });
      review.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openReviewQueue();
      });
      if (pendingProposal) {
        const preview = actions.createEl("button", { cls: "gardener-btn", text: "Preview changes" });
        preview.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleDiffPreview(item, pendingProposal.diff);
        });
      }
    }
  }

  private renderContradictionWorkbench(parent: HTMLElement, pairs: ContradictoryClaimPair[]): void {
    const section = parent.createDiv("gardener-memory-section");
    section.createEl("h4", { text: "Conflicts" });
    if (pairs.length === 0) {
      section.createDiv("gardener-memory-empty").textContent = "Possible note conflicts will appear here with both source snippets.";
      return;
    }

    for (const pair of pairs) {
      const status = this.reviewStore.getStatus(pair.id);
      const item = section.createDiv("gardener-distill-card gardener-contradiction-card");
      const top = item.createDiv("gardener-distill-top");
      top.createSpan({ cls: "gardener-kind memory", text: "conflict" });
      top.createEl("b", { text: status ? contradictionStatusLabel(status) : "Possible note conflict" });
      this.renderContradictionClaim(item, "A", pair.a);
      this.renderContradictionClaim(item, "B", pair.b);
      const actions = item.createDiv("gardener-memory-actions");
      this.renderContradictionButton(actions, pair, "Real conflict", "contradiction-real");
      this.renderContradictionButton(actions, pair, "Needs context", "contradiction-context");
      this.renderContradictionButton(actions, pair, "False positive", "contradiction-false");
      this.renderContradictionButton(actions, pair, "Old info", "contradiction-superseded");
    }
  }

  private renderContradictionClaim(parent: HTMLElement, label: string, claim: MemoryNode): void {
    const prov = claim.provenance[0];
    const block = parent.createDiv("gardener-contradiction-claim");
    block.createEl("span", { text: `Note ${label} · ${prov?.path ?? "unknown source"}` });
    block.createEl("blockquote", { text: prov?.snippet ?? claim.label });
  }

  private renderContradictionButton(parent: HTMLElement, pair: ContradictoryClaimPair, text: string, status: Parameters<MemoryReviewStore["setSyntheticStatus"]>[3]): void {
    const button = parent.createEl("button", { cls: "gardener-btn", text });
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.reviewStore.setSyntheticStatus(
        pair.id,
        "claim",
        `${pair.a.label} <-> ${pair.b.label}`,
        status,
        pair.a.provenance[0]?.path
      );
      this.render();
    });
  }

  private renderNodeList(parent: HTMLElement, heading: string, nodes: MemoryNode[]): void {
    const section = parent.createDiv("gardener-memory-section");
    section.createEl("h4", { text: heading });
    if (nodes.length === 0) {
      section.createDiv("gardener-memory-empty").textContent = "None yet";
      return;
    }
    for (const node of nodes) {
      const item = section.createDiv("gardener-memory-item");
      const confidence = scoreMemoryNode(this.memory.graph, node, this.reviewStore);
      item.createEl("b", { text: node.label });
      const paths = [...new Set(node.provenance.map((p) => p.path))];
      item.createEl("span", {
        text: `${node.provenance.length} source item${node.provenance.length !== 1 ? "s" : ""} · ${formatConfidence(confidence)} · ${paths.slice(0, 2).join(", ")}`,
      });
      if (node.type === "concept") {
        const status = this.reviewStore.getStatus(node.id);
        const canonical = this.canonicalRegistry.get(node.id);
        if (canonical) {
          item.createEl("p", {
            text: `Main note: ${canonical.path} (${canonical.source})`,
            cls: "gardener-memory-hint",
          });
        }
        if (status === "hub-queued") {
          item.createEl("p", {
            text: "Main note queued. Run Gardener to create a reviewable suggestion.",
            cls: "gardener-memory-hint",
          });
        }
        const actions = item.createDiv("gardener-memory-actions");
        if (canonical) {
          const openCanonical = actions.createEl("button", { cls: "gardener-btn approve", text: "Open main note" });
          openCanonical.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.openNote(canonical.path);
          });
        } else {
          const queue = actions.createEl("button", {
            cls: "gardener-btn",
            text: status === "hub-queued" ? "Main note queued" : "Make main note",
          });
          queue.disabled = status === "hub-queued";
          queue.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this.reviewStore.setStatus(node, "hub-queued");
            this.render();
          });
        }
      }
      item.addEventListener("click", () => this.openNote(paths[0]));
      item.style.cursor = "pointer";
    }
  }

  private renderClaimLedger(parent: HTMLElement, claims: MemoryNode[]): void {
    const section = parent.createDiv("gardener-memory-section");
    section.createEl("h4", { text: "Saved Ideas" });
    if (claims.length === 0) {
      section.createDiv("gardener-memory-empty").textContent = "Saved ideas will appear here with source receipts.";
      return;
    }
    for (const claim of claims) {
      const prov = claim.provenance[0];
      const item = section.createDiv("gardener-memory-item");
      const title = item.createEl("b", { text: this.reviewStore.getEditedLabel(claim.id) ?? claim.label });
      item.createEl("span", { text: `${prov.path}${prov.heading ? ` · ${prov.heading}` : ""}` });
      const actions = item.createDiv("gardener-memory-actions");
      const edit = actions.createEl("button", { cls: "gardener-btn", text: "Edit wording" });
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        this.renderClaimEditor(item, title, claim);
      });
      item.addEventListener("click", () => this.openNote(prov.path));
      item.style.cursor = "pointer";
    }
  }

  private renderClaimEditor(parent: HTMLElement, title: HTMLElement, claim: MemoryNode): void {
    const existing = parent.querySelector(".gardener-claim-editor");
    if (existing) {
      existing.remove();
      return;
    }
    const editor = parent.createDiv("gardener-claim-editor");
    editor.addEventListener("click", (event) => event.stopPropagation());
    const input = editor.createEl("textarea");
    input.value = this.reviewStore.getEditedLabel(claim.id) ?? claim.label;
    const save = editor.createEl("button", { cls: "gardener-btn approve", text: "Save wording" });
    save.addEventListener("click", async (event) => {
      event.stopPropagation();
      await this.reviewStore.setEditedLabel(claim, input.value);
      title.textContent = this.reviewStore.getEditedLabel(claim.id) ?? claim.label;
      editor.remove();
    });
  }

  private toggleDiffPreview(parent: HTMLElement, diff: Array<{ kind: string; text: string }>): void {
    const existing = parent.querySelector(".gardener-memory-diff-preview");
    if (existing) {
      existing.remove();
      return;
    }
    const preview = parent.createDiv("gardener-memory-diff-preview");
    if (diff.length === 0) {
      preview.createEl("p", { text: "No textual diff available." });
      return;
    }
    for (const line of diff.slice(0, 40)) {
      preview.createEl("code", {
        cls: `gardener-diff-${line.kind}`,
        text: `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "} ${line.text}`,
      });
    }
  }

  private async exportMemoryGraph(): Promise<void> {
    const graph = this.memory.graph;
    const lines = [
      "# Gardener Knowledge Garden Export",
      "",
      `- Nodes: ${graph.nodes.length}`,
      `- Edges: ${graph.edges.length}`,
      `- Main notes: ${this.canonicalRegistry.getData().entries.length}`,
      "",
      "## Topics",
      ...nodesOfType(graph, "concept").slice(0, 100).map((node) => `- ${node.label} (${formatConfidence(scoreMemoryNode(graph, node, this.reviewStore))})`),
      "",
      "## Saved Ideas",
      ...nodesOfType(graph, "claim")
        .filter((node) => this.reviewStore.getStatus(node.id) === "accepted")
        .slice(0, 100)
        .map((node) => `- ${this.reviewStore.getEditedLabel(node.id) ?? node.label} ^[${node.provenance[0]?.path ?? "unknown source"}]`),
    ];
    await this.app.vault.adapter.write(".gardener/wiki-memory-export.md", `${lines.join("\n")}\n`);
    await this.app.vault.adapter.write(".gardener/wiki-memory-export.json", JSON.stringify(graph, null, 2));
    await this.audit?.writeInternal(".gardener/wiki-memory-export.md", "exported readable wiki memory graph", "wiki-memory-export");
    await this.audit?.writeInternal(".gardener/wiki-memory-export.json", "exported JSON wiki memory graph", "wiki-memory-export");
    new Notice("Gardener: exported knowledge garden files to .gardener/");
  }

  private async openNote(path: string | undefined): Promise<void> {
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }
}

interface CompilerWorkflowState {
  notes: number;
  pendingClaims: number;
  acceptedClaims: number;
  queuedHubs: number;
  canonicalPages: number;
  canonicalProposals: number;
  wikiProposals: number;
  contradictions: number;
  rejectedCorrections: number;
}

function nextActionText(state: CompilerWorkflowState): string {
  if (state.notes === 0) return "Scan the vault to start building your knowledge garden.";
  if (state.pendingClaims > 0) return "Review new ideas and save the ones worth keeping.";
  if (state.queuedHubs > 0) return "Scan again to turn queued main notes into reviewable suggestions.";
  if (state.canonicalProposals > 0) return "Open Suggestions and approve or reject main-note changes.";
  if (state.wikiProposals > 0) return "Review suggested links and related-note context.";
  if (state.acceptedClaims > 0 && state.canonicalPages === 0) return "Pick a strong topic and make it a main note.";
  if (state.contradictions > 0) return "Resolve conflicts before improving related main notes.";
  return "Keep writing. Gardener will scan new notes on the next run.";
}

function contradictionStatusLabel(status: string): string {
  if (status === "contradiction-real") return "Marked real conflict";
  if (status === "contradiction-context") return "Marked needs context";
  if (status === "contradiction-false") return "Marked false positive";
  if (status === "contradiction-superseded") return "Marked old info";
  return "Possible note conflict";
}

function nodesOfType(graph: WikiMemoryGraphData, type: MemoryNode["type"]): MemoryNode[] {
  return graph.nodes.filter((node) => node.type === type);
}
