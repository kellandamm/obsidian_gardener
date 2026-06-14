import type { NoteEntry, VaultIndex } from "../index/VaultIndex";
import { yieldEvery } from "../utils/cooperative";

export type MemoryNodeType = "note" | "concept" | "claim" | "source";
export type MemoryEdgeType =
  | "mentions"
  | "supports"
  | "contradicts"
  | "same-as"
  | "related-to"
  | "derived-from";

export interface MemoryProvenance {
  path: string;
  heading?: string;
  snippet: string;
}

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  label: string;
  aliases: string[];
  provenance: MemoryProvenance[];
  updatedAt: number;
}

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  type: MemoryEdgeType;
  provenance: MemoryProvenance[];
  weight: number;
}

export interface WikiMemoryGraphData {
  version: 1;
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface ExtractedMemory {
  concepts: MemoryNode[];
  claims: MemoryNode[];
  edges: MemoryEdge[];
}

const CLAIM_RE =
  /\b(is|are|was|were|causes|cause|supports|support|contradicts|contradict|requires|require|means|mean|leads to|implies)\b/i;
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "onto", "about",
  "note", "notes", "project", "daily", "because", "there", "their", "these",
]);

export function createWikiMemoryGraph(): WikiMemoryGraphData {
  return { version: 1, nodes: [], edges: [] };
}

export function buildWikiMemoryGraph(index: VaultIndex, noteContents: Map<string, string>): WikiMemoryGraphData {
  const graph = createWikiMemoryGraph();
  const nodeMap = new Map<string, MemoryNode>();
  const edgeMap = new Map<string, MemoryEdge>();

  for (const note of index.notes.values()) {
    const content = noteContents.get(note.path) ?? "";
    const extracted = extractMemoryFromNote(note, content);
    for (const node of extracted.concepts.concat(extracted.claims)) upsertNode(nodeMap, node);
    for (const edge of extracted.edges) upsertEdge(edgeMap, edge);
  }

  const claims = [...nodeMap.values()].filter((node) => node.type === "claim");
  for (const pair of findContradictoryClaimPairs(claims)) {
    upsertEdge(edgeMap, makeEdge(pair.a.id, pair.b.id, "contradicts", pair.a.provenance[0], pair.score));
  }

  graph.nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  graph.edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  return graph;
}

export async function buildWikiMemoryGraphAsync(
  index: VaultIndex,
  noteContents: Map<string, string>,
  batchSize = 100
): Promise<WikiMemoryGraphData> {
  const graph = createWikiMemoryGraph();
  const nodeMap = new Map<string, MemoryNode>();
  const edgeMap = new Map<string, MemoryEdge>();
  let count = 0;

  for (const note of index.notes.values()) {
    const content = noteContents.get(note.path) ?? "";
    const extracted = extractMemoryFromNote(note, content);
    for (const node of extracted.concepts.concat(extracted.claims)) upsertNode(nodeMap, node);
    for (const edge of extracted.edges) upsertEdge(edgeMap, edge);
    await yieldEvery(++count, batchSize);
  }

  const claims = [...nodeMap.values()].filter((node) => node.type === "claim");
  let pairCount = 0;
  for (const pair of findContradictoryClaimPairs(claims)) {
    upsertEdge(edgeMap, makeEdge(pair.a.id, pair.b.id, "contradicts", pair.a.provenance[0], pair.score));
    await yieldEvery(++pairCount, batchSize);
  }

  graph.nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  graph.edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  return graph;
}

