import { Modal, App, Notice } from "obsidian";
import type { ChangeSetEngine } from "../changeset/ChangeSetEngine";
import type { StagedProposal } from "../changeset/ChangeProposal";
import { classifyProposal, familyInfo, PROPOSAL_FAMILIES } from "../tasks/proposalFamilies";
import type { ProposalFamily } from "../tasks/proposalFamilies";

export class BatchReviewModal extends Modal {
  private engine: ChangeSetEngine;
  private selected: Set<string> = new Set();
  private expandedDiff: Set<string> = new Set();

  constructor(app: App, engine: ChangeSetEngine) {
    super(app);
    this.engine = engine;
  }

  onOpen(): void {
    this.modalEl.addClass("gardener-batch-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.selected.clear();

    const pending = this.engine.getPending();
    if (pending.length === 0) {
      contentEl.createEl("h2", { text: "Review Suggestions" });
      contentEl.createEl("p", { text: "No pending suggestions — you're all caught up.", cls: "gardener-batch-empty" });
      return;
    }

    // Header
    const header = contentEl.createDiv("gardener-batch-header");
    header.createEl("h2", { text: `Review Suggestions (${pending.length})` });

    const globalActions = header.createDiv("gardener-batch-global-actions");
    const acceptAllBtn = globalActions.createEl("button", { text: "Accept all", cls: "gardener-btn gardener-btn-accept" });
    acceptAllBtn.addEventListener("click", async () => {
      await this.applyAll(pending);
    });
    const rejectAllBtn = globalActions.createEl("button", { text: "Reject all", cls: "gardener-btn gardener-btn-reject" });
    rejectAllBtn.addEventListener("click", async () => {
      await this.rejectAll(pending);
    });

    // Keyboard hint
    header.createEl("p", { text: "Click a row to expand diff. Space = toggle, A = accept selected, R = reject selected.", cls: "gardener-batch-hint" });

    // Group by family
    const byFamily = new Map<ProposalFamily, StagedProposal[]>();
    for (const p of pending) {
      const fam = classifyProposal(p.proposal);
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam)!.push(p);
    }

    const familyOrder: ProposalFamily[] = ["wiki", "distill", "connect", "verify", "canonicalize", "maintain"];
    for (const famId of familyOrder) {
      const proposals = byFamily.get(famId);
      if (!proposals || proposals.length === 0) continue;
      const info = familyInfo(famId);
      this.renderGroup(contentEl, famId, info.label, info.description, proposals);
    }

    // Accept/Reject selected bar
    const bar = contentEl.createDiv("gardener-batch-action-bar");
    const selectedCount = bar.createSpan("gardener-batch-selected-count");
    selectedCount.textContent = "0 selected";

    const acceptSelBtn = bar.createEl("button", { text: "Accept selected", cls: "gardener-btn gardener-btn-accept" });
    acceptSelBtn.disabled = true;
    acceptSelBtn.addEventListener("click", async () => {
      const toApply = pending.filter((p) => this.selected.has(p.proposal.id));
      await this.applyAll(toApply);
    });

    const rejectSelBtn = bar.createEl("button", { text: "Reject selected", cls: "gardener-btn gardener-btn-reject" });
    rejectSelBtn.disabled = true;
    rejectSelBtn.addEventListener("click", async () => {
      const toReject = pending.filter((p) => this.selected.has(p.proposal.id));
      await this.rejectAll(toReject);
    });

    // Update bar on checkbox change
    const updateBar = () => {
      const n = this.selected.size;
      selectedCount.textContent = `${n} selected`;
      acceptSelBtn.disabled = n === 0;
      rejectSelBtn.disabled = n === 0;
    };

    // Wire checkboxes
    contentEl.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-proposal-id]").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) this.selected.add(cb.dataset.proposalId!);
        else this.selected.delete(cb.dataset.proposalId!);
        updateBar();
      });
    });

    // Keyboard shortcuts on modal
    this.modalEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "a" && this.selected.size > 0) {
        e.preventDefault();
        acceptSelBtn.click();
      }
      if (e.key.toLowerCase() === "r" && this.selected.size > 0) {
        e.preventDefault();
        rejectSelBtn.click();
      }
    });
  }

  private renderGroup(
    container: HTMLElement,
    famId: ProposalFamily,
    label: string,
    description: string,
    proposals: StagedProposal[],
  ): void {
    const section = container.createDiv("gardener-batch-group");

    const groupHeader = section.createDiv("gardener-batch-group-header");
    const groupLeft = groupHeader.createDiv("gardener-batch-group-left");
    groupLeft.createEl("h3", { text: `${label} (${proposals.length})` });
    groupLeft.createEl("span", { text: description, cls: "gardener-batch-group-desc" });

    const groupActions = groupHeader.createDiv("gardener-batch-group-actions");

    const selectAllCb = groupActions.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    selectAllCb.title = "Select all in group";
    selectAllCb.addEventListener("change", () => {
      const checkboxes = section.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-proposal-id]");
      checkboxes.forEach((cb) => {
        cb.checked = selectAllCb.checked;
        if (selectAllCb.checked) this.selected.add(cb.dataset.proposalId!);
        else this.selected.delete(cb.dataset.proposalId!);
      });
      // trigger bar update
      section.closest(".gardener-batch-modal")
        ?.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-proposal-id]")[0]
        ?.dispatchEvent(new Event("change"));
    });

    groupActions.createEl("button", { text: "Accept all", cls: "gardener-btn gardener-btn-accept gardener-btn-sm" })
      .addEventListener("click", async () => { await this.applyAll(proposals); });
    groupActions.createEl("button", { text: "Reject all", cls: "gardener-btn gardener-btn-reject gardener-btn-sm" })
      .addEventListener("click", async () => { await this.rejectAll(proposals); });

    const rows = section.createDiv("gardener-batch-rows");
    for (const staged of proposals) {
      this.renderRow(rows, staged);
    }
  }

  private renderRow(container: HTMLElement, staged: StagedProposal): void {
    const { proposal } = staged;
    const row = container.createDiv("gardener-batch-row");
    row.dataset.id = proposal.id;

    const cb = row.createEl("input", { type: "checkbox", cls: "gardener-batch-cb" }) as HTMLInputElement;
    cb.dataset.proposalId = proposal.id;

    const info = row.createDiv("gardener-batch-row-info");
    const titleRow = info.createDiv("gardener-batch-row-title");
    titleRow.createEl("span", { text: proposal.title });
    titleRow.createEl("span", {
      text: `${Math.round(proposal.confidence * 100)}%`,
      cls: "gardener-confidence gardener-confidence-sm",
    });

    info.createEl("span", { text: proposal.rationale, cls: "gardener-batch-row-rationale" });

    // Diff toggle
    if (proposal.diff.length > 0) {
      const diffToggle = row.createEl("button", {
        text: this.expandedDiff.has(proposal.id) ? "▲ Hide diff" : "▼ Show diff",
        cls: "gardener-btn-link",
      });
      const diffEl = row.createDiv("gardener-batch-diff");
      diffEl.style.display = this.expandedDiff.has(proposal.id) ? "block" : "none";

      for (const line of proposal.diff) {
        const lineEl = diffEl.createEl("div", { cls: `gardener-diff-line gardener-diff-${line.kind}` });
        lineEl.textContent = (line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  ") + line.text;
      }

      diffToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !this.expandedDiff.has(proposal.id);
        if (open) this.expandedDiff.add(proposal.id);
        else this.expandedDiff.delete(proposal.id);
        diffEl.style.display = open ? "block" : "none";
        diffToggle.textContent = open ? "▲ Hide diff" : "▼ Show diff";
      });
    }

    // Per-row accept/reject
    const rowActions = row.createDiv("gardener-batch-row-actions");
    rowActions.createEl("button", { text: "✓", cls: "gardener-btn gardener-btn-accept gardener-btn-icon", title: "Accept" })
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.applyAll([staged]);
      });
    rowActions.createEl("button", { text: "✗", cls: "gardener-btn gardener-btn-reject gardener-btn-icon", title: "Reject" })
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.rejectAll([staged]);
      });

    // Click row body to toggle checkbox
    info.addEventListener("click", () => {
      cb.checked = !cb.checked;
      if (cb.checked) this.selected.add(proposal.id);
      else this.selected.delete(proposal.id);
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  private async applyAll(proposals: StagedProposal[]): Promise<void> {
    let applied = 0;
    let stale = 0;
    for (const staged of proposals) {
      if (staged.status !== "pending") continue;
      const ok = await this.engine.apply(staged.proposal.id);
      if (ok) applied++;
      else stale++;
    }
    const msg = stale > 0
      ? `Applied ${applied}, skipped ${stale} stale suggestions.`
      : `Applied ${applied} suggestion${applied !== 1 ? "s" : ""}.`;
    new Notice(msg);
    this.render();
  }

  private async rejectAll(proposals: StagedProposal[]): Promise<void> {
    for (const staged of proposals) {
      if (staged.status !== "pending") continue;
      await this.engine.reject(staged.proposal.id);
    }
    new Notice(`Rejected ${proposals.length} suggestion${proposals.length !== 1 ? "s" : ""}.`);
    this.render();
  }
}
