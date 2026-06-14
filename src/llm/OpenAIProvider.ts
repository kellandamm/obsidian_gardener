import { requestUrl } from "obsidian";
import { LLMProvider, type LLMOptions } from "./LLMProvider";

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

// Adapts Obsidian's requestUrl to the fetch-like interface used internally and in tests.
const obsidianFetch: FetchLike = async (url, init) => {
  const res = await requestUrl({
    url,
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string> | undefined,
    body: init?.body as string | undefined,
    throw: false,
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => res.json as unknown,
    text: async () => res.text,
  };
};

export class OpenAIProvider extends LLMProvider {
  readonly name: string = "openai";
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(apiKey: string, model = "gpt-4o-mini", baseUrl = "https://api.openai.com/v1", fetchImpl: FetchLike = obsidianFetch) {
    super();
    this.apiKey = apiKey;
    this.defaultModel = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts?.model ?? this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts?.maxTokens ?? 512,
        temperature: opts?.temperature ?? 0.2,
      }),
    });
    if (!res.ok) throw new Error(`${this.name} error: ${await res.text()}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error(`${this.name}: empty response from model`);
    return text;
  }
}

export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly name = "openai-compatible";

  constructor(baseUrl: string, apiKey: string, model = "local-model", fetchImpl: FetchLike = obsidianFetch) {
    super(apiKey, model, baseUrl, fetchImpl);
  }
}
