import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import { newProposalId } from "../changeset/ChangeProposal";

interface TagGroup {
  canonical: string;
  variants: string[];
  paths: string[];
}

export class TagNormalizationTask implements Task {
  readonly id = "tag-normalization";

  async run(index: VaultIndex, schema: GardenerSchema, _llm: LLMProvider): Promise<Finding[]> {
    // Collect all tags and which files use them
    const tagFiles = new Map<string, string[]>();
    for (const note of index.notes.values()) {
      for (const tag of note.tags) {
        const existing = tagFiles.get(tag) ?? [];
        existing.push(note.path);
        tagFiles.set(tag, existing);
      }
    }

    const allTags = [...tagFiles.keys()];
    const groups = this.findVariantGroups(allTags);
    const findings: Finding[] = [];

    for (const group of groups) {
      if (group.variants.length === 0) continue;

      // Collect all affected files
      const affectedPaths = new Set<string>();
      for (const variant of group.variants) {
        for (const p of tagFiles.get(variant) ?? []) affectedPaths.add(p);
      }

      const variantList = group.variants.map((v) => `#${v}`).join(", ");
      const before = `Tags in use: #${group.canonical}, ${variantList}`;
      const after = `Normalized to: #${group.canonical} in ${affectedPaths.size} note(s)`;

      findings.push({
        taskId: this.id,
        confidence: 0.85,
        proposal: {
          id: newProposalId(),
          taskId: this.id,
          type: "insert-link",
          operation: "advisory",
          targetPath: [...affectedPaths][0],
          title: `Normalize tag variants → #${group.canonical}`,
          rationale: `Found ${group.variants.length + 1} variations of the same tag: #${group.canonical}, ${variantList}`,
          diff: [
            { kind: "del", text: variantList },
            { kind: "add", text: `#${group.canonical} (${affectedPaths.size} files)` },
          ],
          before,
          after,
          confidence: 0.85,
          createdAt: Date.now(),
        },
      });
    }

    return findings;
  }

  private findVariantGroups(tags: string[]): TagGroup[] {
    const groups: TagGroup[] = [];
    const assigned = new Set<string>();

    for (const tag of tags) {
      if (assigned.has(tag)) continue;
      const canonical = this.normalize(tag);
      const variants: string[] = [];

      for (const other of tags) {
        if (other === tag || assigned.has(other)) continue;
        if (this.normalize(other) === canonical && other !== tag) {
          variants.push(other);
          assigned.add(other);
        }
      }

      if (variants.length > 0) {
        assigned.add(tag);
        // Pick the most common casing as canonical (lowercase kebab-case preferred)
        groups.push({ canonical: tag, variants, paths: [] });
      }
    }

    return groups;
  }

  private normalize(tag: string): string {
    return tag
      .toLowerCase()
      .replace(/[-_\s]+/g, "-")   // unify separators
      .replace(/s$/, "");          // naive singular
  }
}
