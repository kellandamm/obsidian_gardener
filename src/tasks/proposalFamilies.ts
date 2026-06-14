import type { ChangeProposal } from "../changeset/ChangeProposal";

export type ProposalFamily = "distill" | "canonicalize" | "connect" | "verify" | "maintain" | "wiki";

export interface ProposalFamilyInfo {
  id: ProposalFamily;
  label: string;
  description: string;
}

export const PROPOSAL_FAMILIES: ProposalFamilyInfo[] = [
  {
    id: "wiki",
    label: "Wiki Pages",
    description: "Source summaries, concept pages, index, and agent schema updates.",
  },
  {
    id: "distill",
    label: "New Ideas",
    description: "Useful ideas found in your notes.",
  },
  {
    id: "canonicalize",
    label: "Main Notes",
    description: "Hub notes, duplicate notes, and topic pages.",
  },
  {
    id: "connect",
    label: "Links",
    description: "Missing links, related notes, and broken links.",
  },
  {
    id: "verify",
    label: "Conflicts",
    description: "Notes that may disagree or need a decision.",
  },
  {
    id: "maintain",
    label: "Cleanup",
    description: "Templates, tags, and general vault housekeeping.",
  },
];

export function classifyProposal(proposal: Pick<ChangeProposal, "taskId" | "type">): ProposalFamily {
  if (
    proposal.taskId === "wiki-source-summary" ||
    proposal.taskId === "wiki-concept-page" ||
    proposal.taskId === "wiki-index" ||
    proposal.taskId === "wiki-agent-schema"
  ) return "wiki";
  if (proposal.taskId === "wiki-memory-build" || proposal.taskId === "auto-summarise") return "distill";
  if (
    proposal.taskId === "canonical-concepts" ||
    proposal.taskId === "queued-hub-notes" ||
    proposal.taskId === "canonical-strengthen" ||
    proposal.taskId === "merge-duplicates" ||
    proposal.taskId === "semantic-search" ||
    proposal.taskId === "content-merge" ||
    proposal.taskId === "moc-maintenance"
  ) return "canonicalize";
  if (
    proposal.taskId === "unlinked-mentions" ||
    proposal.taskId === "broken-links" ||
    proposal.taskId === "contextualize-note" ||
    proposal.type === "insert-link" ||
    proposal.type === "delete-link"
  ) return "connect";
  if (
    proposal.taskId === "claim-consistency-buffer" ||
    proposal.taskId === "contradiction-detection" ||
    proposal.taskId === "stale-notes" ||
    proposal.type === "flag-contradiction"
  ) return "verify";
  return "maintain";
}

export function familyInfo(id: ProposalFamily): ProposalFamilyInfo {
  return PROPOSAL_FAMILIES.find((family) => family.id === id)!;
}
