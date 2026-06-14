import test from "node:test";
import assert from "node:assert/strict";
import type { ChangeProposal } from "../src/changeset/ChangeProposal";
import { createErrorBook, proposalSignature, shouldSuppressProposal } from "../src/memory/ErrorBook";

test("computes stable proposal signatures", () => {
  const a = proposalSignature(makeProposal("Link Alpha"));
  const b = proposalSignature(makeProposal("  link   alpha  "));
  assert.equal(a, b);
});

test("suppresses proposals already recorded in the error book", () => {
  const proposal = makeProposal("Link Alpha");
  const errorBook = createErrorBook();
  errorBook.entries.push({
    id: "err-1",
    type: "bad-link",
    taskId: proposal.taskId,
    targetPath: proposal.targetPath,
    secondaryPath: proposal.secondaryPath,
    proposalTitle: proposal.title,
    signature: proposalSignature(proposal),
    createdAt: Date.now(),
  });

  assert.equal(shouldSuppressProposal(errorBook, proposal), true);
  assert.equal(shouldSuppressProposal(errorBook, makeProposal("Different")), false);
});

function makeProposal(title: string): ChangeProposal {
  return {
    id: "prop-1",
    taskId: "canonical-concepts",
    type: "insert-link",
    operation: "replace-file",
    targetPath: "Notes/A.md",
    secondaryPath: "Notes/B.md",
    title,
    rationale: "",
    diff: [],
    before: "",
    after: "",
    confidence: 0.8,
    createdAt: 1,
  };
}