export function extractMemoryFromNote(note: NoteEntry, content: string): ExtractedMemory {
  const now = Date.now();
  const concepts: MemoryNode[] = [];
  const claims: MemoryNode[] = [];
  const edges: MemoryEdge[] = [];
  const sourceNodeId = nodeId("note", note.path);
  const noteProv: MemoryProvenance = {
    path: note.path,
    heading: note.headings[0],
    snippet: firstMeaningfulLine(content) || note.title,
  };

  concepts.push({
    id: sourceNodeId,
    type: "note",
    label: note.title,
    aliases: [note.path.replace(/\.md$/, ""), note.title],
    provenance: [noteProv],
    updatedAt: now,
  });

  if (isSourceNote(note)) {
    const sourceNode = makeNode("source", note.title, noteProv, now);
    concepts.push(sourceNode);
    edges.push(makeEdge(sourceNodeId, sourceNode.id, "derived-from", noteProv, 1));
  }

  const conceptLabels = extractConceptLabels(note, content);
  for (const label of conceptLabels) {
    const concept = makeNode("concept", label, noteProv, now);
    concepts.push(concept);
    edges.push(makeEdge(sourceNodeId, concept.id, "mentions", noteProv, 0.8));
  }

  const claimSnippets = extractClaimSnippets(content);
  for (const snippet of claimSnippets) {
    const claimProv = { ...noteProv, snippet };
    const claim = makeNode("claim", snippet, claimProv, now);
    claims.push(claim);
    edges.push(makeEdge(claim.id, sourceNodeId, "derived-from", claimProv, 1));
    for (const label of conceptLabels.filter((c) => snippet.toLowerCase().includes(c.toLowerCase())).slice(0, 4)) {
      edges.push(makeEdge(claim.id, nodeId("concept", label), "supports", claimProv, 0.75));
    }
  }

  return { concepts, claims, edges };
}

export function searchMemory(graph: WikiMemoryGraphData, query: string, limit = 10): MemoryNode[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return graph.nodes
    .map((node) => ({ node, score: scoreNode(node, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ node }) => node);
}

export function getClaimsForNote(graph: WikiMemoryGraphData, path: string): MemoryNode[] {
  return graph.nodes.filter((node) =>
    node.type === "claim" && node.provenance.some((prov) => prov.path === path)
  );
}

export function getConceptNodes(graph: WikiMemoryGraphData): MemoryNode[] {
  return graph.nodes.filter((node) => node.type === "concept");
}

export function getClaimsForConcept(graph: WikiMemoryGraphData, conceptId: string): MemoryNode[] {
  const claimIds = new Set(
    graph.edges
      .filter((edge) => edge.to === conceptId && edge.type === "supports")
      .map((edge) => edge.from)
  );
  return graph.nodes.filter((node) => claimIds.has(node.id) && node.type === "claim");
}

export interface ContradictoryClaimPair {
  id: string;
  a: MemoryNode;
  b: MemoryNode;
  score: number;
}

export function getContradictoryClaimPairs(graph: WikiMemoryGraphData): ContradictoryClaimPair[] {
  return graph.edges
    .filter((edge) => edge.type === "contradicts")
    .map((edge) => {
      const a = graph.nodes.find((node) => node.id === edge.from);
      const b = graph.nodes.find((node) => node.id === edge.to);
      if (!a || !b || a.type !== "claim" || b.type !== "claim") return null;
      return { id: contradictionPairId(a.id, b.id), a, b, score: edge.weight };
    })
    .filter((pair): pair is ContradictoryClaimPair => pair !== null);
}

export function findConceptsMentionedByNote(graph: WikiMemoryGraphData, path: string): MemoryNode[] {
  const noteNodeId = nodeId("note", path);
  const conceptIds = new Set(
    graph.edges
      .filter((edge) => edge.from === noteNodeId && edge.type === "mentions")
      .map((edge) => edge.to)
  );
  return graph.nodes.filter((node) => conceptIds.has(node.id));
}

export function nodeId(type: MemoryNodeType, label: string): string {
  return `${type}:${slug(label)}`;
}

function makeNode(type: MemoryNodeType, label: string, provenance: MemoryProvenance, updatedAt: number): MemoryNode {
  return {
    id: nodeId(type, label),
    type,
    label,
    aliases: [label],
    provenance: [provenance],
    updatedAt,
  };
}

function makeEdge(from: string, to: string, type: MemoryEdgeType, provenance: MemoryProvenance, weight: number): MemoryEdge {
  return {
    id: `${type}:${from}->${to}`,
    from,
    to,
    type,
    provenance: [provenance],
    weight,
  };
}

function upsertNode(nodes: Map<string, MemoryNode>, node: MemoryNode): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }
  existing.aliases = [...new Set([...existing.aliases, ...node.aliases])];
  existing.provenance = mergeProvenance(existing.provenance, node.provenance);
  existing.updatedAt = Math.max(existing.updatedAt, node.updatedAt);
}

