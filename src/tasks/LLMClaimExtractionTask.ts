import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import {
  nodeId,
  type MemoryNode,
  type MemoryEdge,
  type MemoryProvenance,
  type WikiMemoryGraphData,
} from "../memory/WikiMemoryGraph";
import { isClaimExtractionEnabled } from "../schema/folderRules";
import { yieldEvery } from "../utils/cooperative";

const MAX_NOTES_PER_RUN = 40;
const MAX_NOTE_CHARS = 3000;

const EXTRACTION_PROMPT = `Extract the key ideas and factual claims from this note.

Return ONLY a JSON object with this exact shape:
{
  "concepts": ["concept label", ...],
  "claims": ["one sentence claim", ...]
}

Rules:
- concepts: 2-6 word noun phrases that name a topic (e.g. "spaced repetition", "working memory")
- claims: complete declarative sentences expressing a fact or assertion (e.g. "Spaced repetition improves long-term retention")
- Max 8 concepts, max 10 claims
- Skip vague phrases like "this", "the idea", "something"
- Return valid JSON only, no other text

Note title: {TITLE}
Note content:
{CONTENT}`;

interface LLMExtraction {
  concepts: string[];
  claims: string[];
}

function parseLLMResponse(raw: string): LLMExtraction {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { concepts: [], claims: [] };
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { concepts: [], claims: [] };
    const obj = parsed as Record<string, unknown>;
    const concepts = Array.isArray(obj.concepts)
      ? (obj.concepts as unknown[]).filter((c): c is string => typeof c === "string" && c.length >= 3).slice(0, 8)
      : [];
    const claims = Array.isArray(obj.claims)
      ? (obj.claims as unknown[]).filter((c): c is string => typeof c === "string" && c.length >= 20).slice(0, 10)
      : [];
    return { concepts, claims };
  } catch {
    return { concepts: [], claims: [] };
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeNode(
  type: MemoryNode["type"],
  label: string,
  prov: MemoryProvenance,
): MemoryNode {
  return {
    id: nodeId(type, label),
    type,
    label,
    aliases: [label],
    provenance: [prov],
    updatedAt: Date.now(),
  };
}

function makeEdge(
  from: string,
  to: string,
  type: MemoryEdge["type"],
  prov: MemoryProvenance,
  weight: number,
): MemoryEdge {
  return {
    id: `${slug(from)}-${type}-${slug(to)}`,
    from,
    to,
    type,
    provenance: [prov],
    weight,
  };
}

function mergeExtractionIntoGraph(
  graph: WikiMemoryGraphData,
  extraction: LLMExtraction,
  notePath: string,
  noteTitle: string,
  firstLine: string,
): void {
  const noteNodeId = nodeId("note", notePath);
  const prov: MemoryProvenance = { path: notePath, heading: noteTitle, snippet: firstLine };

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(graph.edges.map((e) => [e.id, e]));

  function upsertNode(node: MemoryNode): void {
    const existing = nodeMap.get(node.id);
    if (existing) {
      if (!existing.provenance.some((p) => p.path === notePath)) {
        existing.provenance.push(...node.provenance);
      }
    } else {
      nodeMap.set(node.id, node);
    }
  }

  function upsertEdge(edge: MemoryEdge): void {
    if (!edgeMap.has(edge.id)) edgeMap.set(edge.id, edge);
  }

  for (const label of extraction.concepts) {
    const concept = makeNode("concept", label, prov);
    upsertNode(concept);
    upsertEdge(makeEdge(noteNodeId, concept.id, "mentions", prov, 0.9));
  }

  for (const claimText of extraction.claims) {
    const claimProv = { ...prov, snippet: claimText };
    const claim = makeNode("claim", claimText, claimProv);
    upsertNode(claim);
    upsertEdge(makeEdge(claim.id, noteNodeId, "derived-from", claimProv, 1));
    for (const label of extraction.concepts) {
      if (claimText.toLowerCase().includes(label.toLowerCase())) {
        upsertEdge(makeEdge(claim.id, nodeId("concept", label), "supports", claimProv, 0.85));
      }
    }
  }

  graph.nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  graph.edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export class LLMClaimExtractionTask implements Task {
  readonly id = "llm-claim-extraction";

  constructor(
    private app: App,
    private memory: MemoryRef,
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled) return [];
    if (!(await llm.isAvailable())) return [];

    // Prioritize notes that haven't been extracted yet or were recently modified
    const existingNotePaths = new Set(
      this.memory.graph.nodes
        .filter((n) => n.type === "note")
        .map((n) => n.provenance[0]?.path)
        .filter(Boolean),
    );

    const candidates = [...index.notes.values()]
      .filter((note) => isClaimExtractionEnabled(schema, note.path))
      .sort((a, b) => {
        // Unextracted notes first, then most recently modified
        const aNew = !existingNotePaths.has(a.path) ? 1 : 0;
        const bNew = !existingNotePaths.has(b.path) ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew;
        return b.mtime - a.mtime;
      })
      .slice(0, MAX_NOTES_PER_RUN);

    let processed = 0;
    for (const note of candidates) {
      const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
      if (!file) continue;

      let content: string;
      try {
        content = await this.app.vault.cachedRead(file);
      } catch {
        continue;
      }

      const stripped = content.replace(/^---[\s\S]*?---/, "").trim();
      const truncated = stripped.slice(0, MAX_NOTE_CHARS);
      const firstLine = stripped.split("\n").find((l) => l.trim().length > 0) ?? note.title;

      const prompt = EXTRACTION_PROMPT
        .replace("{TITLE}", note.title)
        .replace("{CONTENT}", truncated);

      let raw: string;
      try {
        raw = await llm.complete(prompt, { maxTokens: 400, temperature: 0 });
      } catch {
        continue;
      }

      const extraction = parseLLMResponse(raw);
      if (extraction.concepts.length > 0 || extraction.claims.length > 0) {
        mergeExtractionIntoGraph(this.memory.graph, extraction, note.path, note.title, firstLine);
      }

      await yieldEvery(++processed, 5);
    }

    return [];
  }
}
