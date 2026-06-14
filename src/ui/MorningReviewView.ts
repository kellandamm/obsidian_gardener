import { ItemView, WorkspaceLeaf, Modal, App, Menu, Notice } from "obsidian";
import type { ChangeSetEngine } from "../changeset/ChangeSetEngine";
import type { SnoozeDuration } from "../changeset/ChangeProposal";
import { renderCard } from "./ProposalCard";
import { classifyProposal, familyInfo, PROPOSAL_FAMILIES } from "../tasks/proposalFamilies";

export const MORNING_REVIEW_VIEW_TYPE = "gardener-morning-review";

export class MorningReviewView extends ItemView {
  private engine: ChangeSetEngine;
  private cardsEl: HTMLElement | null = null;
  private focusedIndex = 0;
  private hideReviewed = true;

  constructor(leaf: WorkspaceLeaf, engine: ChangeSetEngine) {
    super(leaf);
    this.engine = engine;
  }

  getViewType(): string { return MORNING_REVIEW_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Suggestions"; }
  getIcon(): string { return "leaf"; }

  async onOpen(): Promise<void> {
    this.render();
    this.registerKeyboardShortcuts();
  }

  async onClose(): Promise<void> {}

  refresh(): void {
    this.render();
  }

  private registerKeyboardShortcuts(): void {
    this.registerDomEvent(this.contentEl, "keydown", (e: KeyboardEvent) => {
      // Don't fire when user is typing in a modal input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const cards = this.getPendingCardEls();
      if (cards.length === 0) return;
      this.focusedIndex = Math.min(this.focusedIndex, cards.length - 1);

      switch (e.key.toLowerCase()) {
        case "a": {
          e.preventDefault();
          const id = cards[this.focusedIndex]?.dataset.id;
          if (id) void this.engine.apply(id).then((ok) => {
            if (!ok) new Notice("Gardener: skipped stale suggestion. Run Scan vault now to refresh it.");
            this.render();
          }).catch((e) => { console.error("Gardener: apply failed", e); this.render(); });
          break;
        }
        case "r": {
          e.preventDefault();
          const id = cards[this.focusedIndex]?.dataset.id;
          if (id) void this.engine.reject(id).then(() => this.render()).catch((e) => { console.error("Gardener: reject failed", e); this.render(); });
          break;
        }
        case "s": {
          e.preventDefault();
          const id = cards[this.focusedIndex]?.dataset.id;
          if (id) {
            const menu = new Menu();
            menu.addItem((item) =>
              item.setTitle("Snooze 7 days").onClick(() => {
                void this.engine.snooze(id, 7).then(() => this.render());
              })
            );
            menu.addItem((item) =>
              item.setTitle("Snooze 30 days").onClick(() => {
                void this.engine.snooze(id, 30).then(() => this.render());
              })
            );
            const card = cards[this.focusedIndex];
            const rect = card.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom });
          }
          break;
        }
        case "arrowdown":
        case "j": {
          e.preventDefault();
          this.focusedIndex = Math.min(this.focusedIndex + 1, cards.length - 1);
          this.updateFocus(cards);
          break;
        }
        case "arrowup":
        case "k": {
          e.preventDefault();
          this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
          this.updateFocus(cards);
          break;
        }
      }
    });