function upsertEdge(edges: Map<string, MemoryEdge>, edge: MemoryEdge): void {
  const existing = edges.get(edge.id);
  if (!existing) {
    edges.set(edge.id, edge);
    return;
  }
  existing.provenance = mergeProvenance(existing.provenance, edge.provenance);
  existing.weight = Math.max(existing.weight, edge.weight);
}

function findContradictoryClaimPairs(claims: MemoryNode[]): ContradictoryClaimPair[] {
  const pairs: ContradictoryClaimPair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i];
      const b = claims[j];
      const pathA = a.provenance[0]?.path;
      const pathB = b.provenance[0]?.path;
      if (!pathA || !pathB || pathA === pathB || !looksContradictory(a.label, b.label)) continue;
      const id = contradictionPairId(a.id, b.id);
      if (seen.has(id)) continue;
      seen.add(id);
      pairs.push({ id, a, b, score: contradictionScore(a.label, b.label) });
    }
  }
  return pairs.slice(0, 50);
}

function contradictionPairId(a: string, b: string): string {
  return `contradiction:${[a, b].sort().join("|")}`;
}

function looksContradictory(a: string, b: string): boolean {
  const aNegated = /\b(no|not|never|without|cannot|can't|doesn't|do not|isn't|aren't)\b/i.test(a);
  const bNegated = /\b(no|not|never|without|cannot|can't|doesn't|do not|isn't|aren't)\b/i.test(b);
  if (aNegated === bNegated) return false;
  return sharedTokenCount(a, b) >= 3;
}

function contradictionScore(a: string, b: string): number {
  return Math.min(0.9, 0.5 + sharedTokenCount(a, b) * 0.08);
}

function sharedTokenCount(a: string, b: string): number {
  const bTokens = new Set(tokenize(b).filter((token) => token.length > 3));
  return tokenize(a).filter((token) => token.length > 3 && bTokens.has(token)).length;
}

function mergeProvenance(a: MemoryProvenance[], b: MemoryProvenance[]): MemoryProvenance[] {
  const seen = new Set<string>();
  const merged: MemoryProvenance[] = [];
  for (const prov of [...a, ...b]) {
    const key = `${prov.path}|${prov.heading ?? ""}|${prov.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(prov);
  }
  return merged.slice(0, 12);
}

function extractConceptLabels(note: NoteEntry, content: string): string[] {
  const labels = new Set<string>();
  labels.add(note.title);
  for (const tag of note.tags) labels.add(tag.replace(/[-_/]+/g, " "));
  for (const heading of note.headings.slice(0, 8)) labels.add(heading);
  for (const match of content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    labels.add(match[1].trim());
  }
  for (const phrase of content.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)) {
    labels.add(phrase[1].trim());
  }
  return [...labels]
    .map((label) => label.replace(/^#+\s*/, "").trim())
    .filter((label) => label.length >= 3 && !STOP_WORDS.has(label.toLowerCase()))
    .slice(0, 24);
}

function extractClaimSnippets(content: string): string[] {
  return content
    .replace(/^---[\s\S]*?---/, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length >= 30 && line.length <= 260 && CLAIM_RE.test(line))
    .slice(0, 12);
}

function isSourceNote(note: NoteEntry): boolean {
  const path = note.path.toLowerCase();
  return (
    path.includes("source") ||
    path.includes("literature") ||
    note.tags.some((tag) => ["source", "literature", "reference"].includes(tag.toLowerCase()))
  );
}

function firstMeaningfulLine(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/, "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 0) ?? "";
}

function scoreNode(node: MemoryNode, queryTokens: string[]): number {
  const haystack = tokenize([node.label, ...node.aliases, ...node.provenance.map((p) => p.snippet)].join(" "));
  let score = 0;
  for (const token of queryTokens) if (haystack.includes(token)) score++;
  return score / queryTokens.length;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
