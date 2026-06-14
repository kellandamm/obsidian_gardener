import type { App } from "obsidian";

const AUDIT_FILE = "audit.log";

export interface AuditEntry {
  ts: string;
  action: "apply" | "reject" | "undo" | "block" | "prompt-scope" | "internal-write";
  proposalId?: string;
  path?: string;
  taskId?: string;
  provider?: string;
  locality?: "local" | "cloud" | "none";
  sourcePaths?: string[];
  detail?: string;
}

export class AuditLog {
  private app: App;
  private dataDir: string;

  constructor(app: App, dataDir: string) {
    this.app = app;
    this.dataDir = dataDir;
  }

  async write(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + "\n";
    const path = `${this.dataDir}/${AUDIT_FILE}`;
    try {
      const existing = await this.app.vault.adapter.read(path);
      await this.app.vault.adapter.write(path, existing + line);
    } catch {
      await this.app.vault.adapter.write(path, line);
    }
  }

  async writePromptScope(taskId: string, provider: string, sourcePaths: string[], detail?: string): Promise<void> {
    await this.write({
      ts: new Date().toISOString(),
      action: "prompt-scope",
      taskId,
      provider,
      locality: provider === "ollama" || provider === "none" ? "local" : "cloud",
      sourcePaths,
      detail,
    });
  }

  async writeInternal(path: string, detail: string, taskId?: string): Promise<void> {
    await this.write({
      ts: new Date().toISOString(),
      action: "internal-write",
      path,
      taskId,
      detail,
    });
  }
}
