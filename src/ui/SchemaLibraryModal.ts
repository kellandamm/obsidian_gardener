import { App, Modal, Notice, TFile } from "obsidian";
import { SCHEMA_TEMPLATES, type SchemaTemplate } from "../schema/schemaTemplates";
import type { AuditLog } from "../safety/AuditLog";

const SCHEMA_PATH = "GARDENER.md";

export class SchemaLibraryModal extends Modal {
  private selected: SchemaTemplate | null = null;
  private onApplied: () => Promise<void>;
  private audit?: AuditLog;

  constructor(app: App, onApplied: () => Promise<void>, audit?: AuditLog) {
    super(app);
    this.onApplied = onApplied;
    this.audit = audit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("gardener-schema-library");
    contentEl.createEl("h2", { text: "Schema Library" });
    contentEl.createEl("p", {
      text: "Choose a preset that matches your vault style. This will replace your current GARDENER.md — your notes are untouched.",
      cls: "gardener-schema-subtitle",
    });

    const grid = contentEl.createDiv("gardener-schema-grid");

    for (const template of SCHEMA_TEMPLATES) {
      const card = grid.createDiv("gardener-schema-card");
      card.createDiv("gardener-schema-icon").textContent = template.icon;
      card.createEl("h3", { text: template.name, cls: "gardener-schema-name" });
      card.createEl("p", { text: template.description, cls: "gardener-schema-desc" });

      card.addEventListener("click", () => {
        // Deselect all, select clicked
        grid.querySelectorAll(".gardener-schema-card").forEach((c) =>
          c.removeClass("selected")
        );
        card.addClass("selected");
        this.selected = template;
        applyBtn.removeAttribute("disabled");
      });
    }

    // Preview pane
    const preview = contentEl.createDiv("gardener-schema-preview");
    const previewLabel = preview.createEl("p", {
      text: "Select a template above to preview its GARDENER.md",
      cls: "gardener-schema-preview-hint",
    });
    const previewCode = preview.createEl("pre", { cls: "gardener-schema-preview-code" });
    previewCode.style.display = "none";

    // Update preview on card click
    grid.addEventListener("click", () => {
      if (!this.selected) return;
      previewLabel.style.display = "none";
      previewCode.style.display = "block";
      previewCode.textContent = this.selected.content;
    });

    // Actions
    const actions = contentEl.createDiv("gardener-wizard-actions");
    const cancelBtn = actions.createEl("button", { cls: "gardener-btn", text: "Cancel" });
    const applyBtn = actions.createEl("button", {
      cls: "gardener-btn approve",
      text: "Apply Template",
    });
    applyBtn.setAttr("disabled", "true");

    cancelBtn.addEventListener("click", () => this.close());
    applyBtn.addEventListener("click", async () => {
      if (!this.selected) return;
      await this.applyTemplate(this.selected);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async applyTemplate(template: SchemaTemplate): Promise<void> {
    try {
      const existing = this.app.vault.getAbstractFileByPath(SCHEMA_PATH);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, template.content);
      } else {
        await this.app.vault.create(SCHEMA_PATH, template.content);
      }
      await this.audit?.writeInternal(SCHEMA_PATH, `applied schema template: ${template.id}`, "schema-library");
      new Notice(`Gardener: applied "${template.name}" template to GARDENER.md`);
      await this.onApplied();
      this.close();
    } catch (e) {
      new Notice("Gardener: failed to write GARDENER.md — check console for details.");
      console.error("Gardener schema library error:", e);
    }
  }
}
