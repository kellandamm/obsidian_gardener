import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type GardenerPlugin from "../main";
import { WIKI_MEMORY_VIEW_TYPE } from "./WikiMemoryView";
import { RESURFACING_VIEW_TYPE } from "./ResurfacingSidebarView";
import { VELOCITY_VIEW_TYPE } from "./WritingVelocityView";
import { GRAPH_GAPS_VIEW_TYPE } from "./KnowledgeGraphView";
import { DASHBOARD_VIEW_TYPE } from "./DashboardView";
import { UNDO_HISTORY_VIEW_TYPE } from "./UndoHistoryView";

const MODEL_PRESETS: Record<string, string[]> = {
  ollama: ["llama3.2", "llama3.1", "mistral", "gemma2", "phi3", "qwen2.5"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
  "openai-compatible": ["local-model"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
  none: [],
};

export class GardenerSettingsTab extends PluginSettingTab {
  private plugin: GardenerPlugin;

  constructor(app: App, plugin: GardenerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderSchemaValidation(containerEl);

    // ── AI Provider ──────────────────────────────────────
    this.sectionHeader(containerEl, "AI Provider");

    containerEl.createEl("p", {
      cls: "gardener-settings-notice",
      text: "⚠️ When a cloud provider is selected (OpenAI, Anthropic), note content is sent to that provider's API for processing. Use Ollama or OpenAI-compatible for fully local operation.",
    });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Ollama and OpenAI-compatible servers run locally. OpenAI and Anthropic require an API key.")
      .addDropdown((dd) =>
        dd
          .addOption("ollama", "Ollama (local)")
          .addOption("openai-compatible", "OpenAI-compatible / LM Studio")
          .addOption("openai", "OpenAI")
          .addOption("anthropic", "Anthropic")
          .addOption("none", "None (structural tasks only)")
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (v) => {
            this.plugin.settings.llmProvider = v as typeof this.plugin.settings.llmProvider;
            await this.plugin.saveSettings();
            this.plugin.rebuildProvider();
            this.display();
          })
      );

    const requiresKey = this.plugin.settings.llmProvider === "openai" || this.plugin.settings.llmProvider === "anthropic";
    const keyMissing = requiresKey && !this.plugin.settings.apiKey.trim();

    const apiKeySetting = new Setting(containerEl)
      .setName("API Key")
      .setDesc(requiresKey
        ? "Required for this provider. Stored in Obsidian plugin data (not encrypted)."
        : "Not required for local providers.");

    if (keyMissing) {
      apiKeySetting.descEl.createEl("span", {
        text: " ⚠ No API key set — LLM tasks will fail.",
        cls: "gardener-key-warning",
      });
    }

    apiKeySetting.addText((t) => {
      const input = t.inputEl;
      input.type = "password";
      input.autocomplete = "off";
      t.setPlaceholder(requiresKey ? "sk-..." : "not required")
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (v) => {
          this.plugin.settings.apiKey = v;
          await this.plugin.saveSettings();
          this.display();
        });
    });

    apiKeySetting.addButton((btn) => {
      btn.setButtonText("Show").onClick(() => {
        const input = apiKeySetting.controlEl.querySelector("input");
        if (!input) return;
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        btn.setButtonText(isHidden ? "Hide" : "Show");
      });
    });

    const presets = MODEL_PRESETS[this.plugin.settings.llmProvider] ?? [];
    const modelSetting = new Setting(containerEl)
      .setName("Model")
      .setDesc(
        presets.length > 0
          ? `Suggested: ${presets.slice(0, 3).join(", ")}`
          : "Enter model name manually."
      )
      .addText((t) =>
        t
          .setPlaceholder(presets[0] ?? "model-name")
          .setValue(this.plugin.settings.model)
          .onChange(async (v) => {
            this.plugin.settings.model = v;
            await this.plugin.saveSettings();
          })
      );

    if (presets.length > 0) {
      modelSetting.addDropdown((dd) => {
        dd.addOption("", "— pick preset —");
        for (const preset of presets) dd.addOption(preset, preset);
        dd.setValue("");
        dd.onChange(async (v) => {
          if (!v) return;
          this.plugin.settings.model = v;
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }

    if (this.plugin.settings.llmProvider === "ollama") {
      new Setting(containerEl)
        .setName("Ollama base URL")
        .addText((t) =>
          t
            .setPlaceholder("http://localhost:11434")
            .setValue(this.plugin.settings.ollamaBaseUrl)
            .onChange(async (v) => {
              this.plugin.settings.ollamaBaseUrl = v;
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.llmProvider === "openai-compatible") {
      new Setting(containerEl)
        .setName("OpenAI-compatible base URL")
        .setDesc("LM Studio default: http://localhost:1234/v1")
        .addText((t) =>
          t
            .setPlaceholder("http://localhost:1234/v1")
            .setValue(this.plugin.settings.openAICompatibleBaseUrl)
            .onChange(async (v) => {
              this.plugin.settings.openAICompatibleBaseUrl = v;
              await this.plugin.saveSettings();
              this.plugin.rebuildProvider();
            })
        );
    }

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify the provider is reachable from Obsidian.")
      .addButton((btn) =>
        btn
          .setButtonText("Check provider")
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("Checking...");
            const result = await this.plugin.checkProviderAvailability();
            btn.setDisabled(false);
            btn.setButtonText(result.available ? `✓ ${result.provider} ready` : `✗ ${result.provider} unavailable`);
          })
      );

    // ── Vault ─────────────────────────────────────────────
    this.sectionHeader(containerEl, "Vault");

    new Setting(containerEl)
      .setName("Vault purpose")
      .setDesc("Describe what this vault is for. Gardener uses it to understand your notes better.")
      .addText((t) =>
        t
          .setPlaceholder("e.g. Research notes on machine learning and neuroscience")
          .setValue(this.plugin.settings.vaultPurpose)
          .onChange(async (v) => {
            this.plugin.settings.vaultPurpose = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Vault style")
      .setDesc("Sets folder conventions and canonical note behaviour.")
      .addDropdown((dd) =>
        dd
          .addOption("llm-wiki", "LLM Wiki (Karpathy-style)")
          .addOption("zettelkasten", "Zettelkasten")
          .addOption("para", "PARA")
          .addOption("academic", "Academic / Research")
          .addOption("journal", "Journal / Diary")
          .addOption("general", "General")
          .setValue(this.plugin.settings.vaultStyle)
          .onChange(async (v) => {
            this.plugin.settings.vaultStyle = v as typeof this.plugin.settings.vaultStyle;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Privacy posture")
      .setDesc("Controls which notes are eligible for LLM claim extraction.")
      .addDropdown((dd) =>
        dd
          .addOption("local-first", "Local-first — only local providers touch private notes")
          .addOption("balanced", "Balanced — cloud OK for non-private folders")
          .addOption("cloud-ok", "Cloud OK — no restrictions")
          .setValue(this.plugin.settings.privacyPosture)
          .onChange(async (v) => {
            this.plugin.settings.privacyPosture = v as typeof this.plugin.settings.privacyPosture;
            await this.plugin.saveSettings();
          })
      );

    // ── Schedule ─────────────────────────────────────────
    this.sectionHeader(containerEl, "Schedule");

    new Setting(containerEl)
      .setName("Run at (24h)")
      .setDesc("Gardener scans your vault automatically at this time each day.")
      .addText((t) =>
        t
          .setPlaceholder("03:00")
          .setValue(this.plugin.settings.runAt)
          .onChange(async (v) => {
            this.plugin.settings.runAt = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Batch size")
      .setDesc("Max suggestions per scan.")
      .addSlider((s) =>
        s
          .setLimits(5, 100, 5)
          .setValue(this.plugin.settings.batchSize)
          .onChange(async (v) => {
            this.plugin.settings.batchSize = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Trust & Safety ────────────────────────────────────
    this.sectionHeader(containerEl, "Trust & Safety");

    new Setting(containerEl)
      .setName("Auto-approve threshold")
      .setDesc(
        "Proposals at or above this confidence score apply automatically without review. " +
        "0 = always require manual review. Broken-link fixes are typically 0.95."
      )
      .addSlider((s) =>
        s
          .setLimits(0, 1, 0.05)
          .setValue(this.plugin.settings.autoApproveThreshold)
          .onChange(async (v) => {
            this.plugin.settings.autoApproveThreshold = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setHeading().setName("Auto-approve by category");
    containerEl.createEl("p", {
      text: "Turn on any category to auto-apply those suggestions immediately after each scan, regardless of the threshold above.",
      cls: "setting-item-description",
    });

    const categoryToggles: { key: keyof import("../main").GardenerSettings; label: string; desc: string }[] = [
      { key: "autoApproveWiki", label: "Wiki pages", desc: "Source summaries, concept pages, index updates — safe to auto-apply" },
      { key: "autoApproveIdeas", label: "New ideas", desc: "Extracted claims and concepts added to your knowledge base" },
      { key: "autoApproveLinks", label: "Links", desc: "Missing links, unlinked mentions, and broken link fixes" },
      { key: "autoApproveConflicts", label: "Conflicts", desc: "Contradiction flags — recommended to review manually first" },
      { key: "autoApproveMainNotes", label: "Main notes", desc: "Hub note creation, merging duplicates, MOC maintenance" },
      { key: "autoApproveCleanup", label: "Cleanup", desc: "Template lint, tag fixes, orphan flags" },
    ];

    for (const { key, label, desc } of categoryToggles) {
      new Setting(containerEl)
        .setName(label)
        .setDesc(desc)
        .addToggle((t) =>
          t.setValue(this.plugin.settings[key] as boolean).onChange(async (v) => {
            (this.plugin.settings[key] as boolean) = v;
            await this.plugin.saveSettings();
          })
        );
    }

    new Setting(containerEl)
      .setName("Dry run")
      .setDesc("Show suggestions but never write to disk.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.dryRun).onChange(async (v) => {
          this.plugin.settings.dryRun = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Save run report")
      .setDesc("Write a markdown report to .gardener/ after each scan with all suggestions and auto-applied changes.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.saveRunReport).onChange(async (v) => {
          this.plugin.settings.saveRunReport = v;
          await this.plugin.saveSettings();
        })
      );

    // ── Views ─────────────────────────────────────────────
    this.sectionHeader(containerEl, "Views");

    new Setting(containerEl)
      .setName("Open launcher")
      .setDesc("Quick-access menu for all Gardener views. Also available via the ribbon icon.")
      .addButton((btn) =>
        btn.setButtonText("Open launcher").setCta().onClick(() => this.plugin.openLauncher())
      );

    new Setting(containerEl)
      .setName("Batch Review")
      .setDesc("Accept or reject all pending suggestions by category — wiki, ideas, links, conflicts, cleanup.")
      .addButton((btn) =>
        btn.setButtonText("Open Batch Review").onClick(() => this.plugin.openBatchReview())
      );

    new Setting(containerEl)
      .setName("Scan vault now")
      .setDesc("Run Gardener immediately and open the suggestions pane.")
      .addButton((btn) =>
        btn
          .setButtonText("Scan vault")
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("Scanning...");
            await this.plugin.runPipeline();
            btn.setDisabled(false);
            btn.setButtonText("Scan vault");
          })
      );

    new Setting(containerEl)
      .setName("Gardener Home")
      .setDesc("Topics, saved ideas, sources, conflicts, and corrections.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(WIKI_MEMORY_VIEW_TYPE)
        )
      );

    new Setting(containerEl)
      .setName("Suggestions")
      .setDesc("Review proposed links, canonical notes, and cleanup.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() => this.plugin.activateReviewView())
      );

    new Setting(containerEl)
      .setName("Writing Context sidebar")
      .setDesc("Related concepts and unlinked context surfaced while you write.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(RESURFACING_VIEW_TYPE)
        )
      );

    new Setting(containerEl)
      .setName("Writing Velocity")
      .setDesc("Word count trends and writing momentum over time.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(VELOCITY_VIEW_TYPE)
        )
      );

    new Setting(containerEl)
      .setName("Graph Gaps")
      .setDesc("Under-connected notes and missing links in your knowledge graph.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(GRAPH_GAPS_VIEW_TYPE)
        )
      );

    new Setting(containerEl)
      .setName("Vault Dashboard")
      .setDesc("Orphans, broken links, stubs, and overall vault health at a glance.")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(DASHBOARD_VIEW_TYPE)
        )
      );

    new Setting(containerEl)
      .setName("Change History")
      .setDesc("Browse and undo applied changes (last 30 days).")
      .addButton((btn) =>
        btn.setButtonText("Open").onClick(() =>
          this.plugin.activateView(UNDO_HISTORY_VIEW_TYPE)
        )
      );

    // ── Vault Setup ───────────────────────────────────────
    this.sectionHeader(containerEl, "Vault Setup");

    containerEl.createDiv({ cls: "gardener-settings-notice" }).createEl("p", {
      text: "If your vault doesn't have the Karpathy LLM Wiki folder layout yet, Gardener can create it for you. Existing files are never overwritten — only missing folders and starter files are created.",
    });

    new Setting(containerEl)
      .setName("Build Karpathy layout")
      .setDesc("Creates raw/, wiki/, and all sub-folders plus starter files (GARDENER.md, wiki/index.md, wiki/log.md). Safe to run on an existing vault.")
      .addButton((btn) =>
        btn.setButtonText("Set up layout").onClick(() => { void (async () => {
          btn.setDisabled(true);
          btn.setButtonText("Creating…");
          const result = await this.plugin.setupKarpathyLayout();
          btn.setDisabled(false);
          btn.setButtonText(result.created > 0 ? `Done — ${result.created} items created ✓` : "Already set up ✓");
          window.setTimeout(() => btn.setButtonText("Set up layout"), 3000);
        })(); })
      );

    // ── Wiki Writer ───────────────────────────────────────
    this.sectionHeader(containerEl, "Wiki Writer");

    containerEl.createDiv({ cls: "gardener-settings-notice" }).createEl("p", {
      text: "Wiki Writer lets Gardener autonomously create and maintain source summaries, concept pages, and an index from your vault notes. You must explicitly enable it and configure the folders below.",
    });

    new Setting(containerEl)
      .setName("Enable Wiki Writer")
      .setDesc("Gardener will create and update wiki pages automatically during each scan. Off by default — you must enable this explicitly.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.wikiWriterEnabled).onChange(async (v) => {
          this.plugin.settings.wikiWriterEnabled = v;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.wikiWriterEnabled) {
      new Setting(containerEl)
        .setName("Sources folder")
        .setDesc("Where Gardener writes source summary pages. Default: wiki/sources")
        .addText((t) =>
          t.setPlaceholder("wiki/sources")
            .setValue(this.plugin.settings.wikiSourcesFolder)
            .onChange(async (v) => { this.plugin.settings.wikiSourcesFolder = v; await this.plugin.saveSettings(); })
        );

      new Setting(containerEl)
        .setName("Concepts folder")
        .setDesc("Where Gardener writes concept pages. Default: wiki/concepts")
        .addText((t) =>
          t.setPlaceholder("wiki/concepts")
            .setValue(this.plugin.settings.wikiConceptsFolder)
            .onChange(async (v) => { this.plugin.settings.wikiConceptsFolder = v; await this.plugin.saveSettings(); })
        );

      new Setting(containerEl)
        .setName("Index file")
        .setDesc("Master catalog maintained by Gardener. Default: wiki/index.md")
        .addText((t) =>
          t.setPlaceholder("wiki/index.md")
            .setValue(this.plugin.settings.wikiIndexFile)
            .onChange(async (v) => { this.plugin.settings.wikiIndexFile = v; await this.plugin.saveSettings(); })
        );

      new Setting(containerEl)
        .setName("Log file")
        .setDesc("Append-only scan log maintained by Gardener. Default: wiki/log.md")
        .addText((t) =>
          t.setPlaceholder("wiki/log.md")
            .setValue(this.plugin.settings.wikiLogFile)
            .onChange(async (v) => { this.plugin.settings.wikiLogFile = v; await this.plugin.saveSettings(); })
        );

      new Setting(containerEl)
        .setName("Excluded folders")
        .setDesc("Comma-separated folders to skip when scanning for sources. Gardener always skips wiki output folders and the config folder automatically.")
        .addText((t) =>
          t.setPlaceholder("Templates, Archive")
            .setValue(this.plugin.settings.wikiExcludedFolders)
            .onChange(async (v) => { this.plugin.settings.wikiExcludedFolders = v; await this.plugin.saveSettings(); })
        );

      new Setting(containerEl)
        .setName("Minimum claims for concept page")
        .setDesc("Gardener only creates a concept page once this many claims have been extracted for a concept.")
        .addText((t) =>
          t.setPlaceholder("3")
            .setValue(String(this.plugin.settings.wikiConceptMinClaims))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n > 0) { this.plugin.settings.wikiConceptMinClaims = n; await this.plugin.saveSettings(); }
            })
        );

      new Setting(containerEl)
        .setName("Sync to GARDENER.md")
        .setDesc("Write your Wiki Writer configuration back into GARDENER.md so agents can read it.")
        .addButton((btn) =>
          btn.setButtonText("Apply & update GARDENER.md").onClick(() => { void (async () => {
            btn.setDisabled(true);
            btn.setButtonText("Updating…");
            try {
              await this.plugin.applyWikiWriterToGardenerMd();
              btn.setButtonText("Done ✓");
            } catch (e) {
              new Notice("Gardener: failed to update GARDENER.md");
              console.error("Gardener: applyWikiWriterToGardenerMd failed", e);
              btn.setButtonText("Failed ✗");
            } finally {
              btn.setDisabled(false);
              window.setTimeout(() => btn.setButtonText("Apply & update GARDENER.md"), 2500);
            }
          })(); })
        );
    }

    // ── Agent Integration ─────────────────────────────────
    this.sectionHeader(containerEl, "Agent Integration");

    containerEl.createDiv({ cls: "gardener-settings-notice" }).createEl("p", {
      text: "Select which AI agent or desktop tool will consume the wiki. Gardener generates a schema file (e.g. CLAUDE.md, AGENTS.md, .cursorrules) that tells the agent how to navigate and maintain the wiki. You must explicitly set this up.",
    });

    new Setting(containerEl)
      .setName("Agent or desktop tool")
      .setDesc("The schema file for the selected integration will be kept in sync on every Gardener scan.")
      .addDropdown((d) => {
        d.addOption("none", "None — no agent integration");
        d.addOption("claude-code", "Claude Code → CLAUDE.md");
        d.addOption("codex", "Codex → AGENTS.md");
        d.addOption("cursor", "Cursor → .cursorrules");
        d.addOption("windsurf", "Windsurf → .windsurfrules");
        d.addOption("gemini", "Gemini CLI → GEMINI.md");
        d.addOption("custom", "Custom → AGENT.md");
        d.setValue(this.plugin.settings.agentIntegration);
        d.onChange(async (v) => {
          this.plugin.settings.agentIntegration = v as import("../main").AgentIntegration;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.agentIntegration && this.plugin.settings.agentIntegration !== "none") {
      const agentFile = this.plugin.getAgentSchemaFilePath();
      new Setting(containerEl)
        .setName(`Generate ${agentFile} now`)
        .setDesc(`Create or overwrite ${agentFile} with the current Gardener wiki schema. After this, open the file and point your agent at it.`)
        .addButton((btn) =>
          btn.setButtonText(`Generate ${agentFile}`).setCta().onClick(() => { void (async () => {
            btn.setDisabled(true);
            btn.setButtonText("Generating…");
            try {
              await this.plugin.generateAgentSchemaFile();
              btn.setButtonText("Generated ✓");
            } catch (e) {
              new Notice("Gardener: failed to generate agent schema file");
              console.error("Gardener: generateAgentSchemaFile failed", e);
              btn.setButtonText("Failed ✗");
            } finally {
              btn.setDisabled(false);
              window.setTimeout(() => btn.setButtonText(`Generate ${agentFile}`), 2500);
            }
          })(); })
        );
    }

    // ── Schema Library ───────────────────────────────────
    this.sectionHeader(containerEl, "Schema Library");

    new Setting(containerEl)
      .setName("Browse vault templates")
      .setDesc("Apply a pre-built GARDENER.md for your vault style.")
      .addButton((btn) =>
        btn
          .setButtonText("Browse templates")
          .setCta()
          .onClick(() => this.plugin.openSchemaLibrary())
      );

    new Setting(containerEl)
      .setName("Open GARDENER.md")
      .setDesc("Edit vault rules, protected paths, and task configuration directly.")
      .addButton((btn) =>
        btn.setButtonText("Open file").onClick(() => void this.plugin.openGardenerSchema())
      );
  }

  private sectionHeader(el: HTMLElement, title: string): void {
    const div = el.createDiv("gardener-settings-section");
    new Setting(div).setHeading().setName(title);
  }

  private renderSchemaValidation(el: HTMLElement): void {
    const errors = this.plugin.getSchemaErrors();
    const panel = el.createDiv({
      cls: `gardener-schema-status ${errors.length > 0 ? "invalid" : "valid"}`,
    });
    const top = panel.createDiv("gardener-schema-status-top");
    top.createEl("b", { text: "Gardener Rules" });
    top.createEl("span", {
      text: errors.length > 0
        ? `${errors.length} validation issue${errors.length !== 1 ? "s" : ""}; scanning is paused`
        : "GARDENER.md is valid",
    });

    if (errors.length > 0) {
      const list = panel.createEl("ul");
      for (const error of errors.slice(0, 6)) {
        list.createEl("li", { text: `${error.section}: ${error.message}` });
      }
    } else {
      panel.createEl("p", {
        text: "Folder scopes, protected paths, and task settings are ready.",
      });
    }

    const actions = panel.createDiv("gardener-schema-status-actions");
    const open = actions.createEl("button", { cls: "gardener-btn", text: "Open GARDENER.md" });
    open.addEventListener("click", () => void this.plugin.openGardenerSchema());
    const refresh = actions.createEl("button", { cls: "gardener-btn", text: "Recheck" });
    refresh.addEventListener("click", () => { void (async () => {
      await this.plugin.reloadSchemaForSettings();
      this.display();
    })(); });
  }
}
