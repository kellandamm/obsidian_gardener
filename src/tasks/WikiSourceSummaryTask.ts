import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import { yieldEvery } from "../utils/cooperative";

export interface WikiCfg {
  enabled: boolean;
  sourcesFolder: string;
  conceptsFolder: string;
  indexFile: string;
  logFile: string;
  excludedFolders: string[];
  conceptMinClaims: number;
}

const MAX_SOURCE_CHARS = 6000;
const MAX_PER_RUN = 10;

const SUMMARY_PROMPT = `You are a knowledge base maintainer. Summarise this source document into a structured wiki page.

Return ONLY the markdown content (no code fences). Use this exact format:

---
title: {TITLE}
type: source
created: {DATE}
updated: {DATE}
sources: [{FILENAME}]
tags: [source]
---

One sentence describing what this source is and its main argument or finding.

## Key Ideas

- (3-7 bullet points — the most important ideas, each a complete sentence)

## Notable Claims

- (2-5 specific factual assertions worth tracking, each a complete sentence)

## Quotes

> (1-3 direct quotes worth preserving, if present)

## Related pages

(leave blank — links will be added as the wiki grows)

---

Source title: {TITLE}
Source content:
{CONTENT}`;

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function alreadySummarised(sourcesFolder: string, filename: string, index: VaultIndex): boolean {
  const expectedPath = `${sourcesFolder}/${slug(filename.replace(/\.md$/, ""))}.md`;
  return index.notes.has(expectedPath);
}

export class WikiSourceSummaryTask implements Task {
  readonly id = "wiki-source-summary";

  constructor(private app: App, private wikiCfg: WikiCfg | null = null) {}

  async run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]> {
    const cfg = this.wikiCfg;
    const wikiWriter = cfg ? cfg.enabled : schema.wikiMemory.wikiWriter;
    const sourcesFolder = cfg ? cfg.sourcesFolder : schema.wikiMemory.sourcesFolder;
    const conceptsFolder = cfg ? cfg.conceptsFolder : schema.wikiMemory.conceptsFolder;
    const indexFile = cfg ? cfg.indexFile : schema.wikiMemory.indexFile;
    const logFile = cfg ? cfg.logFile : schema.wikiMemory.logFile;

    if (!wikiWriter) return [];
    if (!sourcesFolder) return [];
    if (!(await llm.isAvailable())) return [];

    // Build set of folders to exclude (wiki output folders + user exclusions)
    const wikiRoot = conceptsFolder ? conceptsFolder.split("/")[0] : "wiki";
    const configDir = this.app.vault.configDir;
    const alwaysExclude = [wikiRoot, configDir, ".gardener"];
    const userExclude = cfg ? cfg.excludedFolders : (schema.wikiMemory.rawFolders.length > 0 ? [] : []);
    const excludedFolders = [...new Set([...alwaysExclude, ...userExclude])];

    // Also exclude the index/log files themselves
    const protectedPaths = new Set([indexFile, logFile].filter(Boolean));

    // Scan entire vault minus excluded folders
    const candidates = [...index.notes.values()]
      .filter((note) => !excludedFolders.some((f) => note.path.startsWith(`${f}/`)))
      .filter((note) => !protectedPaths.has(note.path))
      .filter((note) => !alreadySummarised(sourcesFolder, note.path.split("/").pop() ?? note.title, index))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, MAX_PER_RUN);

    const findings: Finding[] = [];
    let count = 0;

    for (const note of candidates) {
      const file = this.app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) continue;

      let content: string;
      try {
        content = await this.app.vault.cachedRead(file);
      } catch { continue; }

      const stripped = content.replace(/^---[\s\S]*?---/, "").trim();
      const truncated = stripped.slice(0, MAX_SOURCE_CHARS);
      const filename = note.path.split("/").pop() ?? note.title;
      const date = today();

      const prompt = SUMMARY_PROMPT
        .replace(/{TITLE}/g, note.title)
        .replace(/{DATE}/g, date)
        .replace(/{FILENAME}/g, filename)
        .replace("{CONTENT}", truncated);

      let raw: string;
      try {
        raw = await llm.complete(prompt, { maxTokens: 1000, temperature: 0 });
      } catch { continue; }

      if (!raw.trim()) continue;

      const targetPath = `${sourcesFolder}/${slug(filename.replace(/\.md$/, ""))}.md`;
      const before = "";
      const after = raw.trim() + "\n";

      findings.push({
        taskId: this.id,
        confidence: 0.85,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "add-content",
          operation: "replace-file",
          targetPath,
          title: `Create source summary: "${note.title}"`,
          rationale: `Source at ${note.path} has not been summarised yet. LLM extracted key ideas, claims, and quotes.`,
          diff: buildDiff(before, after),
          before,
          after,
          confidence: 0.85,
          createdAt: Date.now(),
        },
      });

      await yieldEvery(++count, 3);
    }

    return findings;
  }
}
