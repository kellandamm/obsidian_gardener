import test from "node:test";
import assert from "node:assert/strict";
import type { ChangeProposal } from "../src/changeset/ChangeProposal";
import { CanonicalPageRegistry } from "../src/memory/CanonicalPageRegistry";

test("records approved hub proposals as canonical pages", async () => {
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

  const registry = new CanonicalPageRegistry(app as never, ".gardener");
  await registry.load();
  await registry.recordApprovedProposal(makeHubProposal(""));

  const entry = registry.get("concept:llm-wiki");
  assert.equal(entry?.path, "Wiki/LLM Wiki.md");
  assert.equal(entry?.conceptLabel, "LLM Wiki");
  assert.equal(entry?.source, "created");
  assert.equal(entry?.provenanceCount, 2);

  const reloaded = new CanonicalPageRegistry(app as never, ".gardener");
  await reloaded.load();
  assert.equal(reloaded.get("concept:llm-wiki")?.path, "Wiki/LLM Wiki.md");
});

test("records promoted existing notes distinctly from created hub pages", async () => {
  const files = new Map<string, string>();
  const app = {
    vault: {
      adapter: {
        read: async () => {
          throw new Error("missing");
        },
        write: async (path: string, content: string) => {
          files.set(path, content);
        },
        mkdir: async () => undefined,
      },
    },
  };

  const registry = new CanonicalPageRegistry(app as never, ".gardener");
  await registry.load();
  await registry.recordApprovedProposal(makeHubProposal("# LLM Wiki\n\nExisting page."));

  assert.equal(registry.get("concept:llm-wiki")?.source, "promoted");
});

function makeHubProposal(before: string): ChangeProposal {
  return {
    id: "hub-1",
    taskId: "queued-hub-notes",
    type: "add-content",
    operation: "replace-file",
    targetPath: "Wiki/LLM Wiki.md",
    title: "Create canonical wiki page for LLM Wiki",
    rationale: "",
    diff: [],
    before,
    after:
      "---\n" +
      "gardener-role: canonical\n" +
      "gardener-concept-id: concept:llm-wiki\n" +
      "---\n\n" +
      "# LLM Wiki\n\n" +
      "## Source Provenance\n\n" +
      "- [[Notes/A]]\n" +
      "- [[Notes/B]]\n",
    confidence: 0.87,
    createdAt: 1,
  };
}
