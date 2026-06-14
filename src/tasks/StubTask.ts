import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

export class StubTask implements Task {
  readonly id = "stub-flagging";

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.tasks.stubFlagging.enabled) return [];

    const minWords = schema.tasks.stubFlagging.minWords;
    const findings: Finding[] = [];

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      if (note.wordCount < minWords && note.wordCount > 0) {
        findings.push({
          taskId: this.id,
          confidence: 0.9,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "flag-stub",
            operation: "advisory",
            targetPath: note.path,
            title: `Stub note: "${note.title}" (${note.wordCount} words)`,
            rationale: `This note has fewer than ${minWords} words and may need expanding.`,
            diff: [],
            before: "",
            after: "",
            confidence: 0.9,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }
}
