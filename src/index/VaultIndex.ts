export interface NoteEntry {
  path: string;
  mtime: number;
  wordCount: number;
  links: string[];           // wikilink targets (resolved paths)
  tags: string[];
  title: string;             // first H1 or filename stem
  headings: string[];        // all H2+ headings in order
  frontmatterKeys: string[]; // keys present in YAML frontmatter
}

export interface VaultIndex {
  notes: Map<string, NoteEntry>;
  backlinks: Map<string, Set<string>>; // path → set of paths that link to it
}

export function createVaultIndex(): VaultIndex {
  return { notes: new Map(), backlinks: new Map() };
}

export function addOrUpdate(index: VaultIndex, entry: NoteEntry): void {
  const existing = index.notes.get(entry.path);
  if (existing) {
    for (const target of existing.links) {
      index.backlinks.get(target)?.delete(entry.path);
    }
  }
  index.notes.set(entry.path, entry);
  for (const target of entry.links) {
    if (!index.backlinks.has(target)) index.backlinks.set(target, new Set());
    index.backlinks.get(target)!.add(entry.path);
  }
}

export function removeNote(index: VaultIndex, path: string): void {
  const entry = index.notes.get(path);
  if (!entry) return;
  for (const target of entry.links) {
    index.backlinks.get(target)?.delete(entry.path);
  }
  index.notes.delete(path);
  index.backlinks.delete(path);
}

export function getOrphans(index: VaultIndex): NoteEntry[] {
  const result: NoteEntry[] = [];
  for (const [path, entry] of index.notes) {
    const bl = index.backlinks.get(path);
    if (!bl || bl.size === 0) result.push(entry);
  }
  return result;
}

export function getBrokenLinks(index: VaultIndex): Array<{ source: string; target: string }> {
  const broken: Array<{ source: string; target: string }> = [];
  for (const [path, entry] of index.notes) {
    for (const link of entry.links) {
      if (!index.notes.has(link)) {
        broken.push({ source: path, target: link });
      }
    }
  }
  return broken;
}

export function getUnlinkedMentions(
  index: VaultIndex,
  sourcePath: string
): Array<{ mentionedPath: string; mentionedTitle: string }> {
  const source = index.notes.get(sourcePath);
  if (!source) return [];
  const result: Array<{ mentionedPath: string; mentionedTitle: string }> = [];
  // checked in UnlinkedMentionTask — kept here as a thin helper
  return result;
}

export function findSimilarByTitle(
  index: VaultIndex,
  path: string,
  threshold: number
): Array<{ path: string; score: number }> {
  const entry = index.notes.get(path);
  if (!entry) return [];
  const title = entry.title.toLowerCase();
  const results: Array<{ path: string; score: number }> = [];
  for (const [other, otherEntry] of index.notes) {
    if (other === path) continue;
    const score = jaccardSimilarity(tokenize(title), tokenize(otherEntry.title.toLowerCase()));
    if (score >= threshold) results.push({ path: other, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Returns connected components (clusters) via union-find on links+backlinks. */
export function graphClusters(index: VaultIndex): string[][] {
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function find(x: string): string {
    if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0); }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra) ?? 0, rankB = rank.get(rb) ?? 0;
    if (rankA < rankB) { parent.set(ra, rb); }
    else if (rankA > rankB) { parent.set(rb, ra); }
    else { parent.set(rb, ra); rank.set(ra, rankA + 1); }
  }

  for (const [path, note] of index.notes) {
    find(path);
    for (const target of note.links) {
      if (index.notes.has(target)) union(path, target);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const path of index.notes.keys()) {
    const root = find(path);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(path);
  }
  return [...clusters.values()].sort((a, b) => b.length - a.length);
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\W+/).filter((t) => t.length > 1));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
