import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleProvider } from "../src/llm/OpenAIProvider";

test("OpenAI-compatible provider calls configured chat completions endpoint", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const provider = new OpenAICompatibleProvider(
    "http://localhost:1234/v1/",
    "local-key",
    "local-model",
    async (url, init) => {
      requestedUrl = String(url);
      requestedBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: " done " } }] }),
      } as Response;
    }
  );

  const result = await provider.complete("hello", { maxTokens: 12, temperature: 0.1 });

  assert.equal(result, "done");
  assert.equal(requestedUrl, "http://localhost:1234/v1/chat/completions");
  const body = JSON.parse(requestedBody) as { model: string; messages: Array<{ content: string }>; max_tokens: number };
  assert.equal(body.model, "local-model");
  assert.equal(body.messages[0].content, "hello");
  assert.equal(body.max_tokens, 12);
});
