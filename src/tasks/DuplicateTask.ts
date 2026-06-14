import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { findSimilarByTitle } from "../index/VaultIndex";
import { TFIDFEngine } from "../embeddings/TFIDFEngine";
import { newProposalId } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

/**
 * Detects near-duplicate notes using both Jaccard title similarity and TF-IDF
 * cosine similarity on index metadata (title + headings + tags). The LLM is
 * used to confirm ambiguous pairs when available.
 */
export class DuplicateTask implements Task {
  readonly id = "merge-duplicates";

  async run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]> {
    if (!schema.tasks.mergeDuplicates.enabled) return [];

    const threshold = schema.tasks.mergeDuplicates.minSimilarity;
    const findings: Finding[] = [];
    const seen = new Set<string>();

    // Build TF-IDF on metadata (no file I/O — uses already-indexed headings+tags+title)
    const engine = new TFIDFEngine();
    engine.build(
      [...index.notes.values()].map((note) => ({
        path: note.path,
        text: isTaskEnabledForPath(schema, note.path, this.id) ? [note.title, ...note.headings, ...note.tags].join(" ") : "",
      }))
    );

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      const titleCandidates = findSimilarByTitle(index, note.path, threshold);
      const semanticCandidates = engine.findSimilar(note.path, threshold);

      // Merge both lists, keep highest score per pair
      const candidateMap = new Map<string, number>();
      for (const { path, score } of titleCandidates) candidateMap.set(path, score);
      for (const { path, score } of semanticCandidates) {
        const existing = candidateMap.get(path) ?? 0;
        candidateMap.set(path, Math.max(existing, score));
      }

      for (const [otherPath, score] of candidateMap) {
        const pairKey = [note.path, otherPath].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const other = index.notes.get(otherPath);
        if (!other) continue;
        if (!isTaskEnabledForPath(schema, otherPath, this.id)) continue;

        let confirmed = true;
        if (await llm.isAvailable()) {
          const verdict = await llm.complete(
            `Are these two note titles about the same topic?\n1. "${note.title}"\n2. "${other.title}"\nReply with YES or NO only.`,
            { maxTokens: 5, temperature: 0 }
          );
          confirmed = verdict.trim().toUpperCase().startsWith("YES");
        }
        if (!confirmed) continue;

        findings.push({
          taskId: this.id,
          confidence: score,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "merge-notes",
            operation: "advisory",
            targetPath: note.path,
            secondaryPath: otherPath,
            title: `Possible duplicate: "${note.title}" ↔ "${other.title}"`,
            rationale: `Similarity ${Math.round(score * 100)}% (title + heading + tag overlap). These may cover the same topic.`,
            diff: [],
            before: "",
            after: "",
            confidence: score,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }
}
