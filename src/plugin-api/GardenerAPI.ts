import type { Task } from "../tasks/Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { ChangeProposal } from "../changeset/ChangeProposal";
import type { WikiMemoryGraphData, MemoryNode } from "../memory/WikiMemoryGraph";
import { getClaimsForNote, searchMemory } from "../memory/WikiMemoryGraph";

export interface GardenerPublicAPI {
  /** Register a custom task — it will run on every pipeline execution. */
  registerTask(task: Task): void;
  /** Unregister a previously registered task by id. */
  unregisterTask(id: string): void;
  /**
   * Subscribe to the pipeline-complete event.
   * Returns an unsubscribe function.
   */
  onPipelineComplete(cb: (proposals: ChangeProposal[]) => void): () => void;
  /** Read-only snapshot of the current vault index. */
  getIndex(): VaultIndex;
  /** Read-only snapshot of the current wiki memory graph. */
  getMemoryGraph(): WikiMemoryGraphData;
  /** Search the wiki memory graph. */
  searchMemory(query: string): MemoryNode[];
  /** Return extracted claim nodes for a note path. */
  getClaimsForNote(path: string): MemoryNode[];
}

type PipelineListener = (proposals: ChangeProposal[]) => void;

export class GardenerAPI implements GardenerPublicAPI {
  private customTasks = new Map<string, Task>();
  private listeners = new Set<PipelineListener>();
  private indexGetter: () => VaultIndex;
  private memoryGetter: () => WikiMemoryGraphData;

  constructor(indexGetter: () => VaultIndex, memoryGetter: () => WikiMemoryGraphData) {
    this.indexGetter = indexGetter;
    this.memoryGetter = memoryGetter;
  }

  registerTask(task: Task): void {
    this.customTasks.set(task.id, task);
  }

  unregisterTask(id: string): void {
    this.customTasks.delete(id);
  }

  onPipelineComplete(cb: PipelineListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getIndex(): VaultIndex {
    return this.indexGetter();
  }

  getMemoryGraph(): WikiMemoryGraphData {
    return this.memoryGetter();
  }

  searchMemory(query: string): MemoryNode[] {
    return searchMemory(this.memoryGetter(), query);
  }

  getClaimsForNote(path: string): MemoryNode[] {
    return getClaimsForNote(this.memoryGetter(), path);
  }

  /** Called by GardenerPlugin at the end of runPipeline. */
  notifyPipelineComplete(proposals: ChangeProposal[]): void {
    for (const cb of this.listeners) {
      try {
        cb(proposals);
      } catch (e) {
        console.error("Gardener API: listener error", e);
      }
    }
  }

  /** Returns all registered custom tasks for inclusion in the pipeline. */
  getCustomTasks(): Task[] {
    return [...this.customTasks.values()];
  }
}
