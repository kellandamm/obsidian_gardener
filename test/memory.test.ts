import test from "node:test";
import assert from "node:assert/strict";
import type { VaultIndex } from "../src/index/VaultIndex";
import { buildWikiMemoryGraph, buildWikiMemoryGraphAsync, getClaimsForConcept, getClaimsForNote, getContradictoryClaimPairs, searchMemory } from "../src/memory/WikiMemoryGraph";

test("builds concept and claim nodes with provenance", () => {
  const index = makeIndex();
  const contents = new Map([
    [
      "Notes/Memory.md",
      "# Memory\n\nMemory consolidation is useful for long-term retrieval. [[Retrieval]] supports recall.",
    ],
  ]);

  const graph = buildWikiMemoryGraph(index, contents);
  const concepts = graph.nodes.filter((node) => node.type === "concept");
  const sources = graph.nodes.filter((node) => node.type === "source");
  const claims = getClaimsForNote(graph, "Notes/Memory.md");

  assert.ok(concepts.some((node) => node.label === "Memory"));
  assert.ok(sources.some((node) => node.label === "Memory"));
  assert.ok(claims.some((node) => node.label.includes("Memory consolidation is useful")));
  assert.ok(claims.every((node) => node.provenance[0].path === "Notes/Memory.md"));
  assert.ok(graph.edges.some((edge) => edge.type === "derived-from"));
  assert.ok(graph.edges.some((edge) => edge.type === "supports"));

  const memoryConcept = concepts.find((node) => node.label === "Memory");
  assert.ok(memoryConcept);
  assert.ok(getClaimsForConcept(graph, memoryConcept.id).some((node) => node.label.includes("Memory consolidation")));
});

test("searches memory graph by labels and snippets", () => {
  const graph = buildWikiMemoryGraph(makeIndex(), new Map([
    ["Notes/Memory.md", "# Memory\n\nMemory consolidation is useful for long-term retrieval."],
  ]));

  const results = searchMemory(graph, "long term retrieval");
  assert.ok(results.some((node) => node.label.includes("Memory consolidation")));
});

test("builds contradiction edges between conflicting claims", () => {
  const index = makeContradictionIndex();
  const graph = buildWikiMemoryGraph(index, new Map([
    ["Notes/A.md", "# Retrieval\n\nRetrieval practice supports durable learning for students."],
    ["Notes/B.md", "# Retrieval Critique\n\nRetrieval practice does not support durable learning for students."],
  ]));

  const pairs = getContradictoryClaimPairs(graph);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].a.provenance[0].path !== pairs[0].b.provenance[0].path);
});

test("batched memory graph builder matches deterministic builder", async () => {
  const index = makeContradictionIndex();
  const contents = new Map([
    ["Notes/A.md", "# Retrieval\n\nRetrieval practice supports durable learning for students."],
    ["Notes/B.md", "# Retrieval Critique\n\nRetrieval practice does not support durable learning for students."],
  ]);

  const syncGraph = buildWikiMemoryGraph(index, contents);
  const asyncGraph = await buildWikiMemoryGraphAsync(index, contents, 1);

  assert.deepEqual(
    asyncGraph.nodes.map(withoutUpdatedAt),
    syncGraph.nodes.map(withoutUpdatedAt)
  );
  assert.deepEqual(asyncGraph.edges, syncGraph.edges);
});

test("batched memory graph builder handles 5,000 synthetic notes", async () => {
  const index = makeLargeIndex(5000);
  const contents = new Map<string, string>();
  for (const path of index.notes.keys()) {
    contents.set(path, `# ${path.replace(/\.md$/, "")}\n\nConcept ${path} supports durable knowledge work for readers.`);
  }

  const graph = await buildWikiMemoryGraphAsync(index, contents, 100);

  assert.equal(graph.nodes.filter((node) => node.type === "note").length, 5000);
  assert.ok(graph.nodes.some((node) => node.type === "claim"));
  assert.ok(graph.edges.some((edge) => edge.type === "supports"));
});

function makeIndex(): VaultIndex {
  return {
    notes: new Map([
      [
        "Notes/Memory.md",
        {
          path: "Notes/Memory.md",
          mtime: 1,
          wordCount: 8,
          links: ["Notes/Retrieval.md"],
          tags: ["concept", "source"],
          title: "Memory",
          headings: ["Consolidation"],
          frontmatterKeys: [],
        },
      ],
    ]),
    backlinks: new Map(),
  };
}

function makeContradictionIndex(): VaultIndex {
  return {
    notes: new Map([
      [
        "Notes/A.md",
        {
          path: "Notes/A.md",
          mtime: 1,
          wordCount: 8,
          links: [],
          tags: ["concept"],
          title: "Retrieval",
          headings: [],
          frontmatterKeys: [],
        },
      ],
      [
        "Notes/B.md",
        {
          path: "Notes/B.md",
          mtime: 1,
          wordCount: 9,
          links: [],
          tags: ["concept"],
          title: "Retrieval Critique",
          headings: [],
          frontmatterKeys: [],
        },
      ],
    ]),
    backlinks: new Map(),
  };
}

function makeLargeIndex(count: number): VaultIndex {
  const notes = new Map();
  for (let i = 0; i < count; i++) {
    const path = `Notes/Synthetic-${i}.md`;
    notes.set(path, {
      path,
      mtime: i,
      wordCount: 12,
      links: [],
      tags: ["concept"],
      title: `Synthetic ${i}`,
      headings: [],
      frontmatterKeys: [],
    });
  }
  return { notes, backlinks: new Map() };
}

function withoutUpdatedAt<T extends { updatedAt: number }>(value: T): Omit<T, "updatedAt"> {
  const { updatedAt: _updatedAt, ...rest } = value;
  return rest;
}
