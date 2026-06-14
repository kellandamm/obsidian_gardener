import type { App } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { TFIDFEngine } from "../embeddings/TFIDFEngine";
import { newProposalId } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

/**
 * Finds semantically similar notes using TF-IDF cosine similarity on full note
 * bodies. More accurate than Jaccard title similarity for notes with different
 * titles but overlapping content.
 */
export class SemanticSearchTask implements Task {
  readonly id = "semantic-search";

  constructor(private app: App) {}

  async run(
    index: VaultIndex,
    schema: GardenerSchema,
    _llm: LLMProvider
  ): Promise<Finding[]> {
    if (!schema.tasks.mergeDuplicates.enabled) return [];

    // Use a slightly lower threshold than title-similarity to catch content overlaps
    const threshold = Math.max(0.75, schema.tasks.mergeDuplicates.minSimilarity * 0.9);
    const files = this.app.vault.getMarkdownFiles();

    const docs: Array<{ path: string; text: string }> = [];
    for (const file of files) {
      if (!index.notes.has(file.path)) continue;
      if (!isTaskEnabledForPath(schema, file.path, this.id)) continue;
      try {
        const content = await this.app.vault.cachedRead(file);
        docs.push({ path: file.path, text: content });
      } catch {
        // skip unreadable files
      }
    }

    const engine = new TFIDFEngine();
    engine.build(docs);

    const findings: Finding[] = [];
    const seen = new Set<string>();

    for (const { path } of docs) {
      const similar = engine.findSimilar(path, threshold);
      for (const { path: otherPath, score } of similar) {
        const pairKey = [path, otherPath].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const note = index.notes.get(path);
        const other = index.notes.get(otherPath);
        if (!note || !other) continue;
        if (!isTaskEnabledForPath(schema, otherPath, this.id)) continue;

        const confidence = Math.round(score * 85) / 100;
        findings.push({
          taskId: this.id,
          confidence,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "merge-notes",
            operation: "advisory",
            targetPath: path,
            secondaryPath: otherPath,
            title: `Semantically similar: "${note.title}" ↔ "${other.title}"`,
            rationale: `Content similarity ${Math.round(score * 100)}% (TF-IDF cosine). These notes may cover overlapping topics even if their titles differ.`,
            diff: [],
            before: "",
            after: "",
            confidence,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }
}
