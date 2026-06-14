import { minimatch } from "minimatch";

export class PathGuard {
  private neverWrite: string[];
  private neverRead: string[];

  constructor(neverWrite: string[], neverRead: string[]) {
    this.neverWrite = neverWrite;
    this.neverRead = neverRead;
  }

  update(neverWrite: string[], neverRead: string[]): void {
    this.neverWrite = neverWrite;
    this.neverRead = neverRead;
  }

  canRead(path: string): boolean {
    return !this.neverRead.some((g) => minimatch(path, g, { dot: true }));
  }

  canWrite(path: string): boolean {
    return !this.neverWrite.some((g) => minimatch(path, g, { dot: true }));
  }

  assertWrite(path: string): void {
    if (!this.canWrite(path)) {
      throw new Error(`Gardener: write to protected path "${path}" blocked by GARDENER.md`);
    }
  }
}
