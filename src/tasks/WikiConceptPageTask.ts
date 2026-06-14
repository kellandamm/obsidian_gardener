import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import type { MemoryReviewStore } from "../memory/MemoryReviewStore";
import type { WikiCfg } from "./WikiSourceSummaryTask";
import { getClaimsForConcept } from "../memory/WikiMemoryGraph";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import { yieldEvery } from "../utils/cooperative";

const MAX_PER_RUN = 8;

const CREATE_PROMPT = `You are a knowledge base maintainer. Write a concept wiki page for the topic below.

Return ONLY the markdown content (no code fences). Use this exact format:

---
title: {CONCEPT}
type: concept
created: {DATE}
updated: {DATE}
sources: [{SOURCES}]
confidence: medium
tags: [concept]
---

One sentence definition of this concept.

## What it is

(2-3 paragraphs explaining the concept clearly. Be precise, not fluffy.)

## Why it matters

(1-2 paragraphs on significance or implications.)

## Key claims

{CLAIMS}

## Open questions

- (1-3 things still uncertain or worth investigating about this concept)

## Related pages

(leave blank — links will be added as the wiki grows)

---

Concept: {CONCEPT}
Claims extracted from vault notes:
{CLAIMS}
Source notes: {SOURCES}`;

const UPDATE_PROMPT = `You are a knowledge base maintainer. Update an existing concept wiki page with new information.

Existing page:
{EXISTING}

New claims to integrate:
{NEW_CLAIMS}

Return the COMPLETE updated markdown page (same format, no code fences).
- Integrate new claims into the relevant sections
- Update confidence level if warranted
- Update the "updated" frontmatter date to {DATE}
- Do not remove existing content unless it is directly contradicted
- Keep the same structure`;

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export class WikiConceptPageTask implements Task {
  readonly id = "wiki-concept-page";

  constructor(
    private app: App,
    private memory: MemoryRef,
    private reviewStore: MemoryReviewStore,
    private wikiCfg: WikiCfg | null = null,
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]> {
    const cfg = this.wikiCfg;
    const wikiWriter = cfg ? cfg.enabled : schema.wikiMemory.wikiWriter;
    const conceptsFolder = cfg ? cfg.conceptsFolder : schema.wikiMemory.conceptsFolder;
    const minClaims = cfg ? cfg.conceptMinClaims : (schema.wikiMemory.conceptPageMinClaims ?? 3);

    if (!wikiWriter) return [];
    if (!conceptsFolder) return [];
    if (!(await llm.isAvailable())) return [];
    const graph = this.memory.graph;

    const concepts = graph.nodes
      .filter((n) => n.type === "concept")
      .map((concept) => {
        const claims = getClaimsForConcept(graph, concept.id);
        const accepted = claims.filter((c) => this.reviewStore.getStatus(c.id) === "accepted");
        return { concept, claims, accepted };
      })
      .filter(({ claims }) => claims.length >= minClaims)
      .sort((a, b) => b.accepted.length - a.accepted.length)
      .slice(0, MAX_PER_RUN);

    const findings: Finding[] = [];
    let count = 0;

    for (const { concept, claims } of concepts) {
      const targetPath = `${conceptsFolder}/${slug(concept.label)}.md`;
      const existingFile = this.app.vault.getAbstractFileByPath(targetPath) as TFile | null;

      const claimBullets = claims.slice(0, 10)
        .map((c) => `- ${this.reviewStore.getEditedLabel(c.id) ?? c.label} (${c.provenance[0]?.path ?? "unknown"})`)
        .join("\n");

      const sources = [...new Set(concept.provenance.map((p) => p.path.split("/").pop() ?? p.path))].slice(0, 5).join(", ");
      const date = today();

      let before = "";
      let prompt: string;

      if (existingFile) {
        try {
          before = await this.app.vault.cachedRead(existingFile);
        } catch { continue; }

        // Skip if recently updated (within 7 days) and no accepted claims
        const acceptedNew = claims
          .filter((c) => this.reviewStore.getStatus(c.id) === "accepted")
          .filter((c) => !before.includes(c.label.slice(0, 40)));
        if (acceptedNew.length === 0) continue;

        prompt = UPDATE_PROMPT
          .replace("{EXISTING}", before.slice(0, 4000))
          .replace(/{NEW_CLAIMS}/g, acceptedNew.slice(0, 5).map((c) => `- ${c.label}`).join("\n"))
          .replace("{DATE}", date);
      } else {
        prompt = CREATE_PROMPT
          .replace(/{CONCEPT}/g, concept.label)
          .replace(/{DATE}/g, date)
          .replace(/{SOURCES}/g, sources)
          .replace(/{CLAIMS}/g, claimBullets);
      }

      let raw: string;
      try {
        raw = await llm.complete(prompt, { maxTokens: 1200, temperature: 0.1 });
      } catch { continue; }

      if (!raw.trim()) continue;

      const after = raw.trim() + "\n";
      if (after === before) continue;

      const isCreate = !existingFile;

      findings.push({
        taskId: this.id,
        confidence: isCreate ? 0.8 : 0.88,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "add-content",
          operation: "replace-file",
          targetPath,
          title: isCreate
            ? `Create concept page: "${concept.label}"`
            : `Update concept page: "${concept.label}"`,
          rationale: isCreate
            ? `Concept appears in ${claims.length} extracted claims across the vault. Enough evidence to draft a concept page.`
            : `New accepted claims found for "${concept.label}" not yet reflected in the existing concept page.`,
          diff: buildDiff(before, after),
          before,
          after,
          confidence: isCreate ? 0.8 : 0.88,
          createdAt: Date.now(),
        },
      });

      await yieldEvery(++count, 3);
    }

    return findings;
  }
}
