# Gardener Roadmap

## Shipped (v1.0)

### Maintenance Tasks
- [x] Broken link detection (`BrokenLinkTask`)
- [x] Orphan note triage (`OrphanTask`)
- [x] Stub note flagging (`StubTask`)
- [x] Unlinked mention suggestions (`UnlinkedMentionTask`)
- [x] Near-duplicate detection (`DuplicateTask`) — upgraded with TF-IDF cosine similarity
- [x] Tag normalization (`TagNormalizationTask`)
- [x] Note split suggestions (`NoteSplitTask`)
- [x] Frontmatter linting (`FrontmatterLintTask`)
- [x] MOC maintenance (`MOCTask`)
- [x] Stale note detection (`StaleNoteTask`)
- [x] Semantic duplicate detection (`SemanticSearchTask`) — TF-IDF on full note bodies
- [x] LLM content-aware merge drafts (`ContentMergeTask`)
- [x] Auto-summarise stubs from backlink context (`AutoSummariseTask`)
- [x] Cross-note contradiction detection (`ContradictionTask`)
- [x] Template enforcement per folder (`TemplateLintTask`)

### Core Infrastructure
- [x] Vault indexer (incremental, mtime-based)
- [x] ChangeSet engine (stage → apply → undo)
- [x] 30-day undo journal
- [x] GARDENER.md schema (parse + validate + ## Templates section)
- [x] Safety model (PathGuard + AuditLog)
- [x] Scheduler (overnight + on-launch-if-stale)
- [x] LLM providers (Ollama, OpenAI, Anthropic)
- [x] Trust levels (auto-approve above confidence threshold)
- [x] TF-IDF embedding engine (`src/embeddings/TFIDFEngine.ts`)
- [x] Public plugin API (`GardenerAPI`) — register custom tasks, subscribe to pipeline events
- [x] Run report export (`generateRunReport`) — opt-in via settings

### UI
- [x] Morning Review pane (card-based approval)
- [x] Keyboard shortcuts in Morning Review (a/r/s/↑↓)
- [x] Snooze proposals (7 or 30 days)
- [x] Resurfacing sidebar — backlinks, semantically related, shared tags, similar titles, unlinked mentions
- [x] Vault Health Dashboard (stats, orphans, broken links, tags)
- [x] Undo History view
- [x] First-run wizard
- [x] Schema Library (6 pre-built GARDENER.md templates)
- [x] Writing Velocity chart (`WritingVelocityView`) — SVG bar chart, 12 weeks, created vs edited
- [x] Knowledge Graph Gaps (`KnowledgeGraphView`) — disconnected cluster detection + tag co-occurrence heatmap
- [x] Wiki Memory Compiler (`WikiMemoryView`) — concepts, claim ledger, source provenance, distillation inbox, correction memory

### LLM Wiki Core
- [x] Wiki Memory graph (`.gardener/wiki-memory.json`) with note/concept/claim/source nodes and provenance
- [x] Error Book (`.gardener/error-book.json`) for rejected/stale/bad suggestions
- [x] GARDENER.md `## Wiki Memory` and `## Folder Rules`
- [x] Canonical concept and claim consistency tasks
- [x] Public API for memory graph, memory search, and claims by note
- [x] Distillation Inbox actions — accept/reject claims, queue hub notes, and persist memory review state
- [x] Canonical page workflow — create/promote canonical pages, register approvals, and strengthen pages with source receipts
- [x] Claim-to-concept support edges and contradiction graph edges
- [x] Canonical Page Workbench and Contradiction Review Workbench
- [x] Memory confidence scoring, source-scope inspector, claim wording edits, diff preview, and graph export
- [x] Cooperative batching for large-vault index and memory graph builds
- [x] Schema validation blocks runs when `GARDENER.md` is invalid

---

## Future — LLM Wiki Experience

### Memory Quality Evaluation
Track acceptance rate, rejection clusters, contradiction resolution states, and confidence drift over time.
- Needs: per-run quality snapshots and trend UI.

### Canonical Page Lifecycle
Detect stale canonical pages, missing source receipts, and accepted claims not yet represented in a page.
- Needs: lifecycle task and dedicated workbench filters.

### Wiki Constitution UI
Show parsed `GARDENER.md` rules, folder scopes, and validation errors inside Settings.
- Needs: schema lint panel with jump-to-section guidance.

## Future — Review Experience

### Bulk Filter / Sort in Morning Review
Filter cards by task type, sort by confidence. Collapse all flags of one type.
- Pure UI change in `src/ui/MorningReviewView.ts`.

### Side-by-Side Diff for Merge Proposals
When a merge is proposed, show both full notes side-by-side rather than just flagging the pair.
- Needs new modal or expanded card layout.

---

## Future — Power User / Workflow

### Folder Rules
Per-folder task overrides in GARDENER.md (e.g. `Fleeting/**`: disable stub-flagging).
- Shipped for claim extraction and stub flagging; future work is broader per-task coverage in every task.
