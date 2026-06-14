import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { ErrorBook } from "../memory/ErrorBook";
import { newProposalId } from "../changeset/ChangeProposal";
import { getContradictoryClaimPairs } from "../memory/WikiMemoryGraph";

export class ClaimConsistencyBufferTask implements Task {
  readonly id = "claim-consistency-buffer";

  constructor(private memory: MemoryRef, private errorBook: ErrorBook) {}

  async run(_index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled || !schema.wikiMemory.contradictionBuffer) return [];

    const findings: Finding[] = [];
    const seen = new Set<string>();

    for (const pair of getContradictoryClaimPairs(this.memory.graph)) {
        const pathA = pair.a.provenance[0]?.path;
        const pathB = pair.b.provenance[0]?.path;
        if (!pathA || !pathB) continue;
        if (seen.has(pair.id)) continue;
        seen.add(pair.id);
        const proposal = {
          id: newProposalId(),
          taskId: this.id,
          type: "flag-contradiction" as const,
          operation: "advisory" as const,
          targetPath: pathA,
          secondaryPath: pathB,
          title: `Possible claim conflict between "${shortTitle(pathA)}" and "${shortTitle(pathB)}"`,
          rationale:
            `Claim A: "${pair.a.provenance[0].snippet}"\n` +
            `Claim B: "${pair.b.provenance[0].snippet}"`,
          diff: [],
          before: "",
          after: "",
          confidence: pair.score,
          createdAt: Date.now(),
        };
        if (!this.errorBook.shouldSuppress(proposal)) {
          findings.push({ taskId: this.id, confidence: proposal.confidence, proposal });
        }
    }

    return findings.slice(0, 15);
  }
}

function shortTitle(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}
