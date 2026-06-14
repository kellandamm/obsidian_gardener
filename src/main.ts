import { Plugin, WorkspaceLeaf, Notice, TFile, normalizePath } from "obsidian";
import { parseGardenerSchema } from "./schema/parseSchema";
import { DEFAULT_SCHEMA, DEFAULT_GARDENER_MD } from "./schema/defaultSchema";
import type { GardenerSchema, SchemaValidationError } from "./schema/GardenerSchema";
import { Indexer } from "./index/Indexer";
import { ChangeSetEngine } from "./changeset/ChangeSetEngine";
import { PathGuard } from "./safety/PathGuard";
import { AuditLog } from "./safety/AuditLog";
import { Scheduler } from "./scheduler/Scheduler";
import { LLMProvider, NoopLLMProvider } from "./llm/LLMProvider";
import { OllamaProvider } from "./llm/OllamaProvider";
import { OpenAICompatibleProvider, OpenAIProvider } from "./llm/OpenAIProvider";
import { AnthropicProvider } from "./llm/AnthropicProvider";
import { BrokenLinkTask } from "./tasks/BrokenLinkTask";
import { OrphanTask } from "./tasks/OrphanTask";
import { StubTask } from "./tasks/StubTask";
import { UnlinkedMentionTask } from "./tasks/UnlinkedMentionTask";
import { DuplicateTask } from "./tasks/DuplicateTask";
import { TagNormalizationTask } from "./tasks/TagNormalizationTask";
import { NoteSplitTask } from "./tasks/NoteSplitTask";
import { FrontmatterLintTask } from "./tasks/FrontmatterLintTask";
import { MOCTask } from "./tasks/MOCTask";
import { StaleNoteTask } from "./tasks/StaleNoteTask";
import { SemanticSearchTask } from "./tasks/SemanticSearchTask";
import { ContentMergeTask } from "./tasks/ContentMergeTask";
import { AutoSummariseTask } from "./tasks/AutoSummariseTask";
import { TemplateLintTask } from "./tasks/TemplateLintTask";
import { WikiMemoryBuildTask } from "./tasks/WikiMemoryBuildTask";
import { WikiSourceSummaryTask } from "./tasks/WikiSourceSummaryTask";
import { WikiConceptPageTask } from "./tasks/WikiConceptPageTask";
import { WikiIndexTask } from "./tasks/WikiIndexTask";
import { WikiAgentSchemaTask } from "./tasks/WikiAgentSchemaTask";
import { CanonicalConceptTask } from "./tasks/CanonicalConceptTask";
import { ContextualizeNoteTask } from "./tasks/ContextualizeNoteTask";
import { ClaimConsistencyBufferTask } from "./tasks/ClaimConsistencyBufferTask";
import { QueuedHubNoteTask } from "./tasks/QueuedHubNoteTask";
import { CanonicalStrengthenTask } from "./tasks/CanonicalStrengthenTask";
import type { Task } from "./tasks/Task";
import { MorningReviewView, MORNING_REVIEW_VIEW_TYPE } from "./ui/MorningReviewView";
import { ResurfacingSidebarView, RESURFACING_VIEW_TYPE } from "./ui/ResurfacingSidebarView";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./ui/DashboardView";
import { UndoHistoryView, UNDO_HISTORY_VIEW_TYPE } from "./ui/UndoHistoryView";
import { GardenerSettingsTab } from "./ui/SettingsTab";
import { FirstRunModal } from "./ui/FirstRunModal";
import { SchemaLibraryModal } from "./ui/SchemaLibraryModal";
import { WritingVelocityView, VELOCITY_VIEW_TYPE } from "./ui/WritingVelocityView";
import { KnowledgeGraphView, GRAPH_GAPS_VIEW_TYPE } from "./ui/KnowledgeGraphView";
import { WikiMemoryView, WIKI_MEMORY_VIEW_TYPE } from "./ui/WikiMemoryView";
import { generateRunReport } from "./ui/ExportReportView";
import { GardenerLauncherModal } from "./ui/GardenerLauncherModal";
import { BatchReviewModal } from "./ui/BatchReviewModal";
import { GardenerAPI } from "./plugin-api/GardenerAPI";
import { ErrorBook } from "./memory/ErrorBook";
import { MemoryReviewStore } from "./memory/MemoryReviewStore";
import { CanonicalPageRegistry } from "./memory/CanonicalPageRegistry";
import type { MemoryRef } from "./memory/MemoryRef";
import { createWikiMemoryGraph } from "./memory/WikiMemoryGraph";
import { loadWikiMemoryGraph } from "./memory/persist";
import { isTaskEnabledForPath } from "./schema/folderRules";
import { classifyProposal } from "./tasks/proposalFamilies";
import type { ProposalFamily } from "./tasks/proposalFamilies";

