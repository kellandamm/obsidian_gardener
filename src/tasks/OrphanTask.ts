import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { getOrphans } from "../index/VaultIndex";
import { newProposalId } from "../changeset/ChangeProposal";

export class OrphanTask implements Task {
  readonly id = "orphan-triage";

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.tasks.orphanTriage.enabled) return [];

    const orphans = getOrphans(index);
    return orphans.map((note) => ({
      taskId: this.id,
      confidence: 0.8,
      proposal: {
        id: newProposalId(),
        taskId: this.id,
        type: "flag-orphan" as const,
        operation: "advisory",
        targetPath: note.path,
        title: `Orphan note: "${note.title}"`,
        rationale: `This note has no backlinks. Consider linking it from an index or home note.`,
        diff: [],
        before: "",
        after: "",
        confidence: 0.8,
        createdAt: Date.now(),
      },
    }));
  }
}
