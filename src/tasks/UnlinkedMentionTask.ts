import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";

export class UnlinkedMentionTask implements Task {
  readonly id = "unlinked-mentions";

  constructor(private app: App) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.tasks.unlinkedMentions.enabled) return [];

    // Build a lookup: title (lower) → note path
    const titleMap = new Map<string, NoteEntry>();
    for (const note of index.notes.values()) {
      titleMap.set(note.title.toLowerCase(), note);
    }

    const findings: Finding[] = [];

    for (const source of index.notes.values()) {
      const alreadyLinked = new Set(source.links);
      const sourceFile = this.app.vault.getAbstractFileByPath(source.path) as TFile | null;
      if (!sourceFile) continue;
      const before = await this.app.vault.cachedRead(sourceFile);
      let after = before;
      const linkedTitles: string[] = [];

      for (const [titleLower, target] of titleMap) {
        if (target.path === source.path) continue;
        if (alreadyLinked.has(target.path)) continue;
        if (titleLower.length < 3) continue;
        if (linkedTitles.length >= 5) break;

        const title = target.title;
        const mentionPattern = new RegExp(`(^|[^\\[])(\\b${escapeRegex(title)}\\b)`, "i");
        const next = after.replace(mentionPattern, (_match, prefix: string) => `${prefix}[[${title}]]`);
        if (next === after) continue;
        after = next;
        linkedTitles.push(title);
      }

      if (linkedTitles.length === 0) continue;

      findings.push({
        taskId: this.id,
        confidence: 0.75,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "insert-link",
          operation: "replace-file",
          targetPath: source.path,
          title: `Link ${linkedTitles.length} mention${linkedTitles.length !== 1 ? "s" : ""} in "${source.title}"`,
          rationale: `These titles appear as text but aren't linked: ${linkedTitles.map((t) => `"${t}"`).join(", ")}.`,
          diff: buildDiff(before, after),
          before,
          after,
          confidence: 0.75,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