export type AgentIntegration = "none" | "claude-code" | "codex" | "cursor" | "windsurf" | "gemini" | "custom";

export interface GardenerSettings {
  llmProvider: "ollama" | "openai" | "openai-compatible" | "anthropic" | "none";
  apiKey: string;
  model: string;
  runAt: string;
  batchSize: number;
  dryRun: boolean;
  firstRunComplete: boolean;
  vaultPurpose: string;
  ollamaBaseUrl: string;
  openAICompatibleBaseUrl: string;
  autoApproveThreshold: number;
  saveRunReport: boolean;
  vaultStyle: "llm-wiki" | "zettelkasten" | "para" | "academic" | "journal" | "general";
  privacyPosture: "local-first" | "balanced" | "cloud-ok";
  // Wiki Writer
  wikiWriterEnabled: boolean;
  wikiSourcesFolder: string;
  wikiConceptsFolder: string;
  wikiIndexFile: string;
  wikiLogFile: string;
  wikiExcludedFolders: string;
  wikiConceptMinClaims: number;
  // Agent integration
  agentIntegration: AgentIntegration;
  agentSchemaFile: string;
  // Per-category auto-approve
  autoApproveWiki: boolean;
  autoApproveIdeas: boolean;
  autoApproveLinks: boolean;
  autoApproveConflicts: boolean;
  autoApproveCleanup: boolean;
  autoApproveMainNotes: boolean;
}

const DEFAULT_SETTINGS: GardenerSettings = {
  llmProvider: "ollama",
  apiKey: "",
  model: "",
  runAt: "03:00",
  batchSize: 25,
  dryRun: false,
  firstRunComplete: false,
  vaultPurpose: "",
  ollamaBaseUrl: "http://localhost:11434",
  openAICompatibleBaseUrl: "http://localhost:1234/v1",
  autoApproveThreshold: 0,
  saveRunReport: false,
  vaultStyle: "llm-wiki",
  privacyPosture: "local-first",
  wikiWriterEnabled: false,
  wikiSourcesFolder: "wiki/sources",
  wikiConceptsFolder: "wiki/concepts",
  wikiIndexFile: "wiki/index.md",
  wikiLogFile: "wiki/log.md",
  wikiExcludedFolders: ".obsidian, .gardener, Templates",
  wikiConceptMinClaims: 3,
  agentIntegration: "none",
  agentSchemaFile: "",
  autoApproveWiki: false,
  autoApproveIdeas: false,
  autoApproveLinks: false,
  autoApproveConflicts: false,
  autoApproveCleanup: false,
  autoApproveMainNotes: false,
};

const DATA_DIR = ".gardener";
const SCHEMA_PATH = "GARDENER.md";

export default class GardenerPlugin extends Plugin {
  declare settings: GardenerSettings;
  api!: GardenerAPI;
  private schema: GardenerSchema = DEFAULT_SCHEMA;
  private indexer!: Indexer;
  private engine!: ChangeSetEngine;
  private guard!: PathGuard;
  private audit!: AuditLog;
  private scheduler!: Scheduler;
  private llm: LLMProvider = new NoopLLMProvider();
  private schemaErrors: SchemaValidationError[] = [];
  private errorBook!: ErrorBook;
  private memoryReview!: MemoryReviewStore;
  private canonicalRegistry!: CanonicalPageRegistry;
  private memory: MemoryRef = { graph: createWikiMemoryGraph() };

  async onload(): Promise<void> {
    await this.loadSettings();

    await this.ensureDataDir();
    await this.loadSchema();

    this.guard = new PathGuard(
      this.schema.protected.neverWrite,
      this.schema.protected.neverRead
    );
    this.audit = new AuditLog(this.app, DATA_DIR);
    this.errorBook = new ErrorBook(this.app, DATA_DIR);
    await this.errorBook.load();
    this.memoryReview = new MemoryReviewStore(this.app, DATA_DIR);
    await this.memoryReview.load();
    this.canonicalRegistry = new CanonicalPageRegistry(this.app, DATA_DIR);
    await this.canonicalRegistry.load();
    this.memory.graph = await loadWikiMemoryGraph(this.app, DATA_DIR);

    this.engine = new ChangeSetEngine(
      this.app,
      DATA_DIR,
      this.settings.dryRun,
      (rule) => this.appendRuleToSchema(rule),
      (proposal, reason) => this.errorBook.recordRejected(proposal, reason),
      (proposal) => this.errorBook.recordStale(proposal),
      (proposal) => this.canonicalRegistry.recordApprovedProposal(proposal),
      this.audit
    );
    await this.engine.load();

    this.indexer = new Indexer(this.app, DATA_DIR, this.schema);
    await this.indexer.load();

    this.api = new GardenerAPI(() => this.indexer.getIndex(), () => this.memory.graph);

    this.rebuildProvider();

    // Register all views
    this.registerView(
      MORNING_REVIEW_VIEW_TYPE,
      (leaf) => new MorningReviewView(leaf, this.engine)
    );
    this.registerView(
      RESURFACING_VIEW_TYPE,
      (leaf) => new ResurfacingSidebarView(leaf, this.indexer)
    );
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new DashboardView(leaf, this.indexer, this.engine)
    );
    this.registerView(
      UNDO_HISTORY_VIEW_TYPE,
      (leaf) => new UndoHistoryView(leaf, this.engine)
    );
    this.registerView(
      VELOCITY_VIEW_TYPE,
      (leaf) => new WritingVelocityView(leaf)
    );
    this.registerView(
      GRAPH_GAPS_VIEW_TYPE,
      (leaf) => new KnowledgeGraphView(leaf, this.indexer)
    );
    this.registerView(
      WIKI_MEMORY_VIEW_TYPE,
      (leaf) => new WikiMemoryView(
        leaf,
        this.memory,
        this.errorBook,
        this.memoryReview,
        this.indexer,
        this.canonicalRegistry,
        this.engine,
        () => this.runPipeline(),
        () => this.activateReviewView(),
        () => this.schema,
        () => this.settings.privacyPosture,
        () => this.settings.llmProvider,
        this.audit
      )
    );

