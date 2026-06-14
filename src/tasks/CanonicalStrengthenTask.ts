import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { MemoryReviewStore } from "../memory/MemoryReviewStore";
import type { CanonicalPageRegistry } from "../memory/CanonicalPageRegistry";
import type { ErrorBook } from "../memory/ErrorBook";
import { buildDiff, newProposalId } from "../changeset/ChangeProposal";
import { getClaimsForConcept } from "../memory/WikiMemoryGraph";

export class CanonicalStrengthenTask implements Task {
  readonly id = "canonical-strengthen";

  constructor(
    private app: App,
    private memory: MemoryRef,
    private reviewStore: MemoryReviewStore,
    private canonicalRegistry: CanonicalPageRegistry,
    private errorBook: ErrorBook
  ) {}

  async run(_index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled) return [];

    const findings: Finding[] = [];
    for (const entry of this.canonicalRegistry.getData().entries) {
      const file = this.app.vault.getAbstractFileByPath(entry.path) as TFile | null;
      if (!file) continue;
      const before = await this.app.vault.cachedRead(file);
      const concept = this.memory.graph.nodes.find((node) => node.id === entry.conceptId);
      if (!concept) continue;
      const acceptedClaims = getClaimsForConcept(this.memory.graph, concept.id)
        .filter((claim) => this.reviewStore.getStatus(claim.id) === "accepted");
      const after = strengthenCanonicalPage(
        before,
        concept.provenance.map((prov) => prov.path),
        acceptedClaims,
        (claimId) => this.reviewStore.getEditedLabel(claimId)
      );
      if (after === before) continue;
      const proposal = {
        id: newProposalId(),
        taskId: this.id,
        type: "add-content" as const,
        operation: "replace-file" as const,
        targetPath: entry.path,
        title: `Strengthen canonical page "${entry.conceptLabel}"`,
        rationale: "Adds missing accepted claims and source provenance to the canonical wiki page.",
        diff: buildDiff(before, after),
        before,
        after,
        confidence: 0.76,
        createdAt: Date.now(),
      };
      if (!this.errorBook.shouldSuppress(proposal)) {
        findings.push({ taskId: this.id, confidence: proposal.confidence, proposal });
      }
    }
    return findings;
  }
}

function strengthenCanonicalPage(
  content: string,
  sourcePaths: string[],
  claims: ReturnType<typeof getClaimsForConcept>,
  getEditedLabel: (claimId: string) => string | null
): string {
  let next = content;
  if (!/^## Source Provenance$/im.test(next)) {
    next = `${next.trimEnd()}\n\n## Source Provenance\n${unique(sourcePaths).map((path) => `- [[${path.replace(/\.md$/, "")}]]`).join("\n")}\n`;
  }
  if (!/^## Claims$/im.test(next) && claims.length > 0) {
    next = `${next.trimEnd()}\n\n## Claims\n${claims.slice(0, 10).map((claim) => renderClaimReceipt(claim, getEditedLabel)).join("\n")}\n`;
  }
  if (!/^## See also$/im.test(next)) {
    next = `${next.trimEnd()}\n\n## See also\n`;
  }
  return next;
}

function renderClaimReceipt(
  claim: ReturnType<typeof getClaimsForConcept>[number],
  getEditedLabel: (claimId: string) => string | null
): string {
  const prov = claim.provenance[0];
  const source = prov ? ` ^[${prov.path.replace(/\.md$/, "")}${prov.heading ? ` > ${prov.heading}` : ""}]` : "";
  return `- ${getEditedLabel(claim.id) ?? claim.label}${source}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