    // Make the content area focusable so keydown fires
    if (!this.contentEl.hasAttribute("tabindex")) {
      this.contentEl.setAttr("tabindex", "0");
    }
  }

  private getPendingCardEls(): HTMLElement[] {
    return Array.from(
      this.contentEl.querySelectorAll<HTMLElement>(".gardener-card[data-pending='true']")
    );
  }

  private updateFocus(cards: HTMLElement[]): void {
    cards.forEach((c, i) => {
      c.classList.toggle("gardener-card-focused", i === this.focusedIndex);
    });
    cards[this.focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-review-view");

    const all = this.engine.getAll();
    const pending = all.filter((s) => s.status === "pending");
    const snoozed = all.filter((s) => s.status === "snoozed");
    const reviewed = all.filter((s) => s.status === "approved" || s.status === "rejected" || s.status === "skipped");

    // Header
    const header = contentEl.createDiv("gardener-review-header");
    const h4 = header.createEl("h4");
    h4.createSpan({ cls: "gardener-count", text: String(pending.length) });
    h4.appendText(` suggestion${pending.length !== 1 ? "s" : ""} to review`);
    if (snoozed.length > 0) {
      h4.appendText(" · ");
      h4.createSpan({ cls: "gardener-snoozed-count", text: `${snoozed.length} snoozed` });
    }
    if (reviewed.length > 0) {
      h4.appendText(" · ");
      const toggleLink = h4.createEl("a", {
        cls: "gardener-toggle-reviewed",
        text: this.hideReviewed ? `${reviewed.length} reviewed (show)` : `${reviewed.length} reviewed (hide)`,
      });
      toggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.hideReviewed = !this.hideReviewed;
        this.render();
      });
    }
    const sub = header.createEl("p");
    const lastRun = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    sub.textContent = `Scan -> review -> improve notes · Last run: ${lastRun}`;

    // Bulk bar + keyboard hint
    if (pending.length > 0) {
      const bulk = contentEl.createDiv("gardener-bulk-bar");

      const approveAllBtn = bulk.createEl("button", { cls: "gardener-chip on", text: "Accept all" });
      approveAllBtn.addEventListener("click", () => { void (async () => {
        approveAllBtn.setAttr("disabled", "true");
        approveAllBtn.textContent = "Accepting...";
        let accepted = 0;
        let skipped = 0;
        try {
          for (const s of pending) {
            const ok = await this.engine.apply(s.proposal.id);
            if (ok) accepted++;
            else skipped++;
          }
          if (skipped > 0) {
            new Notice(`Gardener: accepted ${accepted}, skipped ${skipped} stale suggestion${skipped !== 1 ? "s" : ""}. Run Scan vault now to refresh skipped items.`);
          } else {
            new Notice(`Gardener: accepted ${accepted} suggestion${accepted !== 1 ? "s" : ""}.`);
          }
        } catch (e) {
          console.error("Gardener: accept all failed", e);
          new Notice("Gardener: error while accepting suggestions.");
        } finally {
          this.render();
        }
      })(); });

      bulk.createEl("span", {
        cls: "gardener-kbd-hint",
        text: "a approve/acknowledge · r reject · s snooze · ↑↓ navigate",
      });
    }

    // Empty state
    if (all.length === 0) {
      const empty = contentEl.createDiv("gardener-empty");
      empty.createDiv("gardener-empty-icon").textContent = "✿";
      empty.createEl("p").textContent = "Your vault is tidy — nothing to review.";
      return;
    }

    // Cards
    this.cardsEl = contentEl.createDiv("gardener-cards");

    const visible = this.hideReviewed
      ? all.filter((s) => s.status === "pending" || s.status === "snoozed")
      : all;

    const sorted = [
      ...visible.filter((s) => s.status === "pending"),
      ...visible.filter((s) => s.status === "snoozed"),
      ...visible.filter((s) => s.status !== "pending" && s.status !== "snoozed"),
    ];

    if (sorted.length === 0 && this.hideReviewed && reviewed.length > 0) {
      const doneEl = contentEl.createDiv("gardener-empty");
      doneEl.createDiv("gardener-empty-icon").textContent = "✿";
      doneEl.createEl("p").textContent = `All caught up — ${reviewed.length} reviewed suggestion${reviewed.length !== 1 ? "s" : ""} hidden.`;
      const showLink = doneEl.createEl("a", { text: "Show reviewed", cls: "gardener-toggle-reviewed" });
      showLink.addEventListener("click", (e) => { e.preventDefault(); this.hideReviewed = false; this.render(); });
      return;
    }

    let pendingCardIndex = 0;
    for (const family of PROPOSAL_FAMILIES) {
      const sectionItems = sorted.filter((staged) => classifyProposal(staged.proposal) === family.id);
      if (sectionItems.length === 0) continue;
      const section = this.cardsEl.createDiv("gardener-review-family");
      const info = familyInfo(family.id);
      const heading = section.createDiv("gardener-review-family-heading");
      heading.createEl("h5", { text: info.label });
      heading.createEl("span", { text: `${sectionItems.length} item${sectionItems.length !== 1 ? "s" : ""}` });
      section.createEl("p", { text: info.description, cls: "gardener-review-family-desc" });

      for (const staged of sectionItems) {
        const cardEl = renderCard(staged, {
          onApprove: (id) => {
            void this.engine.apply(id).then((ok) => {
              if (!ok) new Notice("Gardener: skipped stale suggestion. Run Scan vault now to refresh it.");
              this.render();
            });
          },
          onReject: (id) => {
            void this.engine.reject(id).then(() => this.render());
          },
          onRejectWithRule: (id) => {
            new RuleModal(this.app, async (rule) => {
              await this.engine.reject(id, rule);
              this.render();
            }).open();
          },
          onSnooze: (id, days) => {
            void this.engine.snooze(id, days as SnoozeDuration).then(() => this.render());
          },
        });

        if (staged.status === "pending") {
          cardEl.dataset.pending = "true";
          if (pendingCardIndex === this.focusedIndex) cardEl.classList.add("gardener-card-focused");
          pendingCardIndex++;
        }

        section.appendChild(cardEl);
      }
    }

    // Focus the content area so keyboard events fire immediately
    this.contentEl.focus();
  }
}

class RuleModal extends Modal {
  private onSubmit: (rule: string) => void;

  constructor(app: App, onSubmit: (rule: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add a rule to GARDENER.md" });
    contentEl.createEl("p", {
      text: "Describe what Gardener should avoid in the future:",
      cls: "gardener-card-why",
    });
    const input = contentEl.createEl("textarea", {
      placeholder: "e.g. Never merge notes that share a tag but have different topics",
      cls: "gardener-rule-textarea",
    });

    const actions = contentEl.createDiv("gardener-wizard-actions");
    const cancel = actions.createEl("button", { cls: "gardener-btn", text: "Cancel" });
    const confirm = actions.createEl("button", { cls: "gardener-btn approve", text: "Add Rule" });

    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", () => {
      const rule = input.value.trim();
      if (rule) { this.onSubmit(rule); this.close(); }
    });
  }

  onClose(): void { this.contentEl.empty(); }
}
