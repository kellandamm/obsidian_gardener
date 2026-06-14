import { App, Modal } from "obsidian";

export interface LauncherEntry {
  icon: string;
  label: string;
  description: string;
  action: () => void;
}

export class GardenerLauncherModal extends Modal {
  constructor(app: App, private entries: LauncherEntry[]) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("gardener-launcher-modal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Gardener" });

    for (const entry of this.entries) {
      const row = contentEl.createDiv("gardener-launcher-row");
      const icon = row.createDiv("gardener-launcher-icon");
      icon.setText(entry.icon);
      const text = row.createDiv("gardener-launcher-text");
      text.createEl("b", { text: entry.label });
      text.createEl("span", { text: entry.description });
      row.addEventListener("click", () => {
        this.close();
        entry.action();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
