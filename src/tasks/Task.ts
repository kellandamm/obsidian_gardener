import type { VaultIndex } from "../index/VaultIndex";
import type { GardenerSchema } from "../schema/GardenerSchema";
import type { LLMProvider } from "../llm/LLMProvider";
import type { ChangeProposal } from "../changeset/ChangeProposal";

export interface Finding {
  taskId: string;
  proposal: ChangeProposal;
  confidence: number;
}

export interface Task {
  readonly id: string;
  run(index: VaultIndex, schema: GardenerSchema, llm: LLMProvider): Promise<Finding[]>;
}
