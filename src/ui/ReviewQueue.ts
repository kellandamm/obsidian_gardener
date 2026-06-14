import type { StagedProposal } from "../changeset/ChangeProposal";

export type QueueEvent = "update";

export class ReviewQueue {
  private items: StagedProposal[];
  private listeners: Array<() => void> = [];

  constructor(items: StagedProposal[]) {
    this.items = [...items];
  }

  getAll(): StagedProposal[] {
    return this.items;
  }

  getPending(): StagedProposal[] {
    return this.items.filter((i) => i.status === "pending");
  }

  update(id: string, updates: Partial<StagedProposal>): void {
    const item = this.items.find((i) => i.proposal.id === id);
    if (item) {
      Object.assign(item, updates);
      this.emit();
    }
  }

  on(_event: QueueEvent, cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
