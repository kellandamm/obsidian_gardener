import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { getBrokenLinks } from "../index/VaultIndex";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";

export class BrokenLinkTask implements Task {
  readonly id = "broken-links";

  constructor(private app: App) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.tasks.brokenLinks.enabled) return [];

    const broken = getBrokenLinks(index);
    const findings: Finding[] = [];

    for (const { source, target } of broken) {
      const sourceEntry = index.notes.get(source);
      if (!sourceEntry) continue;

      const bare = target.replace(/\.md$/, "");
      const linkPattern = new RegExp(`\\[\\[${escapeRegex(bare)}(?:[|#][^\\]]*)?\\]\\]`, "g");
      const file = this.app.vault.getAbstractFileByPath(source) as TFile | null;
      if (!file) continue;
      const before = await this.app.vault.cachedRead(file);
      const after = before.replace(linkPattern, bare);
      if (after === before) continue;

      findings.push({
        taskId: this.id,
        confidence: 0.95,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "delete-link",
          operation: "replace-file",
          targetPath: source,
          title: `Remove broken link to "${bare}"`,
          rationale: `[[${bare}]] points to a note that doesn't exist.`,
          diff: buildDiff(`... [[${bare}]] ...`, `... ${bare} ...`),
          before,
          after,
          confidence: 0.95,
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
