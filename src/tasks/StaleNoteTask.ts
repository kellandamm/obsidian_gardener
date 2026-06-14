import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId } from "../changeset/ChangeProposal";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export class StaleNoteTask implements Task {
  readonly id = "stale-notes";

  async run(index: VaultIndex, _schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    const cutoff = Date.now() - SIX_MONTHS_MS;
    const findings: Finding[] = [];

    for (const note of index.notes.values()) {
      if (note.mtime > cutoff) continue;

      const backlinks = index.backlinks.get(note.path);
      const backlinkCount = backlinks?.size ?? 0;

      // Stale = untouched for 6+ months AND has at least one backlink
      // (zero backlinks = orphan, handled by OrphanTask)
      if (backlinkCount === 0) continue;

      const monthsOld = Math.floor((Date.now() - note.mtime) / (30 * 24 * 60 * 60 * 1000));

      findings.push({
        taskId: this.id,
        confidence: 0.65,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "flag-stub",
          operation: "advisory",
          targetPath: note.path,
          title: `Stale note: "${note.title}" (${monthsOld}mo untouched)`,
          rationale:
            `This note hasn't been edited in ${monthsOld} months but is still linked from ` +
            `${backlinkCount} other note${backlinkCount !== 1 ? "s" : ""}. ` +
            `Consider reviewing, updating, or archiving it.`,
          diff: [],
          before: "",
          after: "",
          confidence: 0.65,
          createdAt: Date.now(),
        },
      });
    }

    // Sort oldest first
    findings.sort((a, b) => {
      const aNote = index.notes.get(a.proposal.targetPath);
      const bNote = index.notes.get(b.proposal.targetPath);
      return (aNote?.mtime ?? 0) - (bNote?.mtime ?? 0);
    });

    return findings;
  }
}
