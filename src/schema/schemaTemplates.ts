export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
}

export const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    id: "llm-wiki",
    name: "LLM Wiki / Evergreen Memory",
    description: "In-place wiki memory: canonical concepts, claim provenance, conservative related-note context.",
    icon: "🌱",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: In-place evergreen wiki memory built from existing Obsidian notes
method: LLM Wiki
tone: neutral

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Journal/**
never-read:
  - .obsidian/**
  - Journal/Private/**
  - Private/**

## Conventions
naming-style: sentence-case
date-format: YYYY-MM-DD
folder-semantics: Notes = evergreen pages, Sources = source notes, Inbox = raw capture, Journal = private daily writing
tag-taxonomy:
  - concept
  - claim
  - source
  - moc
  - evergreen

## Tasks
merge-duplicates: on
  min-similarity: 0.88
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 40

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
Journal/**: claim-extraction off, stub-flagging off
Daily/**: claim-extraction off, stub-flagging off
Private/**: claim-extraction off, stub-flagging off
Inbox/**: claim-extraction off
Sources/**: claim-extraction on
Highlights/**: claim-extraction on, stub-flagging off
Evergreen/**: claim-extraction on
Wiki/**: claim-extraction on

## Rules
- Prefer existing notes as canonical concept pages
- Do not create a parallel wiki folder
- Every claim or contradiction must point back to source notes
- New hub notes require review before creation
- Journal and private folders should not feed the memory graph

## Schedule
run-at: 03:00
batch-size: 25
`,
  },
  {
    id: "zettelkasten",
    name: "Zettelkasten",
    description: "Atomic permanent notes, literature notes, and fleeting ideas. Dense linking between concepts.",
    icon: "🗂️",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Zettelkasten knowledge base — atomic, permanent, densely linked notes
method: Zettelkasten
tone: neutral

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Fleeting/**
never-read:
  - .obsidian/**

## Conventions
naming-style: numeric-id
date-format: YYYY-MM-DD
folder-semantics: Fleeting = inbox, Literature = source notes, Permanent = evergreen ideas
tag-taxonomy:
  - fleeting
  - literature
  - permanent
  - concept
  - reference

## Tasks
merge-duplicates: on
  min-similarity: 0.85
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 30

## Rules
- Never merge a fleeting note with a permanent note
- Permanent notes should be atomic (one idea per note)
- Preserve numeric IDs in note titles

## Schedule
run-at: 03:00
batch-size: 30
`,
  },
  {
    id: "para",
    name: "PARA",
    description: "Projects, Areas, Resources, Archives. Action-oriented organisation by relevance to your life.",
    icon: "📁",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: PARA productivity system — projects, areas, resources, archives
method: PARA
tone: neutral

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Archives/**
never-read:
  - .obsidian/**
  - Archives/**

## Conventions
naming-style: kebab-case
date-format: YYYY-MM-DD
folder-semantics: Projects = active outcomes, Areas = ongoing responsibilities, Resources = topics of interest, Archives = inactive
tag-taxonomy:
  - project
  - area
  - resource
  - archived
  - action
  - reference
  - waiting

## Tasks
merge-duplicates: on
  min-similarity: 0.88
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 50

## Rules
- Never suggest moving notes into Archives — that is the user's decision
- Do not flag Project notes as orphans — they link to tasks, not other notes
- Resources can be stubs; do not flag them unless word count is under 20

## Schedule
run-at: 03:00
batch-size: 25
`,
  },
  {
    id: "academic",
    name: "Academic Research",
    description: "Literature reviews, citations, experiments, and arguments. Focused on sources and claims.",
    icon: "🎓",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Academic research vault — literature, experiments, arguments, and writing
method: Zettelkasten
tone: formal

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Raw-Data/**
never-read:
  - .obsidian/**
  - Raw-Data/**

## Conventions
naming-style: author-year
date-format: YYYY-MM-DD
folder-semantics: Literature = paper notes (author-year), Claims = atomic arguments, Experiments = data and methods
tag-taxonomy:
  - claim
  - evidence
  - method
  - literature
  - hypothesis
  - replication
  - to-read
  - to-cite

## Tasks
merge-duplicates: on
  min-similarity: 0.82
unlinked-mentions: on
broken-links: on
orphan-triage: off
stub-flagging: on
  min-words: 100

## Rules
- Never merge two literature notes even if titles are similar — they represent distinct sources
- Claims must stay separate from literature notes
- Do not suggest linking notes from different experimental projects

## Schedule
run-at: 02:00
batch-size: 20
`,
  },
  {
    id: "journal",
    name: "Personal Journal",
    description: "Daily notes, reflections, and personal logs. Privacy-first with protected folders.",
    icon: "📓",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Personal journal — daily notes, reflections, and life tracking
method: Daily notes
tone: personal

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Journal/**
  - Private/**
never-read:
  - .obsidian/**
  - Journal/**
  - Private/**

## Conventions
naming-style: YYYY-MM-DD
date-format: YYYY-MM-DD
folder-semantics: Journal = daily entries (protected), Topics = evergreen reflections, People = person notes
tag-taxonomy:
  - mood
  - gratitude
  - goal
  - person
  - memory
  - idea

## Tasks
merge-duplicates: off
unlinked-mentions: on
broken-links: on
orphan-triage: off
stub-flagging: off

## Rules
- Never read or write to the Journal or Private folders
- Do not flag daily notes as orphans
- Do not suggest merging person notes

## Schedule
run-at: 04:00
batch-size: 10
`,
  },
  {
    id: "book-notes",
    name: "Book Notes",
    description: "Reading list, summaries, highlights, and book-to-idea connections.",
    icon: "📚",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Book notes vault — reading list, summaries, highlights, and idea connections
method: Progressive summarization
tone: neutral

## Protected
never-write:
  - Templates/**
  - .obsidian/**
never-read:
  - .obsidian/**

## Conventions
naming-style: title-author
date-format: YYYY-MM-DD
folder-semantics: Books = one note per book, Highlights = raw excerpts, Ideas = concepts extracted from reading
tag-taxonomy:
  - to-read
  - reading
  - finished
  - fiction
  - non-fiction
  - idea
  - favourite

## Tasks
merge-duplicates: on
  min-similarity: 0.90
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 80

## Rules
- Never merge two book notes even if similarity is high — each book is distinct
- Highlight notes are intentionally sparse; do not flag them as stubs
- Prefer linking Ideas notes to Books notes over linking Books to Books

## Schedule
run-at: 03:00
batch-size: 20
`,
  },
  {
    id: "creative-writing",
    name: "Creative Writing",
    description: "Characters, plots, worldbuilding, and drafts. Keeps your story bible consistent.",
    icon: "✍️",
    content: `# GARDENER.md
> Gardener reads this file before every run. Edit it like a note.

## Identity
purpose: Creative writing vault — characters, world, plot, and drafts
method: Story bible
tone: creative

## Protected
never-write:
  - Templates/**
  - .obsidian/**
  - Drafts/**
never-read:
  - .obsidian/**

## Conventions
naming-style: title-case
date-format: YYYY-MM-DD
folder-semantics: Characters = one note per character, World = locations and lore, Plot = scenes and arcs, Drafts = manuscript (protected)
tag-taxonomy:
  - character
  - location
  - faction
  - magic-system
  - plot-point
  - theme
  - symbol

## Tasks
merge-duplicates: on
  min-similarity: 0.92
unlinked-mentions: on
broken-links: on
orphan-triage: on
stub-flagging: on
  min-words: 40

## Rules
- Never merge two character notes
- Never read or write Drafts folder
- Character notes are not orphans even if nothing links to them yet
- Suggest links between character notes and location notes aggressively

## Schedule
run-at: 03:00
batch-size: 25
`,
  },
];