    this.addSettingTab(new GardenerSettingsTab(this.app, this));

    this.addCommand({
      id: "open-morning-review",
      name: "Open Suggestions",
      callback: () => this.activateReviewView(),
    });
    this.addCommand({
      id: "open-resurfacing",
      name: "Open Writing Context sidebar",
      callback: () => this.activateView(RESURFACING_VIEW_TYPE),
    });
    this.addCommand({
      id: "open-dashboard",
      name: "Open Legacy Vault Health Dashboard",
      callback: () => this.activateView(DASHBOARD_VIEW_TYPE),
    });
    this.addCommand({
      id: "open-undo-history",
      name: "Open Change History",
      callback: () => this.activateView(UNDO_HISTORY_VIEW_TYPE),
    });
    this.addCommand({
      id: "open-schema-library",
      name: "Browse Schema Templates",
      callback: () => this.openSchemaLibrary(),
    });
    this.addCommand({
      id: "open-velocity",
      name: "Open Writing Velocity chart",
      callback: () => this.activateView(VELOCITY_VIEW_TYPE),
    });
    this.addCommand({
      id: "open-graph-gaps",
      name: "Open Legacy Knowledge Graph Gaps",
      callback: () => this.activateView(GRAPH_GAPS_VIEW_TYPE),
    });
    this.addCommand({
      id: "open-wiki-memory",
      name: "Open Gardener Home",
      callback: () => this.activateView(WIKI_MEMORY_VIEW_TYPE),
    });
    this.addCommand({
      id: "run-now",
      name: "Scan vault now",
      callback: () => this.runPipeline(),
    });

    this.addRibbonIcon("leaf", "Gardener", () => this.openLauncher());

    this.scheduler = new Scheduler(
      this.app,
      DATA_DIR,
      () => this.runPipeline(),
      () => this.settings.runAt
    );
    await this.scheduler.start();

