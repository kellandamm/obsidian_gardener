import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { ErrorBook } from "../memory/ErrorBook";
import { buildDiff, newProposalId } from "../changeset/ChangeProposal";
import { findConceptsMentionedByNote } from "../memory/WikiMemoryGraph";

export class ContextualizeNoteTask implements Task {
  readonly id = "contextualize-note";

  constructor(
    private app: App,
    private memory: MemoryRef,
    private errorBook: ErrorBook
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled || !schema.wikiMemory.relatedSection) return [];

    const findings: Finding[] = [];
    for (const note of index.notes.values()) {
      const related = findRelatedNotes(index, this.memory, note.path, 3);
      if (related.length < 2) continue;
      const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
      if (!file) continue;
      const before = await this.app.vault.cachedRead(file);
      if (/^##\s+(Related|See also)\s*$/im.test(before)) continue;
      const after = `${before.trimEnd()}\n\n## See also\n${related.map((path) => `- [[${index.notes.get(path)?.title ?? path.replace(/\.md$/, "")}]]`).join("\n")}\n`;
      const proposal = {
        id: newProposalId(),
        taskId: this.id,
        type: "insert-link" as const,
        operation: "replace-file" as const,
        targetPath: note.path,
        title: `Add graph-backed context to "${note.title}"`,
        rationale: `These notes share multiple wiki-memory concepts with provenance: ${related.map((path) => `"${index.notes.get(path)?.title ?? path}"`).join(", ")}.`,
        diff: buildDiff(before, after),
        before,
        after,
        confidence: 0.7,
        createdAt: Date.now(),
      };
      if (!this.errorBook.shouldSuppress(proposal)) {
        findings.push({ taskId: this.id, confidence: proposal.confidence, proposal });
      }
    }
    return findings;
  }
}

function findRelatedNotes(index: VaultIndex, memory: MemoryRef, path: string, limit: number): string[] {
  const concepts = new Set(findConceptsMentionedByNote(memory.graph, path).map((node) => node.id));
  if (concepts.size === 0) return [];
  const scores = new Map<string, number>();
  for (const other of index.notes.values()) {
    if (other.path === path) continue;
    const shared = findConceptsMentionedByNote(memory.graph, other.path)
      .filter((node) => concepts.has(node.id))
      .length;
    if (shared >= 2) scores.set(other.path, shared);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([otherPath]) => otherPath);
}
