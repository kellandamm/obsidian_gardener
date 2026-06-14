# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Personal learning knowledge base — concepts, claims, mental models, open questions
method: LLM Wiki (Karpathy-style)
tone: neutral

## Protected

never-write:
  - raw/**
  - Links/_inbox/**
  - .obsidian/**
  - CLAUDE.md
  - GARDENER.md

never-read:
  - .obsidian/**
  - raw/daily/**
  - Links/_inbox/**

## Conventions
naming-style: sentence-case
date-format: YYYY-MM-DD
folder-semantics: |
  raw/ = immutable source material (never touch)
  wiki/ = LLM-maintained knowledge base
  wiki/concepts/ = core ideas and domain concepts
  wiki/people/ = thinkers, authors, researchers
  wiki/claims/ = specific assertions with evidence and confidence
  wiki/models/ = mental models, frameworks, heuristics
  wiki/questions/ = open questions under investigation
  wiki/sources/ = one summary page per raw source
  wiki/connections/ = cross-domain links between ideas
  wiki/analyses/ = syntheses, comparisons, filed query answers
  Links/ = saved links awaiting triage

tag-taxonomy:
  - concept
  - claim
  - model
  - person
  - question
  - source
  - connection
  - analysis
  - high-confidence
  - low-confidence

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
canonical-folder: wiki/concepts
claim-extraction: on
contradiction-buffer: on
related-section: off

## Wiki Writer
wiki-writer: on
sources-folder: wiki/sources
concepts-folder: wiki/concepts
index-file: wiki/index.md
log-file: wiki/log.md
raw-folders: raw/articles, raw/books, raw/papers, raw/transcripts, raw/highlights
concept-page-min-claims: 3

## Folder Rules

# Raw sources — Gardener reads for concept/claim extraction but never writes
raw/articles/**:    claim-extraction on,  stub-flagging off
raw/books/**:       claim-extraction on,  stub-flagging off
raw/papers/**:      claim-extraction on,  stub-flagging off
raw/transcripts/**: claim-extraction on,  stub-flagging off
raw/highlights/**:  claim-extraction on,  stub-flagging off
raw/daily/**:       claim-extraction off, stub-flagging off
raw/goals/**:       claim-extraction off, stub-flagging off

# Wiki — Gardener actively maintains these
wiki/concepts/**:   claim-extraction on,  stub-flagging on
wiki/claims/**:     claim-extraction on,  stub-flagging off
wiki/people/**:     claim-extraction on,  stub-flagging on
wiki/models/**:     claim-extraction on,  stub-flagging on
wiki/questions/**:  claim-extraction off, stub-flagging off
wiki/sources/**:    claim-extraction on,  stub-flagging off
wiki/connections/**: claim-extraction on, stub-flagging off
wiki/analyses/**:   claim-extraction on,  stub-flagging off

# Links inbox — no processing
Links/**:           claim-extraction off, stub-flagging off

## Rules
- Never create, move, or modify any file inside raw/
- Never modify wiki/log.md or wiki/index.md — these are maintained by the LLM agent (Claude Code / Codex)
- Never modify CLAUDE.md or GARDENER.md
- Prefer existing wiki pages as canonical concept pages — do not create parallel structure
- Stub flagging in wiki/concepts/ and wiki/people/ is intentional — these should be rich pages
- Claim contradictions should be flagged as proposals for human review, not auto-resolved
- Unlinked mentions across wiki pages are high-value suggestions — surface them
- Orphan pages in wiki/ are likely Claude Code stubs that haven't been linked yet — flag but do not delete

## Schedule
run-at: 03:00
batch-size: 30
