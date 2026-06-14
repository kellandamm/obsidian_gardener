import type { StagedProposal } from "../changeset/ChangeProposal";

export interface CardCallbacks {
  onApprove(id: string): void;
  onReject(id: string): void;
  onRejectWithRule(id: string): void;
  onSnooze(id: string, days: 7 | 30): void;
}

const KIND_LABELS: Record<string, string> = {
  "insert-link": "link",
  "delete-link": "fix",
  "merge-notes": "merge",
  "delete-note": "fix",
  "flag-stub": "stub",
  "flag-orphan": "orphan",
  "flag-contradiction": "memory",
  "add-content": "memory",
  "add-frontmatter": "fix",
};

const MEMORY_TASKS = new Set([
  "canonical-concepts",
  "contextualize-note",
  "claim-consistency-buffer",
  "wiki-memory-build",
]);

export function renderCard(staged: StagedProposal, callbacks: CardCallbacks): HTMLElement {
  const { proposal, status } = staged;
  const card = activeDocument.createElement("div");
  card.className = "gardener-card";
  card.dataset.id = proposal.id;

  if (status !== "pending") card.classList.add("gone");
  if (status === "approved") card.classList.add("done");
  if (status === "rejected") card.classList.add("rejected", "done");
  if (status === "snoozed") card.classList.add("snoozed");

  // Top row: kind badge + title
  const top = card.createDiv("gardener-card-top");
  const kindKey = KIND_LABELS[proposal.type] ?? "fix";
  const kind = top.createSpan(`gardener-kind ${kindKey}`);
  kind.textContent = MEMORY_TASKS.has(proposal.taskId) ? "memory" : kindKey;

  const title = top.createDiv("gardener-card-title");
  title.textContent = proposal.title;

  // Confidence badge
  const conf = top.createSpan("gardener-confidence");
  conf.textContent = `${Math.round(proposal.confidence * 100)}%`;

  // Rationale
  const why = card.createDiv("gardener-card-why");
  why.textContent = proposal.rationale;

  // Diff
  if (proposal.diff.length > 0) {
    const diffEl = card.createDiv("gardener-diff");
    for (const line of proposal.diff) {
      const span = diffEl.createSpan(line.kind);
      span.textContent =
        (line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  ") + line.text;
    }
  }

  // Actions — hidden for non-pending cards
  const actions = card.createDiv("gardener-actions");

  if (status === "pending") {
    const approveText = MEMORY_TASKS.has(proposal.taskId)
      ? proposal.operation === "replace-file" ? "Accept into wiki" : "Accept memory"
      : proposal.operation === "replace-file" ? "Approve" : "Acknowledge";
    const approveBtn = actions.createEl("button", { cls: "gardener-btn approve", text: approveText });
    const rejectBtn = actions.createEl("button", { cls: "gardener-btn reject", text: "Reject" });
    const ruleBtn = actions.createEl("button", { cls: "gardener-btn", text: "Reject + Rule" });
    const snoozeBtn = actions.createEl("button", { cls: "gardener-btn gardener-snooze-btn", text: "Snooze" });

    approveBtn.addEventListener("click", () => callbacks.onApprove(proposal.id));
    rejectBtn.addEventListener("click", () => callbacks.onReject(proposal.id));
    ruleBtn.addEventListener("click", () => callbacks.onRejectWithRule(proposal.id));
    snoozeBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      showSnoozeMenu(snoozeBtn, proposal.id, callbacks.onSnooze);
    });
  } else if (status === "snoozed") {
    const until = staged.snoozeUntil
      ? new Date(staged.snoozeUntil).toLocaleDateString()
      : "soon";
    const statusEl = actions.createSpan("gardener-card-status gardener-snoozed-label");
    statusEl.textContent = `💤 snoozed until ${until}`;
  } else {
    const statusEl = actions.createSpan("gardener-card-status");
    statusEl.textContent =
      status === "approved"
        ? proposal.operation === "replace-file" ? "✓ approved" : "✓ acknowledged"
        : "✕ rejected";
    statusEl.addClass("gardener-status-block");
  }

  // Learn banner (shown when rejected with rule)
  if (staged.rejectionReason) {
    const learnBanner = card.createDiv("gardener-learn-banner gardener-status-block");
    learnBanner.appendText("Rule added to GARDENER.md: ");
    learnBanner.createEl("b", { text: staged.rejectionReason });
  }

  return card;
}

function showSnoozeMenu(
  this: void,
  anchor: HTMLElement,
  id: string,
  onSnooze: (id: string, days: 7 | 30) => void
): void {
  // Simple inline snooze picker — avoids importing Obsidian Menu in this module
  const existing = activeDocument.querySelector(".gardener-snooze-popup");
  existing?.remove();

  const popup = activeDocument.createElement("div");
  popup.className = "gardener-snooze-popup";

  const opt7 = popup.createEl("button", { cls: "gardener-snooze-opt", text: "Snooze 7 days" });
  const opt30 = popup.createEl("button", { cls: "gardener-snooze-opt", text: "Snooze 30 days" });

  opt7.addEventListener("click", () => { onSnooze(id, 7); popup.remove(); });
  opt30.addEventListener("click", () => { onSnooze(id, 30); popup.remove(); });

  const rect = anchor.getBoundingClientRect();
  popup.addClass("gardener-snooze-popup");
  popup.setCssProps({
    "--gardener-popup-top": `${rect.bottom + 4}px`,
    "--gardener-popup-left": `${rect.left}px`,
  });

  activeDocument.body.appendChild(popup);
  const dismiss = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) { popup.remove(); activeDocument.removeEventListener("click", dismiss); }
  };
  window.setTimeout(() => activeDocument.addEventListener("click", dismiss), 0);
}
