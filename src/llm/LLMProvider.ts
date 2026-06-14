export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export abstract class LLMProvider {
  abstract readonly name: string;
  abstract complete(prompt: string, opts?: LLMOptions): Promise<string>;
  abstract isAvailable(): Promise<boolean>;
}

export class NoopLLMProvider extends LLMProvider {
  readonly name = "none";
  async complete(): Promise<string> { return ""; }
  async isAvailable(): Promise<boolean> { return false; }
}
