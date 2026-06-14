import test from "node:test";
import assert from "node:assert/strict";
import { classifyProposal } from "../src/tasks/proposalFamilies";

test("classifies existing tasks into wiki workflow families", () => {
  assert.equal(classifyProposal({ taskId: "auto-summarise", type: "add-content" }), "distill");
  assert.equal(classifyProposal({ taskId: "canonical-concepts", type: "insert-link" }), "canonicalize");
  assert.equal(classifyProposal({ taskId: "queued-hub-notes", type: "add-content" }), "canonicalize");
  assert.equal(classifyProposal({ taskId: "canonical-strengthen", type: "add-content" }), "canonicalize");
  assert.equal(classifyProposal({ taskId: "broken-links", type: "delete-link" }), "connect");
  assert.equal(classifyProposal({ taskId: "claim-consistency-buffer", type: "flag-contradiction" }), "verify");
  assert.equal(classifyProposal({ taskId: "template-lint", type: "add-frontmatter" }), "maintain");
});
