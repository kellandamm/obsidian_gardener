import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

// Notes whose titles contain these words are treated as Maps of Content
const MOC_TITLE_RE = /\b(index|moc|map|home|dashboard|hub|contents?|overview|toc)\b/i;
// Fallback: any note with this many outgoing links is also a candidate MOC
const MIN_LINKS_FOR_MOC = 8;

export class MOCTask implements Task {
  readonly id = "moc-maintenance";

  constructor(private app: App) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    const notes = [...index.notes.values()];
    const mocs = notes.filter(
      (n) => isTaskEnabledForPath(schema, n.path, this.id) && (MOC_TITLE_RE.test(n.title) || n.links.length >= MIN_LINKS_FOR_MOC)
    );

    const findings: Finding[] = [];

    for (const moc of mocs) {
      const missing = this.findMissingEntries(moc, index, schema);
      if (missing.length === 0) continue;

      const file = this.app.vault.getAbstractFileByPath(moc.path) as TFile | null;
      if (!file) continue;
      const before = await this.app.vault.cachedRead(file);
      const links = missing.map((candidate) => `- [[${candidate.title}]]`);
      const after = `${before.trimEnd()}\n${links.join("\n")}\n`;

      findings.push({
        taskId: this.id,
        confidence: 0.78,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "insert-link",
          operation: "replace-file",
          targetPath: moc.path,
          title: `Add ${missing.length} entr${missing.length === 1 ? "y" : "ies"} to MOC "${moc.title}"`,
          rationale:
            `${missing.map((candidate) => `"${candidate.title}"`).join(", ")} ` +
            `share topic tags with notes already in this index but aren't linked from it.`,
          diff: buildDiff(before, after),
          before,
          after,
          confidence: 0.78,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }

  private findMissingEntries(moc: NoteEntry, index: VaultIndex, schema: GardenerSchema): NoteEntry[] {
    const linkedPaths = new Set(moc.links);
    linkedPaths.add(moc.path); // don't suggest linking to self

    // Collect tags from notes already linked in the MOC
    const mocTags = new Set<string>();
    for (const path of linkedPaths) {
      const linked = index.notes.get(path);
      if (linked) linked.tags.forEach((t) => mocTags.add(t));
    }
    // Also include the MOC's own tags
    moc.tags.forEach((t) => mocTags.add(t));

    if (mocTags.size === 0) return [];

    // Keywords from MOC title (minus stop words) for title-based matching
    const mocKeywords = tokenize(moc.title);

    const candidates: NoteEntry[] = [];
    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      if (linkedPaths.has(note.path)) continue;

      const sharedTags = note.tags.filter((t) => mocTags.has(t));
      const sharedKeywords = [...tokenize(note.title)].filter((w) => mocKeywords.has(w));

      if (sharedTags.length > 0 || sharedKeywords.length > 0) {
        candidates.push(note);
      }
    }

    // Cap at 5 suggestions per MOC to avoid flooding the review queue
    return candidates.slice(0, 5);
  }
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
  "is", "my", "note", "notes", "index", "moc", "map", "home", "hub",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}
