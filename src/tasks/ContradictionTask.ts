import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId } from "../changeset/ChangeProposal";

const MAX_CLUSTER_SIZE = 8;  // skip clusters larger than this (too expensive)
const MAX_PAIRS = 15;        // cap total LLM calls per run

/**
 * Groups notes by shared tags, then checks pairs within each cluster for
 * contradictory claims using the LLM. Expensive: capped at MAX_PAIRS calls.
 */
export class ContradictionTask implements Task {
  readonly id = "contradiction-detection";

  constructor(private app: App) {}

  async run(
    index: VaultIndex,
    schema: GardenerSchema,
    llm: LLMProvider
  ): Promise<Finding[]> {
    if (!(await llm.isAvailable())) return [];

    // Cluster notes by shared tags
    const tagClusters = new Map<string, string[]>();
    for (const [path, note] of index.notes) {
      for (const tag of note.tags) {
        if (!tagClusters.has(tag)) tagClusters.set(tag, []);
        tagClusters.get(tag)!.push(path);
      }
    }

    // Collect unique pairs from small clusters
    const seen = new Set<string>();
    const pairs: Array<[string, string]> = [];

    for (const cluster of tagClusters.values()) {
      if (cluster.length < 2 || cluster.length > MAX_CLUSTER_SIZE) continue;
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          const key = [cluster[i], cluster[j]].sort().join("|");
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push([cluster[i], cluster[j]]);
          }
        }
      }
    }

    const cappedPairs = pairs.slice(0, MAX_PAIRS);
    const findings: Finding[] = [];

    for (const [pathA, pathB] of cappedPairs) {
      const noteA = index.notes.get(pathA);
      const noteB = index.notes.get(pathB);
      if (!noteA || !noteB) continue;

      let bodyA = "", bodyB = "";
      try {
        const fileA = this.app.vault.getAbstractFileByPath(pathA) as TFile | null;
        const fileB = this.app.vault.getAbstractFileByPath(pathB) as TFile | null;
        if (!fileA || !fileB) continue;
        bodyA = await this.app.vault.cachedRead(fileA);
        bodyB = await this.app.vault.cachedRead(fileB);
      } catch {
        continue;
      }

      // Truncate to first 1000 chars to stay within context limits
      const snippetA = bodyA.slice(0, 1000);
      const snippetB = bodyB.slice(0, 1000);

      let response: string;
      try {
        response = await llm.complete(
          `Do these two notes make contradictory factual claims? Reply with YES or NO on the first line, then one sentence explaining why.\n\n## Note 1: ${noteA.title}\n${snippetA}\n\n## Note 2: ${noteB.title}\n${snippetB}`,
          { maxTokens: 120, temperature: 0 }
        );
      } catch {
        continue;
      }

      const firstLine = response.split("\n")[0].trim().toUpperCase();
      if (!firstLine.startsWith("YES")) continue;

      const explanation = response.split("\n").slice(1).join(" ").trim();
      const confidence = 0.7;

      findings.push({
        taskId: this.id,
        confidence,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "flag-contradiction",
          operation: "advisory",
          targetPath: pathA,
          secondaryPath: pathB,
          title: `Possible contradiction: "${noteA.title}" vs "${noteB.title}"`,
          rationale: explanation || "LLM detected conflicting claims between these notes.",
          diff: [],
          before: "",
          after: "",
          confidence,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }
}
