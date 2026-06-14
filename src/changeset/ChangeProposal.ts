export type ChangeType =
  | "insert-link"
  | "delete-link"
  | "merge-notes"
  | "delete-note"
  | "flag-stub"
  | "flag-orphan"
  | "add-content"
  | "add-frontmatter"
  | "flag-contradiction";

export type ProposalOperation = "replace-file" | "advisory";

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface ChangeProposal {
  id: string;
  taskId: string;
  type: ChangeType;
  /**
   * Only replace-file proposals are allowed to write vault content.
   * Advisory proposals are review-only findings that resolve without disk writes.
   * Missing operation is treated as advisory for legacy staged proposals.
   */
  operation?: ProposalOperation;
  targetPath: string;
  secondaryPath?: string;
  title: string;
  rationale: string;
  diff: DiffLine[];
  before: string;
  after: string;
  confidence: number;
  createdAt: number;
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "skipped" | "snoozed";

export type SnoozeDuration = 7 | 30;

export interface StagedProposal {
  proposal: ChangeProposal;
  status: ProposalStatus;
  rejectionReason?: string;
  snoozeUntil?: number; // epoch ms — proposal re-surfaces after this time
}

let counter = 0;
export function newProposalId(): string {
  return `prop-${Date.now()}-${++counter}`;
}

export function buildDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const diff: DiffLine[] = [];
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const CONTEXT = 2;

  // Simple unified-diff approximation: show changed lines with context
  const changed = new Set<number>();
  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) changed.add(i);
  }

  let lastEmitted = -1;
  for (const i of [...changed].sort((a, b) => a - b)) {
    const start = Math.max(0, i - CONTEXT);
    for (let j = Math.max(lastEmitted + 1, start); j < i; j++) {
      if (beforeLines[j] !== undefined) diff.push({ kind: "ctx", text: beforeLines[j] });
    }
    if (beforeLines[i] !== undefined) diff.push({ kind: "del", text: beforeLines[i] });
    if (afterLines[i] !== undefined) diff.push({ kind: "add", text: afterLines[i] });
    lastEmitted = i;
  }

  // Trailing context
  for (let j = lastEmitted + 1; j <= Math.min(lastEmitted + CONTEXT, maxLen - 1); j++) {
    if (afterLines[j] !== undefined) diff.push({ kind: "ctx", text: afterLines[j] });
  }

  return diff;
}