    if (!this.settings.firstRunComplete) {
      new FirstRunModal(this.app, this.settings, async (updated) => {
        this.settings = { ...this.settings, ...updated, firstRunComplete: true };
        await this.saveSettings();
        await this.applyWizardSettings(updated);
        this.rebuildProvider();
      }).open();
    }
  }

  onunload(): void {
    this.scheduler?.stop();
    this.indexer?.unload();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getSchemaErrors(): SchemaValidationError[] {
    return [...this.schemaErrors];
  }

  async reloadSchemaForSettings(): Promise<SchemaValidationError[]> {
    await this.loadSchema();
    this.guard?.update(this.schema.protected.neverWrite, this.schema.protected.neverRead);
    this.indexer?.updateSchema(this.schema);
    return this.getSchemaErrors();
  }

  async openGardenerSchema(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }

  rebuildProvider(): void {
    const { llmProvider, apiKey, model, ollamaBaseUrl, openAICompatibleBaseUrl } = this.settings;
    if (llmProvider === "ollama") {
      this.llm = new OllamaProvider(ollamaBaseUrl, model || undefined);
    } else if (llmProvider === "openai" && apiKey) {
      this.llm = new OpenAIProvider(apiKey, model || undefined);
    } else if (llmProvider === "openai-compatible") {
      this.llm = new OpenAICompatibleProvider(openAICompatibleBaseUrl, apiKey || "not-needed", model || undefined);
    } else if (llmProvider === "anthropic" && apiKey) {
      this.llm = new AnthropicProvider(apiKey, model || undefined);
    } else {
      this.llm = new NoopLLMProvider();
    }
  }

  async checkProviderAvailability(): Promise<{ provider: string; available: boolean }> {
    this.rebuildProvider();
    return {
      provider: this.llm.name,
      available: await this.llm.isAvailable(),
    };
  }

  async runPipeline(): Promise<void> {
    const pipelineStart = Date.now();
    new Notice("Gardener: scanning your vault...");

    await this.loadSchema();
    if (this.schemaErrors.length > 0) {
      new Notice(`Gardener: fix ${this.schemaErrors.length} GARDENER.md validation issue${this.schemaErrors.length !== 1 ? "s" : ""} before scanning.`);
      console.warn("Gardener: run blocked by GARDENER.md validation errors:", this.schemaErrors);
      return;
    }
    this.guard.update(this.schema.protected.neverWrite, this.schema.protected.neverRead);
    this.indexer.updateSchema(this.schema);

    const wikiCfg = this.settings.wikiWriterEnabled ? {
      enabled: true,
      sourcesFolder: normalizePath(this.settings.wikiSourcesFolder || "wiki/sources"),
      conceptsFolder: normalizePath(this.settings.wikiConceptsFolder || "wiki/concepts"),
      indexFile: normalizePath(this.settings.wikiIndexFile || "wiki/index.md"),
      logFile: normalizePath(this.settings.wikiLogFile || "wiki/log.md"),
      excludedFolders: this.settings.wikiExcludedFolders.split(",").map((s) => s.trim()).filter(Boolean),
      conceptMinClaims: this.settings.wikiConceptMinClaims,
    } : null;

    const tasks: Task[] = [
      new WikiMemoryBuildTask(this.app, DATA_DIR, this.memory),
      // Wiki writer tasks — run after memory is built, before structural tasks
      new WikiSourceSummaryTask(this.app, wikiCfg),
      new WikiConceptPageTask(this.app, this.memory, this.memoryReview, wikiCfg),
      new WikiIndexTask(this.app, wikiCfg),
      new WikiAgentSchemaTask(this.app, this.settings),
      new QueuedHubNoteTask(this.app, this.memory, this.memoryReview, this.errorBook, this.canonicalRegistry),
      new CanonicalConceptTask(this.app, this.memory, this.errorBook, this.canonicalRegistry),
      new CanonicalStrengthenTask(this.app, this.memory, this.memoryReview, this.canonicalRegistry, this.errorBook),
      new ClaimConsistencyBufferTask(this.memory, this.errorBook),
      new ContextualizeNoteTask(this.app, this.memory, this.errorBook),
      new BrokenLinkTask(this.app),
      new OrphanTask(),
      new StubTask(),
      new UnlinkedMentionTask(this.app),
      new DuplicateTask(),
      new TagNormalizationTask(),
      new NoteSplitTask(),
      new FrontmatterLintTask(this.app),
      new MOCTask(this.app),
      new StaleNoteTask(),
      new SemanticSearchTask(this.app),
      new ContentMergeTask(this.app, this.audit),
      new AutoSummariseTask(this.app, this.audit),
      new TemplateLintTask(this.app),
      ...this.api.getCustomTasks(),
    ];

    const index = this.indexer.getIndex();
    const allFindings = [];

    for (const task of tasks) {
      try {
        const findings = await task.run(index, this.schema, this.llm);
        allFindings.push(...findings);
      } catch (e) {
        console.error(`Gardener: task ${task.id} failed`, e);
      }
    }

    // Filter protected paths and apply batch cap
    const afterGuard = allFindings.filter((f) => this.guard.canWrite(f.proposal.targetPath));
    const blocked = allFindings.filter((f) => !this.guard.canWrite(f.proposal.targetPath));
    if (blocked.length > 0) console.warn(`Gardener: ${blocked.length} findings blocked by never-write:`, blocked.map((f) => f.proposal.targetPath));
    const capped = afterGuard
      .filter((f) => isTaskEnabledForPath(this.schema, f.proposal.targetPath, f.taskId))
      .filter((f) => !this.errorBook.shouldSuppress(f.proposal))
      .slice(0, this.settings.batchSize);

    // Trust levels: per-family auto-approve + global threshold fallback
    const threshold = this.settings.autoApproveThreshold;
    const familyAutoApprove: Record<ProposalFamily, boolean> = {
      wiki: this.settings.autoApproveWiki,
      distill: this.settings.autoApproveIdeas,
      connect: this.settings.autoApproveLinks,
      verify: this.settings.autoApproveConflicts,
      maintain: this.settings.autoApproveCleanup,
      canonicalize: this.settings.autoApproveMainNotes,
    };
    const autoApprove = capped.filter((f) => {
      const family = classifyProposal(f.proposal);
      if (familyAutoApprove[family]) return true;
      return threshold > 0 && f.confidence >= threshold;
    });
    const needsReview = capped.filter((f) => {
      const family = classifyProposal(f.proposal);
      if (familyAutoApprove[family]) return false;
      return !(threshold > 0 && f.confidence >= threshold);
    });

    // Stage proposals that need review
    this.engine.stage(needsReview.map((f) => f.proposal));

    // Auto-apply trusted proposals (skips staging/review)
    let autoApplied = 0;
    if (!this.settings.dryRun) {
      for (const finding of autoApprove) {
        this.engine.stage([finding.proposal]);
        const ok = await this.engine.apply(finding.proposal.id);
        if (ok) autoApplied++;
      }
    }

    const reviewCount = needsReview.length;
    let msg = `Gardener: ${reviewCount} suggestion${reviewCount !== 1 ? "s" : ""} ready for review.`;
    if (autoApplied > 0) msg += ` ${autoApplied} auto-applied.`;
    new Notice(msg);

    // Notify external subscribers via public API
    this.api.notifyPipelineComplete(capped.map((f) => f.proposal));

    // Optionally write a run report to the vault
    if (this.settings.saveRunReport) {
      try {
        await generateRunReport(
          this.app,
          capped.map((f) => f.proposal),
          autoApplied,
          Date.now() - pipelineStart,
          this.audit
        );
      } catch (e) {
        console.error("Gardener: failed to write run report", e);
      }
    }

    if (reviewCount > 0) this.activateReviewView();
  }

  async activateReviewView(): Promise<void> {
    await this.activateView(MORNING_REVIEW_VIEW_TYPE);
    // Refresh the view after opening
    const leaves = this.app.workspace.getLeavesOfType(MORNING_REVIEW_VIEW_TYPE);
    if (leaves.length > 0) {
      (leaves[0].view as MorningReviewView).refresh();
    }
  }

  async setupKarpathyLayout(): Promise<{ created: number }> {
    let created = 0;

    const folders = [
      "raw",
      "raw/articles",
      "raw/books",
      "raw/papers",
      "raw/transcripts",
      "raw/highlights",
      "raw/daily",
      "raw/goals",
      "wiki",
      "wiki/concepts",
      "wiki/people",
      "wiki/claims",
      "wiki/models",
      "wiki/questions",
      "wiki/sources",
      "wiki/connections",
      "wiki/analyses",
      "wiki/analyses/briefs",
      "wiki/analyses/reviews",
    ];

    for (const folder of folders) {
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        try {
          await this.app.vault.createFolder(folder);
          created++;
        } catch { /* already exists */ }
      }
    }

    const starterFiles: { path: string; content: string }[] = [
      {
        path: "wiki/index.md",
        content: `# Wiki Index\n\n> Auto-maintained by Gardener. Last updated: ${new Date().toISOString().split("T")[0]}. Do not edit manually.\n\nNo pages yet — run a Gardener scan to populate.\n`,
      },
      {
        path: "wiki/log.md",
        content: `# Wiki Log\n\n> Append-only scan log maintained by Gardener.\n\n## [${new Date().toISOString().split("T")[0]}] setup | Vault layout created\nKarpathy LLM Wiki layout initialised by Gardener.\n`,
      },
      {
        path: "wiki/overview.md",
        content: `# Knowledge Base Overview\n\nHigh-level synthesis of the full knowledge base. Update after major ingests.\n`,
      },
      {
        path: "wiki/glossary.md",
        content: `# Glossary\n\nKey terms, definitions, and usage notes.\n`,
      },
      {
        path: "raw/goals/current-goals.md",
        content: `# Current Learning Goals\n\nList your active learning goals here. Used by Claude Code daily briefs and weekly reviews.\n\n- \n`,
      },
    ];

    for (const { path, content } of starterFiles) {
      if (!this.app.vault.getAbstractFileByPath(path)) {
        try {
          await this.app.vault.create(path, content);
          created++;
        } catch { /* already exists */ }
      }
    }

    // Also auto-enable Wiki Writer with defaults if not already enabled
    if (!this.settings.wikiWriterEnabled) {
      this.settings.wikiWriterEnabled = true;
      await this.saveSettings();
    }

    new Notice(`Gardener: vault layout ready — ${created} items created.`);
    return { created };
  }

  openBatchReview(): void {
    new BatchReviewModal(this.app, this.engine).open();
  }

  openLauncher(): void {
    new GardenerLauncherModal(this.app, [
      {
        icon: "🏠",
        label: "Gardener Home",
        description: "Topics, saved ideas, sources, conflicts",
        action: () => this.activateView(WIKI_MEMORY_VIEW_TYPE),
      },
      {
        icon: "✅",
        label: "Suggestions",
        description: "Review proposed links, canonical notes, and cleanup (card view)",
        action: () => this.activateReviewView(),
      },
      {
        icon: "📋",
        label: "Batch Review",
        description: "Accept or reject suggestions by category — wiki, ideas, links, conflicts, cleanup",
        action: () => new BatchReviewModal(this.app, this.engine).open(),
      },
      {
        icon: "✍️",
        label: "Writing Context",
        description: "Related concepts surfaced while you write",
        action: () => this.activateView(RESURFACING_VIEW_TYPE),
      },
      {
        icon: "📈",
        label: "Writing Velocity",
        description: "Word count trends over time",
        action: () => this.activateView(VELOCITY_VIEW_TYPE),
      },
      {
        icon: "🕸️",
        label: "Graph Gaps",
        description: "Under-connected notes and missing links",
        action: () => this.activateView(GRAPH_GAPS_VIEW_TYPE),
      },
      {
        icon: "📊",
        label: "Vault Dashboard",
        description: "Orphans, broken links, stubs at a glance",
        action: () => this.activateView(DASHBOARD_VIEW_TYPE),
      },
      {
        icon: "↩️",
        label: "Change History",
        description: "Browse and undo applied changes",
        action: () => this.activateView(UNDO_HISTORY_VIEW_TYPE),
      },
      {
        icon: "🔍",
        label: "Scan vault now",
        description: "Run Gardener immediately",
        action: () => { void this.runPipeline(); },
      },
    ]).open();
  }

  async applyWikiWriterToGardenerMd(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
    if (!file) return;
    let content = await this.app.vault.read(file as TFile);
    const s = this.settings;
    const wikiWriterBlock = [
      "\n## Wiki Writer",
      `wiki-writer: ${s.wikiWriterEnabled ? "on" : "off"}`,
      `sources-folder: ${s.wikiSourcesFolder}`,
      `concepts-folder: ${s.wikiConceptsFolder}`,
      `index-file: ${s.wikiIndexFile}`,
      `log-file: ${s.wikiLogFile}`,
      `excluded-folders: ${s.wikiExcludedFolders}`,
      `concept-page-min-claims: ${s.wikiConceptMinClaims}`,
    ].join("\n");
    if (content.includes("## Wiki Writer")) {
      content = content.replace(/\n## Wiki Writer[\s\S]*?(?=\n## |\n*$)/, wikiWriterBlock);
    } else {
      content = content.trimEnd() + "\n" + wikiWriterBlock + "\n";
    }
    await this.app.vault.process(file as TFile, () => content);
    await this.audit?.writeInternal(SCHEMA_PATH, "applied wiki writer settings", "wiki-writer-setup");
    await this.reloadSchemaForSettings();
  }

  getAgentSchemaFilePath(): string {
    return this.settings.agentSchemaFile || agentSchemaFilePath(this.settings.agentIntegration);
  }

  async generateAgentSchemaFile(): Promise<string | null> {
    const { agentIntegration, agentSchemaFile } = this.settings;
    if (agentIntegration === "none") return null;
    const targetPath = normalizePath(agentSchemaFile || agentSchemaFilePath(agentIntegration));
    const content = buildAgentSchema(agentIntegration, this.settings);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing) {
      await this.app.vault.process(existing as TFile, () => content);
    } else {
      const dir = targetPath.split("/").slice(0, -1).join("/");
      if (dir) {
        try { await this.app.vault.createFolder(dir); } catch { /* exists */ }
      }
      await this.app.vault.create(targetPath, content);
    }
    await this.audit?.writeInternal(targetPath, `generated ${agentIntegration} schema`, "agent-schema");
    return targetPath;
  }

  openSchemaLibrary(): void {
    new SchemaLibraryModal(this.app, async () => {
      await this.loadSchema();
      this.guard.update(this.schema.protected.neverWrite, this.schema.protected.neverRead);
      this.indexer.updateSchema(this.schema);
    }, this.audit).open();
  }

  async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      if (viewType === DASHBOARD_VIEW_TYPE) {
        (existing[0].view as DashboardView).refresh();
      }
      if (viewType === WIKI_MEMORY_VIEW_TYPE) {
        (existing[0].view as WikiMemoryView).refresh();
      }
      return;
    }

    const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
  }

  private async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(DATA_DIR);
    } catch {
      // already exists
    }
  }

  private async loadSchema(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
      if (!file) {
        await this.app.vault.create(SCHEMA_PATH, DEFAULT_GARDENER_MD);
        await this.audit?.writeInternal(SCHEMA_PATH, "created default schema", "schema");
        this.schema = DEFAULT_SCHEMA;
        this.schemaErrors = [];
        return;
      }
      const content = await this.app.vault.read(file as TFile);
      const { schema, errors } = parseGardenerSchema(content);
      this.schema = schema;
      this.schemaErrors = errors;
      if (errors.length > 0) {
        console.warn("Gardener: GARDENER.md validation errors:", errors);
        new Notice(`Gardener: ${errors.length} GARDENER.md validation issue${errors.length !== 1 ? "s" : ""}. Runs are paused.`);
      }
    } catch (e) {
      console.error("Gardener: failed to load GARDENER.md", e);
      this.schema = DEFAULT_SCHEMA;
      this.schemaErrors = [{ section: "GARDENER.md", message: "Failed to parse schema file" }];
    }
  }

  private async appendRuleToSchema(rule: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
    if (!file) return;
    const content = await this.app.vault.read(file as TFile);
    const rulesHeader = "## Rules";
    const idx = content.indexOf(rulesHeader);
    if (idx === -1) return;
    const insertAt = idx + rulesHeader.length;
    const newContent = content.slice(0, insertAt) + `\n- ${rule}` + content.slice(insertAt);
    await this.app.vault.modify(file as TFile, newContent);
    await this.audit?.writeInternal(SCHEMA_PATH, "appended rejection rule", "schema-feedback");
  }

  private async applyWizardSettings(settings: GardenerSettings): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
    if (!file) return;
    let content = await this.app.vault.read(file as TFile);
    if (settings.vaultPurpose) {
      content = content.replace(/^purpose:.*$/m, `purpose: ${settings.vaultPurpose}`);
    }
    content = content.replace(/^run-at:.*$/m, `run-at: ${settings.runAt || "03:00"}`);
    if (!content.includes("## Wiki Memory")) {
      content += `\n## Wiki Memory\nenabled: on\nmode: in-place\ncanonical-notes: prefer-existing\nnew-hub-notes: review-only\ncanonical-folder: ${canonicalFolderForStyle(settings.vaultStyle)}\nclaim-extraction: on\ncontradiction-buffer: on\nrelated-section: off\n`;
    } else if (!/^canonical-folder:/m.test(content)) {
      content = content.replace(/^new-hub-notes:.*$/m, (line) => `${line}\ncanonical-folder: ${canonicalFolderForStyle(settings.vaultStyle)}`);
    }
    if (!content.includes("## Folder Rules")) {
      content += `\n## Folder Rules\n${folderRulesForStyle(settings.vaultStyle, settings.privacyPosture)}\n`;
    }
    await this.app.vault.modify(file as TFile, content);
    await this.audit?.writeInternal(SCHEMA_PATH, "applied first-run wizard settings", "first-run");
  }
}

