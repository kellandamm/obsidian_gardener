import { App, Modal, Setting } from "obsidian";
import type { GardenerSettings } from "../main";

export class FirstRunModal extends Modal {
  private settings: GardenerSettings;
  private onComplete: (settings: GardenerSettings) => Promise<void>;
  private step = 0;

  constructor(
    app: App,
    settings: GardenerSettings,
    onComplete: (settings: GardenerSettings) => Promise<void>
  ) {
    super(app);
    this.settings = { ...settings };
    this.onComplete = onComplete;
  }

  onOpen(): void {
    this.renderStep();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderStep(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-wizard");

    const indicator = contentEl.createDiv("step-indicator");
    indicator.textContent = `Step ${this.step + 1} of 3`;

    if (this.step === 0) this.renderProviderStep();
    else if (this.step === 1) this.renderPurposeStep();
    else this.renderScheduleStep();
  }

  private renderProviderStep(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Welcome to Gardener" });
    contentEl.createEl("p", {
      text: "Choose an AI provider. Ollama and LM Studio keep prompts local; cloud providers require an API key.",
      cls: "subtitle",
    });

    new Setting(contentEl)
      .setName("LLM Provider")
      .setDesc("Ollama is auto-detected on localhost:11434")
      .addDropdown((dd) =>
        dd
          .addOption("ollama", "Ollama (local)")
          .addOption("openai-compatible", "OpenAI-compatible / LM Studio")
          .addOption("openai", "OpenAI")
          .addOption("anthropic", "Anthropic")
          .addOption("none", "None (structural tasks only)")
          .setValue(this.settings.llmProvider)
          .onChange((v) => { this.settings.llmProvider = v as GardenerSettings["llmProvider"]; })
      );

    new Setting(contentEl)
      .setName("Privacy posture")
      .setDesc("Local-first keeps wiki memory conservative and avoids cloud prompts by default.")
      .addDropdown((dd) =>
        dd
          .addOption("local-first", "Local-first")
          .addOption("balanced", "Balanced")
          .addOption("cloud-ok", "Cloud OK")
          .setValue(this.settings.privacyPosture)
          .onChange((v) => { this.settings.privacyPosture = v as GardenerSettings["privacyPosture"]; })
      );

    new Setting(contentEl)
      .setName("API Key")
      .setDesc("Required for OpenAI or Anthropic. Usually optional for local compatible servers.")
      .addText((t) =>
        t
          .setPlaceholder("sk-...")
          .setValue(this.settings.apiKey)
          .onChange((v) => { this.settings.apiKey = v; })
      );

    new Setting(contentEl)
      .setName("OpenAI-compatible base URL")
      .setDesc("Use this for LM Studio or other local /v1 chat-completions servers.")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:1234/v1")
          .setValue(this.settings.openAICompatibleBaseUrl)
          .onChange((v) => { this.settings.openAICompatibleBaseUrl = v; })
      );

    contentEl.createDiv("gardener-wizard-provider-note").textContent =
      "Local default: install Ollama and keep Provider set to Ollama, or run LM Studio and choose OpenAI-compatible.";

    this.renderNav();
  }

  private renderPurposeStep(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "What is your vault for?" });
    contentEl.createEl("p", {
      text: "This helps Gardener understand what's relevant to keep or merge.",
      cls: "subtitle",
    });

    new Setting(contentEl)
      .setName("Vault style")
      .setDesc("Used to seed conservative rules for finding ideas, links, and main notes.")
      .addDropdown((dd) =>
        dd
          .addOption("llm-wiki", "Knowledge Garden")
          .addOption("zettelkasten", "Zettelkasten")
          .addOption("para", "PARA")
          .addOption("academic", "Academic")
          .addOption("journal", "Journal")
          .addOption("general", "General")
          .setValue(this.settings.vaultStyle)
          .onChange((v) => { this.settings.vaultStyle = v as GardenerSettings["vaultStyle"]; })
      );

    new Setting(contentEl)
      .setName("Vault purpose")
      .addTextArea((ta) =>
        ta
          .setPlaceholder("e.g. PhD research notes on computational biology, Zettelkasten style")
          .setValue(this.settings.vaultPurpose)
          .onChange((v) => { this.settings.vaultPurpose = v; })
      );

    this.renderNav();
  }

  private renderScheduleStep(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "When should Gardener run?" });
    contentEl.createEl("p", {
      text: "Gardener runs overnight and surfaces suggestions for review.",
      cls: "subtitle",
    });

    new Setting(contentEl)
      .setName("Run time (24h)")
      .addText((t) =>
        t
          .setPlaceholder("03:00")
          .setValue(this.settings.runAt)
          .onChange((v) => { this.settings.runAt = v; })
      );

    const actions = contentEl.createDiv("gardener-wizard-actions");
    const finish = actions.createEl("button", { cls: "gardener-btn approve", text: "Finish Setup" });
    finish.addEventListener("click", async () => {
      await this.onComplete(this.settings);
      this.close();
    });
  }

  private renderNav(): void {
    const actions = this.contentEl.createDiv("gardener-wizard-actions");
    if (this.step > 0) {
      const back = actions.createEl("button", { cls: "gardener-btn", text: "Back" });
      back.addEventListener("click", () => { this.step--; this.renderStep(); });
    }
    const next = actions.createEl("button", { cls: "gardener-btn approve", text: "Next" });
    next.addEventListener("click", () => { this.step++; this.renderStep(); });
  }
}
