import { requestUrl } from "obsidian";
import { LLMProvider, type LLMOptions } from "./LLMProvider";

const DEFAULT_BASE = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

export class OllamaProvider extends LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = DEFAULT_BASE, model = DEFAULT_MODEL) {
    super();
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await requestUrl({ url: `${this.baseUrl}/api/tags`, method: "GET", throw: false });
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const model = opts?.model ?? this.model;
    const res = await requestUrl({
      url: `${this.baseUrl}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: opts?.temperature ?? 0.2,
          num_predict: opts?.maxTokens ?? 512,
        },
      }),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Ollama error ${res.status}: ${res.text}`);
    }
    const data = res.json as { response: string };
    return data.response.trim();
  }
}
