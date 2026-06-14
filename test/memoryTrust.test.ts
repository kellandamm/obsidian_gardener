import test from "node:test";
import assert from "node:assert/strict";
import type { VaultIndex } from "../src/index/VaultIndex";
import { buildWikiMemoryGraph } from "../src/memory/WikiMemoryGraph";
import { MemoryReviewStore } from "../src/memory/MemoryReviewStore";
import { scoreMemoryNode } from "../src/memory/confidence";
import { summarizeSourceScope } from "../src/memory/sourceScope";
import { DEFAULT_SCHEMA } from "../src/schema/defaultSchema";

test("scores accepted sourced claims higher than rejected claims", async () => {
  const graph = buildWikiMemoryGraph(makeIndex(), new Map([
    ["Sources/Memory.md", "# Memory\n\nMemory consolidation is useful for long-term retrieval."],
  ]));
  const claim = graph.nodes.find((node) => node.type === "claim");
  assert.ok(claim);

  const store = new MemoryReviewStore(makeMemoryApp() as never, ".gardener");
  await store.load();
  const initial = scoreMemoryNode(graph, claim, store);
  await store.setStatus(claim, "accepted");
  const accepted = scoreMemoryNode(graph, claim, store);
  await store.setStatus(claim, "rejected");
  const rejected = scoreMemoryNode(graph, claim, store);

  assert.ok(accepted.score > initial.score);
  assert.ok(rejected.score < accepted.score);
});

test("summarizes source scope using never-read and folder rules", () => {
  const schema = structuredClone(DEFAULT_SCHEMA);
  schema.protected.neverRead = ["Private/**"];
  schema.folderRules = [
    { glob: "Journal/**", claimExtraction: false },
    { glob: "Sources/**", claimExtraction: true },
  ];

  const summary = summarizeSourceScope(makeScopeIndex(), schema);
  assert.equal(summary.totalNotes, 3);
  assert.equal(summary.eligibleNotes, 1);
  assert.equal(summary.neverReadNotes, 1);
  assert.equal(summary.claimExtractionDisabledNotes, 1);
});

function makeMemoryApp() {
  const files = new Map<string, string>();
  return {
    vault: {
      adapter: {
        read: async (path: string) => {
          const value = files.get(path);
          if (value === undefined) throw new Error("missing");
          return value;
        },
        write: async (path: string, content: string) => {
          files.set(path, content);
        },
        mkdir: async () => undefined,
      },
    },
  };
}

function makeIndex(): VaultIndex {
  return {
    notes: new Map([
      [
        "Sources/Memory.md",
        {
          path: "Sources/Memory.md",
          mtime: 1,
          wordCount: 8,
          links: [],
          tags: ["source"],
          title: "Memory",
          headings: [],
          frontmatterKeys: [],
        },
      ],
    ]),
    backlinks: new Map(),
  };
}

function makeScopeIndex(): VaultIndex {
  return {
    notes: new Map([
      ["Sources/A.md", note("Sources/A.md")],
      ["Journal/B.md", note("Journal/B.md")],
      ["Private/C.md", note("Private/C.md")],
    ]),
    backlinks: new Map(),
  };
}

function note(path: string) {
  return {
    path,
    mtime: 1,
    wordCount: 10,
    links: [],
    tags: [],
    title: path.replace(/\.md$/, ""),
    headings: [],
    frontmatterKeys: [],
  };
}
