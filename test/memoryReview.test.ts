import test from "node:test";
import assert from "node:assert/strict";
import { MemoryReviewStore } from "../src/memory/MemoryReviewStore";
import type { MemoryNode } from "../src/memory/WikiMemoryGraph";

test("memory review store persists accepted and rejected states", async () => {
  const files = new Map<string, string>();
  const app = {
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

  const node = makeNode("claim:memory");
  const store = new MemoryReviewStore(app as never, ".gardener");
  await store.load();
  await store.setStatus(node, "accepted");

  assert.equal(store.getStatus(node.id), "accepted");

  const reloaded = new MemoryReviewStore(app as never, ".gardener");
  await reloaded.load();
  assert.equal(reloaded.getStatus(node.id), "accepted");

  await reloaded.setStatus(node, "rejected");
  assert.equal(reloaded.getStatus(node.id), "rejected");
});

test("memory review store persists edited accepted claim wording", async () => {
  const files = new Map<string, string>();
  const app = {
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

  const node = makeNode("claim:memory");
  const store = new MemoryReviewStore(app as never, ".gardener");
  await store.load();
  await store.setEditedLabel(node, "Memory consolidation improves long-term retrieval.");

  assert.equal(store.getStatus(node.id), "accepted");
  assert.equal(store.getEditedLabel(node.id), "Memory consolidation improves long-term retrieval.");

  const reloaded = new MemoryReviewStore(app as never, ".gardener");
  await reloaded.load();
  assert.equal(reloaded.getEditedLabel(node.id), "Memory consolidation improves long-term retrieval.");
});

function makeNode(id: string): MemoryNode {
  return {
    id,
    type: "claim",
    label: "Memory consolidation is useful.",
    aliases: [],
    provenance: [{ path: "Notes/Memory.md", snippet: "Memory consolidation is useful." }],
    updatedAt: 1,
  };
}
