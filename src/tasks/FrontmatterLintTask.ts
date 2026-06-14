import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex, NoteEntry } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId, buildDiff } from "../changeset/ChangeProposal";

const MIN_GROUP_SIZE = 3;    // need at least 3 notes to infer a type pattern
const MIN_KEY_COVERAGE = 0.7; // a key must appear in 70%+ of a group to be "expected"

interface NoteType {
  representativeKeys: string[];
  members: NoteEntry[];
}

export class FrontmatterLintTask implements Task {
  readonly id = "frontmatter-lint";

  constructor(private app: App) {}

  async run(index: VaultIndex, _schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    const notes = [...index.notes.values()].filter((n) => n.frontmatterKeys.length > 0);
    if (notes.length < MIN_GROUP_SIZE) return [];

    const types = this.inferTypes(notes);
    const findings: Finding[] = [];

    for (const type of types) {
      for (const note of type.members) {
        const noteKeys = new Set(note.frontmatterKeys);
        const missing = type.representativeKeys.filter((k) => !noteKeys.has(k));
        if (missing.length === 0) continue;

        const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
        if (!file) continue;
        const before = await this.app.vault.cachedRead(file);
        const after = addMissingFrontmatterKeys(before, missing);

        findings.push({
          taskId: this.id,
          confidence: 0.8,
          proposal: {
            id: newProposalId(),
            taskId: this.id,
            type: "add-frontmatter",
            operation: "replace-file",
            targetPath: note.path,
            title: `Frontmatter missing fields in "${note.title}"`,
            rationale:
              `Similar notes have: ${missing.map((k) => `\`${k}\``).join(", ")}. ` +
              `Adding these fields keeps your note type consistent.`,
            diff: buildDiff(before, after),
            before,
            after,
            confidence: 0.8,
            createdAt: Date.now(),
          },
        });
      }
    }

    return findings;
  }

  private inferTypes(notes: NoteEntry[]): NoteType[] {
    // Group notes by their "signature" — sorted key set
    const groups = new Map<string, NoteEntry[]>();
    for (const note of notes) {
      // Use the top-level keys (ignore nested) sorted for a stable signature
      const sig = [...note.frontmatterKeys].sort().join(",");
      const group = groups.get(sig) ?? [];
      group.push(note);
      groups.set(sig, group);
    }

    // Also cluster similar signatures (notes sharing ≥50% of keys)
    const types: NoteType[] = [];
    const assigned = new Set<string>();

    for (const [sig, members] of groups) {
      if (assigned.has(sig)) continue;
      if (members.length < MIN_GROUP_SIZE) continue;

      // Collect all related signatures (similar key sets)
      const allMembers = [...members];
      const sigKeys = new Set(sig.split(","));

      for (const [otherSig, otherMembers] of groups) {
        if (otherSig === sig || assigned.has(otherSig)) continue;
        const otherKeys = new Set(otherSig.split(","));
        const overlap = [...sigKeys].filter((k) => otherKeys.has(k)).length;
        const similarity = overlap / Math.max(sigKeys.size, otherKeys.size);
        if (similarity >= 0.5) {
          allMembers.push(...otherMembers);
          assigned.add(otherSig);
        }
      }

      assigned.add(sig);

      if (allMembers.length < MIN_GROUP_SIZE) continue;

      // Count key frequency across all members
      const keyCounts = new Map<string, number>();
      for (const m of allMembers) {
        for (const k of m.frontmatterKeys) {
          keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
        }
      }

      // Keys that appear in ≥70% of notes are "expected" for this type
      const representativeKeys = [...keyCounts.entries()]
        .filter(([, count]) => count / allMembers.length >= MIN_KEY_COVERAGE)
        .map(([k]) => k);

      if (representativeKeys.length > 0) {
        types.push({ representativeKeys, members: allMembers });
      }
    }

    return types;
  }
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

function addMissingFrontmatterKeys(content: string, missing: string[]): string {
  const newKeys = missing.map((k) => `${k}: `).join("\n");
  const fmMatch = FRONTMATTER_RE.exec(content);
  if (!fmMatch) return `---\n${newKeys}\n---\n\n${content}`;
  return (
    content.slice(0, fmMatch.index + fmMatch[0].length - 3) +
    newKeys +
    "\n---" +
    content.slice(fmMatch.index + fmMatch[0].length)
  );
}
