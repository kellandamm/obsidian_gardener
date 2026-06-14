import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { ErrorBook } from "../memory/ErrorBook";
import type { CanonicalPageRegistry } from "../memory/CanonicalPageRegistry";
import { buildDiff, newProposalId } from "../changeset/ChangeProposal";
import { getConceptNodes } from "../memory/WikiMemoryGraph";

export class CanonicalConceptTask implements Task {
  readonly id = "canonical-concepts";

  constructor(
    private app: App,
    private memory: MemoryRef,
    private errorBook: ErrorBook,
    private canonicalRegistry: CanonicalPageRegistry
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled) return [];

    const findings: Finding[] = [];
    for (const concept of getConceptNodes(this.memory.graph)) {
      const registered = this.canonicalRegistry.get(concept.id);
      const canonical = registered ? index.notes.get(registered.path) ?? null : findCanonicalNote(index, concept.label);
      if (!canonical) {
        const advisory = {
          id: newProposalId(),
          taskId: this.id,
          type: "flag-orphan" as const,
          operation: "advisory" as const,
          targetPath: concept.provenance[0]?.path ?? "",
          title: `Review possible hub note for "${concept.label}"`,
          rationale: `Gardener found ${concept.provenance.length} references to "${concept.label}" but no clear existing canonical note. New hub notes are review-only.`,
          diff: [],
          before: "",
          after: "",
          confidence: 0.55,
          createdAt: Date.now(),
        };
        if (advisory.targetPath && !this.errorBook.shouldSuppress(advisory)) {
          findings.push({ taskId: this.id, confidence: advisory.confidence, proposal: advisory });
        }
        continue;
      }

      for (const prov of concept.provenance.slice(0, 4)) {
        if (prov.path === canonical.path) continue;
        const source = index.notes.get(prov.path);
        if (!source || source.links.includes(canonical.path)) continue;
        const file = this.app.vault.getAbstractFileByPath(source.path) as TFile | null;
        if (!file) continue;
        const before = await this.app.vault.cachedRead(file);
        const after = linkFirstPlainMention(before, concept.label, canonical.title);
        if (after === before) continue;
        const proposal = {
          id: newProposalId(),
          taskId: this.id,
          type: "insert-link" as const,
          operation: "replace-file" as const,
          targetPath: source.path,
          secondaryPath: canonical.path,
          title: `Link "${concept.label}" to canonical note "${canonical.title}"`,
          rationale: `"${canonical.title}" appears to be the existing canonical page for this concept.`,
          diff: buildDiff(before, after),
          before,
          after,
          confidence: 0.82,
          createdAt: Date.now(),
        };
        if (!this.errorBook.shouldSuppress(proposal)) {
          findings.push({ taskId: this.id, confidence: proposal.confidence, proposal });
        }
      }
    }

    return findings;
  }
}

function findCanonicalNote(index: VaultIndex, conceptLabel: string): NoteEntry | null {
  const normalized = normalize(conceptLabel);
  let best: { note: NoteEntry; score: number } | null = null;
  for (const note of index.notes.values()) {
    let score = 0;
    if (normalize(note.title) === normalized) score += 4;
    if (note.tags.some((tag) => ["moc", "concept", "evergreen"].includes(tag.toLowerCase()))) score += 2;
    if ((index.backlinks.get(note.path)?.size ?? 0) >= 2) score += 1;
    if (note.path.toLowerCase().includes("concept") || note.path.toLowerCase().includes("moc")) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { note, score };
  }
  return best?.note ?? null;
}

function linkFirstPlainMention(content: string, label: string, canonicalTitle: string): string {
  const re = new RegExp(`(^|[^\\[])(\\b${escapeRegex(label)}\\b)`, "i");
  return content.replace(re, (_match, prefix: string) => `${prefix}[[${canonicalTitle}]]`);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
