import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

const MIN_WORDS = 800;
const MIN_HEADINGS = 3; // at least 3 H2+ sections to be worth splitting

export class NoteSplitTask implements Task {
  readonly id = "note-split";

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      if (note.wordCount < MIN_WORDS) continue;
      if (note.headings.length < MIN_HEADINGS) continue;

      const headingList = note.headings.slice(0, 6).map((h) => `  • ${h}`).join("\n");
      const extraCount = note.headings.length > 6 ? ` (+${note.headings.length - 6} more)` : "";

      findings.push({
        taskId: this.id,
        confidence: 0.7,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "flag-stub", // reuse flag type — no direct file mutation
          operation: "advisory",
          targetPath: note.path,
          title: `Long note may need splitting: "${note.title}"`,
          rationale:
            `${note.wordCount} words across ${note.headings.length} sections${extraCount}. ` +
            `Consider splitting into separate notes:\n${headingList}`,
          diff: [],
          before: "",
          after: "",
          confidence: 0.7,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }
}
