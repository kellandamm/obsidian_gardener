import type { App } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { findSimilarByTitle } from "../index/VaultIndex";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import type { AuditLog } from "../safety/AuditLog";
import { isTaskEnabledForPath } from "../schema/folderRules";

/**
 * When two notes are confirmed duplicates, uses the LLM to draft a merged note
 * and presents a real before/after diff for review. Requires an LLM provider.
 */
export class ContentMergeTask implements Task {
  readonly id = "content-merge";

  constructor(private app: App, private audit?: AuditLog) {}

  async run(
    index: VaultIndex,
    schema: GardenerSchema,
    llm: LLMProvider
  ): Promise<Finding[]> {
    if (!schema.tasks.mergeDuplicates.enabled) return [];
    if (!(await llm.isAvailable())) return [];

    const threshold = schema.tasks.mergeDuplicates.minSimilarity;
    const findings: Finding[] = [];
    const seen = new Set<string>();

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      const similar = findSimilarByTitle(index, note.path, threshold);
      for (const { path: otherPath, score } of similar) {
        if (!isTaskEnabledForPath(schema, otherPath, this.id)) continue;
        const pairKey = [note.path, otherPath].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const other = index.notes.get(otherPath);
        if (!other) continue;

        // Read both note bodies
        let bodyA = "", bodyB = "";
        try {
          const fileA = this.app.vault.getAbstractFileByPath(note.path);
          const fileB = this.app.vault.getAbstractFileByPath(otherPath);
          if (!fileA || !fileB) continue;
          bodyA = await this.app.vault.read(fileA as Parameters<typeof this.app.vault.read>[0]);
          bodyB = await this.app.vault.read(fileB as Parameters<typeof this.app.vault.read>[0]);
        } catch {
          continue;
        }

        // Ask LLM to merge
        let merged: string;
        try {
          await this.audit?.writePromptScope(this.id, llm.name, [note.path, otherPath], "merge draft");
          merged = await llm.complete(
            `Merge these two notes into one cohesive note. Preserve all unique information. Return only the merged markdown, no explanation.\n\n## Note 1: ${note.title}\n\n${bodyA}\n\n## Note 2: ${other.title}\n\n${bodyB}`,
            { maxTokens: 2000, temperature: 0.3 }
          );
        } catch {
          continue;
        }

        const diff = buildDiff(bodyA, merged);
        const confidence = Math.min(0.9, score);

        findings.push({
          taskId: this.id,
          confidence,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "merge-notes",
            operation: "replace-file",
            targetPath: note.path,
            secondaryPath: otherPath,
            title: `Merge draft: "${note.title}" + "${other.title}"`,
            rationale: `LLM drafted a merged version combining both notes (similarity ${Math.round(score * 100)}%). Review the diff, then approve to replace "${note.title}" with the merged content.`,
            diff,
            before: bodyA,
            after: merged,
            confidence,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }
}
