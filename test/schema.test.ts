import test from "node:test";
import assert from "node:assert/strict";
import { parseGardenerSchema } from "../src/schema/parseSchema";

test("parses wiki memory and folder rules", () => {
  const { schema, errors } = parseGardenerSchema(`
# GARDENER.md

## Tasks
- merge-duplicates: on, min-similarity: 0.82
- flag-stubs: on, min-words: 20

## Wiki Memory
- enabled: on
- mode: in-place
- canonical-notes: prefer-existing
- new-hub-notes: review-only
- canonical-folder: Evergreen
- claim-extraction: off
- contradiction-buffer: on
- related-section: off

## Folder Rules
- Journal/**: claim-extraction off, stub-flagging off
- Literature/**: claim-extraction on
`);

  assert.deepEqual(errors, []);
  assert.equal(schema.tasks.mergeDuplicates.minSimilarity, 0.82);
  assert.equal(schema.tasks.stubFlagging.minWords, 20);
  assert.equal(schema.wikiMemory.enabled, true);
  assert.equal(schema.wikiMemory.canonicalFolder, "Evergreen");
  assert.equal(schema.wikiMemory.claimExtraction, false);
  assert.equal(schema.wikiMemory.contradictionBuffer, true);
  assert.equal(schema.wikiMemory.relatedSection, false);
  assert.equal(schema.folderRules.length, 2);
  assert.equal(schema.folderRules[0].glob, "Journal/**");
  assert.equal(schema.folderRules[0].claimExtraction, false);
  assert.equal(schema.folderRules[0].stubFlagging, false);
});

test("keeps existing schemas working when wiki memory section is absent", () => {
  const { schema, errors } = parseGardenerSchema(`
## Tasks
broken-links: on
orphan-triage: off

## Schedule
run-at: 02:00
batch-size: 10
`);

  assert.deepEqual(errors, []);
  assert.equal(schema.wikiMemory.mode, "in-place");
  assert.equal(schema.wikiMemory.canonicalNotes, "prefer-existing");
  assert.equal(schema.schedule.runAt, "02:00");
  assert.equal(schema.schedule.batchSize, 10);
});

test("validates malformed globs and unknown task keys", () => {
  const { errors } = parseGardenerSchema(`
## Protected
never-write:
  - [

## Tasks
unknown-task: on

## Folder Rules
Bad[: claim-extraction on
Notes/**: mystery-task off
`);

  assert.ok(errors.some((error) => error.section === "Protected" && error.message.includes("Invalid never-write glob")));
  assert.ok(errors.some((error) => error.section === "Tasks" && error.message.includes("Unknown task key")));
  assert.ok(errors.some((error) => error.section === "Folder Rules" && error.message.includes("Invalid glob")));
  assert.ok(errors.some((error) => error.section === "Folder Rules" && error.message.includes("Unknown folder rule setting")));
});
