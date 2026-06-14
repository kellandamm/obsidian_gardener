import { requestUrl } from "obsidian";
import { LLMProvider, type LLMOptions } from "./LLMProvider";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    super();
    this.apiKey = apiKey;
    this.defaultModel = model;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const res = await requestUrl({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts?.model ?? this.defaultModel,
        max_tokens: opts?.maxTokens ?? 512,
        messages: [{ role: "user", content: prompt }],
      }),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Anthropic error ${res.status}: ${res.text}`);
    }
    const data = res.json as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Anthropic: empty response from model");
    return text;
  }
}
