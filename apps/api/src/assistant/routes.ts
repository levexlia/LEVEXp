import {
  ASSISTANT_HISTORY_ITEM_MAX_LENGTH,
  ASSISTANT_HISTORY_MAX_ITEMS,
  ASSISTANT_HISTORY_MAX_TOTAL,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  type AssistantReply,
  type AssistantTurn,
} from "@levex/domain";
import type { FastifyInstance } from "fastify";
import { readPlayerContext } from "./context.js";
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  LlmTimeout,
  chatCompletion,
  type ChatMessage,
} from "./llm.js";
import { systemPrompt } from "./prompt.js";
import { RateLimiter, type RateRule } from "./rateLimit.js";

export const OFFLINE_REPLY =
  "ИИ пока не подключён. Я уже стою на карте и скоро смогу отвечать — а пока загляни в «Миссии» и выбери одну небольшую.";
export const TIMEOUT_ERROR = "Помощник задумался слишком надолго. Попробуй ещё раз чуть позже.";
export const UPSTREAM_ERROR = "Помощник сейчас не может ответить. Попробуй ещё раз чуть позже.";
export const RATE_ERROR = "Давай чуть передохнём: сообщений было много. Попробуй через минуту.";

export interface AssistantOptions {
  /** Defaults to process.env. Tests pass their own. */
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  rateRules?: RateRule[];
  now?: () => number;
}

/** 8 messages a minute and 120 a day per IP. */
export const DEFAULT_RATE_RULES: RateRule[] = [
  { max: 8, windowMs: 60_000 },
  { max: 120, windowMs: 24 * 60 * 60_000 },
];

interface ChatBody {
  message: string;
  history?: AssistantTurn[];
}

export function registerAssistantRoutes(app: FastifyInstance, opts: AssistantOptions = {}): void {
  const limiter = new RateLimiter(opts.rateRules ?? DEFAULT_RATE_RULES, opts.now);

  app.post<{ Body: ChatBody }>("/assistant/chat", {
    schema: {
      body: {
        type: "object",
        required: ["message"],
        additionalProperties: false,
        properties: {
          message: { type: "string", minLength: 1, maxLength: ASSISTANT_MESSAGE_MAX_LENGTH },
          history: {
            type: "array",
            maxItems: ASSISTANT_HISTORY_MAX_ITEMS,
            items: {
              type: "object",
              required: ["role", "content"],
              additionalProperties: false,
              properties: {
                role: { type: "string", enum: ["user", "assistant"] },
                content: { type: "string", minLength: 1, maxLength: ASSISTANT_HISTORY_ITEM_MAX_LENGTH },
              },
            },
          },
        },
      },
    },
    preHandler: async (req, reply) => {
      const message = req.body.message.trim();
      if (!message) return reply.code(400).send({ error: "message is empty" });
      const total = (req.body.history ?? []).reduce((sum, turn) => sum + turn.content.length, 0);
      if (total > ASSISTANT_HISTORY_MAX_TOTAL) return reply.code(400).send({ error: "history is too long" });
      const wait = limiter.take(req.ip);
      if (wait !== null) {
        return reply.code(429).header("retry-after", String(wait)).send({ error: RATE_ERROR });
      }
    },
  }, async (req, reply) => {
    const env = opts.env ?? process.env;
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return { reply: OFFLINE_REPLY, source: "offline" } satisfies AssistantReply;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(readPlayerContext()) },
      ...(req.body.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: req.body.message.trim() },
    ];
    try {
      const text = await chatCompletion(messages, {
        apiKey,
        model: env.ASSISTANT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL,
        maxTokens: positiveInt(env.ASSISTANT_MAX_TOKENS, DEFAULT_MAX_TOKENS),
        timeoutMs: positiveInt(env.ASSISTANT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        fetchImpl: opts.fetchImpl,
      });
      return { reply: text, source: "ok" } satisfies AssistantReply;
    } catch (err) {
      const timeout = err instanceof LlmTimeout;
      // Only the error class/reason. The key and the upstream body are never logged.
      req.log.warn({ assistant: timeout ? "timeout" : (err as Error).message }, "assistant reply failed");
      return reply.code(timeout ? 504 : 502).send({ error: timeout ? TIMEOUT_ERROR : UPSTREAM_ERROR });
    }
  });
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
