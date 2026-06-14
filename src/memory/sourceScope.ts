import { minimatch } from "minimatch";
import type { NoteEntry, VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import { isClaimExtractionEnabled } from "../schema/folderRules";

export interface SourceScopeSummary {
  totalNotes: number;
  eligibleNotes: number;
  neverReadNotes: number;
  claimExtractionDisabledNotes: number;
  eligibleFolders: Array<{ folder: string; count: number }>;
  blockedFolders: Array<{ folder: string; count: number }>;
}

export function summarizeSourceScope(index: VaultIndex, schema: GardenerSchema): SourceScopeSummary {
  const notes = [...index.notes.values()];
  const eligibleFolders = new Map<string, number>();
  const blockedFolders = new Map<string, number>();
  let neverReadNotes = 0;
  let claimExtractionDisabledNotes = 0;

  for (const note of notes) {
    const neverRead = isNeverRead(schema, note.path);
    const claimEnabled = isClaimExtractionEnabled(schema, note.path);
    const folder = folderOf(note);
    if (neverRead) {
      neverReadNotes++;
      increment(blockedFolders, folder);
      continue;
    }
    if (!claimEnabled) {
      claimExtractionDisabledNotes++;
      increment(blockedFolders, folder);
      continue;
    }
    increment(eligibleFolders, folder);
  }

  return {
    totalNotes: notes.length,
    eligibleNotes: sum(eligibleFolders),
    neverReadNotes,
    claimExtractionDisabledNotes,
    eligibleFolders: topFolders(eligibleFolders),
    blockedFolders: topFolders(blockedFolders),
  };
}

function isNeverRead(schema: GardenerSchema, path: string): boolean {
  return schema.protected.neverRead.some((glob) => minimatch(path, glob, { dot: true }));
}

function folderOf(note: NoteEntry): string {
  const parts = note.path.split("/");
  return parts.length > 1 ? parts[0] : "/";
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sum(map: Map<string, number>): number {
  return [...map.values()].reduce((total, count) => total + count, 0);
}

function topFolders(map: Map<string, number>): Array<{ folder: string; count: number }> {
  return [...map.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder))
    .slice(0, 6);
}
