import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import type { AuditLog } from "../safety/AuditLog";
import { isTaskEnabledForPath } from "../schema/folderRules";

/**
 * For stub notes (< minWords) with 2+ backlinks, collects context sentences
 * from linking notes and asks the LLM to draft a summary to fill the stub.
 */
export class AutoSummariseTask implements Task {
  readonly id = "auto-summarise";

  constructor(private app: App, private audit?: AuditLog) {}

  async run(
    index: VaultIndex,
    schema: GardenerSchema,
    llm: LLMProvider
  ): Promise<Finding[]> {
    if (!schema.tasks.stubFlagging.enabled) return [];
    if (!(await llm.isAvailable())) return [];

    const minWords = schema.tasks.stubFlagging.minWords;
    const findings: Finding[] = [];

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      if (note.wordCount >= minWords) continue;

      const linkers = [...(index.backlinks.get(note.path) ?? [])];
      if (linkers.length < 2) continue;

      // Collect sentences that mention this note (by title or [[link]]) from linkers
      const contextSnippets: string[] = [];
      for (const linkerPath of linkers.slice(0, 5)) {
        if (!isTaskEnabledForPath(schema, linkerPath, this.id)) continue;
        try {
          const file = this.app.vault.getAbstractFileByPath(linkerPath) as TFile | null;
          if (!file) continue;
          const content = await this.app.vault.cachedRead(file);
          const sentences = content
            .split(/(?<=[.!?])\s+/)
            .filter((s) => {
              const lower = s.toLowerCase();
              return (
                lower.includes(note.title.toLowerCase()) ||
                lower.includes(`[[${note.path.replace(/\.md$/, "").toLowerCase()}`)
              );
            })
            .slice(0, 3);
          contextSnippets.push(...sentences);
        } catch {
          // skip
        }
      }

      if (contextSnippets.length === 0) continue;

      // Read the stub's current content
      let currentContent = "";
      try {
        const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
        if (!file) continue;
        currentContent = await this.app.vault.cachedRead(file);
      } catch {
        continue;
      }

      const context = contextSnippets.join("\n");
      let summary: string;
      try {
        await this.audit?.writePromptScope(this.id, llm.name, [note.path, ...linkers.slice(0, 5)], "stub summary");
        summary = await llm.complete(
          `Based on these references from other notes, write a 2-3 sentence summary for a note titled "${note.title}":\n\n${context}\n\nReturn only the summary text, no headings.`,
          { maxTokens: 300, temperature: 0.5 }
        );
      } catch {
        continue;
      }

      const after = currentContent.trim()
        ? currentContent.trimEnd() + "\n\n" + summary.trim()
        : `# ${note.title}\n\n${summary.trim()}`;

      const diff = buildDiff(currentContent, after);
      findings.push({
        taskId: this.id,
        confidence: 0.6,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "add-content",
          operation: "replace-file",
          targetPath: note.path,
          title: `Draft summary for stub: "${note.title}"`,
          rationale: `This stub has ${linkers.length} backlinks but only ${note.wordCount} words. LLM drafted a summary from ${contextSnippets.length} context sentences found in linking notes.`,
          diff,
          before: currentContent,
          after,
          confidence: 0.6,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }
}
