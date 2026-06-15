# Gardener for Obsidian

Gardener is an Obsidian plugin that scans your vault and prepares reviewable suggestions for improving your notes.

It helps with:

- finding useful ideas across notes
- suggesting links between related notes
- identifying topics that may deserve a main note
- surfacing possible conflicts between notes
- finding broken links, duplicate notes, stubs, and tag issues

Gardener does not silently rewrite your vault. It stages suggestions for review, and you decide what to accept, reject, snooze, or ignore.

## Why Gardener?

Obsidian vaults often grow faster than they are maintained. Notes become isolated, links go missing, duplicates appear, and useful ideas are hard to reuse.

Gardener is designed to help with that maintenance layer. It scans your existing notes, builds a local memory index, and proposes changes that can make the vault easier to navigate and use.

## What Gardener Does

### Scan Vault

Gardener indexes Markdown files in your vault and applies the rules in `GARDENER.md`.

A scan can produce suggestions for:

- broken links
- orphan notes
- unlinked mentions
- duplicate or overlapping notes
- stub notes
- inconsistent tags
- possible conflicts between notes
- topics that may deserve a main note

### Suggestions

All note edits are reviewable.

Gardener groups suggestions into practical categories:

| Category | Purpose |
|---|---|
| New Ideas | Ideas found across your notes |
| Main Notes | Topic pages, hub notes, and duplicate-note decisions |
| Links | Missing links, related notes, and broken links |
| Conflicts | Notes that may disagree or need review |
| Cleanup | Tags, templates, stubs, and general maintenance |

You can review suggestions one by one, accept them in bulk, reject them, or snooze them.

### Knowledge Garden

Gardener maintains a local memory index under `.gardener/`.

This index can track:

- notes
- topics
- extracted ideas
- source references
- relationships between notes and topics
- rejected suggestions
- stale suggestions
- correction history

The memory index is separate from your note text. Deleting `.gardener/` removes Gardener’s internal memory without deleting your notes.

### Main Notes

Gardener prefers existing notes as main notes when possible.

A note may be treated as a strong topic page if it has backlinks, useful tags, a matching title, or appears in a configured folder.

Creating a new main note is review-only. Gardener prepares the suggestion and waits for approval.

### Conflicts

Gardener can surface possible conflicts between notes and show the relevant source snippets.

Conflict detection is advisory. Gardener does not rewrite notes to resolve conflicts.

### AI Agent Compatibility

Gardener is not meant to replace your AI agent or chat tool.

It prepares your vault so other tools can work with better context. You can use it alongside:

- ChatGPT
- Claude
- Gemini
- Cursor
- Codex
- Ollama
- LM Studio
- custom scripts
- other Obsidian AI plugins

The goal is to keep the useful memory layer inside your vault: notes, links, sources, review decisions, and correction history.

## Privacy

Gardener is local-first by default.

Structural tasks such as broken-link checks, orphan detection, tag cleanup, and duplicate detection can run without an LLM.

AI-backed tasks use the provider you configure.

| Provider | Local | API key required |
|---|---:|---:|
| Ollama | Yes | No |
| LM Studio / OpenAI-compatible local server | Yes | Usually no |
| OpenAI | No | Yes |
| Anthropic | No | Yes |

If you use a cloud provider, relevant note content may be sent to that provider.

Use `GARDENER.md` to mark private folders as `never-read`. Gardener should not index or send `never-read` content to an LLM.

## Getting Started

### Install

Manual installation:

1. Build or download the plugin files.
2. Copy these files into your vault plugin folder:

```text
.obsidian/plugins/obsidian-gardener/
  manifest.json
  main.js
  styles.css
## License

MIT — see [LICENSE](LICENSE)
