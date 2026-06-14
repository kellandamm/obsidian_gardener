import type { App, TFile } from "obsidian";
import { minimatch } from "minimatch";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";
import { isTaskEnabledForPath } from "../schema/folderRules";

const FM_KEY_RE = /^([a-zA-Z0-9_-]+)\s*:/gm;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/**
 * Enforces folder→template mappings defined in GARDENER.md ## Templates.
 * For each note in a mapped folder, checks it has all the template's frontmatter
 * keys and proposes an updated frontmatter block if any are missing.
 */
export class TemplateLintTask implements Task {
  readonly id = "template-lint";

  constructor(private app: App) {}

  async run(
    index: VaultIndex,
    schema: GardenerSchema,
    _llm: LLMProvider
  ): Promise<Finding[]> {
    if (Object.keys(schema.templateMap).length === 0) return [];

    // Read required keys from each template file
    const templateKeys = new Map<string, string[]>();
    for (const tplPath of Object.values(schema.templateMap)) {
      if (templateKeys.has(tplPath)) continue;
      try {
        const file = this.app.vault.getAbstractFileByPath(tplPath) as TFile | null;
        if (!file) continue;
        const content = await this.app.vault.cachedRead(file);
        const fmMatch = FRONTMATTER_RE.exec(content);
        const keys: string[] = [];
        if (fmMatch) {
          FM_KEY_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = FM_KEY_RE.exec(fmMatch[1])) !== null) keys.push(m[1]);
        }
        templateKeys.set(tplPath, keys);
      } catch {
        // template unreadable — skip
      }
    }

    const findings: Finding[] = [];

    for (const note of index.notes.values()) {
      if (!isTaskEnabledForPath(schema, note.path, this.id)) continue;
      // Find the first matching glob for this note
      let matchedTpl: string | null = null;
      for (const [glob, tplPath] of Object.entries(schema.templateMap)) {
        if (minimatch(note.path, glob, { dot: true })) {
          matchedTpl = tplPath;
          break;
        }
      }
      if (!matchedTpl) continue;

      const requiredKeys = templateKeys.get(matchedTpl);
      if (!requiredKeys || requiredKeys.length === 0) continue;

      const missingKeys = requiredKeys.filter((k) => !note.frontmatterKeys.includes(k));
      if (missingKeys.length === 0) continue;

      // Read current content to build proposed fix
      let content = "";
      try {
        const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
        if (!file) continue;
        content = await this.app.vault.cachedRead(file);
      } catch {
        continue;
      }

      const fmMatch = FRONTMATTER_RE.exec(content);
      let after: string;
      if (fmMatch) {
        // Insert missing keys before closing ---
        const newKeys = missingKeys.map((k) => `${k}: `).join("\n");
        after =
          content.slice(0, fmMatch.index + fmMatch[0].length - 3) +
          newKeys + "\n---" +
          content.slice(fmMatch.index + fmMatch[0].length);
      } else {
        // No frontmatter — prepend it
        const newFm = "---\n" + missingKeys.map((k) => `${k}: `).join("\n") + "\n---\n\n";
        after = newFm + content;
      }

      const confidence = 0.85;
      findings.push({
        taskId: this.id,
        confidence,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "add-frontmatter",
          operation: "replace-file",
          targetPath: note.path,
          title: `Missing frontmatter in "${note.title}"`,
          rationale: `Template "${matchedTpl}" requires: ${missingKeys.map((k) => `\`${k}\``).join(", ")}. This note matches the folder pattern "${Object.keys(schema.templateMap).find((g) => schema.templateMap[g] === matchedTpl)}" but is missing these keys.`,
          diff: buildDiff(content, after),
          before: content,
          after,
          confidence,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }
}
