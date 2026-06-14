# LLM Wiki — Personal Learning Edition

A pattern for building a personal knowledge base that compounds over time using LLMs.

This is an idea file. Copy it to your LLM agent (Claude Code, Codex, or similar). Its goal is to communicate the pattern — your agent will build out the specifics with you.

---

## The core idea

Most people's experience with LLMs and documents is RAG: upload files, retrieve chunks at query time, generate an answer. This works, but the LLM rediscovers everything from scratch on every question. Nothing accumulates. Ask something that requires synthesizing five sources and the LLM pieces together fragments every time. NotebookLM, ChatGPT uploads, most RAG systems — this is how they work.

The idea here is different. Instead of retrieving from raw sources at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw material. When you add a new source, the LLM doesn't just index it. It reads it, extracts the key ideas, and integrates them into the existing wiki — updating concept pages, revising mental models, flagging where new evidence contradicts old claims, strengthening the evolving synthesis. Knowledge is compiled once and kept current, not re-derived on every query.

**The wiki is a persistent, compounding artifact.** The cross-references are already there. The contradictions have been flagged. The synthesis already reflects everything you've read. The wiki gets richer with every source you add and every question you ask.

You never write the wiki yourself — the LLM writes and maintains all of it. You source the material, direct the analysis, and ask the questions. The LLM does the bookkeeping: summarizing, cross-referencing, filing, flagging gaps, and keeping everything consistent. In practice: LLM agent open on one side, Obsidian on the other. The LLM edits based on your conversation; you browse results in real time — following links, checking graph view, reading updated pages. Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.

---

## What this is for

This setup is optimized for **learning and understanding** — going deep on topics over time, building a personal knowledge base that reflects how you think, and being able to query it meaningfully months or years later.

Good fits:
- **Deep dives** — going deep on a topic over weeks or months (AI, philosophy, history, science, economics, any domain)
- **Book reading** — filing each chapter as you go, building a companion wiki of ideas, arguments, people, and connections
- **Course notes** — turning lectures and readings into a structured, searchable knowledge base
- **Podcast and video capture** — processing transcripts and highlights into lasting ideas
- **Mental model building** — tracking frameworks, heuristics, and the evidence for and against them
- **Research** — going deep with evolving thesis, tracking how your understanding changes as you read more
- **Intellectual biography** — tracking the evolution of your own thinking over time

---

## Architecture

Three layers:

**Raw sources** — your curated source material. Articles, papers, book chapters, transcripts, podcast highlights, course notes, daily captures. Immutable — the LLM reads, never modifies. This is your source of truth.

**The wiki** — LLM-maintained markdown files. Concept pages, people pages, claim pages, mental model pages, open question pages, connection pages, a master index, a log. The LLM owns this layer entirely. You read it; the LLM writes it.

**The schema** — a document (`CLAUDE.md` for Claude Code, `AGENTS.md` for Codex) that tells the LLM how the wiki is structured, what conventions to follow, and what workflows to run. This is the key config file — what makes the LLM a disciplined wiki maintainer rather than a generic chatbot. You and the LLM co-evolve it as you figure out what works for your learning style.

---

## Operations

**Ingest.** Drop a new source into `raw/` and tell the LLM to process it. Typical flow: read the source, surface key ideas with you, write a source summary, update relevant concept and people pages, file strong claims, note contradictions with existing wiki content, log the activity. A single source may touch 8–15 wiki pages. Stay involved — read the summaries, check the updates, tell the LLM what matters most.

**Query.** Ask questions against the wiki. The LLM reads the index, pulls relevant pages, synthesizes an answer with citations. Strong answers get filed back into the wiki as new pages — comparisons, analyses, connections you discovered. Your explorations compound in the knowledge base just like ingested sources do.

**Lint.** Periodically ask the LLM to health-check the wiki: contradictions between pages, stale claims superseded by newer sources, orphan pages, concepts mentioned but lacking their own page, missing cross-references, open questions you've since answered. This keeps the wiki sharp as it grows.

---

## Indexing and logging

**index.md** — content-oriented. A catalog of every wiki page with a link, one-line summary, and type. Updated on every ingest. The LLM reads this first when answering queries before drilling into pages.

**log.md** — chronological. Append-only record of every ingest, query, and lint pass. Each entry starts with `## [YYYY-MM-DD] operation | title` so you can grep it. Gives you a timeline of how the wiki evolved.

---

## Why this works for learning

The hard part of building a personal knowledge base isn't the reading — it's the maintenance. Updating cross-references, keeping summaries current, noticing when a new idea challenges an old one, building up connections that make knowledge actually usable. Humans abandon wikis because the maintenance cost grows faster than the value. LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass.

Your job is to read good things, ask good questions, and think about what it all means. The LLM's job is everything else.

The result, over time, is close to Vannevar Bush's Memex (1945) — a personal knowledge store with associative trails between ideas, actively curated, where the connections between documents are as valuable as the documents themselves. The part Bush couldn't solve was who does the maintenance. That's now solved.

---

## Tips

- **Obsidian Web Clipper** converts web articles to markdown. Best way to get sources into `raw/`.
- **Download images locally.** Settings → Files and links → set attachment folder to `raw/assets/`. Bind "Download attachments for current file" to a hotkey. Images stay local and the LLM can reference them.
- **Obsidian graph view** shows the shape of your wiki — which concepts are hubs, which are orphans, how ideas cluster together.
- **Dataview plugin** lets you query frontmatter. If the LLM tags pages with type, confidence, date, and source count, you can build dynamic tables across the wiki.
- **File good answers back.** When you ask a question and get a strong synthesis, always ask the LLM to save it as a wiki page. That's how the knowledge base grows beyond what you've read.
- **The wiki is a git repo.** Version history, branching, and the ability to see how your understanding evolved over time — all free.

---

## Note

This document describes the pattern, not a specific implementation. Directory structure, page formats, entity types, tooling — all depends on your domain and how you think. Share it with your LLM agent and co-design a version that fits your learning style. The schema (`CLAUDE.md`) is where the real configuration lives.
