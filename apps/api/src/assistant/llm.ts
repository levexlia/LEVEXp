export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Cheapest default with good Russian, checked on openrouter.ai/api/v1/models on 2026-11-19 ($0.10 / $0.40 per 1M tokens). */
export const DEFAULT_ASSISTANT_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_MAX_TOKENS = 400;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_REPLY_CHARS = 2000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmTimeout extends Error {
  constructor() {
    super("llm timeout");
    this.name = "LlmTimeout";
  }
}

export class LlmFailed extends Error {
  /** Only a status code or a short reason. Never the key, never the upstream body. */
  constructor(readonly reason: string) {
    super(`llm failed: ${reason}`);
    this.name = "LlmFailed";
  }
}

export interface LlmOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** One OpenAI-compatible chat completion through OpenRouter. */
export async function chatCompletion(messages: ChatMessage[], opts: LlmOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let response: Response;
  try {
    response = await (opts.fetchImpl ?? fetch)(OPENROUTER_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        "x-title": "LEVEX",
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: 0.6,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new LlmFailed(`status ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new LlmFailed("empty reply");
    const text = content.trim();
    return text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS - 1)}…` : text;
  } catch (err) {
    if (controller.signal.aborted) throw new LlmTimeout();
    if (err instanceof LlmFailed) throw err;
    throw new LlmFailed(err instanceof Error ? err.name : "network");
  } finally {
    clearTimeout(timer);
  }
}
