import type { App, TFile } from "obsidian";
import type { Task, Finding } from "./Task";
import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { MemoryRef } from "../memory/MemoryRef";
import { buildWikiMemoryGraphAsync } from "../memory/WikiMemoryGraph";
import { saveWikiMemoryGraph } from "../memory/persist";
import { isClaimExtractionEnabled } from "../schema/folderRules";
import { yieldEvery } from "../utils/cooperative";
import { LLMClaimExtractionTask } from "./LLMClaimExtractionTask";

export class WikiMemoryBuildTask implements Task {
  readonly id = "wiki-memory-build";

  constructor(
    private app: App,
    private dataDir: string,
    private memory: MemoryRef
  ) {}

  async run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]> {
    if (!schema.wikiMemory.enabled) return [];

    // Phase 1: regex-based structural graph (always runs, fast)
    const contents = new Map<string, string>();
    let count = 0;
    for (const note of index.notes.values()) {
      if (!isClaimExtractionEnabled(schema, note.path)) {
        contents.set(note.path, "");
        await yieldEvery(++count, 50);
        continue;
      }
      const file = this.app.vault.getAbstractFileByPath(note.path) as TFile | null;
      if (file) contents.set(note.path, await this.app.vault.cachedRead(file));
      await yieldEvery(++count, 50);
    }

    this.memory.graph = await buildWikiMemoryGraphAsync(index, contents);

    // Phase 2: LLM-based claim extraction (runs on top of regex graph when LLM available)
    const llmExtractor = new LLMClaimExtractionTask(this.app, this.memory);
    await llmExtractor.run(index, schema, llm);

    await saveWikiMemoryGraph(this.app, this.dataDir, this.memory.graph);
    return [];
  }
}
