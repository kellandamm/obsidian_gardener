import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { MemoryReviewStore } from "../memory/MemoryReviewStore";
import type { ErrorBook } from "../memory/ErrorBook";
import type { CanonicalPageRegistry } from "../memory/CanonicalPageRegistry";
import type { MemoryNode } from "../memory/WikiMemoryGraph";
import { buildDiff, newProposalId } from "../changeset/ChangeProposal";

export class QueuedHubNoteTask implements Task {
  readonly id = "queued-hub-notes";

  constructor(
    private app: App,
    private memory: MemoryRef,
    private reviewStore: MemoryReviewStore,
    private errorBook: ErrorBook,
    private canonicalRegistry: CanonicalPageRegistry
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled) return [];

    const findings: Finding[] = [];
    const queued = this.reviewStore.getData().entries.filter((entry) => entry.status === "hub-queued");
    for (const entry of queued) {
      const concept = this.memory.graph.nodes.find((node) => node.id === entry.nodeId && node.type === "concept");
      if (!concept) continue;
      if (this.canonicalRegistry.get(concept.id)) continue;
      const existing = findExistingCanonical(index, concept.label);
      const proposal = existing
        ? await this.buildPromotionProposal(existing, concept)
        : this.buildHubCreationProposal(schema, concept);
      if (!proposal || this.errorBook.shouldSuppress(proposal.proposal)) continue;
      findings.push(proposal);
    }
    return findings;
  }

  private buildHubCreationProposal(schema: GardenerSchema, concept: MemoryNode): Finding | null {
    const targetPath = `${schema.wikiMemory.canonicalFolder}/${safeFileName(concept.label)}.md`;
    if (this.app.vault.getAbstractFileByPath(targetPath)) return null;
    const after = renderHubNote(concept);
    const proposal = {
      id: newProposalId(),
      taskId: this.id,
      type: "add-content" as const,
      operation: "replace-file" as const,
      targetPath,
      title: `Create canonical wiki page for "${concept.label}"`,
      rationale: `This concept was queued from Wiki Memory. The page will be created only if approved and includes source provenance.`,
      diff: buildDiff("", after),
      before: "",
      after,
      confidence: 0.74,
      createdAt: Date.now(),
    };
    return { taskId: this.id, confidence: proposal.confidence, proposal };
  }

  private async buildPromotionProposal(note: NoteEntry, concept: MemoryNode): Promise<Finding | null> {
    const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
    if (!file) return null;
    const before = await this.app.vault.cachedRead(file);
    if (/gardener-role:\s*canonical/.test(before) || /#concept\b/.test(before)) return null;
    const after = addCanonicalMarker(before, concept.id);
    const proposal = {
      id: newProposalId(),
      taskId: this.id,
      type: "add-frontmatter" as const,
      operation: "replace-file" as const,
      targetPath: note.path,
      title: `Promote "${note.title}" to canonical wiki page`,
      rationale: `"${note.title}" already matches queued concept "${concept.label}", so Gardener will mark the existing note as canonical instead of creating a new page.`,
      diff: buildDiff(before, after),
      before,
      after,
      confidence: 0.78,
      createdAt: Date.now(),
    };
    return { taskId: this.id, confidence: proposal.confidence, proposal };
  }
}

function renderHubNote(concept: MemoryNode): string {
  const paths = [...new Set(concept.provenance.map((prov) => prov.path))];
  const claims = concept.provenance
    .map((prov) => prov.snippet)
    .filter((snippet, index, arr) => snippet && arr.indexOf(snippet) === index)
    .slice(0, 8);
  return `---\ngardener-role: canonical\ngardener-concept-id: ${concept.id}\n---\n\n# ${concept.label}\n\n## Summary\n\nThis canonical page was queued from Gardener Wiki Memory. Review and refine this summary after approval.\n\n## Source Provenance\n\n${paths.map((path) => `- [[${path.replace(/\.md$/, "")}]]`).join("\n") || "- Add sources"}\n\n## Claims\n\n${claims.map((claim) => `- ${claim}`).join("\n") || "- Add accepted claims"}\n\n## See also\n\n`;
}

function addCanonicalMarker(content: string, conceptId: string): string {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content);
  if (fm) {
    return (
      content.slice(0, fm.index + fm[0].length - 3) +
      `gardener-role: canonical\ngardener-concept-id: ${conceptId}\n---` +
      content.slice(fm.index + fm[0].length)
    );
  }
  return `---\ngardener-role: canonical\ngardener-concept-id: ${conceptId}\n---\n\n${content}`;
}

function findExistingCanonical(index: VaultIndex, label: string): NoteEntry | null {
  const normalized = normalize(label);
  for (const note of index.notes.values()) {
    if (normalize(note.title) === normalized) return note;
  }
  return null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled Concept";
}
