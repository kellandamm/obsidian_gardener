import type { App } from "obsidian";
const LAST_RUN_FILE = "last-run.json";
const POLL_INTERVAL_MS = 60_000; // check every minute

interface LastRunData {
  timestamp: number;
}

export type RunCallback = () => Promise<void>;
export type RunAtCallback = () => string;

export class Scheduler {
  private app: App;
  private dataDir: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onRun: RunCallback;
  private getRunAt: RunAtCallback;
  private running = false;

  constructor(app: App, dataDir: string, onRun: RunCallback, getRunAt: RunAtCallback) {
    this.app = app;
    this.dataDir = dataDir;
    this.onRun = onRun;
    this.getRunAt = getRunAt;
  }

  async start(): Promise<void> {
    const lastRun = await this.loadLastRun();
    const shouldRunNow = this.isStale(lastRun, this.getRunAt());
    if (shouldRunNow) await this.fire();

    this.intervalId = setInterval(async () => {
      const lr = await this.loadLastRun();
      if (this.isStale(lr, this.getRunAt())) await this.fire();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runNow(): Promise<void> {
    await this.fire();
  }

  private async fire(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.onRun();
      await this.saveLastRun();
    } finally {
      this.running = false;
    }
  }

  private isStale(lastRun: number | null, runAt: string): boolean {
    const now = new Date();
    const [h, m] = /^\d{2}:\d{2}$/.test(runAt)
      ? runAt.split(":").map(Number)
      : [3, 0];
    const scheduled = new Date(now);
    scheduled.setHours(h, m, 0, 0);

    // If scheduled time is in the future today, compare against yesterday's slot
    if (scheduled > now) scheduled.setDate(scheduled.getDate() - 1);

    if (lastRun === null) return true;
    return lastRun < scheduled.getTime();
  }

  private async loadLastRun(): Promise<number | null> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.dataDir}/${LAST_RUN_FILE}`);
      return (JSON.parse(raw) as LastRunData).timestamp;
    } catch {
      return null;
    }
  }

  private async saveLastRun(): Promise<void> {
    const data: LastRunData = { timestamp: Date.now() };
    try {
      await this.app.vault.adapter.write(
        `${this.dataDir}/${LAST_RUN_FILE}`,
        JSON.stringify(data)
      );
    } catch {
      // data dir not yet created; main.ts ensures it exists before starting
    }
  }
}
