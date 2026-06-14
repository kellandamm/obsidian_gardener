import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSetEngine } from "../src/changeset/ChangeSetEngine";
import { AuditLog } from "../src/safety/AuditLog";
import type { ChangeProposal } from "../src/changeset/ChangeProposal";

test("audits apply, reject, and undo transactions", async () => {
  const app = makeApp({ "Notes/A.md": "before" });
  const audit = new AuditLog(app as never, ".gardener");
  const engine = new ChangeSetEngine(app as never, ".gardener", false, undefined, undefined, undefined, undefined, audit);
  await engine.load();

  const applyProposal = makeProposal("prop-apply", "Notes/A.md", "before", "after");
  const rejectProposal = makeProposal("prop-reject", "Notes/B.md", "", "");
  engine.stage([applyProposal, rejectProposal]);

  assert.equal(await engine.apply("prop-apply"), true);
  await engine.reject("prop-reject", "bad suggestion");
  const journalId = engine.getJournalEntries()[0]?.id;
  assert.ok(journalId);
  assert.equal(await engine.undo(journalId), true);

  const auditLog = app.files.get(".gardener/audit.log") ?? "";
  const entries = auditLog.trim().split("\n").map((line) => JSON.parse(line) as { action: string; proposalId?: string });
  assert.ok(entries.some((entry) => entry.action === "apply" && entry.proposalId === "prop-apply"));
  assert.ok(entries.some((entry) => entry.action === "reject" && entry.proposalId === "prop-reject"));
  assert.ok(entries.some((entry) => entry.action === "undo" && entry.proposalId === "prop-apply"));
});

test("stale apply marks proposal skipped instead of leaving it pending", async () => {
  const app = makeApp({ "Notes/A.md": "changed" });
  const engine = new ChangeSetEngine(app as never, ".gardener", false);
  await engine.load();

  engine.stage([makeProposal("prop-stale", "Notes/A.md", "before", "after")]);
  assert.equal(await engine.apply("prop-stale"), false);

  const staged = engine.getAll().find((item) => item.proposal.id === "prop-stale");
  assert.equal(staged?.status, "skipped");
  assert.equal(engine.getPending().some((item) => item.proposal.id === "prop-stale"), false);
});

test("new file proposals apply when target is absent", async () => {
  const app = makeApp({});
  const engine = new ChangeSetEngine(app as never, ".gardener", false);
  await engine.load();

  engine.stage([makeProposal("prop-new", "Wiki/New.md", "", "# New\n")]);
  assert.equal(await engine.apply("prop-new"), true);
  assert.equal(app.files.get("Wiki/New.md"), "# New\n");
});


function makeProposal(id: string, targetPath: string, before: string, after: string): ChangeProposal {
  return {
    id,
    taskId: "test-task",
    type: "add-content",
    operation: "replace-file",
    targetPath,
    title: id,
    rationale: "",
    diff: [],
    before,
    after,
    confidence: 0.9,
    createdAt: 1,
  };
}

function makeApp(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries(initialFiles));
  const folders = new Set<string>();
  return {
    files,
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
      },
      getAbstractFileByPath: (path: string) => {
        if (files.has(path)) return { path };
        if (folders.has(path)) return { path };
        return null;
      },
      create: async (path: string, content: string) => {
        files.set(path, content);
        return { path };
      },
      createFolder: async (path: string) => {
        folders.add(path);
      },
      delete: async (file: { path: string }) => {
        files.delete(file.path);
      },
    },
  };
}
