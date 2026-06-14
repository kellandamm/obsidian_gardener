import type { GardenerSchema } from "./GardenerSchema";

export const DEFAULT_SCHEMA: GardenerSchema = {
  identity: {
    purpose: "Personal knowledge base",
    method: "Zettelkasten",
    tone: "neutral",
  },
  protected: {
    neverWrite: ["Templates/**"],
    neverRead: [],
  },
  conventions: {
    namingStyle: "kebab-case",
    dateFormat: "YYYY-MM-DD",
    folderSemantics: "",
    tagTaxonomy: [],
  },
  tasks: {
    mergeDuplicates: { enabled: true, minSimilarity: 0.88 },
    unlinkedMentions: { enabled: true },
    brokenLinks: { enabled: true },
    orphanTriage: { enabled: true },
    stubFlagging: { enabled: true, minWords: 50 },
  },
  rules: [],
  schedule: {
    runAt: "03:00",
    batchSize: 25,
  },
  wikiMemory: {
    enabled: true,
    mode: "in-place",
    canonicalNotes: "prefer-existing",
    newHubNotes: "review-only",
    canonicalFolder: "Wiki",
    claimExtraction: true,
    contradictionBuffer: true,
    relatedSection: false,
    wikiWriter: false,
    sourcesFolder: "",
    conceptsFolder: "",
    indexFile: "",
    logFile: "",
    rawFolders: [],
    conceptPageMinClaims: 3,
  },
  folderRules: [
    { glob: "Journal/**", claimExtraction: false, stubFlagging: false },
    { glob: "Daily/**", claimExtraction: false, stubFlagging: false },
    { glob: "Private/**", claimExtraction: false, stubFlagging: false },
    { glob: "Sources/**", claimExtraction: true, stubFlagging: false },
    { glob: "Highlights/**", claimExtraction: true, stubFlagging: false },
  ],
  templateMap: {},
};

export const DEFAULT_GARDENER_MD = `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Personal knowledge base
method: Zettelkasten
tone: neutral

## Protected
never-write:
  - Templates/**
never-read:

## Conventions
naming-style: kebab-case
date-format: YYYY-MM-DD
folder-semantics:
tag-taxonomy:

## Tasks
merge-duplicates: on
  min-similarity: 0.88
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 50

## Wiki Memory
enabled: on
mode: in-place
canonical-notes: prefer-existing
new-hub-notes: review-only
canonical-folder: Wiki
claim-extraction: on
contradiction-buffer: on
related-section: off

## Folder Rules
# Format: glob: setting on/off, setting on/off
Journal/**: claim-extraction off, stub-flagging off
Daily/**: claim-extraction off, stub-flagging off
Private/**: claim-extraction off, stub-flagging off
Sources/**: claim-extraction on, stub-flagging off
Highlights/**: claim-extraction on, stub-flagging off

## Rules

## Schedule
run-at: 03:00
batch-size: 25

## Templates
# Map folder globs to template files. Format: glob: Templates/FileName.md
# Examples:
#   Books/**: Templates/Book Note.md
#   Projects/**: Templates/Project Note.md
`;
