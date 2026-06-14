# 🌱 Gardener for Obsidian

**Your vault is full of ideas. Gardener helps you find them, connect them, and turn them into a living knowledge base — automatically.**

Gardener scans your notes while you sleep, extracts concepts and claims, surfaces connections you missed, and proposes improvements for you to review. Powered by a local or cloud LLM. You stay in control of every change.

---

## Why Gardener?

Most people end up with hundreds of notes and no clear picture of what they actually know. Ideas sit in isolation. Duplicates pile up. Broken links go unnoticed. Insights that should connect never do.

Gardener fixes this. It reads your vault the way a librarian would — finding patterns, flagging inconsistencies, and building a structured knowledge base from what you've already written. You approve what looks good and ignore the rest.

---

## What it does

### 📚 Wiki Writer
Gardener autonomously maintains a wiki inside your vault — no manual filing required.

- Reads every note in your vault
- Creates a **source summary page** for each document (key ideas, notable claims, direct quotes)
- Builds **concept pages** as ideas accumulate enough evidence across your notes
- Keeps a **master index** and **scan log** updated after every run
- Follows the [Karpathy LLM Wiki](https://github.com/karpathy/llm-wiki) pattern — raw notes stay untouched, the wiki folder is entirely Gardener-managed

### 🧠 Knowledge Graph
Under the hood, Gardener builds a graph of everything in your vault.

- Extracts **concepts**, **claims**, and **relationships** across all notes
- Detects **contradictions** between notes that disagree on the same topic
- Identifies **concepts mentioned everywhere but never given their own page**
- Tracks **claim confidence** and **source provenance**

### 🔗 Structural Maintenance
Every scan checks the health of your vault.

| What Gardener finds | What it proposes |
|---|---|
| Broken links | Fix the link |
| Orphan notes | Connect them or flag for review |
| Unlinked mentions | Add the missing `[[link]]` |
| Near-duplicate notes | Merge drafts for your approval |
| Stub notes (too short) | Auto-summarise from backlink context |
| Notes that disagree | Flag the contradiction for resolution |
| Tags with inconsistent casing | Normalise them |

### 🤖 Agent Integration
Working with Claude Code, Cursor, Codex, Windsurf, or Gemini CLI?

Gardener generates a schema file (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`, etc.) that tells your AI agent exactly how the wiki is structured, which files it owns, which it should never touch, and how to navigate and extend the knowledge base. The schema stays in sync automatically on every scan.

### ✅ Batch Review
Every suggestion Gardener makes is a proposal — nothing changes without your approval.

- **Batch Review modal** — grouped by category (wiki pages, ideas, links, conflicts, cleanup)
- Accept or reject an entire category at once, or pick individual items
- **Per-category auto-approve** — turn on any category to let Gardener apply those changes automatically
- **Keyboard shortcuts** — `A` to accept, `R` to reject, `↑↓` to navigate
- Reviewed items collapse automatically to keep the view clean
- Snooze anything for 7 or 30 days

### 🏗️ Vault Setup
Don't have a structured vault yet? One click creates the full Karpathy layout:

```
raw/              ← your source material (articles, books, papers, highlights, transcripts)
wiki/
  index.md        ← master catalog, auto-maintained by Gardener
  log.md          ← scan history
  sources/        ← one summary per source document
  concepts/       ← core ideas and domain concepts
  people/         ← thinkers and authors
  models/         ← mental models and frameworks
  questions/      ← open questions under investigation
  connections/    ← cross-domain links
  analyses/       ← syntheses and filed query answers
```

---

## Getting started

### 1. Install
- **Community plugins** (once listed): Settings → Community plugins → search "Gardener"
- **Manual**: download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/kellandamm/obsidian_gardener/releases) → copy to `.obsidian/plugins/gardener-plugin/`

### 2. Configure your LLM
Settings → Gardener → **AI Provider**

| Provider | Setup |
|---|---|
| **Ollama** (recommended) | Install [Ollama](https://ollama.ai), run a model locally, point Gardener at `http://localhost:11434` |
| **LM Studio** | Start the local server, use OpenAI-compatible mode at `http://localhost:1234/v1` |
| **OpenAI** | Paste your API key — note content is sent to OpenAI |
| **Anthropic** | Paste your API key — note content is sent to Anthropic |

### 3. Set up your vault layout
Settings → Gardener → **Vault Setup** → "Build Karpathy layout"

Creates all folders and starter files. Safe to run on an existing vault — nothing is overwritten.

### 4. Enable Wiki Writer
Settings → Gardener → **Wiki Writer** → toggle on

Set your folder paths (or use the defaults), then decide which categories to auto-approve.

### 5. Run your first scan
Click the 🌱 leaf icon in the ribbon → **Scan vault now**

Gardener scans your notes and queues proposals. Open **Batch Review** to go through them.

---

## LLM providers

Gardener works fully offline with Ollama or LM Studio. No data ever leaves your machine unless you choose a cloud provider.

| Provider | Data stays local | Requires API key |
|---|---|---|
| Ollama | ✅ Yes | No |
| LM Studio | ✅ Yes | No |
| OpenAI | ❌ No | Yes |
| Anthropic | ❌ No | Yes |

> **Privacy note:** When a cloud provider is selected, note content is sent to that provider's API for processing. API keys are stored in Obsidian plugin data (not encrypted). Use Ollama or LM Studio to keep everything on-device.

---

## Views

| View | What it shows |
|---|---|
| **Suggestions** | Card-by-card review with keyboard shortcuts |
| **Batch Review** | All suggestions grouped by category — bulk accept/reject |
| **Vault Dashboard** | Orphans, broken links, stubs, and overall vault health |
| **Knowledge Graph** | Disconnected clusters and tag co-occurrence heatmap |
| **Wiki Memory** | Extracted concepts, claims, contradictions, and source provenance |
| **Writing Velocity** | Word count trends over time (12-week chart) |
| **Change History** | Browse and undo every change Gardener has applied |

---

## Settings highlights

- **Auto-approve threshold** — proposals above this confidence score apply automatically (0 = always review)
- **Per-category auto-approve** — enable wiki pages, ideas, links, conflicts, or cleanup independently
- **Dry run** — see every proposal without writing anything to disk
- **Excluded folders** — tell Gardener which folders to skip entirely
- **Run schedule** — scans overnight by default (configurable)
- **Batch size** — cap how many changes apply per scan

---

## Requirements

- Obsidian 0.15.0 or later
- Desktop only (Windows, macOS, Linux)
- An LLM provider (local or cloud) for AI-powered features — structural tasks (broken links, orphans, etc.) run without one

---

## License

MIT — see [LICENSE](LICENSE)
