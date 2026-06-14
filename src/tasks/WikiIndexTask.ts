import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { WikiCfg } from "./WikiSourceSummaryTask";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";

const WIKI_TYPES = ["concept", "person", "claim", "model", "question", "source", "connection", "analysis"];

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function typeFromPath(path: string, sourcesFolder: string, conceptsFolder: string): string {
  if (sourcesFolder && path.startsWith(`${sourcesFolder}/`)) return "source";
  if (conceptsFolder && path.startsWith(`${conceptsFolder}/`)) return "concept";
  const segment = path.split("/").slice(-2, -1)[0] ?? "";
  return WIKI_TYPES.find((t) => segment.includes(t)) ?? "note";
}

function oneLineSummary(content: string): string {
  // Extract the first non-frontmatter, non-heading, non-empty line
  const body = content.replace(/^---[\s\S]*?---/, "").trim();
  return body.split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 10 && !l.startsWith("-") && !l.startsWith("|")) ?? "";
}

function buildIndexContent(wikiNotes: NoteEntry[], noteContents: Map<string, string>, sourcesFolder: string, conceptsFolder: string): string {
  const byType = new Map<string, NoteEntry[]>();
  for (const note of wikiNotes) {
    const type = typeFromPath(note.path, sourcesFolder, conceptsFolder);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(note);
  }

  const lines: string[] = [
    "# Wiki Index",
    "",
    `> Auto-maintained by Gardener. Last updated: ${today()}. Do not edit manually — run a Gardener scan to refresh.`,
    "",
    `**${wikiNotes.length} pages** across ${byType.size} types.`,
    "",
  ];

  const typeOrder = ["concept", "person", "model", "claim", "question", "source", "connection", "analysis", "note"];
  for (const type of typeOrder) {
    const notes = byType.get(type);
    if (!notes || notes.length === 0) continue;
    const heading = type.charAt(0).toUpperCase() + type.slice(1) + "s";
    lines.push(`## ${heading}`, "");
    for (const note of notes.sort((a, b) => a.title.localeCompare(b.title))) {
      const content = noteContents.get(note.path) ?? "";
      const summary = oneLineSummary(content);
      lines.push(`- [[${note.path.replace(/\.md$/, "")}|${note.title}]]${summary ? ` — ${summary}` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildLogEntry(wikiNotes: NoteEntry[], sourcesFolder: string, conceptsFolder: string): string {
  const sources = wikiNotes.filter((n) => sourcesFolder && n.path.startsWith(`${sourcesFolder}/`)).length;
  const concepts = wikiNotes.filter((n) => conceptsFolder && n.path.startsWith(`${conceptsFolder}/`)).length;
  return [
    `## [${today()}] scan | Gardener wiki maintenance`,
    `Pages in wiki: ${wikiNotes.length} total — ${sources} sources, ${concepts} concepts`,
    "",
  ].join("\n");
}

export class WikiIndexTask implements Task {
  readonly id = "wiki-index";

  constructor(private app: App, private wikiCfg: WikiCfg | null = null) {}

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    const cfg = this.wikiCfg;
    const wikiWriter = cfg ? cfg.enabled : schema.wikiMemory.wikiWriter;
    const sourcesFolder = cfg ? cfg.sourcesFolder : schema.wikiMemory.sourcesFolder;
    const conceptsFolder = cfg ? cfg.conceptsFolder : schema.wikiMemory.conceptsFolder;
    const indexFile = cfg ? cfg.indexFile : schema.wikiMemory.indexFile;
    const logFile = cfg ? cfg.logFile : schema.wikiMemory.logFile;

    if (!wikiWriter) return [];

    const wikiRoot = conceptsFolder ? conceptsFolder.split("/")[0] : "wiki";

    const wikiNotes = [...index.notes.values()]
      .filter((note) => note.path.startsWith(`${wikiRoot}/`))
      .filter((note) => note.path !== indexFile && note.path !== logFile);

    if (wikiNotes.length === 0) return [];

    const findings: Finding[] = [];

    // Read wiki page content for summaries
    const noteContents = new Map<string, string>();
    for (const note of wikiNotes) {
      const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
      if (file) {
        try { noteContents.set(note.path, await this.app.vault.cachedRead(file)); } catch { /* skip */ }
      }
    }

    // Update wiki/index.md
    if (indexFile) {
      const indexPath = indexFile;
      const existingFile = this.app.vault.getAbstractFileByPath(indexPath) as TFile | null;
      const before = existingFile ? (await this.app.vault.cachedRead(existingFile).catch(() => "")) : "";
      const after = buildIndexContent(wikiNotes, noteContents, sourcesFolder, conceptsFolder) + "\n";

      if (after !== before) {
        findings.push({
          taskId: this.id,
          confidence: 0.95,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "add-content",
            operation: "replace-file",
            targetPath: indexPath,
            title: `Refresh wiki index (${wikiNotes.length} pages)`,
            rationale: "Wiki index is out of date. Regenerated from current wiki page structure.",
            diff: buildDiff(before, after),
            before,
            after,
            confidence: 0.95,
            createdAt: Date.now(),
          },
        });
      }
    }

    // Append to wiki/log.md
    if (logFile) {
      const logPath = logFile;
      const existingFile = this.app.vault.getAbstractFileByPath(logPath) as TFile | null;
      const before = existingFile ? (await this.app.vault.cachedRead(existingFile).catch(() => "")) : "";
      const entry = buildLogEntry(wikiNotes, sourcesFolder, conceptsFolder);
      // Only append if no entry today already
      if (!before.includes(`[${today()}]`)) {
        const after = before + (before.endsWith("\n\n") ? "" : "\n") + entry;
        findings.push({
          taskId: this.id,
          confidence: 0.95,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "add-content",
            operation: "replace-file",
            targetPath: logPath,
            title: `Append scan entry to wiki log`,
            rationale: `No log entry for ${today()} yet. Appending Gardener scan summary.`,
            diff: buildDiff(before, after),
            before,
            after,
            confidence: 0.95,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }
}