function canonicalFolderForStyle(style: GardenerSettings["vaultStyle"]): string {
  if (style === "zettelkasten") return "Permanent";
  if (style === "academic") return "Claims";
  return "Wiki";
}

export function agentSchemaFilePath(agent: import("./main").AgentIntegration): string {
  const map: Record<string, string> = {
    "claude-code": "CLAUDE.md",
    "codex": "AGENTS.md",
    "cursor": ".cursorrules",
    "windsurf": ".windsurfrules",
    "gemini": "GEMINI.md",
    "custom": "AGENT.md",
    "none": "",
  };
  return map[agent] ?? "AGENT.md";
}

export function buildAgentSchema(agent: import("./main").AgentIntegration, s: GardenerSettings): string {
  const agentNames: Record<string, string> = {
    "claude-code": "Claude Code",
    "codex": "Codex",
    "cursor": "Cursor",
    "windsurf": "Windsurf",
    "gemini": "Gemini CLI",
    "custom": "AI Agent",
    "none": "AI Agent",
  };
  const name = agentNames[agent] ?? "AI Agent";
  const today = new Date().toISOString().split("T")[0];
  const sourcesFolder = s.wikiSourcesFolder || "wiki/sources";
  const conceptsFolder = s.wikiConceptsFolder || "wiki/concepts";
  const indexFile = s.wikiIndexFile || "wiki/index.md";
  const logFile = s.wikiLogFile || "wiki/log.md";
  const excluded = s.wikiExcludedFolders || ".obsidian, .gardener, Templates";

  return `# ${name} — Wiki Schema
> Auto-generated by Gardener on ${today}. Re-run "Generate agent schema" in Gardener settings to update.

## Role

You are the wiki maintainer for a personal learning knowledge base managed by Gardener (an Obsidian plugin).

Gardener runs automatically and handles:
- Extracting concepts and claims from raw source notes
- Creating and updating source summary pages in \`${sourcesFolder}/\`
- Creating and updating concept pages in \`${conceptsFolder}/\`
- Maintaining the index at \`${indexFile}\`
- Appending scan logs to \`${logFile}\`

Your role is complementary: deep interactive ingests, answering questions, writing syntheses, and handling tasks Gardener cannot automate.

## Communication Mode

Default to concise replies to reduce token usage:
- Drop filler, pleasantries, hedging, and unnecessary articles
- Keep technical terms, file paths, commands, code, quotes, and citations exact
- Use full clarity for security warnings, irreversible actions, or multi-step instructions where compression risks misread

---

## Directory Structure

\`\`\`
raw/                   ← immutable source material (read only, never modify)
wiki/
  ${indexFile.split("/").pop()}        ← master catalog, maintained by Gardener
  ${logFile.split("/").pop()}          ← append-only scan log, maintained by Gardener
  ${sourcesFolder.split("/").pop()}/   ← one summary page per source, created by Gardener
  ${conceptsFolder.split("/").pop()}/  ← concept pages, created and updated by Gardener
  people/              ← thinker/author pages (you create these)
  models/              ← mental models and frameworks (you create these)
  questions/           ← open questions under investigation (you create these)
  connections/         ← cross-domain links (you create these)
  analyses/            ← syntheses, comparisons, filed query answers (you create these)
\`\`\`

### Protected — never modify these
- All files in: raw/
- \`${indexFile}\` — Gardener maintains this
- \`${logFile}\` — Gardener maintains this
- \`GARDENER.md\` — Gardener's configuration

### Excluded from processing
${excluded.split(",").map((f: string) => `- ${f.trim()}/`).join("\n")}

---

## Entity Types

| Type | Folder | Owner | Purpose |
|---|---|---|---|
| Source summary | \`${sourcesFolder}/\` | Gardener | Key ideas, claims, quotes from a raw source |
| Concept | \`${conceptsFolder}/\` | Gardener | Core idea — definition, claims, open questions |
| Person | \`wiki/people/\` | You | Thinker/author — key ideas, works, lineage |
| Model | \`wiki/models/\` | You | Mental model or framework |
| Question | \`wiki/questions/\` | You | Open question under investigation |
| Connection | \`wiki/connections/\` | You | Cross-domain link between ideas |
| Analysis | \`wiki/analyses/\` | You | Synthesis, comparison, or filed query answer |

---

## Page Format

Every wiki page must have this YAML frontmatter:

\`\`\`yaml
---
title: <page title>
type: source | concept | person | model | question | connection | analysis
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [list of source filenames]
confidence: high | medium | low
tags: [relevant tags]
---
\`\`\`

Followed by:
1. **One-line summary** (used in ${indexFile})
2. **Body** — headers, lists, tables as appropriate
3. **Open questions** — what this page doesn't answer yet
4. **Related pages** — \`[[filename]]\` links at the bottom

---

## Workflows

### Query
1. Read \`${indexFile}\` to find relevant pages
2. Read those pages
3. Synthesise answer with citations
4. Ask: "File this as a wiki page?" If yes → \`wiki/analyses/\`

### Create a people / model / question page
1. Check \`${indexFile}\` — does the page already exist?
2. Create the page in the right folder using the page format above
3. Add backlinks from related concept pages
4. Note: do NOT update \`${indexFile}\` — Gardener will refresh it on next scan

### Lint (when user asks)
Check for:
- Contradictions between pages
- Orphan pages (no inbound links)
- Concepts mentioned but lacking their own page
- Open questions that could now be answered

Report findings. Apply fixes only with user confirmation.

---

## Session Start

1. Read this file
2. Read \`${indexFile}\` to orient
3. Read the last 3 entries in \`${logFile}\` to understand recent Gardener activity
4. Ask: ingest, query, lint, or something else?

---

## Notes
- Prefer updating existing pages over creating new ones
- Use \`[[filename-without-extension]]\` for all internal links
- kebab-case for filenames
- If a source contradicts the wiki, flag it explicitly before updating
- Gardener scans at ${s.runAt} daily — new concept/source pages appear automatically after each scan
`;
}

function folderRulesForStyle(
  style: GardenerSettings["vaultStyle"],
  privacy: GardenerSettings["privacyPosture"]
): string {
  const rules = new Set<string>();
  rules.add("Journal/**: claim-extraction off, stub-flagging off");
  rules.add("Daily/**: claim-extraction off, stub-flagging off");
  rules.add("Sources/**: claim-extraction on, stub-flagging off");
  rules.add("Highlights/**: claim-extraction on, stub-flagging off");
  rules.add("Inbox/**: claim-extraction off");
  if (privacy === "local-first") {
    rules.add("Private/**: claim-extraction off, stub-flagging off");
  }
  if (style === "academic") {
    rules.add("Literature/**: claim-extraction on, stub-flagging off");
    rules.add("Raw-Data/**: claim-extraction off, stub-flagging off");
  }
  if (style === "zettelkasten" || style === "llm-wiki") {
    rules.add("Evergreen/**: claim-extraction on");
    rules.add("Permanent/**: claim-extraction on");
  }
  if (style === "journal") {
    rules.add("Archive/**: claim-extraction off, stub-flagging off");
  }
  return [...rules].join("\n");
}
